// Etapa 5: traducción de párrafos con la API gratuita de Gemini.
// - La clave la pega el usuario en Broots y se guarda cifrada por Windows (safeStorage); nunca vuelve
//   a la interfaz.
// - Siempre se traduce al idioma de Broots. Lo traducido se guarda en <biblioteca>/.broots/traducciones/
//   (por el texto original), un archivo por libro y por idioma: <uuid>.json para el español (como hasta
//   la 1.4.0) y <uuid>.en.json o <uuid>.pt.json para los otros. Así releer un libro no gasta cupo y la
//   traducción queda en Drive. En una biblioteca compartida (solo lectura) se guarda en esta PC.
// - 1.9 «Explicar»: qué quiere decir lo que seleccionaste en el lector, en el contexto de su párrafo y sin spoilers.
//   Las explicaciones se guardan 30 días en <biblioteca>/.broots/explicaciones/<uuid>.<idioma>.json (preguntar dos
//   veces lo mismo no gasta cupo); después se borran solas. Para conservar una, el lector la guarda como nota.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage, net } = require('electron');
const { t } = require('./idioma.cjs');

// Del más rápido al más capaz; si uno no existe o se queda sin cupo, se prueba el siguiente.
// "Pensar" demora la respuesta y para traducir no hace falta: se pide el nivel más bajo de cada modelo.
const MODELOS = [
  { nombre: 'gemini-3.5-flash-lite', pensar: 'minimal' },
  { nombre: 'gemini-3.6-flash', pensar: 'minimal' },
  { nombre: 'gemini-3.8-flash', pensar: 'low' },
  { nombre: 'gemini-flash-latest', pensar: null },
];
const TIEMPO_MAXIMO = 45000; // por pedido: si Gemini no contesta, se corta y se reintenta
const TANDA_MAXIMA = { caracteres: 2800, parrafos: 16 };
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

// Instrucciones para Gemini, escritas en el idioma al que se traduce (el de Broots).
const INSTRUCCIONES = {
  es: `Sos un traductor literario. Traducí al español latinoamericano natural (para un lector de Argentina, pero sin voseo ni modismos forzados) cada elemento del arreglo JSON que te paso.
Reglas:
- Devolvé un arreglo JSON con la MISMA cantidad de elementos y en el mismo orden.
- Cada elemento es HTML: mantené exactamente las etiquetas (<em>, <strong>, <br>, <a ...>, etc.) y traducí solo el texto.
- Respetá el tono, el registro y la puntuación del autor. No resumas, no agregues notas ni explicaciones.
- Nombres propios, títulos de obras y siglas quedan como en el original salvo que tengan traducción conocida.
- Si un elemento ya está en español o no tiene texto para traducir, devolvelo igual.`,
  en: `You are a literary translator. Translate each element of the JSON array I send you into natural, fluent English.
Rules:
- Return a JSON array with the SAME number of elements, in the same order.
- Each element is HTML: keep the tags exactly as they are (<em>, <strong>, <br>, <a ...>, etc.) and translate only the text.
- Respect the author's tone, register and punctuation. Don't summarize, and don't add notes or explanations.
- Proper names, titles of works and acronyms stay as in the original unless they have a well-known translation.
- If an element is already in English or has no text to translate, return it unchanged.`,
  pt: `Você é um tradutor literário. Traduza para o português do Brasil, de forma natural e fluente, cada elemento do array JSON que eu enviar.
Regras:
- Devolva um array JSON com a MESMA quantidade de elementos e na mesma ordem.
- Cada elemento é HTML: mantenha exatamente as tags (<em>, <strong>, <br>, <a ...> etc.) e traduza só o texto.
- Respeite o tom, o registro e a pontuação do autor. Não resuma, não acrescente notas nem explicações.
- Nomes próprios, títulos de obras e siglas ficam como no original, a menos que tenham tradução conhecida.
- Se um elemento já estiver em português ou não tiver texto para traduzir, devolva-o igual.`,
};
// Frase para probar la clave: en inglés, salvo que se traduzca al inglés.
const PRUEBA = { es: 'Good morning! The library is open.', en: '¡Buen día! La biblioteca está abierta.', pt: 'Good morning! The library is open.' };

