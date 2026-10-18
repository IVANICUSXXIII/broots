// Lectura de una biblioteca de Calibre.
//
// Regla de oro de la Etapa 1: NUNCA se escribe en la biblioteca original.
// Se copia metadata.db a una carpeta interna de la app y se lee esa copia,
// así Calibre y Google Drive no se ven afectados en absoluto.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_NAME = 'metadata.db';

/** Busca la biblioteca configurada en Calibre (si Calibre estuvo instalado en esta PC). */
function detectarBibliotecaDeCalibre() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  try {
    const raw = fs.readFileSync(path.join(appData, 'calibre', 'global.py.json'), 'utf8');
    const libraryPath = JSON.parse(raw).library_path;
    return libraryPath && esBibliotecaValida(libraryPath) ? path.normalize(libraryPath) : null;
  } catch {
    return null;
  }
}

function esBibliotecaValida(libraryPath) {
  return fs.existsSync(path.join(libraryPath, DB_NAME));
}

/** Copia la base (y su diario WAL, si existe) a la carpeta interna de la app. */
function copiarBase(libraryPath, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const destino = path.join(cacheDir, DB_NAME);
  for (const sufijo of ['-wal', '-shm']) fs.rmSync(destino + sufijo, { force: true });
  fs.copyFileSync(path.join(libraryPath, DB_NAME), destino);
  const wal = path.join(libraryPath, DB_NAME + '-wal');
  if (fs.existsSync(wal)) fs.copyFileSync(wal, destino + '-wal');
  return destino;
}

/** Calibre guarda "fecha desconocida" como el año 101. */
function fecha(valor) {
  if (!valor) return null;
  const año = Number(String(valor).slice(0, 4));
  return año >= 1000 ? valor : null;
}

/** Convierte la descripción HTML de Calibre en texto plano (no se renderiza HTML ajeno). */
function htmlATexto(html) {
  if (!html) return '';
  const texto = limpiarHtml(html);
  // Algunas descripciones traen el HTML "doblemente codificado" (&lt;p&gt;): tras decodificar, se limpia otra vez.
  // Solo etiquetas HTML reales: un texto como "<símbolos>" escrito por el usuario no se toca.
  const ETIQUETAS = /<\/?(p|div|br|span|b|i|em|strong|u|ul|ol|li|h[1-6]|a|font|blockquote)\b[^>]*>/i;
  return ETIQUETAS.test(texto) ? limpiarHtml(texto) : texto;
}

