// Agregar a la biblioteca un libro que está en el Kindle pero no en Calibre.
//
// Para no arriesgar la compatibilidad, Broots NO escribe la base de Calibre a mano: usa la
// herramienta oficial de Calibre (calibredb), que hace exactamente lo mismo que "Agregar libros"
// en Calibre (carpeta del autor, ficha metadata.opf, portada si el archivo la trae).
//
// - El archivo se copia TAL CUAL desde el Kindle. Si está protegido (DRM), sigue protegido: solo
//   se abre en el Kindle o la app de Kindle. Broots nunca quita protecciones.
// - Los libros KFX comprados se guardan como "KFX-ZIP": el archivo principal más su carpeta
//   assets (contenido, recursos y licencia), con la misma estructura que en el Kindle.
// - Si el libro ya no está en el Kindle, se agrega como ficha sin archivo ("libro vacío" de Calibre).
// - Antes de cada cambio se guarda una copia de metadata.db en .broots/respaldos.
const fs = require('node:fs');
const path = require('node:path');
const { zipSync } = require('fflate');
const calibre = require('./calibre.cjs');
const { t } = require('./idioma.cjs');

const EXTENSIONES_LIBRO = ['.epub', '.azw3', '.azw', '.mobi', '.prc', '.pdf', '.kfx', '.txt', '.docx'];

/** Id del libro que informa "calibredb add" ("ID de libros añadidos: 233" / "Added book ids: 233"). */
function idAgregado(salida) {
  return Number(/(\d+)\s*$/.exec(String(salida).trim())?.[1]) || null;
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Meléndez, Sandro" -> "Sandro Meléndez". Varios autores ("A; B") -> "A & B", como espera Calibre. */
function autorParaCalibre(autor) {
  const autores = String(autor ?? '')
    .split(/\s*;\s*/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const partes = a.split(/\s*,\s*/);
      return partes.length === 2 ? `${partes[1]} ${partes[0]}` : a;
    });
  return autores.length ? autores.join(' & ') : t('agregar.autorDesconocido');
}

/**
 * Título prolijo para Calibre: quita al final las etiquetas de origen del archivo (p. ej. "(Z-Library)")
 * y el autor repetido entre paréntesis. "(Spanish Edition)" se conserva: es parte del título en Amazon.
 */
function tituloParaCalibre(titulo, autor) {
  const apellidos = normalizar(autor).split(' ').filter((p) => p.length > 2);
  let limpio = String(titulo).trim();
  for (;;) {
    const m = /\s*\(([^()]*)\)\s*$/.exec(limpio);
    if (!m) break;
    const dentro = normalizar(m[1]);
    const esOrigen = /^(z ?lib(rary)?( org)?|libgen.*|epub|pdf|ebook|www .*)$/.test(dentro);
    const esAutor = apellidos.length > 0 && apellidos.every((a) => dentro.includes(a));
    if (!esOrigen && !esAutor) break;
    limpio = limpio.slice(0, m.index).trim();
  }
  return limpio || String(titulo).trim();
}

// ---------- Buscar el archivo en el Kindle ----------

function carpetasDocumentosDelKindle() {
  const carpetas = [];
  for (let c = 'D'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const docs = `${String.fromCharCode(c)}:\\documents`;
    try {
      if (fs.existsSync(path.join(docs, 'My Clippings.txt')) || fs.existsSync(path.join(docs, '..', 'system'))) carpetas.push(docs);
    } catch {}
  }
  return carpetas;
}

function archivosDeLibro(carpeta, profundidad, lista = []) {
  let entradas = [];
  try {
    entradas = fs.readdirSync(carpeta, { withFileTypes: true });
  } catch {
    return lista;
  }
  for (const e of entradas) {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) {
      if (profundidad > 0 && !e.name.endsWith('.sdr') && e.name !== 'dictionaries' && !e.name.startsWith('.')) {
        archivosDeLibro(ruta, profundidad - 1, lista);
      }
    } else if (EXTENSIONES_LIBRO.includes(path.extname(e.name).toLowerCase())) {
      lista.push(ruta);
    }
  }
  return lista;
}

/** Nombre del archivo sin extensión ni el código de Amazon que el Kindle agrega al final ("_B0D9R4NY4Z"). */
function nombreBase(ruta) {
  return path.basename(ruta, path.extname(ruta)).replace(/_[A-Z0-9]{10,}$/, '');
}

/** Código de Amazon (ASIN) del nombre de archivo, si lo tiene. */
function asinDe(ruta) {
  return /_(B0[A-Z0-9]{8})$/.exec(path.basename(ruta, path.extname(ruta)))?.[1] ?? null;
}

