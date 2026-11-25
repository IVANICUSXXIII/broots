// 1.13: leer en voz alta (el botón «Escuchar» del lector). Dos niveles, como Google Play Libros:
// - Sin internet: voces Piper (Daniela en español, Kristin en inglés, Faber en portugués) con el motor sherpa-onnx, en un
//   proceso aparte (procesoVoz.cjs). Las voces no viajan en el instalador: se bajan la primera vez que se piden, a una
//   carpeta de esta PC, y voces.json fija de dónde y con qué huella. Después no hace falta internet.
// - Con internet: Gemini, con la clave que el usuario ya guardó para traducir. El cupo gratis es chico (3 pedidos por
//   minuto): acá se espacian los pedidos, y lo ya escuchado se guarda un tiempo en esta PC para no volver a gastarlo.
//
// Las voces vienen tal como las publica Piper (un .onnx y su .onnx.json). Al bajarlas se les agrega lo que el motor
// necesita saber (metadatos al final del .onnx y tokens.txt): es lo mismo que hace el conversor de sherpa-onnx.
// Daniela y Faber (licencia dudosa: parten de «lessac», una voz que es solo para investigación) se bajan de su sitio
// original y Broots no las guarda en ningún repositorio propio. Las voces de Piper 1.5 (reentrenadas desde el 9/11/2026)
// juntan diptongos en un solo símbolo («aɪ») y sherpa-onnx 1.13.8 no los lee: por eso Faber va fija en la versión anterior.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { app, utilityProcess, net } = require('electron');
const { t } = require('./idioma.cjs');
const traduccion = require('./traduccion.cjs');

// Solo para pruebas (con BROOTS_DATOS): BROOTS_VOCES=manifiesto.json dice de dónde bajarlas, y =real baja las de verdad.
// Sin eso, las pruebas no salen a internet. BROOTS_VOZ_FALSA=1 «habla» sin modelo (ver procesoVoz.cjs) y con Gemini.
const PRUEBA = process.env.BROOTS_DATOS ? process.env.BROOTS_VOCES || 'apagado' : null;
const FALSA = Boolean(process.env.BROOTS_VOZ_FALSA);
const RAIZ = PRUEBA ? path.join(process.env.BROOTS_DATOS, 'voces') : path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Broots', 'voces');
const ORIGENES = ['https://huggingface.co/rhasspy/piper-voices/resolve/', 'https://github.com/IVANICUSXXIII/broots-voces/releases/download/'];
const ESPEAK = app.isPackaged ? path.join(process.resourcesPath, 'espeak-ng-data') : path.join(__dirname, '..', 'voz', 'espeak-ng-data');
// Sin pedidos durante este tiempo, el proceso de la voz se cierra y libera la memoria (en pruebas se puede acortar).
const INACTIVO = (PRUEBA && Number(process.env.BROOTS_VOZ_INACTIVO_MS)) || 3 * 60 * 1000;
const CACHE_GEMINI = 200 * 1024 * 1024; // tope de lo escuchado con Gemini que se guarda en esta PC

function leerManifiesto() {
  if (PRUEBA && PRUEBA !== 'real' && PRUEBA !== 'apagado') return JSON.parse(fs.readFileSync(PRUEBA, 'utf8'));
  return require('./voces.json');
}
const infoDe = (idioma) => {
  const m = leerManifiesto();
  return idioma !== 'gemini' && Object.hasOwn(m, idioma) ? m[idioma] : null;
};
const carpetaDe = (idioma, info) => `${idioma}-${info.id}-${info.version}`;
const hayVoz = (idioma, info) => fs.existsSync(path.join(RAIZ, carpetaDe(idioma, info), 'voz.json'));

function falla(mensaje) {
  const error = new Error(mensaje);
  error.propio = true;
  return error;
}
function borrarSinChistar(ruta) {
  try {
    fs.rmSync(ruta, { recursive: true, force: true });
  } catch {}
}