// ---------- Clave ----------

// Solo para pruebas: BROOTS_TRADUCCION_FALSA=1 "traduce" anteponiendo el idioma («ES· », «EN· »…), sin usar Gemini.
const FALSA = Boolean(process.env.BROOTS_TRADUCCION_FALSA);

function estado(config) {
  if (FALSA) return { tieneClave: true, cifradoDisponible: true };
  return { tieneClave: Boolean(config.gemini?.claveCifrada), cifradoDisponible: safeStorage.isEncryptionAvailable() };
}

/** Devuelve la configuración nueva con la clave cifrada (o sin clave si viene vacía y borrar=true). */
function conClave(config, clave, borrar) {
  const gemini = { ...(config.gemini ?? {}) };
  if (borrar) delete gemini.claveCifrada;
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error(t('traduccion.sinCifrado'));
    gemini.claveCifrada = safeStorage.encryptString(String(clave).trim()).toString('base64');
  }
  return { ...config, gemini };
}

function leerClave(config) {
  if (!config.gemini?.claveCifrada) return null;
  return safeStorage.decryptString(Buffer.from(config.gemini.claveCifrada, 'base64'));
}

// ---------- Caché ----------

const huella = (texto) => crypto.createHash('sha1').update(texto).digest('base64url').slice(0, 20);
const cacheAbierta = new Map(); // archivo -> { datos, pendiente }

/** carpetaDatos: <biblioteca>/.broots, o una carpeta de esta PC si la biblioteca es compartida (solo lectura). */
function archivoCache(carpetaDatos, uuid, destino) {
  const nombre = String(uuid).replace(/[^a-z0-9-]/gi, '');
  return path.join(carpetaDatos, 'traducciones', destino === 'es' ? `${nombre}.json` : `${nombre}.${destino}.json`);
}

function leerCache(archivo) {
  if (!cacheAbierta.has(archivo)) {
    let datos = {};
    try {
      datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    } catch {}
    cacheAbierta.set(archivo, { datos, pendiente: null });
  }
  return cacheAbierta.get(archivo);
}

/** Guarda la caché unos segundos después del último cambio (Drive no necesita una escritura por párrafo). */
function guardarCache(archivo) {
  const cache = cacheAbierta.get(archivo);
  clearTimeout(cache.pendiente);
  cache.pendiente = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, JSON.stringify(cache.datos));
    } catch (error) {
      console.error('[traduccion] no pude guardar la caché:', error.message);
    }
  }, 3000);
}

