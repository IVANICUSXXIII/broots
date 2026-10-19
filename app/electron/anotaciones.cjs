// 1.8 «Subrayados y notas»: lo que subrayás y anotás en el lector de Broots, y la lista única de cada libro
// (Broots y Kindle juntos, en orden de lectura) que usan el lector, el panel del libro, el club y el .md de cada
// libro (cuaderno.cjs).
//
// Dónde vive: <datos de la biblioteca>/subrayados-lector/<pc>.json (ver carpetaDatos() en main.cjs: .broots de
// la biblioteca o, en una copia compartida de solo lectura, una carpeta de esta PC). Cada PC escribe SOLO su
// archivo, así con la biblioteca en Drive dos PC nunca pisan el mismo. Al leer se juntan todos: si un subrayado
// está en varios (otra PC le cambió el color o lo borró), gana el cambio más nuevo. Borrar deja una marca
// («borrado», con el texto adentro) para que las otras PC también lo borren y para poder deshacerlo.
//
// Cómo se ancla un subrayado (para que se vea igual con otra letra, otro tamaño de ventana o la traducción): el
// capítulo (href, la ruta dentro del EPUB), el párrafo y el lugar dentro de su texto donde empieza y donde
// termina, y en qué versión estaba el párrafo al subrayar ('original' o 'traduccion'). También se guardan el
// texto y un poco de lo que lo rodea, por si el EPUB cambia (ver src/lib/subrayados.js). Nunca se toca metadata.db.
//
// Los subrayados del Kindle siguen en .broots/subrayados.json (subrayados.cjs). Para ordenarlos junto con los de
// Broots y pintarlos en el lector, se busca su texto en el EPUB, pero solo cuando el libro se abre en el lector
// (o se lleva al club): así Broots nunca baja de Drive cientos de EPUB por su cuenta. Lo encontrado se recuerda
// en esta PC (ubicados-*.json, en la caché de Broots) hasta que cambie el EPUB o lleguen subrayados nuevos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PC } = require('./habito.cjs');

const CARPETA = 'subrayados-lector';
const COLORES = ['amarillo', 'verde', 'celeste', 'rosa'];

function leerJson(archivo, defecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch {
    return defecto;
  }
}

/** Escritura segura: copia del anterior (.bak) y reemplazo atómico (un corte a mitad de camino no deja un JSON roto). */
function escribirJson(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  if (fs.existsSync(archivo)) fs.copyFileSync(archivo, `${archivo}.bak`);
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(datos, null, 1));
  fs.renameSync(temporal, archivo);
}

const carpeta = (datos) => path.join(datos, CARPETA);
const archivoPropio = (datos) => path.join(carpeta(datos), `${PC}.json`);

// ---------- Juntar lo de todas las PC ----------

// Lo leído de todos los archivos; se vuelve a leer solo si alguno cambió (por ejemplo, llegó por Drive lo de otra PC).
let leido = null; // { clave, porLibro: Map(uuid -> Map(id -> registro)) }

function archivosDeLaCarpeta(datos) {
  let nombres = [];
  try {
    nombres = fs.readdirSync(carpeta(datos)).filter((n) => n.endsWith('.json')).sort();
  } catch {}
  const firmas = nombres.map((n) => {
    try {
      const e = fs.statSync(path.join(carpeta(datos), n));
      return `${n}:${e.mtimeMs}:${e.size}`;
    } catch {
      return n;
    }
  });
  return { nombres, clave: `${datos}|${firmas.join('|')}` };
}

/** Entre dos versiones de un mismo subrayado, gana la modificada más tarde (y, si empatan, la de la PC con nombre mayor). */
const masNuevo = (a, b) => (a.modificado ?? '') > (b.modificado ?? '') || ((a.modificado ?? '') === (b.modificado ?? '') && (a.pc ?? '') > (b.pc ?? ''));

