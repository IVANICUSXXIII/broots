// Duplicados: libros repetidos en la biblioteca.
//
// Detección (sin IA): mismo título (sin aclaraciones entre paréntesis como "(Spanish Edition)") y
// mismo autor, o mismo ISBN. Se sugiere conservar el más completo, pero decide el usuario.
// Al resolver: los formatos que solo tenía el descartado pasan al conservado, también sus
// subrayados, y el descartado va a la papelera de Calibre (se puede recuperar).
const calibre = require('./calibre.cjs');
const { t } = require('./idioma.cjs');

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Título comparable: sin lo que va entre paréntesis o corchetes ("(Spanish Edition)", "(Edición mexicana)"). */
function tituloClave(titulo) {
  return normalizar(String(titulo).replace(/\([^)]*\)|\[[^\]]*\]/g, ' '));
}

function apellidos(libro) {
  const autor = libro.authors.find((a) => !/desconocido|unknown|desconhecido/i.test(a)) ?? '';
  return normalizar(autor).split(' ').filter((p) => p.length > 2);
}

/** Puntaje para sugerir cuál conservar: más formatos, EPUB, portada, subrayados. */
function completitud(libro, subrayados) {
  return (
    libro.formats.length * 10 +
    (libro.formats.some((f) => f.format === 'EPUB') ? 15 : 0) +
    (libro.hasCover ? 8 : 0) +
    (libro.comments ? 3 : 0) +
    Math.min(subrayados(libro), 50)
  );
}

/**
 * Agrupa los libros repetidos. Devuelve [{ libros: [...ids], sugerido: id, motivo }].
 * subrayados(libro) -> cantidad de subrayados del libro (para no perderlos al elegir).
 */
function buscar(libros, subrayados = () => 0) {
  const padre = new Map(libros.map((l) => [l.id, l.id]));
  const raiz = (id) => (padre.get(id) === id ? id : (padre.set(id, raiz(padre.get(id))), padre.get(id)));
  const unir = (a, b) => padre.set(raiz(a), raiz(b));
  const motivos = new Map();

  const porClave = new Map();
  for (const libro of libros) {
    const titulo = tituloClave(libro.title);
    if (titulo.length < 3) continue;
    const clave = `${titulo}|${apellidos(libro).at(-1) ?? ''}`;
    if (porClave.has(clave)) {
      unir(libro.id, porClave.get(clave));
      motivos.set(raiz(libro.id), t('duplicados.tituloAutor'));
    } else porClave.set(clave, libro.id);
  }
  const porIsbn = new Map();
  for (const libro of libros) {
    const isbn = String(libro.identifiers?.isbn ?? '').replace(/[^0-9xX]/g, '');
    if (isbn.length < 10) continue;
    if (porIsbn.has(isbn)) {
      unir(libro.id, porIsbn.get(isbn));
      if (!motivos.has(raiz(libro.id))) motivos.set(raiz(libro.id), t('duplicados.isbn'));
    } else porIsbn.set(isbn, libro.id);
  }

  const grupos = new Map();
  for (const libro of libros) {
    const r = raiz(libro.id);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(libro);
  }
  return [...grupos.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([r, lista]) => {
      const ordenados = [...lista].sort((a, b) => completitud(b, subrayados) - completitud(a, subrayados));
      return { libros: ordenados.map((l) => l.id), sugerido: ordenados[0].id, motivo: motivos.get(raiz(r)) ?? t('duplicados.tituloAutor') };
    });
}

/**
 * Resuelve un grupo: pasa al conservado los formatos que le faltan y manda los demás a la papelera.
 * formatos: Map id -> { FORMATO: ruta }.
 */
async function resolver(libraryPath, conservar, descartar, formatos) {
  const propios = new Set(Object.keys(formatos.get(conservar) ?? {}));
  const pasados = [];
  for (const id of descartar) {
    for (const [formato, ruta] of Object.entries(formatos.get(id) ?? {})) {
      if (propios.has(formato)) continue;
      const r = await calibre.calibredb(libraryPath, ['add_format', String(conservar), ruta]);
      if (!r.ok) return r;
      propios.add(formato);
      pasados.push(formato);
    }
  }
  // Sin --permanent: va a la papelera de Calibre (.caltrash) y se puede recuperar desde Calibre.
  const r = await calibre.calibredb(libraryPath, ['remove', descartar.join(',')]);
  return r.ok ? { ok: true, pasados } : r;
}

module.exports = { buscar, resolver, tituloClave };
