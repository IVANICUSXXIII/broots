// Arma los diccionarios sin internet de Broots (1.12) a partir de Wiktionary. No corre en la PC de quien usa Broots:
// se corre de vez en cuando, a mano, y lo que sale se sube a una versión nueva de IVANICUSXXIII/broots-diccionarios.
//
//   node --max-old-space-size=12000 scripts/armar-diccionarios.mjs --version 2026.11 --origen <carpeta> --salida <carpeta>
//
// En <origen> tienen que estar los datos que kaikki.org saca de Wiktionary con wiktextract (MIT; solo se usa su salida):
//   es.jsonl.gz       https://kaikki.org/eswiktionary/raw-wiktextract-data.jsonl.gz
//   pt.jsonl.gz       https://kaikki.org/ptwiktionary/raw-wiktextract-data.jsonl.gz
//   en-todo.jsonl.gz  https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz (2,9 GB)
//
// De cada Wiktionary sale el diccionario de su idioma: palabras de ese idioma, definidas en ese idioma. Del Wiktionary
// en inglés también se sacan las formas conjugadas del español y el portugués («assumiu» → «assumir»), solo el dato de
// a qué palabra apuntan: esas ediciones traen menos conjugaciones.
//
// Qué queda afuera, para que pese poco: nombres propios, ejemplos, etimología y pronunciación. Las formas conjugadas
// guardan solo un puntero a su palabra base, y cada categoría tiene hasta 12 sentidos. Por eso el resultado es una
// versión RESUMIDA de Wiktionary, y así hay que decirlo en el crédito (licencia CC BY-SA 4.0: ver CREDITOS.txt).
//
// Sale, por idioma, una base SQLite (<idioma>-<version>.db) y su versión comprimida (.db.br), y diccionarios.json, que
// se copia a electron/ con las huellas y los pesos. Estas bases se escriben con node:sqlite porque son nuestras: nada
// que ver con metadata.db, que nunca se escribe a mano.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const { claveDe } = createRequire(import.meta.url)('../electron/diccionario.cjs');

const MAX_SENTIDOS = 12;
const MAX_LARGO = 500; // caracteres: algunas definiciones son media enciclopedia
const REPOSITORIO = 'IVANICUSXXIII/broots-diccionarios';
const FUERA = new Set(['name', 'character', 'symbol', 'punct', 'unknown']); // nombres propios y letras sueltas

// Las categorías del Wiktionary en inglés vienen en minúscula y abreviadas.
const CATEGORIAS_EN = {
  noun: 'Noun', verb: 'Verb', adj: 'Adjective', adv: 'Adverb', phrase: 'Phrase', prep_phrase: 'Prepositional phrase', intj: 'Interjection', prep: 'Preposition',
  conj: 'Conjunction', pron: 'Pronoun', det: 'Determiner', article: 'Article', num: 'Numeral', prefix: 'Prefix', suffix: 'Suffix', proverb: 'Proverb',
  abbrev: 'Abbreviation', contraction: 'Contraction', particle: 'Particle',
};