function limpiarHtml(html) {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function agrupar(filas, clave, valor) {
  const mapa = new Map();
  for (const fila of filas) {
    const id = fila[clave];
    if (!mapa.has(id)) mapa.set(id, []);
    mapa.get(id).push(valor(fila));
  }
  return mapa;
}

function leerPreferencia(db, key) {
  const fila = db.prepare('SELECT val FROM preferences WHERE key = ?').get(key);
  if (!fila) return null;
  try {
    return JSON.parse(fila.val);
  } catch {
    return null;
  }
}

function leerColumnasPropias(db) {
  const columnas = db
    .prepare('SELECT id, label, name, datatype, display, is_multiple, normalized FROM custom_columns WHERE mark_for_delete = 0 ORDER BY id')
    .all();

  return columnas.map((c) => {
    let display = {};
    try {
      display = JSON.parse(c.display);
    } catch {}
    const tabla = `custom_column_${c.id}`;
    const filas = c.normalized
      ? db.prepare(`SELECT l.book AS book, v.value AS value FROM books_${tabla}_link l JOIN ${tabla} v ON v.id = l.value`).all()
      : db.prepare(`SELECT book, value FROM ${tabla}`).all();

    const valores = new Map();
    for (const { book, value } of filas) {
      const v = c.datatype === 'bool' ? Boolean(value) : value;
      if (c.is_multiple) {
        if (!valores.has(book)) valores.set(book, []);
        valores.get(book).push(v);
      } else {
        valores.set(book, v);
      }
    }

    return {
      label: c.label,
      name: c.name,
      datatype: c.datatype,
      isMultiple: Boolean(c.is_multiple),
      enumValues: display.enum_values ?? null,
      allowHalfStars: Boolean(display.allow_half_stars),
      valores,
    };
  });
}

/**
 * Lee toda la biblioteca desde una copia de metadata.db.
 * Devuelve { datos } para la interfaz y { archivos } (rutas en disco) solo para el proceso principal.
 */
function cargarBiblioteca(libraryPath, cacheDir) {
  const copia = copiarBase(libraryPath, cacheDir);
  const db = new DatabaseSync(copia, { readOnly: true });
  try {
    const q = (sql) => db.prepare(sql).all();

    const autores = agrupar(
      q('SELECT l.book, a.name FROM books_authors_link l JOIN authors a ON a.id = l.author ORDER BY l.id'),
      'book', (f) => f.name,
    );
    const etiquetas = agrupar(
      q('SELECT l.book, t.name FROM books_tags_link l JOIN tags t ON t.id = l.tag ORDER BY t.name'),
      'book', (f) => f.name,
    );
    const series = new Map(q('SELECT l.book, s.name FROM books_series_link l JOIN series s ON s.id = l.series').map((f) => [f.book, f.name]));
    const editoriales = new Map(q('SELECT l.book, p.name FROM books_publishers_link l JOIN publishers p ON p.id = l.publisher').map((f) => [f.book, f.name]));
    const idiomas = agrupar(
      q('SELECT l.book, g.lang_code FROM books_languages_link l JOIN languages g ON g.id = l.lang_code ORDER BY l.item_order'),
      'book', (f) => f.lang_code,
    );
    const valoraciones = new Map(q('SELECT l.book, r.rating FROM books_ratings_link l JOIN ratings r ON r.id = l.rating').map((f) => [f.book, f.rating]));
    const formatos = agrupar(
      q('SELECT book, format, uncompressed_size, name FROM data ORDER BY format'),
      'book', (f) => ({ format: f.format, size: f.uncompressed_size, name: f.name }),
    );
    const identificadores = agrupar(q('SELECT book, type, val FROM identifiers'), 'book', (f) => [f.type, f.val]);
    const descripciones = new Map(q('SELECT book, text FROM comments').map((f) => [f.book, f.text]));
    const columnas = leerColumnasPropias(db);

    const archivos = new Map();
    const books = q('SELECT id, title, sort, author_sort, path, has_cover, timestamp, pubdate, series_index, last_modified, uuid FROM books').map((b) => {
      const fmts = formatos.get(b.id) ?? [];
      archivos.set(b.id, {
        carpeta: path.join(libraryPath, b.path),
        portada: b.has_cover ? path.join(libraryPath, b.path, 'cover.jpg') : null,
        formatos: Object.fromEntries(fmts.map((f) => [f.format, path.join(libraryPath, b.path, `${f.name}.${f.format.toLowerCase()}`)])),
      });

      const custom = {};
      for (const c of columnas) {
        if (c.valores.has(b.id)) custom[c.label] = c.valores.get(b.id);
      }

      return {
        id: b.id,
        uuid: b.uuid,
        title: b.title,
        sort: b.sort,
        authors: autores.get(b.id) ?? [],
        authorSort: b.author_sort,
        series: series.get(b.id) ?? null,
        seriesIndex: series.has(b.id) ? b.series_index : null,
        tags: etiquetas.get(b.id) ?? [],
        publisher: editoriales.get(b.id) ?? null,
        languages: idiomas.get(b.id) ?? [],
        rating: valoraciones.get(b.id) ?? null,
        formats: fmts.map((f) => ({ format: f.format, size: f.size })),
        identifiers: Object.fromEntries(identificadores.get(b.id) ?? []),
        hasCover: Boolean(b.has_cover),
        added: fecha(b.timestamp),
        pubdate: fecha(b.pubdate),
        lastModified: b.last_modified,
        comments: htmlATexto(descripciones.get(b.id)),
        custom,
      };
    });

    return {
      datos: {
        libraryPath,
        loadedAt: new Date().toISOString(),
        books,
        customColumns: columnas.map(({ valores, ...resto }) => resto),
        virtualLibraries: leerPreferencia(db, 'virtual_libraries') ?? {},
      },
      archivos,
    };
  } finally {
    db.close();
  }
}

module.exports = { detectarBibliotecaDeCalibre, esBibliotecaValida, cargarBiblioteca };