/** Busca en el Kindle conectado el archivo que corresponde a un título. Devuelve la ruta o null. */
function buscarArchivoEnKindle(titulo) {
  const buscado = normalizar(titulo);
  let mejor = null;
  for (const docs of carpetasDocumentosDelKindle()) {
    for (const ruta of archivosDeLibro(docs, 3)) {
      const nombre = normalizar(nombreBase(ruta));
      let puntaje = 0;
      if (nombre === buscado) puntaje = 100;
      else if (Math.min(nombre.length, buscado.length) >= 8 && (nombre.startsWith(buscado) || buscado.startsWith(nombre))) puntaje = 70;
      if (!puntaje) continue;
      // A igual parecido, se prefiere el formato más útil.
      puntaje -= EXTENSIONES_LIBRO.indexOf(path.extname(ruta).toLowerCase()) * 0.1;
      if (!mejor || puntaje > mejor.puntaje) mejor = { ruta, puntaje };
    }
  }
  return mejor?.ruta ?? null;
}

// ---------- Preparar el archivo ----------

/** ¿El archivo MOBI/AZW/AZW3 tiene protección? (campo "encryption" de su cabecera). */
function mobiProtegido(ruta) {
  const fd = fs.openSync(ruta, 'r');
  try {
    const cabecera = Buffer.alloc(86);
    fs.readSync(fd, cabecera, 0, 86, 0);
    const inicioRegistro0 = cabecera.readUInt32BE(78);
    const cifrado = Buffer.alloc(2);
    fs.readSync(fd, cifrado, 0, 2, inicioRegistro0 + 12);
    return cifrado.readUInt16BE(0) !== 0;
  } catch {
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function leerCarpeta(carpeta, prefijo, archivos) {
  for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) leerCarpeta(ruta, `${prefijo}/${e.name}`, archivos);
    else archivos[`${prefijo}/${e.name}`] = fs.readFileSync(ruta);
  }
}

/**
 * Copia el libro del Kindle a una carpeta temporal, listo para agregar a Calibre.
 * Devuelve { ruta, formato, protegido }.
 */
function prepararArchivo(rutaKindle, carpetaTemporal) {
  fs.mkdirSync(carpetaTemporal, { recursive: true });
  const extension = path.extname(rutaKindle).toLowerCase();
  const base = path.basename(rutaKindle, path.extname(rutaKindle));
  const assets = path.join(path.dirname(rutaKindle), `${base}.sdr`, 'assets');

  // Solo los KFX comprados traen contenido en assets; los documentos propios tienen la carpeta vacía.
  const assetsConContenido = fs.existsSync(assets) && fs.readdirSync(assets).length > 0;
  if (extension === '.kfx' && assetsConContenido) {
    // KFX comprado: el archivo principal es un índice; el contenido está en la carpeta assets.
    const archivos = { [`${base}.kfx`]: fs.readFileSync(rutaKindle) };
    leerCarpeta(assets, `${base}.sdr/assets`, archivos);
    const destino = path.join(carpetaTemporal, `${nombreBase(rutaKindle)}.kfx-zip`);
    fs.writeFileSync(destino, zipSync(archivos, { level: 0 }));
    return { ruta: destino, formato: 'KFX-ZIP', protegido: fs.existsSync(path.join(assets, 'voucher')) };
  }

  const destino = path.join(carpetaTemporal, `${nombreBase(rutaKindle)}${extension}`);
  fs.copyFileSync(rutaKindle, destino);
  const protegido = ['.azw', '.azw3', '.mobi', '.prc'].includes(extension) && mobiProtegido(destino);
  return { ruta: destino, formato: extension.slice(1).toUpperCase(), protegido };
}

// ---------- Alta en Calibre ----------

/**
 * Agrega un libro a la biblioteca de Calibre. Devuelve { ok, id, modo, formato, protegido } o { ok: false, mensaje }.
 * libro = { titulo, autor }.
 */
async function agregarLibro(libraryPath, libro, carpetaTemporal) {
  if (!calibre.herramienta('calibredb')) return calibre.sinHerramientas();

  const enKindle = buscarArchivoEnKindle(libro.titulo);
  let archivo = null;
  if (enKindle) {
    try {
      archivo = prepararArchivo(enKindle, carpetaTemporal);
    } catch (error) {
      return { ok: false, mensaje: t('agregar.noPudeCopiar', { error: error.message }) };
    }
  }

  const argumentos = ['add', '--title', tituloParaCalibre(libro.titulo, libro.autor), '--authors', autorParaCalibre(libro.autor)];
  const asin = enKindle && asinDe(enKindle);
  if (asin) argumentos.push('--identifier', `amazon:${asin}`);
  if (archivo) argumentos.push(archivo.ruta);
  else argumentos.push('--empty');

  // calibre.calibredb hace el respaldo, la fila de espera y los reintentos.
  const resultado = await calibre.calibredb(libraryPath, argumentos);
  if (archivo) fs.rmSync(archivo.ruta, { force: true });
  if (!resultado.ok) return resultado;
  const id = idAgregado(resultado.salida);
  if (!id) return { ok: false, mensaje: t('agregar.sinId') };
  return {
    ok: true,
    id,
    modo: archivo ? 'archivo' : 'ficha',
    formato: archivo?.formato ?? null,
    protegido: archivo?.protegido ?? false,
    hayKindle: carpetasDocumentosDelKindle().length > 0,
  };
}

module.exports = { agregarLibro, buscarArchivoEnKindle, prepararArchivo, autorParaCalibre, tituloParaCalibre, idAgregado, EXTENSIONES_LIBRO };