// Las marcas que se muestran (registro y región). wiktextract las normaliza en inglés: acá se traducen, y lo que no
// está en la tabla no se muestra (son cosas gramaticales como «transitive», o códigos como «utci»).
const MARCAS = {
  es: {
    colloquial: 'coloquial', outdated: 'desusado', derogatory: 'despectivo', rare: 'poco usado', obsolete: 'obsoleto', figurative: 'figurado', vulgar: 'vulgar', literary: 'literario',
    jocular: 'humorístico', slang: 'jerga', Lunfardo: 'lunfardo', lunfardismo: 'lunfardo', Lunfardismo: 'lunfardo', formal: 'formal', euphemism: 'eufemismo', ironic: 'irónico',
    childish: 'infantil', neologism: 'neologismo', culto: 'culto', rural: 'rural', juvenil: 'juvenil', subestándar: 'subestándar',
    Argentina: 'Argentina', 'Río-de-la-Plata': 'Río de la Plata', Uruguay: 'Uruguay', 'South-Cone': 'Cono Sur', Chile: 'Chile', Paraguay: 'Paraguay', Bolivia: 'Bolivia', Peru: 'Perú',
    Ecuador: 'Ecuador', Colombia: 'Colombia', Venezuela: 'Venezuela', Mexico: 'México', Cuba: 'Cuba', Honduras: 'Honduras', 'El-Salvador': 'El Salvador', Nicaragua: 'Nicaragua',
    'Puerto-Rico': 'Puerto Rico', 'Costa-Rica': 'Costa Rica', Guatemala: 'Guatemala', 'Dominican-Republic': 'República Dominicana', Panama: 'Panamá', America: 'América',
    'Central-America': 'Centroamérica', 'South-America': 'Sudamérica', Caribbean: 'Caribe', Spain: 'España', Andalusia: 'Andalucía', Aragon: 'Aragón', Canaries: 'Canarias', Philippines: 'Filipinas',
  },
  pt: {
    figuratively: 'figurado', 'sentido figurado': 'figurado', popular: 'popular', archaic: 'arcaico', Arcaísmo: 'arcaico', informal: 'informal', colloquial: 'coloquial', pejorative: 'pejorativo',
    vulgar: 'vulgar', obsolete: 'obsoleto', familiar: 'familiar', rare: 'raro', uncommon: 'pouco usado', poetic: 'poético', ironic: 'irônico', Anglicism: 'anglicismo', dialectal: 'dialetal',
    derogatory: 'depreciativo', slang: 'gíria', Gíria: 'gíria', gíria: 'gíria', Regionalismo: 'regionalismo', regionalismo: 'regionalismo', neologismo: 'neologismo', Neologismo: 'neologismo',
    estrangeirismo: 'estrangeirismo', Estrangeirismo: 'estrangeirismo', Portugal: 'Portugal', Brazil: 'Brasil', Angola: 'Angola', Moçambique: 'Moçambique', 'Northeast-Brazil': 'Nordeste do Brasil',
    'Southern-Brazil': 'Sul do Brasil', 'North-Brazil': 'Norte do Brasil', 'Southeast-Brazil': 'Sudeste do Brasil', 'Rio Grande do Sul': 'Rio Grande do Sul', 'Minas Gerais': 'Minas Gerais',
    Bahia: 'Bahia', 'Rio de Janeiro': 'Rio de Janeiro', 'São Paulo': 'São Paulo', Ceará: 'Ceará', Pernambuco: 'Pernambuco',
  },
  en: {
    informal: 'informal', colloquial: 'colloquial', slang: 'slang', archaic: 'archaic', obsolete: 'obsolete', dated: 'dated', rare: 'rare', literary: 'literary', poetic: 'poetic',
    figuratively: 'figurative', humorous: 'humorous', vulgar: 'vulgar', derogatory: 'derogatory', offensive: 'offensive', formal: 'formal', historical: 'historical', dialectal: 'dialectal',
    euphemistic: 'euphemistic', UK: 'UK', US: 'US', British: 'UK', Australia: 'Australia', Canada: 'Canada', Ireland: 'Ireland', Scotland: 'Scotland', India: 'India',
  },
};

// Temas: en español y portugués vienen normalizados en inglés; se traducen los que más aparecen.
const TEMAS = {
  es: {
    medicine: 'Medicina', nautical: 'Náutica', religion: 'Religión', botany: 'Botánica', architecture: 'Arquitectura', anatomy: 'Anatomía', history: 'Historia', music: 'Música',
    biology: 'Biología', chemistry: 'Química', food: 'Gastronomía', linguistics: 'Lingüística', computing: 'Informática', sports: 'Deportes', military: 'Militar', zoology: 'Zoología',
    philosophy: 'Filosofía', games: 'Juegos', economics: 'Economía', agriculture: 'Agricultura', geography: 'Geografía', law: 'Derecho', physics: 'Física', mathematics: 'Matemática',
  },
  pt: {
    medicine: 'Medicina', nautical: 'Náutica', religion: 'Religião', botany: 'Botânica', architecture: 'Arquitetura', anatomy: 'Anatomia', zoology: 'Zoologia', linguistics: 'Linguística',
    law: 'Direito', chemistry: 'Química', food: 'Culinária', sports: 'Esportes', 'information-science': 'Informática', mythology: 'Mitologia', meteorology: 'Meteorologia', music: 'Música',
    history: 'História', physics: 'Física', mathematics: 'Matemática', geography: 'Geografia',
  },
};