function juntar(datos) {
  const { nombres, clave } = archivosDeLaCarpeta(datos);
  if (leido?.clave === clave) return leido.porLibro;
  const porLibro = new Map();
  for (const nombre of nombres) {
    const contenido = leerJson(path.join(carpeta(datos), nombre), {});
    for (const [uuid, registros] of Object.entries(contenido?.libros ?? {})) {
      if (!Array.isArray(registros)) continue;
      if (!porLibro.has(uuid)) porLibro.set(uuid, new Map());
      const delLibro = porLibro.get(uuid);
      for (const r of registros) {
        if (!r?.id || typeof r.texto !== 'string') continue;
        const previo = delLibro.get(r.id);
        if (!previo || masNuevo(r, previo)) delLibro.set(r.id, r);
      }
    }
  }
  leido = { clave, porLibro };
  return porLibro;
}

const porCreacion = (a, b) => (a.creado ?? '').localeCompare(b.creado ?? '');

/** Subrayados vigentes de un libro (sin los borrados). */
function delLibro(datos, uuid) {
  return [...(juntar(datos).get(uuid)?.values() ?? [])].filter((r) => !r.borrado).sort(porCreacion);
}

/** Cuántos subrayados de Broots tiene cada libro: { uuid: n } (para la grilla, los filtros y los repetidos). */
function resumen(datos) {
  const cuentas = {};
  for (const [uuid, registros] of juntar(datos)) {
    const n = [...registros.values()].filter((r) => !r.borrado).length;
    if (n) cuentas[uuid] = n;
  }
  return cuentas;
}

// ---------- Guardar y borrar (siempre en el archivo de esta PC) ----------

const texto = (v, max) => String(v ?? '').slice(0, max);
const entero = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);

/** Lo que llega de la interfaz, revisado campo por campo (nada de lo que no se conoce se guarda). */
function limpiar(registro, previo) {
  const r = registro ?? {};
  const version = r.version === 'traduccion' ? 'traduccion' : 'original';
  const parrafo = entero(r.parrafo);
  return {
    id: /^[\w-]{6,64}$/.test(r.id ?? '') ? r.id : crypto.randomUUID(),
    href: texto(r.href, 500),
    capitulo: entero(r.capitulo),
    tituloCapitulo: texto(r.tituloCapitulo, 300),
    parrafo,
    inicio: entero(r.inicio),
    parrafoFin: Math.max(parrafo, entero(r.parrafoFin)),
    fin: entero(r.fin),
    version,
    idioma: version === 'traduccion' ? texto(r.idioma, 5) : null,
    texto: texto(r.texto, 8000),
    antes: texto(r.antes, 80),
    despues: texto(r.despues, 80),
    orden: typeof r.orden === 'number' && r.orden >= 0 && r.orden <= 1 ? Math.round(r.orden * 100000) / 100000 : 0,
    color: COLORES.includes(r.color) ? r.color : COLORES[0],
    nota: texto(r.nota, 20000).trim(),
    creado: previo?.creado ?? (esFecha(r.creado) ? r.creado : new Date().toISOString()),
    modificado: new Date().toISOString(),
    pc: PC,
    borrado: false,
  };
}

/** Reemplaza (o agrega) registros de un libro en el archivo de esta PC. */
function escribirPropios(datos, uuid, registros) {
  const archivo = archivoPropio(datos);
  const contenido = leerJson(archivo, null) ?? {};
  const libros = contenido.libros && typeof contenido.libros === 'object' ? contenido.libros : {};
  const ids = new Set(registros.map((r) => r.id));
  libros[uuid] = [...(Array.isArray(libros[uuid]) ? libros[uuid] : []).filter((r) => !ids.has(r.id)), ...registros];
  escribirJson(archivo, { version: 1, pc: PC, libros });
  leido = null;
}

/** Guarda un subrayado nuevo o cambiado (color, nota). También sirve para deshacer un borrado. */
function guardar(datos, uuid, registro) {
  if (!uuid) return { ok: false };
  const previo = juntar(datos).get(uuid)?.get(registro?.id);
  const limpio = limpiar(registro, previo);
  if (!limpio.texto.trim() || !limpio.href) return { ok: false };
  escribirPropios(datos, uuid, [limpio]);
  return { ok: true, registro: limpio };
}

/** Borra un subrayado: queda una marca con todo adentro (para las otras PC y para deshacer). */
function borrar(datos, uuid, id) {
  const previo = juntar(datos).get(uuid)?.get(id);
  if (!previo || previo.borrado) return { ok: false };
  escribirPropios(datos, uuid, [{ ...previo, borrado: true, modificado: new Date().toISOString(), pc: PC }]);
  return { ok: true, registro: previo };
}

