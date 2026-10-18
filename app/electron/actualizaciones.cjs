// Actualizaciones de Broots: pregunta en GitHub si salió una versión nueva, la baja en segundo plano,
// la verifica y la instala al cerrar Broots (o enseguida, con «Reiniciar ahora»).
//
// Mismo esquema que la copia propia de Calibre (calibrePropio.cjs): la versión y la huella SHA-256 del
// instalador salen de la página de versiones de Broots en GitHub, y el archivo bajado tiene que coincidir.
// Solo se aceptan descargas de esa página. No viaja nada del usuario: es una consulta y una descarga.
//
// El instalador es el mismo que se baja a mano (NSIS de electron-builder): con /S se instala sin
// preguntar, --updated conserva los accesos directos como estaban y --force-run vuelve a abrir Broots.
//
// Solo para pruebas: BROOTS_ACTUALIZACIONES=http://127.0.0.1:puerto reemplaza a GitHub por un servidor local.
// Sin empaquetar (desarrollo y pruebas), el instalador no se ejecuta: se anota en simulado.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { t } = require('./idioma.cjs');

const REPOSITORIO = 'IVANICUSXXIII/broots';
const PRUEBA = process.env.BROOTS_ACTUALIZACIONES?.replace(/\/+$/, '') || null;
const API = `${PRUEBA ? `${PRUEBA}/repos` : 'https://api.github.com/repos'}/${REPOSITORIO}/releases/latest`;
const ORIGEN_DESCARGA = `${PRUEBA ?? 'https://github.com'}/${REPOSITORIO}/releases/download/`;
const PAGINA = `https://github.com/${REPOSITORIO}/releases`;
const SEIS_HORAS = 6 * 60 * 60 * 1000;
const ESPACIO_NECESARIO = 400 * 1024 ** 2; // el instalador pesa ~120 MB
const IDIOMAS = ['es', 'en', 'pt'];

let carpeta = null; // <datos de Broots>/actualizaciones
let versionActual = '0.0.0';
let simular = true;
let alEstado = () => {};
let estado = { fase: 'nada' }; // lo que ve la interfaz (ver estadoPublico)
let enCurso = null;

/** main.cjs lo llama al abrir: dónde guardar, qué versión corre y a quién avisarle los cambios. */
function configurar(opciones) {
  ({ carpeta, versionActual } = opciones);
  simular = !opciones.empaquetado;
  alEstado = opciones.alEstado ?? alEstado;
  revisarDescargada();
}

// ---------- Archivo de estado: { revisado, descargada: { version, sha256, tamaño, novedades }, avisada, frases } ----------

const archivoEstado = () => path.join(carpeta, 'estado.json');
function leer() {
  try {
    return JSON.parse(fs.readFileSync(archivoEstado(), 'utf8'));
  } catch {
    return {};
  }
}
function guardar(cambios) {
  const nuevo = { ...leer(), ...cambios };
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(`${archivoEstado()}.tmp`, JSON.stringify(nuevo, null, 2));
  fs.renameSync(`${archivoEstado()}.tmp`, archivoEstado());
  return nuevo;
}

function avisar(nuevo) {
  estado = nuevo;
  alEstado(estadoPublico());
}

/** Lo que muestra la interfaz: la fase, la versión nueva y cuándo se revisó por última vez. */
function estadoPublico() {
  const guardado = leer();
  return { ...estado, revisado: guardado.revisado ?? null, avisada: Boolean(estado.version && guardado.avisada === estado.version) };
}

// ---------- Versiones ----------

