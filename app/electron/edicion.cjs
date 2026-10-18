// Etapa 4: editar libros, cambiar portadas, agregar archivos y convertir formatos.
// Todo pasa por las herramientas oficiales de Calibre (ver calibre.cjs): nada se escribe a mano.
const fs = require('node:fs');
const path = require('node:path');
const calibre = require('./calibre.cjs');
const { idAgregado } = require('./agregar.cjs');
const { t } = require('./idioma.cjs');

// ---------- Editar datos ----------

function escaparHtml(texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Descripción en texto plano -> HTML simple por párrafos (como la guarda Calibre). */
function textoAHtml(texto) {
  const parrafos = String(texto ?? '').trim().split(/\n\s*\n/).filter(Boolean);
  return parrafos.map((p) => `<p>${escaparHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * Fecha 'AAAA' o 'AAAA-MM-DD' -> mediodía UTC explícito. Sin hora ni zona, calibredb la guarda un día
 * después; solo el año se guarda a mitad de año para que nunca se corra al año anterior.
 */
function fechaParaCalibre(valor) {
  const fecha = String(valor ?? '').trim();
  if (/^\d{4}$/.test(fecha)) return `${fecha}-06-15T12:00:00+00:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return `${fecha}T12:00:00+00:00`;
  return fecha;
}

/**
 * Convierte los cambios de la interfaz en argumentos --field de calibredb.
 * cambios: { title, authors[], series, seriesIndex, publisher, pubdate ('AAAA' o 'AAAA-MM-DD'),
 *            languages[], tags[], comments (texto), custom: { etiqueta: valor } }
 * columnas: las columnas propias de la biblioteca (para saber el tipo de cada una).
 */
function camposDe(cambios, columnas) {
  const campos = [];
  const poner = (campo, valor) => campos.push('--field', `${campo}:${valor ?? ''}`);
  if ('title' in cambios) poner('title', cambios.title.trim());
  if ('sort' in cambios) poner('sort', cambios.sort.trim());
  if ('authors' in cambios) poner('authors', cambios.authors.map((a) => a.trim()).filter(Boolean).join(' & '));
  if ('authorSort' in cambios) poner('author_sort', cambios.authorSort.trim());
  if ('rating' in cambios) poner('rating', cambios.rating ? cambios.rating / 2 : ''); // calificación de Calibre, en estrellas
  if ('added' in cambios && cambios.added) poner('timestamp', fechaParaCalibre(cambios.added));
  if ('series' in cambios) poner('series', cambios.series?.trim());
  if ('seriesIndex' in cambios && cambios.seriesIndex !== '' && cambios.seriesIndex != null) poner('series_index', Number(cambios.seriesIndex));
  if ('publisher' in cambios) poner('publisher', cambios.publisher?.trim());
  if ('pubdate' in cambios) poner('pubdate', fechaParaCalibre(cambios.pubdate));
  if ('languages' in cambios) poner('languages', cambios.languages.join(','));
  if ('tags' in cambios) poner('tags', cambios.tags.map((t) => t.replace(/,/g, ' ').trim()).filter(Boolean).join(','));
  if ('comments' in cambios) poner('comments', textoAHtml(cambios.comments));
  // Calibre reemplaza TODOS los identificadores: se pasa la lista completa (los que ya tenía + los nuevos).
  if (cambios.identifiers) poner('identifiers', Object.entries(cambios.identifiers).map(([k, v]) => `${k}:${v}`).join(','));
  for (const [etiqueta, valor] of Object.entries(cambios.custom ?? {})) {
    const columna = columnas.find((c) => c.label === etiqueta);
    if (!columna) continue;
    if (columna.datatype === 'rating') poner(`#${etiqueta}`, valor ? valor / 2 : ''); // Calibre recibe estrellas (1-5)
    else if (columna.datatype === 'bool') poner(`#${etiqueta}`, valor == null ? '' : valor ? 'true' : 'false');
    else poner(`#${etiqueta}`, valor ?? '');
  }
  return campos;
}

async function editar(libraryPath, id, cambios, columnas) {
  const campos = camposDe(cambios, columnas);
  if (!campos.length) return { ok: true };
  return calibre.calibredb(libraryPath, ['set_metadata', String(id), ...campos]);
}

/** Cambia la portada a partir de una imagen (JPG, PNG, WEBP…; Calibre la convierte sola). */
async function cambiarPortada(libraryPath, id, rutaImagen) {
  if (!rutaImagen || !fs.existsSync(rutaImagen)) return { ok: false, mensaje: t('edicion.sinImagen') };
  return calibre.calibredb(libraryPath, ['set_metadata', String(id), '--field', `cover:${rutaImagen}`]);
}

// ---------- Agregar archivos ----------

const EXTENSIONES_AGREGABLES = ['.epub', '.pdf', '.mobi', '.azw', '.azw3', '.kfx', '.txt', '.docx', '.rtf', '.fb2', '.cbz', '.cbr', '.djvu', '.lit', '.prc'];

/**
 * Agrega archivos de libros a la biblioteca, de a uno (Calibre lee título, autor y portada del archivo).
 * Si Calibre detecta que el libro ya existe, no lo duplica y lo informa.
 */
async function agregarArchivos(libraryPath, rutas) {
  const resultados = [];
  for (const ruta of rutas) {
    const nombre = path.basename(ruta);
    if (!EXTENSIONES_AGREGABLES.includes(path.extname(ruta).toLowerCase())) {
      resultados.push({ nombre, ok: false, mensaje: t('edicion.noEsLibro') });
      continue;
    }
    const r = await calibre.calibredb(libraryPath, ['add', ruta]);
    const id = r.ok ? idAgregado(r.salida) : null;
    if (id) resultados.push({ nombre, ok: true, id });
    else if (r.ok) resultados.push({ nombre, ok: false, mensaje: t('edicion.yaEsta') });
    else resultados.push({ nombre, ok: false, mensaje: r.mensaje });
  }
  return resultados;
}

// ---------- Convertir formatos ----------

// Formato de origen preferido para convertir (los más fieles primero). KFX/KFX-ZIP no se pueden leer.
const ORIGENES = ['EPUB', 'AZW3', 'MOBI', 'AZW', 'DOCX', 'FB2', 'RTF', 'HTMLZ', 'TXT', 'PDF'];

/** ¿El archivo MOBI/AZW/AZW3 tiene protección (DRM)? Esos no se pueden convertir. */
function protegido(ruta) {
  if (!/\.(azw3?|mobi|prc)$/i.test(ruta)) return false;
  try {
    const fd = fs.openSync(ruta, 'r');
    const cabecera = Buffer.alloc(86);
    fs.readSync(fd, cabecera, 0, 86, 0);
    const cifrado = Buffer.alloc(2);
    fs.readSync(fd, cifrado, 0, 2, cabecera.readUInt32BE(78) + 12);
    fs.closeSync(fd);
    return cifrado.readUInt16BE(0) !== 0;
  } catch {
    return false;
  }
}

/** Elige desde qué formato convertir. Devuelve { formato, ruta } o { motivo }. */
function origenDeConversion(formatos, destino) {
  const disponibles = ORIGENES.filter((f) => f !== destino && formatos[f] && fs.existsSync(formatos[f]));
  const libres = disponibles.filter((f) => !protegido(formatos[f]));
  if (libres.length) return { formato: libres[0], ruta: formatos[libres[0]] };
  if (disponibles.length) return { motivo: t('edicion.protegido') };
  if (Object.keys(formatos).some((f) => f.startsWith('KFX'))) return { motivo: t('edicion.kfx') };
  return { motivo: t('edicion.sinOrigen') };
}

/**
 * Convierte un libro a EPUB o PDF con ebook-convert y agrega el resultado como un formato más.
 * Puede tardar (de segundos a un par de minutos según el libro).
 */
async function convertir(libraryPath, id, formatos, destino, carpetaTemporal) {
  const conversor = calibre.herramienta('ebook-convert');
  if (!conversor) return calibre.sinHerramientas();
  if (formatos[destino]) return { ok: false, mensaje: t('edicion.yaTiene', { formato: destino }) };
  const origen = origenDeConversion(formatos, destino);
  if (!origen.ruta) return { ok: false, mensaje: origen.motivo };

  fs.mkdirSync(carpetaTemporal, { recursive: true });
  const salida = path.join(carpetaTemporal, `conversion-${id}.${destino.toLowerCase()}`);
  fs.rmSync(salida, { force: true });
  const opciones = destino === 'PDF' ? ['--paper-size', 'a5', '--pdf-default-font-size', '16'] : [];
  const r = await calibre.ejecutar(conversor, [origen.ruta, salida, ...opciones], 15 * 60 * 1000);
  if (r.error || !fs.existsSync(salida)) {
    console.error('[convertir] ebook-convert falló:', r.errores || r.error?.message);
    // Con algunos libros (ciertas fuentes o imágenes) el conversor de Calibre se cierra solo al final.
    const otro = destino === 'PDF' ? 'EPUB' : 'PDF';
    return { ok: false, mensaje: t('edicion.noPudoConvertir', { formato: destino, otro }) };
  }
  const alta = await calibre.calibredb(libraryPath, ['add_format', String(id), salida]);
  fs.rmSync(salida, { force: true });
  return alta.ok ? { ok: true, desde: origen.formato, formato: destino } : alta;
}

module.exports = { editar, cambiarPortada, agregarArchivos, convertir, origenDeConversion, textoAHtml, EXTENSIONES_AGREGABLES };