/** Limpia una definición: saca llamadas de nota («^([cita requerida])»), restos de marcado y espacios de más. */
function limpiar(texto) {
  let limpio = String(texto ?? '')
    .replace(/\^\([^)]*\)/g, '')
    .replace(/\[\[|\]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (limpio.length > MAX_LARGO) {
    const corte = limpio.lastIndexOf(' ', MAX_LARGO);
    limpio = `${limpio.slice(0, corte > 0 ? corte : MAX_LARGO)}…`;
  }
  return limpio;
}

/**
 * El texto de un sentido, según cómo arma las definiciones cada edición:
 * - Español: varios párrafos seguidos; el primero es la definición, los demás suelen ser ejemplos o fórmulas.
 * - Portugués: «exprime a ideia de:» + «lugar» es una definición partida en dos; si no, el primero.
 * - Inglés: general + detalle («To move swiftly.» + «To compete in a race.»). Va el general una sola vez, así los 12
 *   lugares alcanzan para los distintos significados; si el general termina en «:», necesita el detalle.
 */
function textosDelSentido(sentido, idioma, generalesVistos) {
  const g = (sentido.glosses ?? []).map(limpiar).filter(Boolean);
  if (!g.length) return null;
  if (idioma === 'es') return g[0];
  if (idioma === 'pt') return g[0].endsWith(':') && g.length > 1 ? `${g[0]} ${g.at(-1)}` : g[0];
  if (g.length === 1) return g[0];
  if (g[0].endsWith(':')) {
    const vistos = generalesVistos.get(g[0]) ?? 0; // de estos, los dos primeros detalles
    generalesVistos.set(g[0], vistos + 1);
    return vistos < 2 ? g.at(-1) : null;
  }
  if (generalesVistos.has(g[0])) return null;
  generalesVistos.set(g[0], 1);
  return g[0];
}

function marcasDe(sentido, idioma) {
  const tabla = MARCAS[idioma];
  const marcas = [...(sentido.tags ?? []), ...(sentido.raw_tags ?? [])].map((m) => tabla[m]).filter(Boolean);
  const tema = (sentido.topics ?? []).map((m) => (idioma === 'en' ? m.replaceAll('-', ' ') : TEMAS[idioma][m])).find(Boolean);
  if (tema) marcas.push(tema);
  return [...new Set(marcas)].slice(0, 3);
}

/** Va juntando las palabras de un idioma y las escribe en una base. */
export class Diccionario {
  constructor(idioma) {
    this.idioma = idioma;
    this.definiciones = new Map(); // palabra -> [[categoría, [sentido...]]...]; sentido: texto o [texto, marcas]
    this.punteros = new Map(); // palabra -> Set de palabras base
    this.textoDeForma = new Map(); // palabra -> [categoría, texto], por si su palabra base no está
  }

  /** Una entrada de la edición de Wiktionary en este idioma. */
  agregarDefiniciones(o) {
    if (o.lang_code !== this.idioma || !o.word || FUERA.has(o.pos)) return;
    const categoria = this.idioma === 'en' ? CATEGORIAS_EN[o.pos] ?? o.pos : o.pos_title ?? o.pos;
    const sentidos = [];
    const generales = new Map();
    for (const s of o.senses ?? []) {
      if (s.tags?.includes('no-gloss')) continue;
      const base = [...(s.form_of ?? []), ...(s.alt_of ?? [])].map((f) => f.word).filter(Boolean);
      if (base.length) {
        this.#apuntar(o.word, base);
        if (!this.textoDeForma.has(o.word)) this.textoDeForma.set(o.word, [categoria, limpiar(s.glosses?.[0])]);
        continue;
      }
      const texto = textosDelSentido(s, this.idioma, generales);
      if (!texto) continue;
      const marcas = marcasDe(s, this.idioma);
      sentidos.push(marcas.length ? [texto, marcas.join(', ')] : texto);
    }
    if (!sentidos.length) return;
    const lista = this.definiciones.get(o.word) ?? [];
    const misma = lista.find(([c]) => c === categoria); // la misma categoría en otra etimología: van juntas
    if (misma) misma[1].push(...sentidos);
    else lista.push([categoria, sentidos]);
    this.definiciones.set(o.word, lista);
  }

  /** Una entrada de otra edición: de ahí solo sirve a qué palabra apunta cada forma conjugada. */
  agregarFormas(o) {
    if (o.lang_code !== this.idioma || !o.word || FUERA.has(o.pos)) return;
    const base = (o.senses ?? []).flatMap((s) => (s.form_of ?? []).map((f) => f.word)).filter(Boolean);
    if (base.length) this.#apuntar(o.word, base);
  }

  #apuntar(palabra, base) {
    const destino = this.punteros.get(palabra) ?? new Set();
    for (const b of base) if (b !== palabra) destino.add(b);
    if (destino.size) this.punteros.set(palabra, destino);
  }

  /** Escribe la base. info: { version, fuente, fecha }. Devuelve cuántas palabras quedaron. */
  escribir(ruta, info) {
    fs.rmSync(ruta, { force: true });
    const db = new DatabaseSync(ruta);
    db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=8192;
      CREATE TABLE info (clave TEXT PRIMARY KEY, valor TEXT);
      CREATE TABLE palabras (clave TEXT NOT NULL, palabra TEXT NOT NULL, defs TEXT, lemas TEXT);`);
    const conInfo = db.prepare('INSERT INTO info VALUES (?, ?)');
    for (const [clave, valor] of Object.entries({ idioma: this.idioma, licencia: 'CC BY-SA 4.0', ...info })) conInfo.run(clave, String(valor));
    const insertar = db.prepare('INSERT INTO palabras VALUES (?, ?, ?, ?)');
    const existe = (p) => this.definiciones.has(p) || this.punteros.has(p);
    let conDefinicion = 0;
    let soloPuntero = 0;
    db.exec('BEGIN');
    for (const palabra of new Set([...this.definiciones.keys(), ...this.punteros.keys()])) {
      let defs = this.definiciones.get(palabra);
      const lemas = [...(this.punteros.get(palabra) ?? [])].filter(existe);
      if (!defs && !lemas.length) {
        // Una forma cuya palabra base no está (o es un nombre propio): queda su texto, que es lo único que hay.
        const forma = this.textoDeForma.get(palabra);
        if (!forma?.[1]) continue;
        defs = [[forma[0], [forma[1]]]];
      }
      const recortadas = defs?.map(([c, sentidos]) => [c, [...new Map(sentidos.map((s) => [JSON.stringify(s), s])).values()].slice(0, MAX_SENTIDOS)]);
      insertar.run(claveDe(palabra), palabra, recortadas ? JSON.stringify(recortadas) : null, lemas.length ? JSON.stringify(lemas) : null);
      if (recortadas) conDefinicion++;
      else soloPuntero++;
    }
    db.exec('COMMIT; CREATE INDEX indice_clave ON palabras (clave); VACUUM; PRAGMA journal_mode=DELETE;');
    db.close();
    return { conDefinicion, soloPuntero };
  }
}

async function* lineas(archivo) {
  const lector = readline.createInterface({ input: fs.createReadStream(archivo, { highWaterMark: 1 << 20 }).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const linea of lector) {
    if (!linea.startsWith('{')) continue;
    try {
      yield JSON.parse(linea);
    } catch {} // una línea rota no frena el armado
  }
}

/** Comprime sin apuro: pesa menos y se descomprime igual de rápido. */
async function comprimir(origen, destino) {
  const tamaño = fs.statSync(origen).size;
  await pipeline(
    fs.createReadStream(origen),
    zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: tamaño } }),
    fs.createWriteStream(destino),
  );
}

async function huellaDe(archivo) {
  const h = crypto.createHash('sha256');
  for await (const trozo of fs.createReadStream(archivo)) h.update(trozo);
  return h.digest('hex');
}

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Falta --${nombre}.`);
  return process.argv[i + 1];
}

