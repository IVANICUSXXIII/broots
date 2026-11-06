// 1.12: el diccionario sin internet («Definir» en la barrita del lector). Uno por idioma (español, inglés y portugués),
// armado con Wiktionary (CC BY-SA 4.0) por scripts/armar-diccionarios.mjs.
//
// No viaja en el instalador: se baja la primera vez que se pide, de IVANICUSXXIII/broots-diccionarios, a una carpeta
// de esta PC (no a la biblioteca, para que no ocupe lugar en Drive). diccionarios.json dice qué versión de cada uno va
// con esta versión de Broots y cuál es su huella: lo bajado tiene que coincidir. Después no hace falta internet.
//
// Si una versión nueva de Broots trae un diccionario nuevo, el viejo se sigue usando mientras el nuevo baja en silencio:
// el que ya tenía su diccionario nunca se queda sin él por no tener internet.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { DatabaseSync } = require('node:sqlite');
const { t } = require('./idioma.cjs');

// Solo para pruebas (con BROOTS_DATOS): BROOTS_DICCIONARIOS=manifiesto.json dice de dónde bajarlos, y =real baja los de
// verdad. Sin eso, las pruebas no salen a internet.
const PRUEBA = process.env.BROOTS_DATOS ? process.env.BROOTS_DICCIONARIOS || 'apagado' : null;
const RAIZ = PRUEBA ? path.join(process.env.BROOTS_DATOS, 'diccionarios') : path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Broots', 'diccionarios');
const ORIGEN = 'https://github.com/IVANICUSXXIII/broots-diccionarios/releases/download/';

function leerManifiesto() {
  if (PRUEBA && PRUEBA !== 'real' && PRUEBA !== 'apagado') return JSON.parse(fs.readFileSync(PRUEBA, 'utf8'));
  return require('./diccionarios.json');
}
const infoDe = (idioma) => {
  const m = leerManifiesto();
  return Object.hasOwn(m, idioma) ? m[idioma] : null;
};

// ---------- Normalizar ----------

const enMinuscula = (s) => String(s).normalize('NFC').toLowerCase().replace(/[’ʼ]/g, "'");
/** La clave por la que se busca: en minúscula y sin tildes. «Año» y «ano» comparten clave: gana la coincidencia exacta. */
const claveDe = (s) => enMinuscula(s).normalize('NFD').replace(/\p{M}/gu, '');

