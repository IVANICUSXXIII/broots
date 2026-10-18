// Familia: compartir libros con cada integrante.
//
// Cada integrante tiene una etiqueta ("Para Ana"). Al tocar "Actualizar", Broots arma en una carpeta de
// Drive una mini biblioteca de Calibre solo con esos libros:
//  1. copia metadata.db a una carpeta temporal y le quita, con calibredb, los libros que no van;
//  2. copia las carpetas de esos libros (solo lo nuevo o cambiado) y borra las que ya no van;
//  3. deja la base nueva y una marca (broots-compartida.json) que hace que Broots la abra en modo
//     solo lectura.
// La biblioteca original solo se lee: nunca se modifica en este proceso.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const calibre = require('./calibre.cjs');
const { t } = require('./idioma.cjs');

const MARCA = 'broots-compartida.json';
// La etiqueta se guarda en el integrante al crearlo, en el idioma de ese momento ("Para Ana", "For Ana"),
// así cambiar de idioma no desarma los libros ya marcados. Hasta la 1.4.0 se calculaba con el nombre.
const etiquetaOriginal = (nombre) => `Para ${String(nombre).trim()}`;
const etiquetaDe = (integrante) => integrante.etiqueta || etiquetaOriginal(integrante.nombre);

/** ¿Esta carpeta es una copia compartida por Broots? (se abre en modo solo lectura) */
function esCompartida(libraryPath) {
  return fs.existsSync(path.join(libraryPath, MARCA));
}

function leerMarca(libraryPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(libraryPath, MARCA), 'utf8'));
  } catch {
    return null;
  }
}

/** Carpeta sugerida: "Mi unidad\Broots compartido\Libros de <nombre>" (o junto a la biblioteca si no está en Drive). */
function carpetaSugerida(libraryPath, nombre) {
  const partes = path.resolve(libraryPath).split(path.sep);
  const i = partes.findIndex((p) => /^(mi unidad|my drive|meu drive)$/i.test(p));
  const raiz = i >= 0 ? partes.slice(0, i + 1).join(path.sep) : path.dirname(path.resolve(libraryPath));
  return path.join(raiz.endsWith(':') ? `${raiz}${path.sep}` : raiz, t('familia.carpetaRaiz'), t('familia.carpetaLibros', { nombre: String(nombre).trim() }));
}

const dentroDe = (carpeta, otra) => {
  const relativa = path.relative(path.resolve(carpeta), path.resolve(otra));
  return relativa === '' || (!relativa.startsWith('..') && !path.isAbsolute(relativa));
};

/** La carpeta destino no puede ser la biblioteca ni estar adentro (ni al revés). */
function validarDestino(libraryPath, destino) {
  if (!destino || !path.isAbsolute(destino)) return t('familia.elegiCarpeta');
  if (dentroDe(libraryPath, destino) || dentroDe(destino, libraryPath)) return t('familia.fueraDeBiblioteca');
  return null;
}

/** Copia los archivos de la carpeta de un libro que falten o hayan cambiado. Devuelve cuántos copió. */
function copiarCarpeta(origen, destino) {
  if (!fs.existsSync(origen)) return 0;
  fs.mkdirSync(destino, { recursive: true });
  let copiados = 0;
  const enOrigen = new Set();
  for (const entrada of fs.readdirSync(origen, { withFileTypes: true })) {
    if (!entrada.isFile()) continue;
    enOrigen.add(entrada.name);
    const de = path.join(origen, entrada.name);
    const a = path.join(destino, entrada.name);
    const datos = fs.statSync(de);
    const actual = fs.existsSync(a) ? fs.statSync(a) : null;
    if (actual && actual.size === datos.size && actual.mtimeMs >= datos.mtimeMs - 2000) continue;
    fs.copyFileSync(de, a);
    fs.utimesSync(a, datos.atime, datos.mtime);
    copiados++;
  }
  // Formatos que se quitaron del libro original
  for (const nombre of fs.readdirSync(destino)) if (!enOrigen.has(nombre)) fs.rmSync(path.join(destino, nombre), { force: true, recursive: true });
  return copiados;
}

/** Borra de la copia las carpetas de libros que ya no van (solo dentro de la copia). */
function quitarSobrantes(destino, esperadas) {
  let quitados = 0;
  for (const autor of fs.readdirSync(destino, { withFileTypes: true })) {
    if (!autor.isDirectory() || autor.name.startsWith('.')) continue;
    const carpetaAutor = path.join(destino, autor.name);
    for (const libro of fs.readdirSync(carpetaAutor, { withFileTypes: true })) {
      if (!libro.isDirectory()) continue;
      const relativa = `${autor.name}/${libro.name}`;
      if (esperadas.has(relativa.toLowerCase())) continue;
      fs.rmSync(path.join(carpetaAutor, libro.name), { recursive: true, force: true });
      quitados++;
    }
    if (!fs.readdirSync(carpetaAutor).length) fs.rmSync(carpetaAutor, { recursive: true, force: true });
  }
  return quitados;
}

