// Club de lectura: arma el archivo .md de un libro para llevarlo a Claude (Project) o a NotebookLM.
//
// El archivo tiene SOLO material del libro (datos, descripción y tus subrayados y notas, del Kindle y del lector
// de Broots, en orden de lectura). Las instrucciones de "compañero de club" viven en el Project de Claude y en la skill de
// Gemini, así no se repiten en cada archivo.
// Se guarda en <biblioteca>/.broots/club-de-lectura/ (en Drive, junto con los subrayados).
// Se escribe en el idioma de Broots (el nombre de la carpeta no cambia).
const fs = require('node:fs');
const path = require('node:path');
const idiomas = require('./idioma.cjs');
const { t } = idiomas;

function idioma(codigo) {
  try {
    const nombre = new Intl.DisplayNames([idiomas.region()], { type: 'language' }).of(codigo);
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  } catch {
    return codigo;
  }
}

function fecha(iso, opciones = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return iso ? new Date(iso).toLocaleDateString(idiomas.region(), opciones) : null;
}

/** Nombre de archivo válido en Windows: "Título - Autor.md". */
function nombreArchivo(libro) {
  const base = `${libro.title} - ${libro.authors[0] ?? t('club.autorDesconocido')}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
  return `${base}.md`;
}

/**
 * Cita de un subrayado en Markdown: el texto citado y debajo de dónde sale. Desde la 1.8 llegan juntos los del
 * Kindle y los del lector de Broots (ver anotaciones.listaDelLibro), con el capítulo cuando se sabe.
 */
function bloqueSubrayado(s) {
  const lugar = [
    s.titulo && t('club.capitulo', { titulo: s.titulo }),
    s.pagina && t('club.pagina', { n: s.pagina[0] }),
    s.ubicacion && t('club.posicion', { n: s.ubicacion[0] }),
    fecha(s.fecha, { day: 'numeric', month: 'short', year: 'numeric' }),
  ]
    .filter(Boolean)
    .join(' · ');
  if (s.tipo === 'nota') {
    return [`**✎ ${t('club.notaSuelta')}:** ${s.texto}`, lugar && `<sub>${lugar}</sub>`].filter(Boolean).join('\n\n');
  }
  const cita = s.texto.split('\n').map((linea) => `> ${linea}`).join('\n');
  return [cita, lugar && `<sub>${lugar}</sub>`, s.nota && `**✎ ${t('club.miNota')}:** ${s.nota}`].filter(Boolean).join('\n\n');
}

/** Contenido completo del archivo .md de un libro. */
function armarMarkdown(libro, subrayados) {
  const datos = [
    [t('club.autor'), libro.authors.join(', ')],
    [t('club.serie'), libro.series && `${libro.series}${libro.seriesIndex != null ? ` (${t('club.libroDeSerie', { n: libro.seriesIndex })})` : ''}`],
    [t('club.publicado'), libro.pubdate?.slice(0, 4)],
    [t('club.editorial'), libro.publisher],
    [t('club.idioma'), libro.languages.map(idioma).join(', ')],
    [t('club.isbn'), libro.identifiers?.isbn],
    [t('club.etiquetas'), libro.tags.filter((t) => !/<\/?[a-z]|^[^\p{L}\p{N}]+$/iu.test(t)).join(', ')],
  ].filter(([, valor]) => valor);

  const partes = [
    `# ${libro.title}`,
    datos.map(([clave, valor]) => `- **${clave}:** ${valor}`).join('\n'),
  ];
  if (libro.comments) partes.push(`## ${t('club.descripcion')}`, libro.comments);

  const subrayadosReales = subrayados.filter((s) => s.tipo !== 'nota').length;
  const notas = subrayados.filter((s) => s.nota || s.tipo === 'nota').length;
  let resumen = t('club.sinSubrayados');
  if (subrayados.length) {
    const cuantos = { subrayados: t('club.subrayados', { n: subrayadosReales }), notas: t('club.notas', { n: notas }) };
    resumen = t(notas ? 'club.resumenConNotas' : 'club.resumen', cuantos);
    if (notas) resumen += ` ${t('club.aclaracionNotas')}`;
  }
  partes.push(`## ${t('club.misSubrayados')}`, resumen);
  if (subrayados.length) partes.push(subrayados.map(bloqueSubrayado).join('\n\n---\n\n'));
  partes.push(`---\n\n_${t('club.exportado', { fecha: fecha(new Date().toISOString()) })}_`);
  return `${partes.join('\n\n')}\n`;
}

/** Escribe el .md del libro y devuelve su ruta. */
function exportar(libraryPath, libro, subrayados) {
  const carpeta = path.join(libraryPath, '.broots', 'club-de-lectura');
  fs.mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, nombreArchivo(libro));
  fs.writeFileSync(ruta, armarMarkdown(libro, subrayados), 'utf8');
  return ruta;
}

module.exports = { exportar, armarMarkdown, nombreArchivo };