/** Qué voz hay para un idioma: { tiene: false } si no hay voz sin internet; si la hay, si ya está bajada y cuánto pesa. */
function estado(idioma) {
  const info = infoDe(idioma);
  if (!info) return { tiene: false };
  return { tiene: true, nombre: info.nombre, lista: hayVoz(idioma, info), bajar: info.onnx.bytes + info.json.bytes };
}

// ---------- Preparar una voz ----------

// Un campo de protobuf de tipo «bytes» (ONNX es protobuf). Sumar campos al final del archivo es válido: así se agregan
// los metadatos (campo 14, metadata_props) sin tener que leer ni reescribir el modelo.
const varint = (n) => {
  const bytes = [];
  while (n > 127) {
    bytes.push((n & 127) | 128);
    n >>>= 7;
  }
  bytes.push(n);
  return Buffer.from(bytes);
};
const campo = (numero, contenido) => Buffer.concat([varint((numero << 3) | 2), varint(contenido.length), contenido]);
const metadato = (clave, valor) => campo(14, Buffer.concat([campo(1, Buffer.from(clave)), campo(2, Buffer.from(String(valor)))]));

/** Del .onnx.json de Piper: los metadatos que pide sherpa-onnx, tokens.txt y los ajustes de la voz. */
function prepararDesde(json) {
  const meta = {
    model_type: 'vits',
    comment: 'piper',
    language: json.language?.name_english ?? '',
    voice: json.espeak?.voice ?? '',
    has_espeak: 1,
    n_speakers: json.num_speakers ?? 1,
    sample_rate: json.audio?.sample_rate ?? 22050,
  };
  if (!meta.voice || !json.phoneme_id_map) throw falla(t('voz.noCoincide'));
  const tokens = `${Object.entries(json.phoneme_id_map).map(([simbolo, ids]) => `${simbolo} ${ids[0]}`).join('\n')}\n`;
  const ajustes = { ruido: json.inference?.noise_scale, ruidoW: json.inference?.noise_w, largo: json.inference?.length_scale };
  return { metadatos: Buffer.concat(Object.entries(meta).map(([k, v]) => metadato(k, v))), tokens, ajustes };
}

/** La carpeta con los datos de espeak-ng (viajan en el instalador), copiada al lado de las voces. */
function asegurarEspeak() {
  const destino = path.join(RAIZ, 'espeak-ng-data');
  const marca = path.join(destino, '.broots');
  const version = app.getVersion();
  try {
    if (fs.readFileSync(marca, 'utf8') === version) return;
  } catch {}
  borrarSinChistar(destino);
  fs.mkdirSync(RAIZ, { recursive: true });
  fs.cpSync(ESPEAK, destino, { recursive: true });
  fs.writeFileSync(marca, version);
}

// ---------- Bajar ----------

const enCurso = new Map(); // idioma -> { promesa, corte, oyentes }

async function bajarArchivo(archivo, destino, corte, alAvanzar) {
  if (!PRUEBA && !ORIGENES.some((o) => archivo.url.startsWith(o))) throw falla(t('voz.noPude'));
  const respuesta = await fetch(archivo.url, { redirect: 'follow', signal: AbortSignal.any([corte.signal, AbortSignal.timeout(30 * 60 * 1000)]) });
  if (!respuesta.ok || !respuesta.body) throw falla(t('voz.respondio', { estado: respuesta.status }));
  const huella = crypto.createHash('sha256');
  async function* contando(cuerpo) {
    for await (const trozo of cuerpo) {
      huella.update(trozo);
      alAvanzar(trozo.length);
      yield trozo;
    }
  }
  await pipeline(Readable.fromWeb(respuesta.body), contando, fs.createWriteStream(destino), { signal: corte.signal });
  if (huella.digest('hex') !== archivo.sha256) throw falla(t('voz.noCoincide'));
}