// ---------- Gemini ----------

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un pedido a un modelo: devuelve el texto de la respuesta. esquema: el JSON que se espera (sin esquema, texto libre). */
async function llamar(modelo, clave, { sistema, contenido, esquema, temperatura = 0.3 }, conPensamiento = true) {
  const generationConfig = esquema
    ? { temperature: temperatura, responseMimeType: 'application/json', responseSchema: esquema }
    : { temperature: temperatura, responseMimeType: 'text/plain' };
  if (modelo.pensar && conPensamiento) generationConfig.thinkingConfig = { thinkingLevel: modelo.pensar };
  const respuesta = await net.fetch(`${API}/${modelo.nombre}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': clave },
    signal: AbortSignal.timeout(TIEMPO_MAXIMO),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: 'user', parts: [{ text: contenido }] }],
      generationConfig,
    }),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(cuerpo.error?.message ?? t('traduccion.respondio', { estado: respuesta.status }));
    error.estado = respuesta.status;
    error.motivo = cuerpo.error?.details?.find((d) => d.reason)?.reason ?? cuerpo.error?.status ?? '';
    // Cuánto pide esperar Gemini cuando se alcanza el límite por minuto (p. ej. "12s").
    const demora = cuerpo.error?.details?.find((d) => d.retryDelay)?.retryDelay;
    error.esperar = demora ? Math.ceil(parseFloat(demora) * 1000) : null;
    throw error;
  }
  return cuerpo.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
}

async function pedir(modelo, clave, textos, destino, conPensamiento = true) {
  const pedido = { sistema: INSTRUCCIONES[destino], contenido: JSON.stringify(textos), esquema: { type: 'ARRAY', items: { type: 'STRING' } } };
  const traducidos = JSON.parse(await llamar(modelo, clave, pedido, conPensamiento));
  if (!Array.isArray(traducidos) || traducidos.length !== textos.length) throw Object.assign(new Error(t('traduccion.incompleta')), { incompleta: true });
  return traducidos.map(String);
}

const sinModelo = new Set(); // modelos que esta clave no tiene (404): no se vuelven a probar
const sinPensamiento = new Set(); // modelos que no aceptan elegir el nivel de "pensamiento"

/**
 * Prueba los modelos en orden con hacer(modelo, conPensamiento) hasta que uno conteste. Si la respuesta vuelve
 * desarmada, alDesarmarse() puede ofrecer otro camino (al traducir, partir la tanda en dos). noPude: la clave del
 * mensaje final si ninguno pudo.
 */
async function conModelos(hacer, { alDesarmarse = () => null, noPude = 'traduccion.noPude' } = {}) {
  let ultimoError = null;
  for (const modelo of MODELOS) {
    if (sinModelo.has(modelo.nombre)) continue;
    for (let intento = 0; intento < 2; intento++) {
      try {
        return await hacer(modelo, !sinPensamiento.has(modelo.nombre));
      } catch (error) {
        ultimoError = error;
        const detalle = `${error.motivo} ${error.message}`;
        if (error.estado === 400 && /API_KEY/i.test(detalle)) throw new Error(t('traduccion.claveInvalida'));
        if (error.estado === 403) throw new Error(t('traduccion.claveRechazada'));
        if (error.estado === 400 && /think/i.test(detalle) && !sinPensamiento.has(modelo.nombre)) {
          sinPensamiento.add(modelo.nombre); // ese modelo no acepta el nivel: se repite sin pedirlo
          intento--;
          continue;
        }
        if (error.estado === 404) {
          sinModelo.add(modelo.nombre);
          break;
        }
        if (error.incompleta || error instanceof SyntaxError) {
          const otroCamino = alDesarmarse();
          if (otroCamino) return await otroCamino;
          if (intento === 0) continue;
          break;
        }
        if (error.estado === 429) {
          if (intento === 0 && (error.esperar ?? 0) <= 20000) {
            await esperar(error.esperar ?? 6000);
            continue;
          }
          break; // sin cupo en este modelo: pasa al siguiente
        }
        if (intento === 0) await esperar(1500); // corte de red, demora o error del servidor: un reintento
      }
    }
  }
  if (ultimoError?.estado === 429) throw new Error(t('traduccion.limite'));
  if (ultimoError?.name === 'TimeoutError' || ultimoError?.name === 'AbortError') throw new Error(t('traduccion.demora'));
  throw new Error(t(noPude, { detalle: ultimoError?.message ?? t('traduccion.errorDesconocido') }));
}

/** Traduce una tanda probando los modelos en orden. Si la respuesta vuelve desarmada, parte la tanda en dos. */
function traducirTanda(clave, textos, destino) {
  return conModelos((modelo, pensar) => pedir(modelo, clave, textos, destino, pensar), {
    alDesarmarse: () => {
      if (textos.length < 2) return null;
      const mitad = Math.ceil(textos.length / 2);
      return (async () => [...(await traducirTanda(clave, textos.slice(0, mitad), destino)), ...(await traducirTanda(clave, textos.slice(mitad), destino))])();
    },
  });
}

// Cola de pedidos a Gemini: de a uno (para no chocar con el límite por minuto) y lo que está en
// pantalla primero; lo que se adelanta de las páginas siguientes espera su turno.
const cola = [];
let ocupada = false;

function encolar(urgente, tarea) {
  return new Promise((resolver, rechazar) => {
    const pedido = { urgente, tarea, resolver, rechazar };
    const posicion = urgente ? cola.findIndex((p) => !p.urgente) : -1;
    if (posicion >= 0) cola.splice(posicion, 0, pedido);
    else cola.push(pedido);
    atenderCola();
  });
}

async function atenderCola() {
  if (ocupada) return;
  ocupada = true;
  while (cola.length) {
    const pedido = cola.shift();
    try {
      pedido.resolver(await pedido.tarea());
    } catch (error) {
      pedido.rechazar(error);
    }
  }
  ocupada = false;
}

/** Arma tandas chicas: las respuestas cortas llegan antes y se desarman menos. */
function tandas(indices, textos) {
  const lista = [];
  let actual = [];
  let largo = 0;
  for (const i of indices) {
    if (actual.length && (largo + textos[i].length > TANDA_MAXIMA.caracteres || actual.length >= TANDA_MAXIMA.parrafos)) {
      lista.push(actual);
      actual = [];
      largo = 0;
    }
    actual.push(i);
    largo += textos[i].length;
  }
  if (actual.length) lista.push(actual);
  return lista;
}

/**
 * Traduce una lista de párrafos (HTML) al idioma destino ('es', 'en' o 'pt'). Devuelve { ok, traducciones[] } en el mismo orden.
 * Lo que ya está en la caché del libro vuelve al instante; lo demás se pide a Gemini por la cola.
 * urgente: son párrafos que el usuario está mirando (pasan adelante de los que se adelantan).
 */
async function traducir(config, carpetaDatos, uuid, textos, urgente = false, destino = 'es') {
  if (!INSTRUCCIONES[destino]) destino = 'es';
  const archivo = archivoCache(carpetaDatos, uuid, destino);
  const cache = leerCache(archivo);
  const resultado = textos.map((texto) => cache.datos[huella(texto)] ?? null);
  const faltan = textos.map((_, i) => (resultado[i] == null ? i : -1)).filter((i) => i >= 0);
  if (!faltan.length) return { ok: true, traducciones: resultado };

  if (FALSA) {
    await esperar(urgente ? 300 : 900);
    return { ok: true, traducciones: textos.map((texto, i) => resultado[i] ?? `${destino.toUpperCase()}· ${texto}`) };
  }
  const clave = leerClave(config);
  if (!clave) return { ok: false, sinClave: true, mensaje: t('traduccion.sinClave') };
  try {
    for (const tanda of tandas(faltan, textos)) {
      // Otra tanda de la cola pudo haber traducido estos párrafos: se revisa la caché cuando llega el turno.
      const traducidos = await encolar(urgente, async () => {
        const pendientes = tanda.filter((i) => cache.datos[huella(textos[i])] == null);
        if (pendientes.length) {
          const nuevos = await traducirTanda(clave, pendientes.map((i) => textos[i]), destino);
          pendientes.forEach((i, k) => (cache.datos[huella(textos[i])] = nuevos[k]));
          guardarCache(archivo);
        }
        return tanda.map((i) => cache.datos[huella(textos[i])]);
      });
      tanda.forEach((i, k) => (resultado[i] = traducidos[k]));
    }
    return { ok: true, traducciones: resultado };
  } catch (error) {
    return { ok: false, mensaje: error.message, traducciones: resultado };
  }
}

/** Prueba la clave con una frase corta, traducida al idioma destino. */
async function probar(config, destino = 'es') {
  if (!INSTRUCCIONES[destino]) destino = 'es';
  const clave = leerClave(config);
  if (!clave) return { ok: false, mensaje: t('traduccion.sinClave') };
  try {
    const [ejemplo] = await traducirTanda(clave, [PRUEBA[destino]], destino);
    return { ok: true, mensaje: t('traduccion.funciona', { ejemplo }) };
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
}

// ---------- 1.9: «Explicar» ----------

const DIAS_EXPLICACION = 30;
const LARGO = { texto: 400, parrafo: 2400 }; // lo que se manda como máximo (el lector no ofrece Explicar para más)

// Para Gemini, en el idioma de la respuesta (el de Broots). El libro, el fragmento y su párrafo van en el pedido.
const INSTRUCCIONES_EXPLICAR = {
  es: `Sos un compañero de lectura que sabe mucho y explica fácil. El lector seleccionó un fragmento del libro que está leyendo y quiere entenderlo. Explicale, en español latinoamericano natural y en 2 a 4 oraciones, qué quiere decir ese fragmento EN ESE CONTEXTO (el párrafo donde aparece).
Reglas:
- Si es una palabra o una expresión, decí qué significa acá. Si está en otro idioma, traducila.
- Si es un nombre de persona, lugar, obra o hecho histórico, contá brevemente quién o qué es.
- Si es una frase, explicá con palabras simples qué quiere decir.
- Nunca adelantes nada de lo que pasa después en el libro: nada de spoilers.
- Texto plano: sin títulos, sin listas, sin markdown y sin repetir el fragmento al principio.`,
  en: `You're a well-read reading buddy who explains things simply. The reader selected a passage from the book they're reading and wants to understand it. In natural English and in 2 to 4 sentences, explain what that passage means IN THIS CONTEXT (the paragraph it appears in).
Rules:
- If it's a word or an expression, say what it means here. If it's in another language, translate it.
- If it's the name of a person, place, work or historical event, briefly say who or what it is.
- If it's a sentence, explain in plain words what it means.
- Never reveal anything that happens later in the book: no spoilers.
- Plain text: no headings, no lists, no markdown, and don't repeat the passage at the start.`,
  pt: `Você é um companheiro de leitura que sabe muito e explica de um jeito fácil. O leitor selecionou um trecho do livro que está lendo e quer entendê-lo. Explique, em português do Brasil natural e em 2 a 4 frases, o que esse trecho quer dizer NESSE CONTEXTO (o parágrafo onde aparece).
Regras:
- Se for uma palavra ou expressão, diga o que significa aqui. Se estiver em outro idioma, traduza.
- Se for o nome de uma pessoa, lugar, obra ou fato histórico, conte brevemente quem ou o que é.
- Se for uma frase, explique com palavras simples o que ela quer dizer.
- Nunca adiante nada do que acontece depois no livro: nada de spoilers.
- Texto puro: sem títulos, sem listas, sem markdown e sem repetir o trecho no começo.`,
};
const ROTULOS = {
  es: { libro: 'Libro', autor: 'Autor', fragmento: 'Fragmento seleccionado', parrafo: 'Párrafo donde aparece' },
  en: { libro: 'Book', autor: 'Author', fragmento: 'Selected passage', parrafo: 'Paragraph it appears in' },
  pt: { libro: 'Livro', autor: 'Autor', fragmento: 'Trecho selecionado', parrafo: 'Parágrafo onde aparece' },
};

function archivoExplicaciones(carpetaDatos, uuid, destino) {
  const nombre = String(uuid).replace(/[^a-z0-9-]/gi, '');
  return path.join(carpetaDatos, 'explicaciones', `${nombre}.${destino}.json`);
}

function escribirExplicaciones(archivo, datos) {
  try {
    if (!Object.keys(datos).length) return fs.rmSync(archivo, { force: true });
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(datos));
  } catch (error) {
    console.error('[explicar] no pude guardar las explicaciones:', error.message);
  }
}

