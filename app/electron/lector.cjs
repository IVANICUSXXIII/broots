// Etapa 5: lector de EPUB. Abre el archivo (un .zip) en memoria y entrega a la interfaz la lista de
// capítulos, el índice y el contenido de cada capítulo. Las imágenes del libro se sirven con el
// protocolo libro://epub/<id>/<ruta dentro del EPUB>. Nada se modifica: el EPUB solo se lee.
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync, strFromU8 } = require('fflate');
const { t } = require('./idioma.cjs');

const abiertos = new Map(); // ruta del EPUB -> { mtime, archivos, estructura }

const TIPOS = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
};

function decodificar(texto) {
  return String(texto ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Ruta relativa dentro del EPUB -> ruta absoluta dentro del zip ("OEBPS/text/../img/a.jpg" -> "OEBPS/img/a.jpg"). */
function resolver(base, relativa) {
  const sinAncla = decodeURIComponent(relativa.split('#')[0]);
  return path.posix.normalize(path.posix.join(path.posix.dirname(base), sinAncla)).replace(/^\.\//, '');
}

const atributo = (etiqueta, nombre) => decodificar(new RegExp(`\\s${nombre}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(etiqueta)?.slice(2, 4).find((v) => v != null) ?? '');

/** Índice del libro: navegación EPUB 3 (nav.xhtml) o, si no hay, el NCX de EPUB 2. */
function leerIndice(archivos, manifiesto, opfRuta, opf) {
  const nav = manifiesto.find((m) => /\bnav\b/.test(m.properties));
  if (nav && archivos[nav.ruta]) {
    const html = strFromU8(archivos[nav.ruta]);
    const toc = /<nav[^>]*epub:type\s*=\s*["']toc["'][^>]*>([\s\S]*?)<\/nav>/i.exec(html)?.[1] ?? '';
    const entradas = [];
    let nivel = 0;
    for (const m of toc.matchAll(/<(\/?)(ol|li)\b[^>]*>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (m[2]?.toLowerCase() === 'ol') nivel += m[1] ? -1 : 1;
      else if (m[3] != null) {
        const titulo = decodificar(m[4].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        const href = atributo(`<a ${m[3]}>`, 'href');
        if (titulo && href) entradas.push({ titulo, href: resolver(nav.ruta, href) + (href.includes('#') ? `#${href.split('#')[1]}` : ''), nivel: Math.max(0, nivel - 1) });
      }
    }
    if (entradas.length) return entradas;
  }
  const idNcx = /<spine[^>]*\btoc\s*=\s*["']([^"']+)["']/i.exec(opf)?.[1];
  const ncx = manifiesto.find((m) => m.id === idNcx || m.tipo === 'application/x-dtbncx+xml');
  if (!ncx || !archivos[ncx.ruta]) return [];
  const xml = strFromU8(archivos[ncx.ruta]);
  const entradas = [];
  let nivel = -1;
  for (const m of xml.matchAll(/<navPoint\b[^>]*>|<\/navPoint>|<text>([\s\S]*?)<\/text>|<content\b([^>]*)\/?>/gi)) {
    if (/^<navPoint/i.test(m[0])) nivel++;
    else if (/^<\/navPoint/i.test(m[0])) nivel--;
    else if (m[1] != null) entradas.push({ titulo: decodificar(m[1]).replace(/\s+/g, ' ').trim(), href: '', nivel: Math.max(0, nivel) });
    else if (m[2] != null && entradas.length && !entradas.at(-1).href) {
      const src = atributo(`<c ${m[2]}>`, 'src');
      entradas.at(-1).href = resolver(ncx.ruta, src) + (src.includes('#') ? `#${src.split('#')[1]}` : '');
    }
  }
  return entradas.filter((e) => e.titulo && e.href);
}

// Ofuscación de fuentes (IDPF y Adobe): no es DRM, solo esconde las tipografías incluidas, y el
// lector usa las suyas. Cualquier otro cifrado (o un rights.xml de Adobe) sí es DRM.
const OFUSCACION_DE_FUENTES = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);

function tieneDrm(archivos) {
  if (archivos['META-INF/rights.xml']) return true;
  const cifrado = archivos['META-INF/encryption.xml'];
  if (!cifrado) return false;
  return [...strFromU8(cifrado).matchAll(/<EncryptionMethod\b[^>]*Algorithm\s*=\s*["']([^"']+)["']/gi)].some((m) => !OFUSCACION_DE_FUENTES.has(m[1]));
}

/** Abre el EPUB (o lo toma de la memoria si no cambió) y devuelve su estructura. */
function abrir(ruta) {
  const mtime = fs.statSync(ruta).mtimeMs;
  const previo = abiertos.get(ruta);
  if (previo && previo.mtime === mtime) return previo;

  const archivos = unzipSync(fs.readFileSync(ruta));
  const contenedor = archivos['META-INF/container.xml'];
  if (!contenedor) throw new Error(t('lector.noEsEpub'));
  const opfRuta = atributo(/<rootfile\b[^>]*>/i.exec(strFromU8(contenedor))?.[0] ?? '', 'full-path');
  if (!archivos[opfRuta]) throw new Error(t('lector.sinOpf'));
  const opf = strFromU8(archivos[opfRuta]);
  if (tieneDrm(archivos)) throw new Error(t('lector.drm'));

  const manifiesto = [...opf.matchAll(/<item\b[^>]*>/gi)].map(([etiqueta]) => ({
    id: atributo(etiqueta, 'id'),
    ruta: resolver(opfRuta, atributo(etiqueta, 'href')),
    tipo: atributo(etiqueta, 'media-type'),
    properties: atributo(etiqueta, 'properties'),
  }));
  const porId = new Map(manifiesto.map((m) => [m.id, m]));
  const capitulos = [...opf.matchAll(/<itemref\b[^>]*>/gi)]
    .map(([etiqueta]) => porId.get(atributo(etiqueta, 'idref')))
    .filter((m) => m && /html|xml/.test(m.tipo) && archivos[m.ruta])
    .map((m) => ({ href: m.ruta, largo: archivos[m.ruta].length }));
  if (!capitulos.length) throw new Error(t('lector.sinCapitulos'));

  const estructura = {
    capitulos,
    indice: leerIndice(archivos, manifiesto, opfRuta, opf),
    idioma: /<dc:language[^>]*>([^<]*)</i.exec(opf)?.[1]?.trim().toLowerCase() ?? '',
  };
  const abierto = { mtime, archivos, estructura };
  abiertos.clear(); // un libro abierto a la vez: libera la memoria del anterior
  abiertos.set(ruta, abierto);
  return abierto;
}

function capitulo(ruta, href) {
  const datos = abrir(ruta).archivos[href];
  if (!datos) throw new Error(t('lector.sinCapitulo'));
  return strFromU8(datos);
}

/** Respuesta para libro://epub/<id>/<ruta>: imágenes del EPUB abierto. */
function recurso(ruta, interna) {
  const datos = abrir(ruta).archivos[interna];
  const tipo = TIPOS[path.extname(interna).toLowerCase()];
  if (!datos || !tipo) return new Response(null, { status: 404 });
  return new Response(datos, { headers: { 'content-type': tipo } });
}

module.exports = { abrir, capitulo, recurso, resolver };
