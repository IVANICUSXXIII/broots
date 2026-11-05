// 1.11: los archivos del lector de páginas (PDF y cómics). Nada se modifica: el archivo del libro solo se lee.
//
// PDF: la interfaz lo abre con pdf.js y acá se le entregan pedazos del archivo a medida que los pide, así un PDF enorme
// no se carga entero en memoria. Si tiene DRM o contraseña, pdf.js no lo abre y la interfaz explica por qué.
//
// CBZ: es un zip de imágenes. Se lee su directorio y cada página se saca del archivo recién cuando se la pide.
// CBR: es un RAR. Lo descomprime libarchive en otro hilo (extraerComic.cjs) a una carpeta temporal fuera de la biblioteca,
// que se borra al abrir otro cómic y al cerrar Broots. Se decide por los primeros bytes y no por la extensión: hay muchos
// .cbr que por dentro son zip, y al revés. Las páginas se sirven con libro://comic/<id>/<n>.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Worker } = require('node:worker_threads');
const { Inflate, inflateSync, strFromU8 } = require('fflate');
const { t } = require('./idioma.cjs');
const { decodificar } = require('./lector.cjs');

const ES_IMAGEN = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const ES_FICHA = /(^|\/)comicinfo\.xml$/i;
const ES_BASURA = /(^|\/)(__MACOSX\/|\.)/; // restos de macOS y archivos ocultos
const TIPOS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif' };
const CABECERA = 64 * 1024; // alcanza para saber lo que mide una imagen
const PAGINA_MAXIMA = 512 * 1024 * 1024; // una «página» más grande que esto no es una página
const ordenNatural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

let abierto = null; // { ruta, mtime, estructura, paginas: [{ leer }] }: un cómic por vez
let hilo = null; // la extracción en curso
let ultimoPedido = 0; // si abrís otro cómic mientras este termina de abrirse, gana el último

function leerTrozo(descriptor, inicio, largo) {
  const datos = Buffer.alloc(largo);
  const leidos = fs.readSync(descriptor, datos, 0, largo, inicio);
  return leidos === largo ? datos : datos.subarray(0, leidos);
}