/** Lo seleccionado, sin los signos que hayan quedado pegados en las puntas. */
const limpiarSeleccion = (texto) =>
  String(texto ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();

/**
 * Si la palabra no está tal cual, otras formas de escribirla, de la más probable a la menos. El diccionario trae casi
 * todas las conjugaciones, pero no los pronombres pegados («diciéndole», «fazê-lo») ni todos los plurales y femeninos.
 */
function otrasFormas(palabra, idioma) {
  const w = enMinuscula(palabra);
  const c = [];
  const si = (regla, cambio) => {
    if (regla.test(w)) c.push(cambio(w));
  };
  if (idioma === 'es') {
    let base = w;
    for (let i = 0; i < 2; i++) {
      const m = /^(.{2,}?)(me|te|se|lo|la|le|nos|os|los|las|les)$/.exec(base);
      if (!m || !/([aeií]r|ndo|[áéíóú].*)$/.test(m[1])) break; // solo de lo que parece un verbo («Paula» no es «pau» + «la»)
      base = m[1];
      c.push(base);
    }
    si(/s$/, (x) => x.slice(0, -1));
    si(/es$/, (x) => x.slice(0, -2));
    si(/ces$/, (x) => `${x.slice(0, -3)}z`);
    si(/as?$/, (x) => x.replace(/as?$/, 'o'));
    si(/oras?$/, (x) => x.replace(/oras?$/, 'or'));
  } else if (idioma === 'pt') {
    const antes = w.split('-')[0];
    if (antes !== w) c.push(antes, antes.replace(/[áa]$/, 'ar'), antes.replace(/[êe]$/, 'er'), antes.replace(/[íi]$/, 'ir'), antes.replace(/[ôo]$/, 'or'));
    si(/s$/, (x) => x.slice(0, -1));
    si(/es$/, (x) => x.slice(0, -2));
    si(/ns$/, (x) => `${x.slice(0, -2)}m`);
    si(/(ões|ães)$/, (x) => `${x.slice(0, -3)}ão`);
    si(/is$/, (x) => `${x.slice(0, -2)}l`);
    si(/as?$/, (x) => x.replace(/as?$/, 'o'));
  } else {
    si(/'s$/, (x) => x.slice(0, -2));
    si(/s'$/, (x) => x.slice(0, -1));
    if (w.includes('-')) c.push(w.split('-').at(-1));
  }
  return [...new Set(c)].filter((x) => x && x !== w);
}

// ---------- Las bases ----------

const abiertas = new Map(); // archivo -> { db, buscar }

function abrir(archivo) {
  if (abiertas.has(archivo)) return abiertas.get(archivo);
  const db = new DatabaseSync(path.join(RAIZ, archivo), { readOnly: true });
  const abierta = { db, buscar: db.prepare('SELECT palabra, defs, lemas FROM palabras WHERE clave = ?') };
  abiertas.set(archivo, abierta);
  return abierta;
}

function cerrar(archivo) {
  abiertas.get(archivo)?.db.close();
  abiertas.delete(archivo);
}

/** Lo que hay en la carpeta para un idioma, sin contar lo que está bajando. */
function archivosDe(idioma) {
  try {
    return fs.readdirSync(RAIZ).filter((n) => n.startsWith(`${idioma}-`) && n.endsWith('.db'));
  } catch {
    return [];
  }
}

const parsear = (fila) => (fila ? { ...fila, defs: fila.defs ? JSON.parse(fila.defs) : null, lemas: fila.lemas ? JSON.parse(fila.lemas) : null } : null);

/** Las filas de una palabra: la escrita igual, después la que está en minúscula; si no hay ninguna, las parecidas (sin tildes). */
function filasDe(base, palabra) {
  const filas = base.buscar.all(claveDe(palabra)).map(parsear);
  const exactas = filas.filter((f) => f.palabra.normalize('NFC') === palabra.normalize('NFC'));
  const conMinuscula = filas.filter((f) => f.palabra === enMinuscula(palabra) && !exactas.includes(f));
  const elegidas = [...exactas, ...conMinuscula];
  if (elegidas.length) return elegidas;
  const iguales = filas.filter((f) => enMinuscula(f.palabra) === enMinuscula(palabra));
  return iguales.length ? iguales : filas;
}

const sentidos = (defs) =>
  defs.map(([nombre, lista]) => ({
    nombre,
    sentidos: lista.map((s) => (Array.isArray(s) ? { texto: s[0], marcas: s[1] } : { texto: s, marcas: '' })),
  }));

/** Sigue el puntero de una forma hasta una palabra con definiciones (una o dos vueltas: «Googled» → «Google»). */
function definicionesDeBase(base, lema, vueltas = 2) {
  for (const fila of filasDe(base, lema)) {
    if (fila.defs) return { palabra: fila.palabra, forma: true, categorias: sentidos(fila.defs) };
    if (vueltas > 0 && fila.lemas?.[0]) {
      const siguiente = definicionesDeBase(base, fila.lemas[0], vueltas - 1);
      if (siguiente) return siguiente;
    }
  }
  return null;
}

/** Arma lo que se muestra de una palabra: sus propias definiciones y las de la palabra de la que es forma. */
function entradasDe(base, filas, idioma) {
  const propias = [];
  const formas = [];
  const vistas = new Set();
  for (const fila of filas) {
    if (fila.defs) propias.push({ palabra: fila.palabra, forma: false, categorias: sentidos(fila.defs) });
    // «corrió» apunta a «correr» y a «correrse»: si está la palabra sin el «se», alcanza con esa.
    const lemas = (fila.lemas ?? []).filter((l, _i, todos) => !(idioma === 'es' && l.endsWith('se') && todos.includes(l.slice(0, -2))));
    for (const lema of lemas.slice(0, 2)) {
      if (vistas.has(lema)) continue;
      vistas.add(lema);
      const entrada = definicionesDeBase(base, lema);
      if (entrada) formas.push(entrada);
    }
  }
  // Con una sola definición propia, primero la palabra base: «ran» es casi siempre de «run», no «hilo enrollado».
  const pocas = propias.length === 1 && propias[0].categorias.length === 1 && propias[0].categorias[0].sentidos.length === 1;
  return pocas ? [...formas, ...propias] : [...propias, ...formas];
}

function buscarEnBase(archivo, texto, idioma) {
  const base = abrir(archivo);
  for (const intento of [texto, ...otrasFormas(texto, idioma)]) {
    const filas = filasDe(base, intento);
    if (!filas.length) continue;
    const entradas = entradasDe(base, filas, idioma);
    // Si se llegó por una regla («gatas» → «gato»), se muestra como forma de esa palabra.
    if (entradas.length) return intento === texto ? entradas : entradas.map((e) => ({ ...e, forma: true }));
  }
  return null;
}

// ---------- Bajar ----------

const enCurso = new Map(); // idioma -> { promesa, corte, oyentes }

/** Un error con un mensaje pensado para mostrar. */
function falla(mensaje) {
  const error = new Error(mensaje);
  error.propio = true;
  return error;
}

function borrarSinChistar(ruta) {
  try {
    fs.rmSync(ruta, { force: true });
  } catch {}
}

/** Baja, verifica la huella y descomprime. El archivo final aparece recién cuando está entero y verificado. */
async function descargar(idioma, info, corte, avisar) {
  fs.mkdirSync(RAIZ, { recursive: true });
  const libre = fs.statfsSync(RAIZ);
  const hacenFalta = info.bajar + info.disco + 20 * 1024 * 1024;
  if (libre.bavail * libre.bsize < hacenFalta) throw falla(t('diccionario.sinEspacio', { megas: Math.ceil(hacenFalta / 1e6) }));
  if (!PRUEBA && !info.url.startsWith(ORIGEN)) throw falla(t('diccionario.noPude'));

  const comprimido = path.join(RAIZ, `${info.archivo}.br.tmp`);
  const temporal = path.join(RAIZ, `${info.archivo}.tmp`);
  try {
    const respuesta = await fetch(info.url, { redirect: 'follow', signal: AbortSignal.any([corte.signal, AbortSignal.timeout(20 * 60 * 1000)]) });
    if (!respuesta.ok || !respuesta.body) throw falla(t('diccionario.respondio', { estado: respuesta.status }));
    const huella = crypto.createHash('sha256');
    let hecho = 0;
    let ultimoAviso = 0;
    avisar({ idioma, fase: 'bajando', hecho, total: info.bajar });
    async function* contando(cuerpo) {
      for await (const trozo of cuerpo) {
        huella.update(trozo);
        hecho += trozo.length;
        if (Date.now() - ultimoAviso > 150) {
          ultimoAviso = Date.now();
          avisar({ idioma, fase: 'bajando', hecho, total: info.bajar });
        }
        yield trozo;
      }
    }
    await pipeline(Readable.fromWeb(respuesta.body), contando, fs.createWriteStream(comprimido), { signal: corte.signal });
    if (huella.digest('hex') !== info.sha256) throw falla(t('diccionario.noCoincide'));

    avisar({ idioma, fase: 'preparando' });
    await pipeline(fs.createReadStream(comprimido), zlib.createBrotliDecompress(), fs.createWriteStream(temporal), { signal: corte.signal });
    // Que abra y sea del idioma que dice, antes de ponerlo en su lugar.
    const prueba = new DatabaseSync(temporal, { readOnly: true });
    const delIdioma = prueba.prepare("SELECT valor FROM info WHERE clave = 'idioma'").get()?.valor;
    prueba.close();
    if (delIdioma !== idioma) throw falla(t('diccionario.noCoincide'));
    fs.renameSync(temporal, path.join(RAIZ, info.archivo));

    // Recién ahora se va el viejo (si está abierto, se cierra: el próximo pedido abre el nuevo).
    for (const viejo of archivosDe(idioma)) {
      if (viejo === info.archivo) continue;
      cerrar(viejo);
      borrarSinChistar(path.join(RAIZ, viejo));
    }
  } finally {
    borrarSinChistar(comprimido);
    borrarSinChistar(temporal);
  }
}

/** Baja el diccionario de un idioma; si ya está bajando, se suma. Devuelve { ok } o { ok: false, cancelado | mensaje }. */
function bajarDiccionario(idioma, alProgresar = () => {}) {
  const info = infoDe(idioma);
  if (!info) return Promise.resolve({ ok: false, mensaje: t('diccionario.noPude') });
  if (archivosDe(idioma).includes(info.archivo)) return Promise.resolve({ ok: true });
  if (PRUEBA === 'apagado') return Promise.resolve({ ok: false, mensaje: t('diccionario.sinInternet') });
  const yaEnCurso = enCurso.get(idioma);
  if (yaEnCurso) {
    yaEnCurso.oyentes.add(alProgresar);
    return yaEnCurso.promesa;
  }
  const corte = new AbortController();
  const oyentes = new Set([alProgresar]);
  const avisar = (estado) => {
    for (const o of oyentes) o(estado);
  };
  const promesa = descargar(idioma, info, corte, avisar)
    .then(() => ({ ok: true }))
    .catch((error) => {
      if (corte.signal.aborted) return { ok: false, cancelado: true };
      if (error.name === 'TimeoutError') return { ok: false, mensaje: t('diccionario.cortada') };
      if (error.propio) return { ok: false, mensaje: error.message };
      // fetch falla con un TypeError si no hay internet o se corta la conexión.
      return { ok: false, mensaje: error instanceof TypeError ? t('diccionario.sinInternet') : t('diccionario.noPude') };
    })
    .finally(() => enCurso.delete(idioma));
  enCurso.set(idioma, { promesa, corte, oyentes });
  return promesa;
}

function cancelarBajada(idioma) {
  enCurso.get(idioma)?.corte.abort();
  return { ok: true };
}

// ---------- Definir ----------

/**
 * La definición de lo seleccionado.
 * Devuelve { estado: 'listo', idioma, entradas }, { estado: 'noEsta', idioma }, { estado: 'falta', idioma, bajar } (hay
 * que bajar el diccionario) o { estado: 'sinDiccionario' } (idioma que no tenemos).
 */
function definir(idioma, seleccion) {
  const info = infoDe(idioma);
  if (!info) return { estado: 'sinDiccionario' };
  const texto = limpiarSeleccion(seleccion);
  if (!texto) return { estado: 'noEsta', idioma };

  const hay = archivosDe(idioma);
  const archivo = hay.includes(info.archivo) ? info.archivo : hay[0];
  if (!archivo) return { estado: 'falta', idioma, bajar: info.bajar };
  // Era de una versión anterior de Broots: se usa igual, y el nuevo baja en silencio para la próxima.
  if (archivo !== info.archivo) bajarDiccionario(idioma);

  try {
    const entradas = buscarEnBase(archivo, texto, idioma);
    return entradas ? { estado: 'listo', idioma, entradas } : { estado: 'noEsta', idioma };
  } catch {
    // Un archivo roto no se arregla solo: se saca, y el próximo pedido lo baja de nuevo.
    cerrar(archivo);
    borrarSinChistar(path.join(RAIZ, archivo));
    return { estado: 'falta', idioma, bajar: info.bajar };
  }
}

/** La página de Wiktionary de una palabra (el crédito de cada definición) o el texto de la licencia. */
function direccion(destino, idioma, palabra) {
  if (destino === 'licencia') return `https://creativecommons.org/licenses/by-sa/4.0/deed.${['es', 'en', 'pt'].includes(idioma) ? idioma : 'en'}`;
  if (destino !== 'entrada' || !['es', 'en', 'pt'].includes(idioma)) return null;
  const limpia = limpiarSeleccion(palabra);
  return limpia ? `https://${idioma}.wiktionary.org/wiki/${encodeURIComponent(limpia.replaceAll(' ', '_'))}` : null;
}

module.exports = { definir, bajarDiccionario, cancelarBajada, direccion, claveDe, otrasFormas, RAIZ };