/** Baja, verifica y prepara. La carpeta final aparece recién cuando la voz está entera y lista. */
async function descargar(idioma, info, corte, avisar) {
  fs.mkdirSync(RAIZ, { recursive: true });
  const libre = fs.statfsSync(RAIZ);
  const hacenFalta = (info.onnx.bytes + info.json.bytes) * 2 + 20 * 1024 * 1024;
  if (libre.bavail * libre.bsize < hacenFalta) throw falla(t('voz.sinEspacio', { megas: Math.ceil(hacenFalta / 1e6) }));
  const final = path.join(RAIZ, carpetaDe(idioma, info));
  const temporal = `${final}.tmp`;
  borrarSinChistar(temporal);
  fs.mkdirSync(temporal, { recursive: true });
  try {
    const total = info.onnx.bytes + info.json.bytes;
    let hecho = 0;
    let ultimoAviso = 0;
    const alAvanzar = (n) => {
      hecho += n;
      if (Date.now() - ultimoAviso > 150) {
        ultimoAviso = Date.now();
        avisar({ idioma, fase: 'bajando', hecho, total });
      }
    };
    avisar({ idioma, fase: 'bajando', hecho, total });
    await bajarArchivo(info.json, path.join(temporal, 'piper.onnx.json'), corte, alAvanzar);
    await bajarArchivo(info.onnx, path.join(temporal, 'modelo.onnx'), corte, alAvanzar);
    avisar({ idioma, fase: 'preparando' });
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(temporal, 'piper.onnx.json'), 'utf8'));
    } catch {
      throw falla(t('voz.noCoincide'));
    }
    const { metadatos, tokens, ajustes } = prepararDesde(json);
    fs.appendFileSync(path.join(temporal, 'modelo.onnx'), metadatos);
    fs.writeFileSync(path.join(temporal, 'tokens.txt'), tokens);
    fs.writeFileSync(path.join(temporal, 'voz.json'), JSON.stringify({ idioma, id: info.id, version: info.version, ...ajustes }));
    fs.renameSync(temporal, final);
    // Recién ahora se van las versiones anteriores de la voz de este idioma.
    for (const nombre of fs.readdirSync(RAIZ)) {
      if (nombre.startsWith(`${idioma}-`) && path.join(RAIZ, nombre) !== final) borrarSinChistar(path.join(RAIZ, nombre));
    }
  } finally {
    borrarSinChistar(temporal);
  }
}

/** Baja la voz de un idioma; si ya está bajando, se suma. Devuelve { ok } o { ok: false, cancelado | mensaje }. */
function bajar(idioma, alProgresar = () => {}) {
  const info = infoDe(idioma);
  if (!info) return Promise.resolve({ ok: false, mensaje: t('voz.noPude') });
  if (hayVoz(idioma, info)) return Promise.resolve({ ok: true });
  if (PRUEBA === 'apagado') return Promise.resolve({ ok: false, mensaje: t('voz.sinInternet') });
  const yaEnCurso = enCurso.get(idioma);
  if (yaEnCurso) {
    yaEnCurso.oyentes.add(alProgresar);
    return yaEnCurso.promesa;
  }
  const corte = new AbortController();
  const oyentes = new Set([alProgresar]);
  const avisar = (e) => {
    for (const o of oyentes) o(e);
  };
  const promesa = descargar(idioma, info, corte, avisar)
    .then(() => ({ ok: true }))
    .catch((error) => {
      if (corte.signal.aborted) return { ok: false, cancelado: true };
      if (error.name === 'TimeoutError') return { ok: false, mensaje: t('voz.cortada') };
      if (error.propio) return { ok: false, mensaje: error.message };
      return { ok: false, mensaje: error instanceof TypeError ? t('voz.sinInternet') : t('voz.noPude') };
    })
    .finally(() => enCurso.delete(idioma));
  enCurso.set(idioma, { promesa, corte, oyentes });
  return promesa;
}

function cancelar(idioma) {
  enCurso.get(idioma)?.corte.abort();
  return { ok: true };
}

// ---------- El proceso de la voz ----------

let proceso = null;
let numero = 0;
const pendientes = new Map(); // id -> resolver
let apagar = null;

function abrirProceso() {
  if (proceso) return proceso;
  asegurarEspeak();
  const p = utilityProcess.fork(path.join(__dirname, 'procesoVoz.cjs'), [], { cwd: RAIZ, serviceName: 'Broots voz', stdio: 'ignore' });
  p.on('message', (m) => {
    const resolver = pendientes.get(m?.id);
    if (!resolver) return;
    pendientes.delete(m.id);
    resolver(m);
  });
  p.on('exit', () => {
    if (proceso === p) proceso = null;
    for (const [id, resolver] of pendientes) {
      pendientes.delete(id);
      resolver({ id, ok: false, error: 'se cayó' });
    }
  });
  proceso = p;
  return p;
}

