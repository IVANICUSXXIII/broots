// Copia propia de las herramientas de Calibre, para cuando Calibre NO está instalado en la PC.
//
// Si Calibre está instalado, Broots usa ese (así Broots y Calibre usan siempre la misma versión: una
// versión nueva de Calibre actualiza el formato de metadata.db, y el Calibre instalado quedaría con
// una base "del futuro"). Si no está, Broots baja el instalador oficial (.msi), lo verifica y lo
// "desarma" en una carpeta propia sin instalar nada en Windows (msiexec /a: sin ventanas ni permisos
// de administrador). Una vez por semana revisa si salió una versión nueva.
//
// Verificación: la versión y su huella SHA-256 salen de la página oficial de Calibre en GitHub; la
// huella SHA-512 sale del sitio de Calibre. El archivo descargado tiene que coincidir con las dos.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { t } = require('./idioma.cjs');

// Solo para pruebas: BROOTS_CALIBRE_PROPIO=carpeta usa otra carpeta para la copia propia.
const RAIZ = process.env.BROOTS_CALIBRE_PROPIO || path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Broots', 'calibre');
const ARCHIVO_ESTADO = path.join(RAIZ, 'actual.json'); // { version, carpeta, revisado }
const API_GITHUB = 'https://api.github.com/repos/kovidgoyal/calibre/releases/latest';
const ORIGEN_DESCARGA = 'https://github.com/kovidgoyal/calibre/releases/download/';
const FIRMAS = 'https://calibre-ebook.com/signatures/';
const UNA_SEMANA = 7 * 24 * 60 * 60 * 1000;
const ESPACIO_NECESARIO = 1.2 * 1024 ** 3; // descarga (~240 MB) + extraído (~670 MB) + margen

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, 'utf8'));
  } catch {
    return {};
  }
}

function guardarEstado(estado) {
  fs.mkdirSync(RAIZ, { recursive: true });
  fs.writeFileSync(`${ARCHIVO_ESTADO}.tmp`, JSON.stringify(estado, null, 2));
  fs.renameSync(`${ARCHIVO_ESTADO}.tmp`, ARCHIVO_ESTADO);
}

/** Carpeta de la copia propia lista para usar, o null. */
function carpetaPropia() {
  const { carpeta } = leerEstado();
  return carpeta && fs.existsSync(path.join(carpeta, 'calibredb.exe')) ? carpeta : null;
}

/** Versión de la copia propia lista para usar, o null. */
function versionPropia() {
  return carpetaPropia() ? leerEstado().version ?? null : null;
}