/** Las explicaciones guardadas de un libro, sin las de más de 30 días (si había viejas, el archivo se limpia). */
function leerExplicaciones(archivo, ahora = Date.now()) {
  let datos = {};
  try {
    datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch {}
  const vigentes = {};
  let viejas = 0;
  for (const [clave, e] of Object.entries(datos && typeof datos === 'object' ? datos : {})) {
    const fecha = Date.parse(e?.fecha);
    if (e?.explicacion && fecha && ahora - fecha < DIAS_EXPLICACION * 86400000) vigentes[clave] = e;
    else viejas++;
  }
  if (viejas) escribirExplicaciones(archivo, vigentes);
  return vigentes;
}

// Por si Gemini igual manda negritas o títulos de markdown: se ven como texto común.
const limpiarRespuesta = (texto) => String(texto ?? '').replace(/\*\*|__/g, '').replace(/^\s*#+\s*/gm, '').trim();
const unaLinea = (texto, largo) => String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, largo);

/**
 * Explica un fragmento en su contexto, en el idioma destino. pedido: { texto, parrafo, titulo, autores }.
 * Devuelve { ok, explicacion, guardada } (guardada: ya se había pedido en los últimos 30 días) o { ok: false, mensaje, sinClave }.
 */
async function explicar(config, carpetaDatos, uuid, pedido, destino = 'es') {
  if (!INSTRUCCIONES_EXPLICAR[destino]) destino = 'es';
  const texto = unaLinea(pedido?.texto, LARGO.texto);
  const parrafo = unaLinea(pedido?.parrafo, LARGO.parrafo);
  if (!texto) return { ok: false, mensaje: t('traduccion.nadaQueExplicar') };
  const archivo = archivoExplicaciones(carpetaDatos, uuid, destino);
  const clave = huella(`${texto}\n${parrafo}`);
  const guardada = leerExplicaciones(archivo)[clave];
  if (guardada) return { ok: true, explicacion: guardada.explicacion, guardada: true };

  let explicacion;
  if (FALSA) {
    await esperar(400);
    explicacion = `${destino.toUpperCase()}· «${texto}»: explicación de prueba, en el contexto de su párrafo.`;
  } else {
    const claveGemini = leerClave(config);
    if (!claveGemini) return { ok: false, sinClave: true, mensaje: t('traduccion.sinClave') };
    const r = ROTULOS[destino];
    const contenido = [
      pedido?.titulo && `${r.libro}: ${unaLinea(pedido.titulo, 300)}`,
      pedido?.autores && `${r.autor}: ${unaLinea(pedido.autores, 300)}`,
      `${r.fragmento}: «${texto}»`,
      parrafo && `${r.parrafo}: «${parrafo}»`,
    ].filter(Boolean).join('\n');
    try {
      // Por la misma cola que las traducciones (para no chocar con el límite por minuto), y adelante: lo pidió recién.
      explicacion = await encolar(true, () =>
        conModelos(
          async (modelo, pensar) => {
            const respuesta = limpiarRespuesta(await llamar(modelo, claveGemini, { sistema: INSTRUCCIONES_EXPLICAR[destino], contenido, temperatura: 0.4 }, pensar));
            if (!respuesta) throw Object.assign(new Error(t('traduccion.incompleta')), { incompleta: true });
            return respuesta;
          },
          { noPude: 'traduccion.noPudeExplicar' },
        ),
      );
    } catch (error) {
      return { ok: false, mensaje: error.message };
    }
  }
  // Se vuelve a leer el archivo por si mientras tanto se guardó otra explicación.
  escribirExplicaciones(archivo, { ...leerExplicaciones(archivo), [clave]: { texto, explicacion, fecha: new Date().toISOString() } });
  return { ok: true, explicacion, guardada: false };
}

module.exports = { estado, conClave, traducir, probar, explicar };