async function principal() {
  const version = argumento('version');
  const origen = argumento('origen');
  const salida = argumento('salida');
  fs.mkdirSync(salida, { recursive: true });
  const diccionarios = { es: new Diccionario('es'), en: new Diccionario('en'), pt: new Diccionario('pt') };

  for (const idioma of ['es', 'pt']) {
    console.log(`Leyendo el Wiktionary en ${idioma}…`);
    for await (const o of lineas(path.join(origen, `${idioma}.jsonl.gz`))) diccionarios[idioma].agregarDefiniciones(o);
  }
  console.log('Leyendo el Wiktionary en inglés (son 25 GB, tarda)…');
  for await (const o of lineas(path.join(origen, 'en-todo.jsonl.gz'))) {
    if (o.lang_code === 'en') diccionarios.en.agregarDefiniciones(o);
    else if (o.lang_code === 'es' || o.lang_code === 'pt') diccionarios[o.lang_code].agregarFormas(o);
  }

  const manifiesto = {};
  for (const [idioma, d] of Object.entries(diccionarios)) {
    const archivo = `${idioma}-${version}.db`;
    const base = path.join(salida, archivo);
    const cuentas = d.escribir(base, { version });
    diccionarios[idioma] = null; // libera la memoria antes de comprimir
    console.log(`${idioma}: ${cuentas.conDefinicion} palabras con definición, ${cuentas.soloPuntero} formas. Comprimiendo…`);
    await comprimir(base, `${base}.br`);
    manifiesto[idioma] = {
      version,
      archivo,
      url: `https://github.com/${REPOSITORIO}/releases/download/v${version}/${archivo}.br`,
      sha256: await huellaDe(`${base}.br`),
      bajar: fs.statSync(`${base}.br`).size,
      disco: fs.statSync(base).size,
    };
    console.log(manifiesto[idioma]);
  }
  fs.writeFileSync(path.join(salida, 'diccionarios.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);
  console.log(`Listo. Copiá ${path.join(salida, 'diccionarios.json')} a electron/ y subí los .db.br a la versión v${version} de ${REPOSITORIO}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await principal();
