// Buscar datos y portada de un libro en internet con la herramienta de Calibre (fetch-ebook-metadata).
//
// Nunca se aplica nada automáticamente: la búsqueda puede equivocarse de edición (p. ej. traer la
// segunda parte de un libro), así que se muestra una vista previa y el usuario elige qué aplicar.
const fs = require('node:fs');
const path = require('node:path');
const calibre = require('./calibre.cjs');
const { t } = require('./idioma.cjs');

// Cómo llama Calibre (o Broots, al agregar un libro sin autor) al autor desconocido, según el idioma.
const AUTOR_DESCONOCIDO = ['Desconocido', 'Unknown', 'Desconhecido'];

function decodificar(texto) {
  return String(texto ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function htmlATexto(html) {
  return decodificar(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lee los datos útiles de la ficha OPF que devuelve Calibre. */
function leerOpf(opf) {
  const uno = (etiqueta) => decodificar(new RegExp(`<dc:${etiqueta}[^>]*>([^<]*)<`, 'i').exec(opf)?.[1] ?? '').trim();
  const todos = (etiqueta) => [...opf.matchAll(new RegExp(`<dc:${etiqueta}[^>]*>([^<]*)<`, 'gi'))].map((m) => decodificar(m[1]).trim()).filter(Boolean);
  const identificador = (esquema) => new RegExp(`scheme="${esquema}"[^>]*>([^<]*)<`, 'i').exec(opf)?.[1]?.trim() ?? '';
  const descripcion = /<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i.exec(opf)?.[1] ?? '';
  return {
    title: uno('title'),
    authors: todos('creator'),
    publisher: uno('publisher'),
    pubdate: uno('date').slice(0, 4),
    languages: todos('language'),
    tags: todos('subject'),
    comments: htmlATexto(descripcion),
    isbn: identificador('ISBN'),
  };
}

/**
 * Busca datos del libro con la búsqueda de Calibre (Google Books y Open Library). Devuelve
 * { ok, datos, portada } donde portada es la ruta de la imagen descargada (o null).
 * Con `amazon: true` (Configuración → Privacidad; apagado de fábrica) busca primero directo en
 * Amazon (por ASIN, ISBN o título y autor). Sin eso, no se consulta Amazon en ningún paso.
 */
async function buscar(libro, carpetaTemporal, { amazon = false } = {}) {
  const web = require('./web.cjs');
  if (amazon) {
    const enAmazon = await web.buscarEnAmazon(libro);
    if (enAmazon.ok) {
      const portada = await web.descargarPortada(enAmazon.datos.portadaUrl, path.join(carpetaTemporal, `portada-web-${libro.id}.jpg`));
      return { ok: true, datos: enAmazon.datos, portada };
    }
  }
  const enCalibre = await buscarConCalibre(libro, carpetaTemporal, { amazon });
  if (enCalibre.ok || enCalibre.sinHerramientas) return enCalibre;
  return { ok: false, mensaje: t(amazon ? 'metadatos.sinDatosConAmazon' : 'metadatos.sinDatos') };
}

/** Lee los datos desde una dirección que pega el usuario (Amazon, editorial, librería…). */
async function buscarEnUrl(libro, url, carpetaTemporal) {
  const web = require('./web.cjs');
  const r = await web.desdeUrl(url);
  if (!r.ok) return r;
  const portada = await web.descargarPortada(r.datos.portadaUrl, path.join(carpetaTemporal, `portada-web-${libro.id}.jpg`));
  return { ok: true, datos: r.datos, portada };
}

// Fuentes de la herramienta de Calibre sin Amazon (los nombres son los de fetch-ebook-metadata --help).
const FUENTES_SIN_AMAZON = ['Google', 'Google Images', 'Edelweiss', 'Open Library'];

/** Búsqueda con la herramienta de Calibre (hoy encuentra datos en Google Books, pero casi nunca portadas). */
async function buscarConCalibre(libro, carpetaTemporal, { amazon = false } = {}) {
  const programa = calibre.herramienta('fetch-ebook-metadata');
  if (!programa) return calibre.sinHerramientas();
  fs.mkdirSync(carpetaTemporal, { recursive: true });
  const portada = path.join(carpetaTemporal, `portada-web-${libro.id}.jpg`);
  fs.rmSync(portada, { force: true });

  const argumentos = ['--title', libro.title, '--opf', '--cover', portada, '--timeout', '40'];
  if (libro.authors.length && !AUTOR_DESCONOCIDO.includes(libro.authors[0])) argumentos.push('--authors', libro.authors.join(' & '));
  if (libro.identifiers?.isbn) argumentos.push('--isbn', libro.identifiers.isbn);
  if (amazon && libro.identifiers?.amazon) argumentos.push('--identifier', `amazon:${libro.identifiers.amazon}`);
  if (!amazon) for (const fuente of FUENTES_SIN_AMAZON) argumentos.push('--allowed-plugin', fuente);

  const r = await calibre.ejecutar(programa, argumentos, 120000);
  const opf = r.salida.trim();
  if (!opf.includes('<dc:title')) return { ok: false, mensaje: t('metadatos.sinDatosInternet') };
  return { ok: true, datos: { ...leerOpf(opf), fuente: t('metadatos.fuenteCalibre') }, portada: fs.existsSync(portada) ? portada : null };
}

/** Dirección de Google Imágenes para buscar la portada a mano. */
function busquedaDePortada(libro) {
  const consulta = `${libro.title} ${libro.authors[0] ?? ''} ${t('metadatos.busquedaPortada')}`.trim();
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(consulta)}`;
}

module.exports = { buscar, buscarEnUrl, leerOpf, busquedaDePortada };