/** Lo que mide una imagen, mirando solo su principio. null si no se sabe (la interfaz la mide al mostrarla). */
function tamanoImagen(d) {
  if (d.length < 26) return null;
  if (d[0] === 0x89 && d[1] === 0x50) return { ancho: d.readUInt32BE(16), alto: d.readUInt32BE(20) }; // PNG
  if (d[0] === 0x47 && d[1] === 0x49) return { ancho: d.readUInt16LE(6), alto: d.readUInt16LE(8) }; // GIF
  if (d[0] === 0x42 && d[1] === 0x4d) return { ancho: d.readInt32LE(18), alto: Math.abs(d.readInt32LE(22)) }; // BMP
  if (d.toString('latin1', 0, 4) === 'RIFF' && d.toString('latin1', 8, 12) === 'WEBP') {
    const tipo = d.toString('latin1', 12, 16);
    if (tipo === 'VP8X' && d.length >= 30) return { ancho: 1 + d.readUIntLE(24, 3), alto: 1 + d.readUIntLE(27, 3) };
    if (tipo === 'VP8 ' && d.length >= 30) return { ancho: d.readUInt16LE(26) & 0x3fff, alto: d.readUInt16LE(28) & 0x3fff };
    if (tipo === 'VP8L') {
      const bits = d.readUInt32LE(21);
      return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (d[0] === 0xff && d[1] === 0xd8) {
    // JPEG: se saltea de bloque en bloque hasta el que trae el tamaño (SOF).
    let i = 2;
    while (i + 9 < d.length) {
      if (d[i] !== 0xff) return null;
      const marca = d[i + 1];
      if (marca === 0xff) {
        i++;
        continue;
      }
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { ancho: d.readUInt16BE(i + 7), alto: d.readUInt16BE(i + 5) };
      i += 2 + d.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** El principio de una entrada comprimida del zip, sin descomprimirla entera. */
function principioInflado(comprimido) {
  const partes = [];
  try {
    new Inflate((parte) => partes.push(parte)).push(comprimido, false);
  } catch {}
  return Buffer.concat(partes);
}

// ---------- CBZ: el zip, leído a mano ----------

/** Las entradas del zip, o null si conviene que lo abra libarchive (ZIP64, métodos raros, estructura dañada). */
function leerDirectorioZip(descriptor, largo) {
  const cola = leerTrozo(descriptor, Math.max(0, largo - 65557), Math.min(largo, 65557));
  const fin = cola.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0 || fin + 22 > cola.length) return null;
  const cantidad = cola.readUInt16LE(fin + 10);
  const tamano = cola.readUInt32LE(fin + 12);
  const inicio = cola.readUInt32LE(fin + 16);
  if (cantidad === 0xffff || tamano === 0xffffffff || inicio === 0xffffffff || inicio + tamano > largo) return null;
  const d = leerTrozo(descriptor, inicio, tamano);
  const entradas = [];
  for (let i = 0, n = 0; n < cantidad; n++) {
    if (i + 46 > d.length || d.readUInt32LE(i) !== 0x02014b50) return null;
    const banderas = d.readUInt16LE(i + 8);
    const largoNombre = d.readUInt16LE(i + 28);
    entradas.push({
      nombre: d.toString('utf8', i + 46, i + 46 + largoNombre).replace(/\\/g, '/'),
      cifrada: Boolean(banderas & 1),
      metodo: d.readUInt16LE(i + 10),
      comprimido: d.readUInt32LE(i + 20),
      tamano: d.readUInt32LE(i + 24),
      lugar: d.readUInt32LE(i + 42),
    });
    i += 46 + largoNombre + d.readUInt16LE(i + 30) + d.readUInt16LE(i + 32);
  }
  return entradas;
}

/** Saca una entrada del zip. */
function leerEntradaZip(descriptor, entrada) {
  const local = leerTrozo(descriptor, entrada.lugar, 30);
  const datos = entrada.lugar + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  const comprimido = leerTrozo(descriptor, datos, entrada.comprimido);
  return entrada.metodo === 0 ? comprimido : Buffer.from(inflateSync(comprimido, { out: new Uint8Array(entrada.tamano) }));
}

async function abrirZip(ruta, largo) {
  const descriptor = fs.openSync(ruta, 'r');
  try {
    const entradas = leerDirectorioZip(descriptor, largo);
    if (!entradas) return null;
    const utiles = entradas.filter((e) => !ES_BASURA.test(e.nombre) && (ES_IMAGEN.test(e.nombre) || ES_FICHA.test(e.nombre)));
    if (utiles.some((e) => e.cifrada)) throw new Error(t('paginas.comicContrasena'));
    if (utiles.some((e) => ![0, 8].includes(e.metodo))) return null;
    const ficha = utiles.find((e) => ES_FICHA.test(e.nombre));
    const imagenes = utiles.filter((e) => ES_IMAGEN.test(e.nombre)).sort((a, b) => ordenNatural.compare(a.nombre, b.nombre));
    const tamanos = [];
    for (let i = 0; i < imagenes.length; i++) {
      const e = imagenes[i];
      try {
        const local = leerTrozo(descriptor, e.lugar, 30);
        const inicio = e.lugar + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
        const trozo = leerTrozo(descriptor, inicio, Math.min(CABECERA, e.comprimido));
        tamanos.push(tamanoImagen(e.metodo === 0 ? trozo : principioInflado(trozo)));
      } catch {
        tamanos.push(null);
      }
      if (i % 25 === 24) await new Promise(setImmediate); // que el resto de Broots no espere
    }
    return {
      nombres: imagenes.map((e) => e.nombre),
      tamanos,
      ficha: ficha && ficha.tamano < 1024 * 1024 ? strFromU8(leerEntradaZip(descriptor, ficha)) : '',
      // Cada página se saca del archivo recién cuando se la pide.
      leer: (n) => {
        const e = imagenes[n];
        if (!e || e.tamano > PAGINA_MAXIMA) return null;
        const propio = fs.openSync(ruta, 'r');
        try {
          return leerEntradaZip(propio, e);
        } finally {
          fs.closeSync(propio);
        }
      },
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

// ---------- CBR (y lo que el zip no pudo): libarchive, en otro hilo ----------

/** Borra las extracciones temporales; `salvo` es la carpeta que se está usando. */
function limpiarTemporales(carpeta, salvo = null) {
  try {
    for (const nombre of fs.readdirSync(carpeta)) {
      if (nombre !== salvo) fs.rmSync(path.join(carpeta, nombre), { recursive: true, force: true });
    }
  } catch {}
}

function extraer(ruta, destino) {
  hilo?.terminate(); // si estaba abriendo otro cómic, ya no hace falta
  return new Promise((listo, fallo) => {
    const propio = new Worker(path.join(__dirname, 'extraerComic.cjs'), { workerData: { ruta, destino } });
    hilo = propio;
    let respondio = false;
    propio.once('message', (r) => {
      respondio = true;
      listo(r);
    });
    propio.once('error', fallo);
    propio.once('exit', () => {
      if (hilo === propio) hilo = null;
      if (!respondio) fallo(new Error('extracción interrumpida'));
    });
  });
}

async function abrirConLibarchive(ruta, mtime, carpetaTemporal) {
  const clave = crypto.createHash('sha1').update(`${ruta}|${mtime}`).digest('hex').slice(0, 16);
  const destino = path.join(carpetaTemporal, clave);
  const hecho = path.join(destino, 'listo.json');
  limpiarTemporales(carpetaTemporal, clave);
  let r = null;
  try {
    r = JSON.parse(fs.readFileSync(hecho, 'utf8'));
  } catch {}
  if (!r) {
    fs.rmSync(destino, { recursive: true, force: true });
    fs.mkdirSync(destino, { recursive: true });
    try {
      r = await extraer(ruta, destino);
    } catch (error) {
      console.error('[paginas] no pude abrir el cómic:', error.message);
      r = { error: 'noPudeAbrir' };
    }
    if (r.error) {
      fs.rmSync(destino, { recursive: true, force: true });
      throw new Error(t(r.error === 'cifrado' ? 'paginas.comicContrasena' : 'paginas.comicNoAbre'));
    }
    fs.writeFileSync(hecho, JSON.stringify(r));
  }
  const imagenes = r.imagenes.sort((a, b) => ordenNatural.compare(a.nombre, b.nombre));
  const tamanos = imagenes.map((e) => {
    try {
      const descriptor = fs.openSync(path.join(destino, e.archivo), 'r');
      try {
        return tamanoImagen(leerTrozo(descriptor, 0, CABECERA));
      } finally {
        fs.closeSync(descriptor);
      }
    } catch {
      return null;
    }
  });
  return {
    nombres: imagenes.map((e) => e.nombre),
    tamanos,
    ficha: r.ficha ?? '',
    leer: (n) => (imagenes[n] ? fs.readFileSync(path.join(destino, imagenes[n].archivo)) : null),
  };
}

// ---------- El cómic abierto ----------

/** Índice: las marcas de ComicInfo.xml o, si no hay, las carpetas del archivo (cada una, un capítulo o tomo). */
function armarIndice(nombres, ficha) {
  const marcas = [...ficha.matchAll(/<Page\b[^>]*>/gi)]
    .map(([etiqueta]) => ({
      pagina: Number(/\bImage\s*=\s*"(\d+)"/i.exec(etiqueta)?.[1]),
      titulo: decodificar(/\bBookmark\s*=\s*"([^"]*)"/i.exec(etiqueta)?.[1] ?? '').trim(),
    }))
    .filter((m) => m.titulo && m.pagina < nombres.length)
    .sort((a, b) => a.pagina - b.pagina);
  if (marcas.length) return marcas.map((m) => ({ ...m, nivel: 0 }));
  const carpetas = new Map();
  nombres.forEach((nombre, pagina) => {
    const carpeta = path.posix.dirname(nombre);
    if (!carpetas.has(carpeta)) carpetas.set(carpeta, pagina);
  });
  carpetas.delete('.');
  if (carpetas.size < 2) return [];
  return [...carpetas].map(([carpeta, pagina]) => ({ titulo: path.posix.basename(carpeta), pagina, nivel: 0 }));
}

/** Abre un CBZ o un CBR y dice cuántas páginas tiene, lo que mide cada una, su índice y si viene marcado como manga. */
async function abrirComic(ruta, carpetaTemporal) {
  const { mtimeMs: mtime, size: largo } = fs.statSync(ruta);
  if (abierto?.ruta === ruta && abierto.mtime === mtime) return abierto.estructura;
  abierto = null;
  const pedido = ++ultimoPedido;
  const descriptor = fs.openSync(ruta, 'r');
  const principio = leerTrozo(descriptor, 0, 4);
  fs.closeSync(descriptor);
  const esZip = principio.toString('latin1', 0, 2) === 'PK';
  const contenido = (esZip && (await abrirZip(ruta, largo))) || (await abrirConLibarchive(ruta, mtime, carpetaTemporal));
  if (pedido !== ultimoPedido) throw new Error(t('paginas.comicNoAbre')); // ya nadie lo está esperando
  if (!contenido.nombres.length) throw new Error(t('paginas.comicSinImagenes'));
  const estructura = {
    version: Math.round(mtime), // para que la página en memoria no sobreviva a un archivo cambiado
    tamanos: contenido.tamanos,
    indice: armarIndice(contenido.nombres, contenido.ficha),
    manga: /<Manga>\s*(Yes|YesAndRightToLeft)\s*<\/Manga>/i.test(contenido.ficha),
  };
  abierto = { ruta, mtime, estructura, leer: contenido.leer, tipos: contenido.nombres.map((n) => TIPOS[path.extname(n).toLowerCase()]) };
  return estructura;
}

/** Respuesta para libro://comic/<id>/<n>: una página del cómic abierto. */
function imagen(ruta, n) {
  if (abierto?.ruta !== ruta) return new Response(null, { status: 404 });
  const datos = abierto.leer(n);
  if (!datos) return new Response(null, { status: 404 });
  return new Response(datos, { headers: { 'content-type': abierto.tipos[n] } });
}

// ---------- PDF ----------

/** Un pedazo del PDF: pdf.js pide solo lo que necesita para la página que va a dibujar. */
function rangoPdf(ruta, inicio, fin) {
  const descriptor = fs.openSync(ruta, 'r');
  try {
    return leerTrozo(descriptor, inicio, Math.max(0, fin - inicio));
  } finally {
    fs.closeSync(descriptor);
  }
}

// Lo que pdf.js necesita aparte de su código: tipografías estándar, tablas de caracteres y decodificadores. Se copian a
// dist/pdfjs al compilar (vite.config.mjs); en desarrollo también pueden salir de node_modules. Solo estas carpetas y
// solo un nombre de archivo, sin rutas.
const RECURSOS_PDF = new Set(['cmaps', 'standard_fonts', 'wasm']);
function recursoPdf(tipo, nombre) {
  if (!RECURSOS_PDF.has(tipo) || !/^[\w.-]+$/.test(String(nombre)) || String(nombre).includes('..')) return null;
  for (const base of [path.join(__dirname, '..', 'dist', 'pdfjs'), path.join(__dirname, '..', 'node_modules', 'pdfjs-dist')]) {
    const archivo = path.join(base, tipo, nombre);
    if (fs.existsSync(archivo)) return fs.readFileSync(archivo);
  }
  return null;
}

module.exports = { abrirComic, imagen, rangoPdf, recursoPdf, limpiarTemporales, tamanoImagen };
