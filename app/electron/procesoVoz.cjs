// Leer en voz alta: el proceso aparte que pone la voz (voz.cjs lo abre con utilityProcess).
//
// Corre «parado» en la carpeta de las voces (cwd) y abre todo con rutas relativas: espeak-ng, el que pasa las letras a
// sonidos, no abre rutas con tilde y en una cuenta como «José» se caía. Si algo se rompe acá, Broots sigue andando:
// voz.cjs lo vuelve a abrir en el próximo pedido.
//
// Recibe { tipo: 'decir', id, carpeta, texto, velocidad, hilos } y contesta { id, ok, muestras (Float32Array), tasa }.
// Atiende de a un pedido: el motor no se comparte entre dos a la vez.
const fs = require('node:fs');
const path = require('node:path');

// Solo para pruebas: BROOTS_VOZ_FALSA=1 no carga ningún modelo; «habla» con un silencio que dura según el largo del
// texto (BROOTS_VOZ_FALSA_MS milisegundos por letra), así se prueba el lector entero sin bajar voces de verdad.
const FALSA = Boolean(process.env.BROOTS_VOZ_FALSA);
const MS_POR_LETRA = Number(process.env.BROOTS_VOZ_FALSA_MS) || 12;

let sherpa = null;
let cargada = null; // { carpeta, tts, hilos }
const cola = [];
let ocupado = false;

async function motor(carpeta, hilos) {
  if (cargada?.carpeta === carpeta && cargada.hilos === hilos) return cargada.tts;
  sherpa ??= require('sherpa-onnx-node');
  const ajustes = JSON.parse(fs.readFileSync(path.join(carpeta, 'voz.json'), 'utf8'));
  cargada = null; // la anterior se suelta sola (una voz por vez: cada una ocupa bastante memoria)
  const tts = await sherpa.OfflineTts.createAsync({
    model: {
      vits: {
        model: `${carpeta}/modelo.onnx`,
        tokens: `${carpeta}/tokens.txt`,
        dataDir: 'espeak-ng-data',
        noiseScale: ajustes.ruido ?? 0.667,
        noiseScaleW: ajustes.ruidoW ?? 0.8,
        lengthScale: ajustes.largo ?? 1,
      },
      numThreads: hilos,
      provider: 'cpu',
      debug: false,
    },
    maxNumSentences: 1,
  });
  cargada = { carpeta, tts, hilos };
  return tts;
}

async function decir({ carpeta, texto, velocidad, hilos }) {
  if (FALSA) {
    // BROOTS_VOZ_FALSA_FALLA=palabra: el pedazo que la lleva falla (para probar el aviso y la marca rojiza).
    if (process.env.BROOTS_VOZ_FALSA_FALLA && texto.includes(process.env.BROOTS_VOZ_FALSA_FALLA)) throw new Error('falla simulada');
    const tasa = 8000;
    await new Promise((r) => setTimeout(r, 30));
    return { muestras: new Float32Array(Math.max(1, Math.round((texto.length * MS_POR_LETRA * tasa) / 1000 / velocidad))), tasa };
  }
  const tts = await motor(carpeta, hilos);
  // enableExternalBuffer: false, o Electron lo rechaza («External buffers are not allowed»).
  const generar = (text) => tts.generateAsync({ text, sid: 0, speed: velocidad, enableExternalBuffer: false });
  let audio;
  try {
    audio = await generar(texto);
  } catch (error) {
    // Una segunda vez, con lo más sencillo: letras, números y la puntuación de siempre. Si no queda nada, silencio.
    const sencillo = texto.replace(/[^\p{L}\p{N}\s.,;:¿?¡!'"«»()-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(sencillo)) return { muestras: new Float32Array(1600), tasa: 8000 };
    if (sencillo === texto) throw error;
    audio = await generar(sencillo);
  }
  return { muestras: audio.samples, tasa: audio.sampleRate };
}

async function atender() {
  if (ocupado) return;
  ocupado = true;
  while (cola.length) {
    const pedido = cola.shift();
    try {
      const { muestras, tasa } = await decir(pedido);
      process.parentPort.postMessage({ id: pedido.id, ok: true, muestras, tasa });
    } catch (error) {
      process.parentPort.postMessage({ id: pedido.id, ok: false, error: String(error?.message ?? error) });
    }
  }
  ocupado = false;
}

process.parentPort.on('message', ({ data }) => {
  if (data?.tipo === 'decir') {
    cola.push(data);
    atender();
  } else if (data?.tipo === 'olvidar') {
    // Lo que todavía no empezó ya no hace falta (se paró la lectura o se saltó a otro lado).
    for (const pedido of cola.splice(0)) process.parentPort.postMessage({ id: pedido.id, ok: false, error: 'olvidado' });
  }
});
