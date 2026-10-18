// Datos de libros desde la web, sin depender de Google.
//
// Calibre busca en Amazon a través de los resultados de Google, y desde que Google cambió esas
// páginas ya no encuentra ni datos ni portadas. Broots va directo:
//  - Amazon: por ASIN (código de Amazon) o ISBN abre la página del libro; si no hay, busca en Amazon.
//  - Cualquier URL que pegue el usuario: si es Amazon se lee su ficha; si no, los datos estructurados
//    (schema.org Book / Open Graph) que publican la mayoría de librerías y editoriales.
// La página se abre en una ventana invisible, como un navegador común, solo para leerla.
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, net } = require('electron');
const { t } = require('./idioma.cjs');

const ESPERA_MAXIMA = 30000;

const IDIOMAS = {
  español: 'spa', spanish: 'spa', castellano: 'spa', inglés: 'eng', ingles: 'eng', english: 'eng',
  portugués: 'por', portugues: 'por', portuguese: 'por', francés: 'fra', frances: 'fra', french: 'fra',
  italiano: 'ita', italian: 'ita', alemán: 'deu', aleman: 'deu', german: 'deu', catalán: 'cat', catalan: 'cat',
};
const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
  octubre: 10, noviembre: 11, diciembre: 12, january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "1 Julio 2024" / "July 1, 2024" / "2024-07-01" -> "2024-07-01" (o solo el año si no hay más). */