function cerrarProceso() {
  clearTimeout(apagar);
  apagar = null;
  proceso?.kill();
  proceso = null;
}

/** Lo que pasó con la voz, para entender un problema después (voces/voz.log, de pocas líneas). */
function anotar(texto) {
  try {
    const archivo = path.join(RAIZ, 'voz.log');
    if (fs.existsSync(archivo) && fs.statSync(archivo).size > 200 * 1024) fs.renameSync(archivo, `${archivo}.1`);
    fs.appendFileSync(archivo, `${new Date().toISOString()} ${texto}\n`);
  } catch {}
}

/**
 * Un pedido al proceso de la voz. El apagado por inactividad se programa recién cuando no queda ningún pedido
 * pendiente: antes quedaba un temporizador viejo andando y apagaba la voz en plena lectura.
 */
function pedirAlProceso(datos) {
  clearTimeout(apagar);
  apagar = null;
  const id = ++numero;
  return new Promise((resolver) => {
    pendientes.set(id, resolver);
    try {
      abrirProceso().postMessage({ tipo: 'decir', id, ...datos });
    } catch (error) {
      pendientes.delete(id);
      resolver({ id, ok: false, error: error.message });
    }
  }).finally(() => {
    if (!pendientes.size) {
      clearTimeout(apagar);
      apagar = setTimeout(cerrarProceso, INACTIVO);
    }
  });
}

/** Cuántos hilos usa la voz: con 4 ya va bien (más no la acelera) y nunca más de la mitad de la PC. */
const hilos = () => Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));

async function decirSinInternet(idioma, texto, velocidad) {
  const info = infoDe(idioma);
  if (!info) return { ok: false, motivo: 'sinVoz' };
  if (!hayVoz(idioma, info)) return { ok: false, motivo: 'falta', nombre: info.nombre, bajar: info.onnx.bytes + info.json.bytes };
  // «ritmo» (voces.json) es el 1× de cada voz: las de Piper hablan más rápido que un audiolibro, y el usuario eligió de oído
  // (25/11) que el 1× sea 0,7 del ritmo con que salen. Lo que se devuelve es la velocidad pedida, sin el ritmo.
  const datos = { carpeta: carpetaDe(idioma, info), texto, velocidad: velocidad * (info.ritmo ?? 1), hilos: hilos() };
  let respuesta = await pedirAlProceso(datos);
  // Si el proceso se cayó (o lo cerraron), se abre de nuevo y se prueba otra vez.
  if (!respuesta.ok && respuesta.error === 'se cayó') {
    anotar(`el proceso se cayó; reintento (${idioma}, ${texto.length} letras)`);
    respuesta = await pedirAlProceso(datos);
  }
  if (respuesta.ok) return { ok: true, muestras: respuesta.muestras, tasa: respuesta.tasa, motor: 'local', velocidad };
  if (respuesta.error === 'olvidado') return { ok: false, motivo: 'olvidado' };
  anotar(`no pude leer (${idioma}): ${respuesta.error} · «${texto.slice(0, 120)}»`);
  console.error('[voz]', respuesta.error);
  return { ok: false, motivo: 'error', mensaje: t('voz.noPudeLeer') };
}

/** Lo que estaba en la fila y ya no hace falta (se paró la lectura o se saltó a otro lado). */
function olvidar() {
  proceso?.postMessage({ tipo: 'olvidar' });
  for (const turno of geminiEnFila) turno.cancelado = true;
  return { ok: true };
}

// ---------- Gemini ----------