/**
 * Arma o actualiza la copia de un integrante.
 * libros: los libros con su etiqueta (de la biblioteca cargada: { id, path, title }).
 * alProgresar({ hecho, total, titulo }) se llama mientras copia.
 */
async function sincronizar(libraryPath, integrante, libros, alProgresar = () => {}) {
  const destino = integrante.carpeta;
  const problema = validarDestino(libraryPath, destino);
  if (problema) return { ok: false, mensaje: problema };
  fs.mkdirSync(destino, { recursive: true });
  const ajenos = fs.readdirSync(destino).filter((n) => !n.startsWith('.'));
  if (ajenos.length && !esCompartida(destino)) {
    return { ok: false, mensaje: t('familia.carpetaOcupada') };
  }

  // 1. Base de datos solo con los libros elegidos, armada en una carpeta temporal (ruta corta para calibredb).
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'broots-compartir-'));
  try {
    fs.copyFileSync(path.join(libraryPath, 'metadata.db'), path.join(temporal, 'metadata.db'));
    const elegidos = new Set(libros.map((l) => l.id));
    const db = new DatabaseSync(path.join(temporal, 'metadata.db'), { readOnly: true });
    const sobran = db.prepare('SELECT id FROM books').all().map((f) => f.id).filter((id) => !elegidos.has(id));
    db.close();
    if (sobran.length) {
      const r = await calibre.calibredb(temporal, ['remove', '--permanent', sobran.join(',')], { modifica: false });
      if (!r.ok) return r;
    }

    // 2. Archivos de cada libro
    let nuevos = 0;
    for (const [k, libro] of libros.entries()) {
      alProgresar({ hecho: k, total: libros.length, titulo: libro.title });
      if (copiarCarpeta(path.join(libraryPath, libro.path), path.join(destino, libro.path))) nuevos++;
      await new Promise((r) => setImmediate(r));
    }
    const quitados = quitarSobrantes(destino, new Set(libros.map((l) => l.path.replace(/\\/g, '/').toLowerCase())));

    // 3. Base nueva y marca de "biblioteca compartida"
    fs.copyFileSync(path.join(temporal, 'metadata.db'), path.join(destino, 'metadata.db.nuevo'));
    fs.rmSync(path.join(destino, 'metadata.db'), { force: true });
    fs.renameSync(path.join(destino, 'metadata.db.nuevo'), path.join(destino, 'metadata.db'));
    const fecha = new Date().toISOString();
    fs.writeFileSync(path.join(destino, MARCA), JSON.stringify({ nombre: integrante.nombre, soloLectura: true, actualizado: fecha, libros: libros.length }, null, 2));
    alProgresar({ hecho: libros.length, total: libros.length });
    return { ok: true, libros: libros.length, nuevos, quitados, fecha };
  } catch (error) {
    return { ok: false, mensaje: t('familia.noPudeCopia', { error: calibre.mensajeDeError(error.message) }) };
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }
}

// ---------- Integrantes (en config.json de esta PC) ----------

function nuevoIntegrante(familia, datos, libraryPath) {
  const nombre = String(datos.nombre ?? '').trim().replace(/\s+/g, ' ');
  if (!nombre) throw new Error(t('familia.escribiNombre'));
  if (!/^[\p{L}\p{N} ]{1,30}$/u.test(nombre)) throw new Error(t('familia.soloLetras'));
  if (familia.some((i) => i.nombre.toLowerCase() === nombre.toLowerCase())) throw new Error(t('familia.nombreRepetido'));
  return { id: crypto.randomUUID(), nombre, etiqueta: t('familia.etiqueta', { nombre }), kindle: '', carpeta: carpetaSugerida(libraryPath, nombre) };
}

function validarKindle(direccion) {
  const d = String(direccion ?? '').trim();
  if (d && !/^[^\s@]+@(free\.)?kindle\.com$/i.test(d)) throw new Error(t('familia.kindleInvalido'));
  return d;
}

module.exports = { MARCA, etiquetaDe, etiquetaOriginal, esCompartida, leerMarca, carpetaSugerida, validarDestino, sincronizar, nuevoIntegrante, validarKindle };