/** Al resolver un libro repetido: los subrayados del que se descarta pasan al que se conserva. */
function mover(datos, deUuid, aUuid) {
  const vigentes = delLibro(datos, deUuid);
  if (!vigentes.length || deUuid === aUuid) return 0;
  const ahora = new Date().toISOString();
  escribirPropios(datos, aUuid, vigentes.map((r) => ({ ...r, modificado: ahora, pc: PC })));
  escribirPropios(datos, deUuid, vigentes.map((r) => ({ ...r, borrado: true, modificado: ahora, pc: PC })));
  return vigentes.length;
}

// ---------- Subrayados del Kindle dentro del EPUB ----------

/** Texto para comparar: minúsculas, sin tildes y con todo lo que no es letra o número como un espacio. */
function normalizar(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ');
}

const porUbicacion = (a, b) => (a.ubicacion?.[0] ?? Infinity) - (b.ubicacion?.[0] ?? Infinity);

function buscarDesde(textos, aguja, desde) {
  for (let i = desde.capitulo; i < textos.length; i++) {
    const k = textos[i].indexOf(aguja, i === desde.capitulo ? desde.pos : 0);
    if (k >= 0) return { capitulo: i, pos: k };
  }
  return null;
}

/** Título del capítulo según el índice del libro (el último del índice que empieza en ese capítulo o antes). */
function titulos(estructura) {
  const inicios = estructura.indice
    .map((e) => ({ titulo: e.titulo, capitulo: estructura.capitulos.findIndex((c) => c.href === e.href.split('#')[0]) }))
    .filter((e) => e.capitulo >= 0);
  return (capitulo) => {
    let actual = null;
    for (const e of inicios) if (e.capitulo <= capitulo) actual = e.titulo;
    return actual;
  };
}

/**
 * Busca cada subrayado del Kindle en el texto del libro. Van en el orden del Kindle y cada búsqueda arranca donde
 * terminó la anterior: así una frase que se repite cae donde corresponde. Si el texto completo no aparece (el
 * Kindle a veces corta o cambia un signo), se prueba con el principio. Las notas sueltas van con el subrayado
 * del Kindle más cercano. Devuelve { id: { capitulo, href, fraccion, titulo } | null }.
 */
function buscarEnLibro({ estructura, textos }, kindle) {
  const normales = textos.map(normalizar);
  const tituloDe = titulos(estructura);
  const resultado = {};
  let cursor = { capitulo: 0, pos: 0 };
  const ubicados = [];
  for (const s of kindle.filter((s) => s.tipo !== 'nota').sort(porUbicacion)) {
    const aguja = normalizar(s.texto).trim();
    const intentos = aguja.length > 60 ? [aguja, aguja.slice(0, 60).trim()] : aguja.length >= 4 ? [aguja] : [];
    let hallado = null;
    for (const intento of intentos) {
      hallado = buscarDesde(normales, intento, cursor) ?? buscarDesde(normales, intento, { capitulo: 0, pos: 0 });
      if (hallado) break;
    }
    if (!hallado) {
      resultado[s.id] = null;
      continue;
    }
    cursor = { capitulo: hallado.capitulo, pos: hallado.pos + 1 };
    const largo = Math.max(1, normales[hallado.capitulo].length);
    resultado[s.id] = {
      capitulo: hallado.capitulo,
      href: estructura.capitulos[hallado.capitulo].href,
      fraccion: Math.round((hallado.pos / largo) * 100000) / 100000,
      titulo: tituloDe(hallado.capitulo),
    };
    ubicados.push({ ubicacion: s.ubicacion?.[0] ?? null, ...resultado[s.id] });
  }
  for (const nota of kindle.filter((s) => s.tipo === 'nota')) {
    const antes = nota.ubicacion ? ubicados.filter((u) => u.ubicacion != null && u.ubicacion <= nota.ubicacion[0]).at(-1) : null;
    resultado[nota.id] = antes ? { ...antes, fraccion: Math.min(1, antes.fraccion + 0.00001), ubicacion: undefined } : null;
  }
  return resultado;
}

// Lo encontrado se recuerda por libro: { uuid: { firma, resultado } }. La firma cambia si cambia el EPUB o los subrayados.
const memoria = new Map(); // archivo de caché -> contenido