const pedidosGemini = []; // cuándo salió cada pedido (para no pasar el cupo por minuto)
const geminiEnFila = new Set();
let pedidosFalsos = 0;
const CARPETA_GEMINI = path.join(RAIZ, 'gemini');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Busca el audio (base64) en la respuesta, esté donde esté: la forma de la respuesta cambió más de una vez. */
function audioDe(respuesta) {
  let hallado = null;
  (function recorrer(x) {
    if (!x || typeof x !== 'object') return;
    if (typeof x.data === 'string' && x.data.length > 100 && (!x.type || x.type === 'audio')) hallado = x;
    for (const v of Object.values(x)) recorrer(v);
  })(respuesta);
  return hallado;
}

/** De WAV (o PCM de 16 bits sin encabezado) a muestras de -1 a 1. */
function aMuestras(buffer) {
  let tasa = 24000;
  let datos = buffer;
  if (buffer.subarray(0, 4).toString() === 'RIFF') {
    tasa = buffer.readUInt32LE(24);
    let lugar = 12;
    while (lugar + 8 <= buffer.length) {
      const nombre = buffer.subarray(lugar, lugar + 4).toString();
      const largo = buffer.readUInt32LE(lugar + 4);
      if (nombre === 'data') {
        datos = buffer.subarray(lugar + 8, lugar + 8 + largo);
        break;
      }
      lugar += 8 + largo;
    }
  }
  const muestras = new Float32Array(Math.floor(datos.length / 2));
  for (let i = 0; i < muestras.length; i++) muestras[i] = datos.readInt16LE(i * 2) / 32768;
  return { muestras, tasa };
}
function aPcm(muestras) {
  const b = Buffer.alloc(muestras.length * 2);
  for (let i = 0; i < muestras.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(muestras[i] * 32767))), i * 2);
  return b;
}

/** Saca lo más viejo de lo guardado de Gemini hasta que entre en el tope. */
function podarCache() {
  try {
    const archivos = fs.readdirSync(CARPETA_GEMINI).map((n) => {
      const ruta = path.join(CARPETA_GEMINI, n);
      const s = fs.statSync(ruta);
      return { ruta, tamaño: s.size, cuando: s.mtimeMs };
    });
    let total = archivos.reduce((s, a) => s + a.tamaño, 0);
    for (const a of archivos.sort((x, y) => x.cuando - y.cuando)) {
      if (total <= CACHE_GEMINI) break;
      borrarSinChistar(a.ruta);
      total -= a.tamaño;
    }
  } catch {}
}