function fechaIso(texto) {
  const t = String(texto ?? '').toLowerCase().trim();
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\s+(?:de\s+)?(\d{4})/.exec(t);
  if (m && MESES[m[2]]) return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m && MESES[m[1]]) return `${m[3]}-${String(MESES[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = /(\d{4})/.exec(t);
  return m ? m[1] : '';
}

/** ISBN-13 que empieza con 978 -> ISBN-10 (Amazon usa el ISBN-10 en sus direcciones de libros). */
function isbn10(isbn) {
  const d = String(isbn ?? '').replace(/[^0-9Xx]/g, '');
  if (d.length === 10) return d.toUpperCase();
  if (d.length !== 13 || !d.startsWith('978')) return null;
  const nueve = d.slice(3, 12);
  const suma = [...nueve].reduce((s, c, i) => s + Number(c) * (10 - i), 0);
  const control = (11 - (suma % 11)) % 11;
  return nueve + (control === 10 ? 'X' : String(control));
}

// ---------- Extracción (se ejecuta dentro de la página) ----------

const EXTRAER_AMAZON = `(() => {
  const limpiar = (s) => String(s ?? '').replace(/[\\u200e\\u200f]/g, '').replace(/\\s+/g, ' ').trim();
  const detalles = {};
  for (const li of document.querySelectorAll('#detailBullets_feature_div li, #productDetails_detailBullets_sections1 tr')) {
    const etiqueta = limpiar(li.querySelector('.a-text-bold, th')?.textContent).replace(/[:\\s]+$/, '');
    const valor = limpiar(li.querySelector('.a-text-bold + span, td')?.textContent);
    if (etiqueta && valor) detalles[etiqueta.toLowerCase()] = valor;
  }
  for (const el of document.querySelectorAll('[id^="rpi-attribute-"]')) {
    const etiqueta = limpiar(el.querySelector('.rpi-attribute-label')?.textContent);
    const valor = limpiar(el.querySelector('.rpi-attribute-value')?.textContent);
    if (etiqueta && valor && !detalles[etiqueta.toLowerCase()]) detalles[etiqueta.toLowerCase()] = valor;
  }
  let portada = null;
  const img = document.querySelector('#landingImage, #ebooksImgBlkFront, #imgBlkFront, #main-image');
  try {
    const opciones = JSON.parse(img?.getAttribute('data-a-dynamic-image') ?? '{}');
    portada = Object.entries(opciones).sort((a, b) => b[1][0] - a[1][0])[0]?.[0] ?? null;
  } catch {}
  portada = portada ?? img?.getAttribute('data-old-hires') ?? img?.src ?? null;
  const descripcion = document.querySelector('#bookDescription_feature_div .a-expander-content, #bookDescription_feature_div noscript, #bookDescription_feature_div');
  return {
    sitio: 'amazon',
    title: limpiar(document.querySelector('#productTitle, #ebooksProductTitle')?.textContent),
    authors: [...document.querySelectorAll('#bylineInfo .author a.a-link-normal, #bylineInfo .contributorNameID')]
      .map((a) => limpiar(a.textContent)).filter((a, i, l) => a && l.indexOf(a) === i),
    detalles,
    comments: limpiar(descripcion?.innerText ?? descripcion?.textContent ?? ''),
    portada,
    captcha: Boolean(document.querySelector('form[action*="validateCaptcha"]')),
  };
})()`;

const EXTRAER_GENERICO = `(() => {
  const meta = (n) => document.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]')?.content?.trim() ?? '';
  let libro = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const datos = JSON.parse(s.textContent);
      const lista = [].concat(datos['@graph'] ?? datos);
      libro = lista.find((x) => /Book|Product/.test([].concat(x['@type']).join(' '))) ?? libro;
    } catch {}
  }
  const nombres = (v) => [].concat(v ?? []).map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean);
  const imagen = (v) => (Array.isArray(v) ? v[0] : typeof v === 'object' ? v?.url : v) ?? null;
  return {
    sitio: 'web',
    title: libro?.name ?? meta('og:title') ?? document.title,
    authors: nombres(libro?.author),
    publisher: nombres(libro?.publisher)[0] ?? '',
    pubdate: libro?.datePublished ?? meta('book:release_date') ?? '',
    isbn: libro?.isbn ?? meta('book:isbn') ?? '',
    language: libro?.inLanguage ?? '',
    comments: libro?.description ?? meta('og:description') ?? meta('description'),
    portada: imagen(libro?.image) ?? meta('og:image') ?? null,
  };
})()`;

/** Abre una página en una ventana invisible y ejecuta un script de extracción. */
async function leerPagina(url, script) {
  const ventana = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: true } });
  const agente = ventana.webContents.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?broots\/\S+/i, '');
  try {
    await Promise.race([
      ventana.loadURL(url, { userAgent: agente, extraHeaders: 'Accept-Language: es-AR,es;q=0.9,en;q=0.6\n' }),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error(t('web.demora'))), ESPERA_MAXIMA)),
    ]);
    await new Promise((r) => setTimeout(r, 800)); // contenido que la página completa después de cargar
    return { url: ventana.webContents.getURL(), datos: await ventana.webContents.executeJavaScript(script) };
  } finally {
    ventana.destroy();
  }
}

/** Convierte la ficha de Amazon en los campos de Broots. */
function desdeAmazon(d, url) {
  const det = (...claves) => {
    for (const clave of claves) for (const [k, v] of Object.entries(d.detalles)) if (k.startsWith(clave)) return v;
    return '';
  };
  const idioma = det('idioma', 'language').toLowerCase();
  const asin = det('asin') || /\/dp\/([A-Z0-9]{10})/.exec(url)?.[1] || '';
  const portada = d.portada ? d.portada.replace(/\._[^/]*_\.(jpe?g|png)$/i, '.$1') : null; // sin sufijo = tamaño completo
  return {
    fuente: 'Amazon',
    title: d.title, // tal cual lo publica Amazon (incluido "(Spanish Edition)" si lo tiene)
    authors: d.authors,
    publisher: det('editorial', 'publisher').replace(/;.*$/, '').replace(/\s*\(.*\)$/, ''),
    pubdate: fechaIso(det('fecha de publicación', 'publication date') || det('editorial', 'publisher')),
    languages: IDIOMAS[idioma] ? [IDIOMAS[idioma]] : [],
    isbn: det('isbn-13', 'isbn-10').replace(/[^0-9Xx]/g, ''),
    pages: Number(/\d+/.exec(det('número de páginas', 'longitud de impresión', 'print length', 'páginas'))?.[0]) || null,
    asin: /^[A-Z0-9]{10}$/.test(asin) ? asin : '',
    comments: d.comments,
    tags: [],
    portadaUrl: portada,
  };
}

function desdeGenerico(d) {
  const idioma = String(d.language ?? '').toLowerCase();
  return {
    fuente: t('web.paginaWeb'),
    title: d.title ?? '',
    authors: d.authors ?? [],
    publisher: d.publisher ?? '',
    pubdate: fechaIso(d.pubdate),
    languages: IDIOMAS[idioma] ? [IDIOMAS[idioma]] : /^[a-z]{3}$/.test(idioma) ? [idioma] : [],
    isbn: String(d.isbn ?? '').replace(/[^0-9Xx]/g, ''),
    pages: null,
    asin: '',
    comments: d.comments ?? '',
    tags: [],
    portadaUrl: d.portada,
  };
}

/** Lee los datos de un libro desde cualquier URL (Amazon o una página con datos estructurados). */
async function desdeUrl(url) {
  let direccion;
  try {
    direccion = new URL(String(url).trim());
    if (!/^https?:$/.test(direccion.protocol)) throw new Error();
  } catch {
    return { ok: false, mensaje: t('web.direccionInvalida') };
  }
  const esAmazon = /(^|\.)amazon\.[a-z.]+$/i.test(direccion.hostname);
  try {
    const { url: final, datos } = await leerPagina(direccion.href, esAmazon ? EXTRAER_AMAZON : EXTRAER_GENERICO);
    if (esAmazon) {
      if (datos.captcha) return { ok: false, mensaje: t('web.captcha') };
      if (!datos.title) return { ok: false, mensaje: t('web.sinDatosAmazon') };
      return { ok: true, datos: desdeAmazon(datos, final) };
    }
    if (!datos.title) return { ok: false, mensaje: t('web.sinDatos') };
    return { ok: true, datos: desdeGenerico(datos) };
  } catch (error) {
    return { ok: false, mensaje: t('web.noPudeLeer', { error: error.message }) };
  }
}

/** Busca el libro en Amazon usando lo que ya se sabe: ASIN, después ISBN, y si no, título y autor. */
async function buscarEnAmazon(libro) {
  const ids = libro.identifiers ?? {};
  const asin = ids.amazon || ids.mobi_asin || ids.asin;
  if (asin) return desdeUrl(`https://www.amazon.com/dp/${asin}`);
  const diez = isbn10(ids.isbn);
  if (diez) {
    const r = await desdeUrl(`https://www.amazon.com/dp/${diez}`);
    if (r.ok) return r;
  }
  // Búsqueda dentro de Amazon (no en Google): se abre el primer libro de los resultados.
  const consulta = [libro.title.replace(/\(.*?\)/g, ''), libro.authors?.[0]].filter(Boolean).join(' ');
  try {
    const { datos } = await leerPagina(
      `https://www.amazon.com/s?k=${encodeURIComponent(consulta)}&i=stripbooks-intl-ship`,
      `[...document.querySelectorAll('[data-component-type="s-search-result"] a[href*="/dp/"]')].map((a) => a.href)[0] ?? null`,
    );
    if (!datos) return { ok: false, mensaje: t('web.sinLibroAmazon') };
    return desdeUrl(datos);
  } catch (error) {
    return { ok: false, mensaje: t('web.noPudeBuscar', { error: error.message }) };
  }
}

/** Descarga una portada a un archivo temporal. Devuelve la ruta o null. */
async function descargarPortada(url, destino) {
  if (!url) return null;
  try {
    const respuesta = await net.fetch(url);
    if (!respuesta.ok) return null;
    const datos = Buffer.from(await respuesta.arrayBuffer());
    if (datos.length < 2000) return null; // imágenes vacías o "sin portada"
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, datos);
    return destino;
  } catch {
    return null;
  }
}

module.exports = { desdeUrl, buscarEnAmazon, descargarPortada, isbn10, fechaIso };