function leerUbicados(archivo) {
  if (!memoria.has(archivo)) memoria.set(archivo, leerJson(archivo, {}) ?? {});
  return memoria.get(archivo);
}

function firmaKindle(epub, kindle) {
  const e = fs.statSync(epub);
  return crypto.createHash('sha1').update(`${e.mtimeMs}|${e.size}|${kindle.map((s) => s.id).join(',')}`).digest('hex').slice(0, 16);
}

/**
 * ¿Dónde está cada subrayado del Kindle en el EPUB? Si ya se buscó (y nada cambió) devuelve lo recordado; si no,
 * busca solo si se pide (ubicar), con textosDe(epub) (lector.textos). Devuelve { estado, resultado }, con estado
 * 'ubicados', 'pendiente' (falta abrir el libro en el lector), 'sinEpub' o 'error'.
 */
async function ubicarKindle({ uuid, epub, kindle, cache, ubicar, textosDe }) {
  if (!kindle.length) return { estado: 'ubicados', resultado: {} };
  if (!epub) return { estado: 'sinEpub', resultado: {} };
  let firma;
  try {
    firma = firmaKindle(epub, kindle);
  } catch {
    return { estado: 'sinEpub', resultado: {} };
  }
  const recordados = leerUbicados(cache);
  if (recordados[uuid]?.firma === firma) return { estado: 'ubicados', resultado: recordados[uuid].resultado };
  if (!ubicar) return { estado: 'pendiente', resultado: recordados[uuid]?.resultado ?? {} };
  try {
    const resultado = buscarEnLibro(await textosDe(epub), kindle);
    recordados[uuid] = { firma, resultado };
    escribirJson(cache, recordados);
    return { estado: 'ubicados', resultado };
  } catch (error) {
    console.error('[subrayados] no pude buscar los del Kindle en el EPUB:', error.message);
    return { estado: 'error', resultado: {} };
  }
}

// ---------- La lista única de un libro ----------

/**
 * Subrayados y notas de un libro, de Broots y del Kindle, en orden de lectura: primero los que tienen capítulo
 * (por capítulo y lugar dentro del capítulo) y al final los del Kindle que no se ubicaron (en el orden del Kindle).
 * Cada entrada: { id, origen: 'broots' | 'kindle', tipo, texto, nota, color, fecha, capitulo, href, titulo, orden, … }.
 */
async function listaDelLibro({ datos, uuid, kindle = [], epub = null, cache, ubicar = false, textosDe }) {
  const propios = delLibro(datos, uuid).map((r) => ({ ...r, origen: 'broots', tipo: 'subrayado', fecha: r.creado, titulo: r.tituloCapitulo || null }));
  const { estado, resultado } = await ubicarKindle({ uuid, epub, kindle, cache, ubicar, textosDe });
  const delKindle = kindle.map((s) => {
    const u = resultado[s.id] ?? null;
    return {
      id: s.id,
      origen: 'kindle',
      tipo: s.tipo === 'nota' ? 'nota' : 'subrayado',
      texto: s.texto,
      nota: s.nota ?? '',
      color: null,
      fecha: s.fecha ?? null,
      fechaTexto: s.fechaTexto ?? null,
      pagina: s.pagina ?? null,
      ubicacion: s.ubicacion ?? null,
      capitulo: u?.capitulo ?? null,
      href: u?.href ?? null,
      orden: u?.fraccion ?? null,
      titulo: u?.titulo ?? null,
    };
  });
  const conCapitulo = [...propios, ...delKindle.filter((e) => e.capitulo != null)].sort(
    (a, b) => a.capitulo - b.capitulo || (a.orden ?? 0) - (b.orden ?? 0) || porCreacion({ creado: a.fecha }, { creado: b.fecha }),
  );
  const sinCapitulo = delKindle.filter((e) => e.capitulo == null).sort((a, b) => porUbicacion(a, b) || (a.fecha ?? '').localeCompare(b.fecha ?? ''));
  return { entradas: [...conCapitulo, ...sinCapitulo], kindle: estado };
}

module.exports = { COLORES, delLibro, resumen, guardar, borrar, mover, listaDelLibro, normalizar, buscarEnLibro };