async function decirGemini(config, idioma, texto) {
  const g = leerManifiesto().gemini ?? require('./voces.json').gemini;
  const voz = g.voces[idioma] ?? g.voces.otro;
  const archivo = path.join(CARPETA_GEMINI, `${crypto.createHash('sha1').update(`${g.modelo}|${voz}|${g.estilo}|${texto}`).digest('hex')}.pcm`);
  try {
    const guardado = fs.readFileSync(archivo);
    fs.utimesSync(archivo, new Date(), new Date()); // lo recién escuchado es lo último que se borra
    return { ok: true, ...aMuestras(guardado), motor: 'gemini' };
  } catch {}

  if (FALSA || traduccion.falsa) {
    // En pruebas, BROOTS_VOZ_FALSA_CUPO=n: después de n pedidos, Gemini dice que se terminó el cupo del día.
    pedidosFalsos++;
    const cupo = Number(process.env.BROOTS_VOZ_FALSA_CUPO);
    if (cupo && pedidosFalsos > cupo) return { ok: false, motivo: 'cupo', mensaje: t('voz.cupoGeminiDia') };
    await esperar(60);
    return { ok: true, muestras: new Float32Array(Math.max(1, Math.round(texto.length * 12 * 8))), tasa: 8000, motor: 'gemini' };
  }
  const clave = traduccion.leerClave(config);
  if (!clave) return { ok: false, motivo: 'sinClave', mensaje: t('traduccion.sinClave') };

  let cuerpo;
  for (let intento = 0; ; intento++) {
    // El cupo gratis: a lo sumo «porMinuto» pedidos en 60 segundos. Si ya se usaron, se espera el turno.
    const turno = { cancelado: false };
    geminiEnFila.add(turno);
    try {
      for (;;) {
        const haceUnMinuto = Date.now() - 60_000;
        while (pedidosGemini.length && pedidosGemini[0] < haceUnMinuto) pedidosGemini.shift();
        if (pedidosGemini.length < (g.porMinuto ?? 3)) break;
        await esperar(pedidosGemini[0] - haceUnMinuto + 300);
        if (turno.cancelado) return { ok: false, motivo: 'olvidado' };
      }
    } finally {
      geminiEnFila.delete(turno);
    }
    if (turno.cancelado) return { ok: false, motivo: 'olvidado' };
    pedidosGemini.push(Date.now());

    let respuesta;
    try {
      respuesta = await net.fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: g.modelo,
          input: [{ type: 'user_input', content: [{ type: 'text', text: texto, annotations: [{ type: 'speech_metadata', style: g.estilo }] }] }],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ voice: voz }] },
        }),
      });
    } catch (error) {
      return { ok: false, motivo: 'error', mensaje: error.name === 'TimeoutError' ? t('traduccion.demora') : t('voz.sinInternetGemini') };
    }
    cuerpo = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) break;
    const detalle = JSON.stringify(cuerpo.error ?? {});
    if (respuesta.status === 429) {
      // Por minuto: Gemini dice cuánto esperar, y se espera (antes se tomaba como «se terminó» y se pasaba a la voz de
      // la PC). Por día: ahí sí se terminó hasta mañana.
      const demora = cuerpo.error?.details?.find((d) => d.retryDelay)?.retryDelay;
      const ms = demora ? Math.ceil(parseFloat(demora) * 1000) + 500 : 20_000;
      const porDia = /per ?day/i.test(detalle);
      anotar(`Gemini 429 ${porDia ? 'por día' : 'por minuto'} (espera ${demora ?? '?'}): ${(cuerpo.error?.message ?? '').slice(0, 160)}`);
      if (porDia || intento >= 3 || ms > 70_000) return { ok: false, motivo: 'cupo', mensaje: porDia ? t('voz.cupoGeminiDia') : t('voz.cupoGemini') };
      await esperar(ms);
      continue;
    }
    if (respuesta.status === 403 || (respuesta.status === 400 && /API_KEY/i.test(detalle))) return { ok: false, motivo: 'sinClave', mensaje: t('traduccion.claveInvalida') };
    anotar(`Gemini ${respuesta.status}: ${detalle.slice(0, 200)}`);
    console.error('[voz] Gemini', respuesta.status, detalle);
    return { ok: false, motivo: 'error', mensaje: t('voz.geminiRespondio', { estado: respuesta.status }) };
  }
  const audio = audioDe(cuerpo);
  if (!audio) return { ok: false, motivo: 'error', mensaje: t('voz.noPudeLeer') };
  const { muestras, tasa } = aMuestras(Buffer.from(audio.data, 'base64'));
  try {
    fs.mkdirSync(CARPETA_GEMINI, { recursive: true });
    // Se guarda como PCM de 24 kHz sin encabezado (así lo entiende aMuestras al leerlo).
    if (tasa === 24000) fs.writeFileSync(archivo, aPcm(muestras));
    if (Math.random() < 0.1) podarCache();
  } catch {}
  return { ok: true, muestras, tasa, motor: 'gemini' };
}

/** Lo que se va a escuchar: { ok, muestras, tasa, motor } o { ok: false, motivo, mensaje? }. */
function decir(config, { idioma, texto, velocidad = 1, motor = 'local' }) {
  // Sin símbolos ni caracteres privados (los cuadraditos de algunos libros, adornos, emojis): no se pronuncian y a veces
  // hacían fallar al motor. Quedan letras, números, signos de puntuación y espacios.
  const limpio = String(texto ?? '').replace(/[^\p{L}\p{M}\p{N}\p{P}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(limpio)) return Promise.resolve({ ok: true, muestras: new Float32Array(1600), tasa: 8000, motor, velocidad: 1 });
  const v = Math.min(2, Math.max(0.5, Number(velocidad) || 1));
  return motor === 'gemini' ? decirGemini(config, idioma, limpio) : decirSinInternet(idioma, limpio, v);
}

module.exports = { estado, bajar, cancelar, decir, olvidar, cerrarProceso, prepararDesde };