/** Última versión publicada de Calibre: { version, url, sha256, tamaño, nombre }. */
async function ultimaVersion() {
  const respuesta = await fetch(API_GITHUB, {
    headers: { 'user-agent': 'Broots', accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!respuesta.ok) throw new Error(t('calibrePropio.noPudeConsultar', { estado: respuesta.status }));
  const datos = await respuesta.json();
  const version = String(datos.tag_name ?? '').replace(/^v/, '');
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) throw new Error(t('calibrePropio.formatoVersion'));
  const nombre = `calibre-64bit-${version}.msi`;
  const archivo = datos.assets?.find((a) => a.name === nombre);
  if (!archivo?.digest?.startsWith('sha256:') || !archivo.browser_download_url?.startsWith(ORIGEN_DESCARGA)) {
    throw new Error(t('calibrePropio.sinInstalador'));
  }
  return { version, nombre, url: archivo.browser_download_url, sha256: archivo.digest.slice(7).toLowerCase(), tamaño: archivo.size };
}

/** Descarga calculando las dos huellas al vuelo. */
async function descargar(info, destino, alProgresar) {
  const respuesta = await fetch(info.url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!respuesta.ok || !respuesta.body) throw new Error(t('calibrePropio.descargaFallo', { estado: respuesta.status }));
  const h256 = crypto.createHash('sha256');
  const h512 = crypto.createHash('sha512');
  const archivo = fs.createWriteStream(destino);
  let bajado = 0;
  let ultimoAviso = 0;
  try {
    for await (const trozo of respuesta.body) {
      h256.update(trozo);
      h512.update(trozo);
      bajado += trozo.length;
      if (!archivo.write(trozo)) await once(archivo, 'drain');
      if (Date.now() - ultimoAviso > 400) {
        ultimoAviso = Date.now();
        alProgresar(bajado);
      }
    }
  } finally {
    await new Promise((resolver) => archivo.end(resolver));
  }
  return { sha256: h256.digest('hex'), sha512: h512.digest('hex'), bajado };
}

async function huellaOficialSha512(nombre) {
  const respuesta = await fetch(`${FIRMAS}${nombre}.sha512`, { signal: AbortSignal.timeout(30000) });
  if (!respuesta.ok) throw new Error(t('calibrePropio.sinHuella'));
  const huella = /^[0-9a-f]{128}/i.exec((await respuesta.text()).trim())?.[0];
  if (!huella) throw new Error(t('calibrePropio.formatoHuella'));
  return huella.toLowerCase();
}

function ejecutar(programa, linea, timeout) {
  return new Promise((resolver) => {
    // windowsVerbatimArguments: msiexec necesita PROPIEDAD="valor con espacios" tal cual.
    execFile(programa, [linea], { timeout, windowsHide: true, windowsVerbatimArguments: true }, (error, salida) => resolver({ error, salida: String(salida) }));
  });
}

/** "Desarma" el .msi en una carpeta, sin instalar nada en Windows. Devuelve la carpeta con calibredb.exe. */
async function extraer(msi, destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  const r = await ejecutar('msiexec.exe', `/a "${msi}" /qn TARGETDIR="${destino}"`, 10 * 60 * 1000);
  if (r.error) throw new Error(t('calibrePropio.noPudePreparar', { detalle: r.error.code ?? r.error.message }));
  const carpeta = [path.join(destino, 'PFiles64', 'Calibre2'), path.join(destino, 'PFiles', 'Calibre2')].find((c) => fs.existsSync(path.join(c, 'calibredb.exe')));
  if (!carpeta) throw new Error(t('calibrePropio.sinHerramientasEsperadas'));
  return carpeta;
}

/** Borra versiones viejas y restos de descargas (si algún archivo está en uso, queda para la próxima). */
function limpiar(actual) {
  if (!fs.existsSync(RAIZ)) return;
  for (const nombre of fs.readdirSync(RAIZ)) {
    const ruta = path.join(RAIZ, nombre);
    if (ruta === ARCHIVO_ESTADO || path.resolve(ruta) === path.resolve(actual ?? '')) continue;
    try {
      fs.rmSync(ruta, { recursive: true, force: true });
    } catch {}
  }
}

let enCurso = null;

/**
 * Se asegura de que haya herramientas de Calibre. Si Calibre está instalado no hace nada.
 * instalado: si Calibre está instalado en Windows. alEstado({ fase, ... }) informa el avance:
 * 'descargando' (hecho, total), 'preparando', 'listo', 'error' (mensaje).
 */
function asegurar({ instalado, forzar = false } = {}, alEstado = () => {}) {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    if (instalado) return { ok: true, fuente: 'instalado' };
    const estado = leerEstado();
    const propia = carpetaPropia();
    try {
      if (propia && !forzar && Date.now() - (estado.revisado ?? 0) < UNA_SEMANA) return { ok: true, fuente: 'propia', version: estado.version };
      const info = await ultimaVersion();
      if (propia && estado.version === info.version) {
        guardarEstado({ ...estado, revisado: Date.now() });
        limpiar(propia);
        return { ok: true, fuente: 'propia', version: estado.version };
      }

      fs.mkdirSync(RAIZ, { recursive: true });
      const libre = fs.statfsSync(RAIZ);
      if (libre.bavail * libre.bsize < ESPACIO_NECESARIO) throw new Error(t('calibrePropio.sinEspacio'));

      const actualizando = Boolean(propia);
      alEstado({ fase: 'descargando', version: info.version, hecho: 0, total: info.tamaño, actualizando });
      const msi = path.join(RAIZ, `descarga-${info.version}.msi`);
      const huellas = await descargar(info, msi, (hecho) => alEstado({ fase: 'descargando', version: info.version, hecho, total: info.tamaño, actualizando }));
      const sha512 = await huellaOficialSha512(info.nombre);
      if (huellas.sha256 !== info.sha256 || huellas.sha512 !== sha512) {
        fs.rmSync(msi, { force: true });
        throw new Error(t('calibrePropio.noCoincide'));
      }

      alEstado({ fase: 'preparando', version: info.version, actualizando });
      const temporal = path.join(RAIZ, `extrayendo-${info.version}`);
      const carpetaExtraida = await extraer(msi, temporal);
      const final = path.join(RAIZ, info.version);
      fs.rmSync(final, { recursive: true, force: true });
      fs.renameSync(carpetaExtraida, final);
      const prueba = await ejecutar(path.join(final, 'calibredb.exe'), '--version', 60000);
      if (!prueba.salida.includes(info.version.replace(/\.0$/, ''))) throw new Error(t('calibrePropio.noResponden'));

      // Recién ahora se cambia a la versión nueva (las operaciones en curso terminan con la anterior).
      guardarEstado({ version: info.version, carpeta: final, revisado: Date.now() });
      limpiar(final);
      alEstado({ fase: 'listo', version: info.version, actualizando });
      return { ok: true, fuente: 'propia', version: info.version };
    } catch (error) {
      const motivo = error.name === 'TimeoutError' ? t('calibrePropio.cortada') : error.message;
      const mensaje = t(propia ? 'calibrePropio.noPudeActualizar' : 'calibrePropio.noPudeDescargar', { motivo });
      alEstado({ fase: 'error', mensaje, sinHerramientas: !propia });
      return { ok: false, mensaje };
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

module.exports = { carpetaPropia, versionPropia, asegurar, ultimaVersion, RAIZ };
