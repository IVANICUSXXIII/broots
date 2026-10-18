// Acceso a las herramientas oficiales de Calibre (calibredb, ebook-convert, fetch-ebook-metadata).
//
// Regla de oro: Broots NUNCA escribe la base de Calibre a mano. Toda modificación pasa por estas
// herramientas, que hacen exactamente lo mismo que Calibre, y:
//  - de a una por vez (una fila de espera), para que dos cambios no choquen,
//  - con un respaldo de metadata.db antes de cada cambio (.broots/respaldos, los últimos 5),
//  - reintentando unos segundos si Calibre quedó ocupado por un cambio anterior.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { t } = require('./idioma.cjs');

const CARPETAS_CALIBRE = [
  'C:\\Program Files\\Calibre2',
  'C:\\Program Files (x86)\\Calibre2',
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Calibre2'),
];
const RESPALDOS_A_CONSERVAR = 5;
// Respuesta cuando todavía no hay herramientas (ni Calibre instalado ni la copia propia descargada).
const sinHerramientas = () => ({ ok: false, sinHerramientas: true, mensaje: t('calibre.sinHerramientas') });
// Calibre ocupado: otro programa de Calibre abierto, la base bloqueada un instante por un proceso que
// todavía se está cerrando, o un archivo recién creado que Windows (antivirus, indexador) tiene abierto
// unos segundos (WinError 32). En esos casos se reintenta unos segundos.
const OCUPADA = /otro programa|another calibre|is running|en ejecuci|database is locked|base de datos est[aá] bloqueada|WinError 32|siendo utilizado por otro proceso|being used by another process/i;

/** Carpeta del Calibre instalado en Windows, o null. */
function carpetaInstalada() {
  // Solo para pruebas: BROOTS_SIN_CALIBRE=1 simula una PC sin Calibre instalado.
  if (process.env.BROOTS_SIN_CALIBRE) return null;
  return CARPETAS_CALIBRE.find((c) => fs.existsSync(path.join(c, 'calibredb.exe'))) ?? null;
}

/**
 * Ruta de una herramienta de Calibre (p. ej. 'calibredb'), o null si no hay ninguna.
 * Primero el Calibre instalado (misma versión que el que abre el usuario); si no hay, la copia
 * propia que Broots descarga sola (ver calibrePropio.cjs).
 */
function herramienta(nombre) {
  for (const carpeta of [carpetaInstalada(), require('./calibrePropio.cjs').carpetaPropia()]) {
    if (!carpeta) continue;
    const ruta = path.join(carpeta, `${nombre}.exe`);
    if (fs.existsSync(ruta)) return ruta;
  }
  return null;
}

function respaldarBase(libraryPath) {
  const carpeta = path.join(libraryPath, '.broots', 'respaldos');
  fs.mkdirSync(carpeta, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.copyFileSync(path.join(libraryPath, 'metadata.db'), path.join(carpeta, `metadata-${marca}.db`));
  const respaldos = fs.readdirSync(carpeta).filter((n) => n.startsWith('metadata-')).sort();
  for (const viejo of respaldos.slice(0, -RESPALDOS_A_CONSERVAR)) fs.rmSync(path.join(carpeta, viejo), { force: true });
}

function ejecutar(programa, argumentos, timeout = 180000) {
  return new Promise((resolve) => {
    execFile(programa, argumentos, { timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (error, salida, errores) => {
      resolve({ error, salida: String(salida), errores: String(errores) });
    });
  });
}

// Fila de espera: cada operación empieza cuando termina la anterior.
let cola = Promise.resolve();
function enFila(tarea) {
  const resultado = cola.then(tarea, tarea);
  cola = resultado.catch(() => {});
  return resultado;
}

/** Explica en el idioma de Broots por qué falló una herramienta de Calibre. */
function mensajeDeError(texto) {
  if (OCUPADA.test(texto)) return t('calibre.ocupado');
  const ultima = texto.trim().split('\n').filter(Boolean).pop() ?? t('calibre.errorDesconocido');
  return t('calibre.noPudo', { detalle: ultima });
}

/**
 * Ejecuta calibredb sobre la biblioteca (en fila, con respaldo previo si `modifica`).
 * Devuelve { ok, salida } o { ok: false, mensaje }.
 */
function calibredb(libraryPath, argumentos, { modifica = true } = {}) {
  return enFila(async () => {
    const programa = herramienta('calibredb');
    if (!programa) return sinHerramientas();
    // Las copias que Broots comparte con la familia son solo para leer (ver compartir.cjs).
    if (modifica && fs.existsSync(path.join(libraryPath, 'broots-compartida.json'))) {
      return { ok: false, mensaje: t('calibre.compartida') };
    }
    if (modifica) respaldarBase(libraryPath);
    const [orden, ...resto] = argumentos;
    let intento;
    for (let i = 0; i < 8; i++) {
      intento = await ejecutar(programa, [orden, '--with-library', libraryPath, ...resto]);
      if (!OCUPADA.test(`${intento.errores}\n${intento.salida}`)) break;
      await new Promise((r) => setTimeout(r, 1300));
    }
    const texto = `${intento.errores}\n${intento.error?.message ?? ''}`;
    if (intento.error) {
      console.error('[calibre] calibredb falló:', texto.trim());
      return { ok: false, mensaje: mensajeDeError(`${texto}\n${intento.salida}`) };
    }
    return { ok: true, salida: intento.salida };
  });
}

module.exports = { herramienta, carpetaInstalada, calibredb, ejecutar, respaldarBase, mensajeDeError, sinHerramientas };