/** "1.6.0" -> [1, 6, 0]; null si no es una versión. */
function partes(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? '').trim());
  return m ? m.slice(1).map(Number) : null;
}
/** true si a es más nueva que b. */
function esMasNueva(a, b) {
  const [x, y] = [partes(a), partes(b)];
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/**
 * Novedades de una versión: van escondidas en la descripción de la versión en GitHub, como
 * <!-- novedades {"es": [...], "en": [...], "pt": [...]} --> (las escribe scripts/publicar.mjs).
 */
function leerNovedades(texto) {
  const m = /<!--\s*novedades\s*(\{[\s\S]*?\})\s*-->/.exec(String(texto ?? ''));
  if (!m) return null;
  try {
    const datos = JSON.parse(m[1]);
    const limpias = Object.fromEntries(
      IDIOMAS.map((i) => [i, Array.isArray(datos[i]) ? datos[i].filter((n) => typeof n === 'string' && n.trim()).slice(0, 8).map((n) => n.trim().slice(0, 300)) : []]),
    );
    return IDIOMAS.some((i) => limpias[i].length) ? limpias : null;
  } catch {
    return null;
  }
}

/** Última versión publicada de Broots: { version, nombre, url, sha256, tamaño, novedades }. */
async function ultimaVersion() {
  const respuesta = await fetch(API, {
    headers: { 'user-agent': 'Broots', accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  // Sin ninguna versión publicada todavía, GitHub responde 404: no es un error, simplemente no hay nada nuevo.
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw new Error(t('actualizaciones.noPudeConsultar', { estado: respuesta.status }));
  const datos = await respuesta.json();
  const version = String(datos.tag_name ?? '').replace(/^v/, '');
  if (!partes(version)) throw new Error(t('actualizaciones.formatoVersion'));
  const archivo = datos.assets?.find((a) => /\.exe$/i.test(a.name ?? ''));
  if (!archivo?.digest?.startsWith('sha256:') || !archivo.browser_download_url?.startsWith(ORIGEN_DESCARGA)) {
    throw new Error(t('actualizaciones.sinInstalador'));
  }
  return {
    version,
    url: archivo.browser_download_url,
    sha256: archivo.digest.slice(7).toLowerCase(),
    tamaño: archivo.size,
    novedades: leerNovedades(datos.body),
  };
}

// ---------- Descarga ----------

const archivoDe = (version) => path.join(carpeta, `Broots-${version}.exe`); // nombre propio, no el del servidor

function huellaDe(archivo) {
  return crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
}

/** Descarga calculando la huella al vuelo; devuelve la huella del archivo bajado. */
async function descargar(info, destino, alProgresar) {
  const respuesta = await fetch(info.url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!respuesta.ok || !respuesta.body) throw new Error(t('actualizaciones.descargaFallo', { estado: respuesta.status }));
  const huella = crypto.createHash('sha256');
  const archivo = fs.createWriteStream(destino);
  let bajado = 0;
  let ultimoAviso = 0;
  try {
    for await (const trozo of respuesta.body) {
      huella.update(trozo);
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
  return huella.digest('hex');
}

/** Borra todo lo de la carpeta menos el estado y el instalador que se conserva. */
function limpiar(conservar) {
  if (!fs.existsSync(carpeta)) return;
  for (const nombre of fs.readdirSync(carpeta)) {
    const ruta = path.join(carpeta, nombre);
    if (ruta === archivoEstado() || ruta === conservar || nombre === 'simulado.json') continue;
    try {
      fs.rmSync(ruta, { recursive: true, force: true });
    } catch {} // si está en uso, queda para la próxima
  }
}

/**
 * La descarga guardada, si sigue sirviendo: más nueva que esta versión y entera. Con conHuella se
 * recalcula su huella (antes de instalar); si no, alcanza con el tamaño (leer 120 MB demora el inicio).
 */
function descargadaValida({ conHuella = false } = {}) {
  const { descargada } = leer();
  if (!descargada || !esMasNueva(descargada.version, versionActual)) return null;
  const archivo = archivoDe(descargada.version);
  try {
    if (!fs.existsSync(archivo) || fs.statSync(archivo).size !== descargada.tamaño) return null;
    return !conHuella || huellaDe(archivo) === descargada.sha256 ? { ...descargada, archivo } : null;
  } catch {
    return null;
  }
}

/** Al abrir: si quedó una versión bajada sin instalar, está lista; si ya se instaló, se borra. */
function revisarDescargada() {
  const lista = descargadaValida();
  if (lista) {
    estado = { fase: 'lista', version: lista.version, novedades: lista.novedades ?? null };
  } else {
    if (leer().descargada) guardar({ descargada: null });
    limpiar(null);
  }
}

/**
 * Busca una versión nueva y, si la hay, la baja y la verifica. Fases que se avisan: 'buscando',
 * 'al-dia', 'descargando' (hecho, total), 'lista' (version, novedades) y 'error' (mensaje).
 */
function buscar() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    // Una versión ya bajada no se vuelve a bajar.
    if (estado.fase === 'lista' && descargadaValida()) return { ok: true, ...estadoPublico() };
    avisar({ fase: 'buscando' });
    try {
      const info = await ultimaVersion();
      guardar({ revisado: Date.now() });
      if (!info || !esMasNueva(info.version, versionActual)) {
        avisar({ fase: 'al-dia' });
        return { ok: true, ...estadoPublico() };
      }

      fs.mkdirSync(carpeta, { recursive: true });
      const libre = fs.statfsSync(carpeta);
      if (libre.bavail * libre.bsize < ESPACIO_NECESARIO) throw new Error(t('actualizaciones.sinEspacio'));

      avisar({ fase: 'descargando', version: info.version, hecho: 0, total: info.tamaño });
      const parcial = `${archivoDe(info.version)}.parcial`;
      const huella = await descargar(info, parcial, (hecho) => avisar({ fase: 'descargando', version: info.version, hecho, total: info.tamaño }));
      if (huella !== info.sha256) {
        fs.rmSync(parcial, { force: true });
        throw new Error(t('actualizaciones.noCoincide'));
      }
      fs.renameSync(parcial, archivoDe(info.version));
      guardar({ descargada: { version: info.version, sha256: info.sha256, tamaño: fs.statSync(archivoDe(info.version)).size, novedades: info.novedades } });
      limpiar(archivoDe(info.version));
      avisar({ fase: 'lista', version: info.version, novedades: info.novedades });
      return { ok: true, ...estadoPublico() };
    } catch (error) {
      const motivo = error.name === 'TimeoutError' ? t('actualizaciones.cortada') : error.message;
      const mensaje = t('actualizaciones.noPude', { motivo });
      avisar({ fase: 'error', mensaje });
      return { ok: false, mensaje };
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/** true si pasaron seis horas desde la última revisión (para la revisión automática con Broots abierto). */
function tocaRevisar() {
  return Date.now() - (leer().revisado ?? 0) >= SEIS_HORAS;
}

/** La interfaz ya mostró el aviso de esta versión (no se vuelve a mostrar al abrir). */
function marcarAvisada(version) {
  if (partes(version)) guardar({ avisada: version });
  return estadoPublico();
}

// ---------- Instalar ----------

let instalando = false;
/**
 * Ejecuta el instalador bajado, separado de Broots (sigue solo cuando Broots se cierra).
 * reabrir: vuelve a abrir Broots al terminar («Reiniciar ahora»). Devuelve true si había algo que instalar.
 */
function instalar({ reabrir = false } = {}) {
  if (instalando) return true;
  const lista = descargadaValida({ conHuella: true });
  if (!lista) return false;
  instalando = true;
  const argumentos = ['/S', '--updated', ...(reabrir ? ['--force-run'] : [])];
  if (simular) {
    fs.writeFileSync(path.join(carpeta, 'simulado.json'), JSON.stringify({ archivo: lista.archivo, argumentos, version: lista.version, fecha: new Date().toISOString() }, null, 2));
    return true;
  }
  try {
    spawn(lista.archivo, argumentos, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  } catch (error) {
    instalando = false;
    console.error('[actualizaciones] no pude abrir el instalador:', error.message);
    return false;
  }
}

// ---------- Frases del aviso ----------

/**
 * Qué frase mostrar de una lista de `cantidad` frases: van al azar, sin repetirse hasta pasar por todas
 * (lo que falta de cada lista se recuerda en el estado).
 */
function siguienteFrase(tipo, cantidad) {
  if (!/^[a-z]+$/.test(String(tipo)) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100) return 0;
  const frases = leer().frases ?? {};
  let quedan = (frases[tipo] ?? []).filter((i) => Number.isInteger(i) && i < cantidad);
  if (!quedan.length) {
    quedan = [...Array(cantidad).keys()];
    for (let i = quedan.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [quedan[i], quedan[j]] = [quedan[j], quedan[i]];
    }
  }
  const elegida = quedan.pop();
  guardar({ frases: { ...frases, [tipo]: quedan } });
  return elegida;
}

module.exports = {
  configurar,
  buscar,
  tocaRevisar,
  estadoPublico,
  marcarAvisada,
  instalar,
  siguienteFrase,
  esMasNueva,
  leerNovedades,
  PAGINA,
  PRUEBA,
};
