// 1.7 «Hábito de lectura»: sesiones de lectura y relecturas.
//
// Todo vive en <datos de la biblioteca>/habito (ver carpetaDatos() en main.cjs: .broots de la biblioteca o,
// en una copia compartida de solo lectura, una carpeta de esta PC):
//  - sesiones-AAAA-MM-<pc>.json: las sesiones de un mes leídas en una PC. Un archivo por mes y por PC para
//    que, con la biblioteca en Drive, dos PC nunca escriban el mismo archivo y cada uno quede chico.
//  - lecturas.json: las vueltas de cada libro ({ uuid: [{ n, inicio, fin, resultado }] }). Releer abre una
//    vuelta nueva; las sesiones de las anteriores quedan como estaban (las estadísticas no se pisan).
// Nada de esto toca metadata.db: el estado del libro (Leyendo, Leído…) va por calibredb, como siempre.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const calibre = require('./calibre.cjs');
const { t } = require('./idioma.cjs');

const carpetaHabito = (datos) => path.join(datos, 'habito');
// Nombre corto y anónimo de esta PC (no se guarda el nombre real del equipo).
const PC = crypto.createHash('sha1').update(`${os.hostname()}|${os.userInfo().username}`).digest('hex').slice(0, 8);

function leerJson(archivo, defecto) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch {
    return defecto;
  }
}
function escribirJson(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  // Primero a un temporal y después se renombra: un corte a mitad de camino no deja un JSON roto.
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(datos, null, 1));
  fs.renameSync(temporal, archivo);
}

const mesDe = (iso) => iso.slice(0, 7); // '2026-10'
const archivoSesiones = (datos, iso) => path.join(carpetaHabito(datos), `sesiones-${mesDe(iso)}-${PC}.json`);
const archivoLecturas = (datos) => path.join(carpetaHabito(datos), 'lecturas.json');

/** Todas las sesiones de todas las PC, de la más vieja a la más nueva. */
function leerSesiones(datos) {
  let nombres = [];
  try {
    nombres = fs.readdirSync(carpetaHabito(datos)).filter((n) => /^sesiones-\d{4}-\d{2}-[\w]+\.json$/.test(n));
  } catch {
    return [];
  }
  const sesiones = nombres.flatMap((n) => leerJson(path.join(carpetaHabito(datos), n), { sesiones: [] }).sesiones ?? []);
  return sesiones.filter((s) => s?.uuid && s.inicio && s.minutos > 0).sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const leerLecturas = (datos) => leerJson(archivoLecturas(datos), {});

/** Vuelta actual de un libro (la última), o null si nunca se leyó con Broots. */
const vueltaActual = (lecturas, uuid) => lecturas[uuid]?.at(-1) ?? null;

const numero = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);

/**
 * Guarda (o actualiza) una sesión. El lector la manda cada medio minuto mientras leés, así un corte de
 * luz pierde como mucho eso. Si el libro no tenía vuelta todavía, se crea la primera.
 */
function guardarSesion(datos, sesion) {
  if (!sesion?.id || !sesion.uuid || !/^\d{4}-\d{2}-\d{2}T/.test(sesion.inicio ?? '')) return { ok: false };
  const limpia = {
    id: String(sesion.id).slice(0, 40),
    uuid: String(sesion.uuid),
    titulo: String(sesion.titulo ?? '').slice(0, 300),
    lectura: Math.max(1, Math.round(numero(sesion.lectura, 1, 999) ?? 1)),
    inicio: sesion.inicio,
    fin: typeof sesion.fin === 'string' ? sesion.fin : new Date().toISOString(),
    minutos: Math.round((numero(sesion.minutos, 0, 24 * 60) ?? 0) * 10) / 10,
    paginas: Math.round(numero(sesion.paginas, 0, 100000) ?? 0),
    paginasLibro: Math.round(numero(sesion.paginasLibro, 0, 1000000) ?? 0),
    desde: numero(sesion.desde, 0, 1) ?? 0,
    hasta: numero(sesion.hasta, 0, 1) ?? 0,
  };
  const archivo = archivoSesiones(datos, limpia.inicio);
  const contenido = leerJson(archivo, { sesiones: [] });
  const sesiones = (contenido.sesiones ?? []).filter((s) => s.id !== limpia.id);
  sesiones.push(limpia);
  escribirJson(archivo, { sesiones });

  const lecturas = leerLecturas(datos);
  if (!lecturas[limpia.uuid]?.length) {
    lecturas[limpia.uuid] = [{ n: 1, inicio: limpia.inicio }];
    escribirJson(archivoLecturas(datos), lecturas);
  }
  return { ok: true };
}

/** Termina la vuelta actual de un libro: resultado 'leido' o 'abandonado'. */
function terminar(datos, uuid, resultado) {
  if (!['leido', 'abandonado'].includes(resultado)) return leerLecturas(datos);
  const lecturas = leerLecturas(datos);
  const vueltas = lecturas[uuid] ?? [];
  const ahora = new Date().toISOString();
  if (!vueltas.length) vueltas.push({ n: 1, inicio: null }); // leído antes de Broots
  const actual = vueltas.at(-1);
  actual.fin = ahora;
  actual.resultado = resultado;
  lecturas[uuid] = vueltas;
  escribirJson(archivoLecturas(datos), lecturas);
  return lecturas;
}

/** Si la vuelta actual estaba abandonada y el libro vuelve a Leyendo, se retoma (sigue siendo la misma vuelta). */
function retomar(datos, uuid) {
  const lecturas = leerLecturas(datos);
  const actual = vueltaActual(lecturas, uuid);
  if (actual?.resultado !== 'abandonado') return lecturas;
  delete actual.fin;
  delete actual.resultado;
  escribirJson(archivoLecturas(datos), lecturas);
  return lecturas;
}

/**
 * Releer: cierra la vuelta actual como leída (si no lo estaba) y abre una nueva desde el principio.
 * `leidoAntes`: el libro figuraba como Leído en Calibre sin haberlo leído con Broots (cuenta como primera vuelta).
 */
function releer(datos, uuid, leidoAntes) {
  const lecturas = leerLecturas(datos);
  const vueltas = lecturas[uuid] ?? [];
  const ahora = new Date().toISOString();
  if (!vueltas.length && leidoAntes) vueltas.push({ n: 1, inicio: null, fin: null, resultado: 'leido' });
  const actual = vueltas.at(-1);
  if (actual && !actual.resultado) Object.assign(actual, { fin: ahora, resultado: 'leido' });
  vueltas.push({ n: (actual?.n ?? 0) + 1, inicio: ahora });
  lecturas[uuid] = vueltas;
  escribirJson(archivoLecturas(datos), lecturas);
  return lecturas;
}

/** Ritmo para «te quedan»: el del libro en esta vuelta (fracción del libro por minuto) y el general (páginas por minuto). */
function ritmos(sesiones, uuid, lectura) {
  const delLibro = sesiones.filter((s) => s.uuid === uuid && s.lectura === lectura && s.paginasLibro > 0);
  const minutosLibro = delLibro.reduce((t, s) => t + s.minutos, 0);
  const fraccion = delLibro.reduce((t, s) => t + s.paginas / s.paginasLibro, 0);
  const recientes = sesiones.slice(-300);
  const minutosTotal = recientes.reduce((t, s) => t + s.minutos, 0);
  const paginasTotal = recientes.reduce((t, s) => t + s.paginas, 0);
  return {
    libro: { minutos: minutosLibro, fraccion },
    general: { minutos: minutosTotal, paginas: paginasTotal },
  };
}

/** Lo que el lector necesita al abrir un libro: qué vuelta es y los ritmos para estimar. */
function alAbrir(datos, uuid) {
  const lecturas = leerLecturas(datos);
  const lectura = vueltaActual(lecturas, uuid)?.n ?? 1;
  return { lectura, ritmos: ritmos(leerSesiones(datos), uuid, lectura) };
}

/** Todo, para la pantalla «Mi lectura» y el panel del libro (las cuentas se hacen en la interfaz). */
function todo(datos) {
  return { sesiones: leerSesiones(datos), lecturas: leerLecturas(datos) };
}

/**
 * «Borrar estadísticas»: no se borra nada de verdad. La carpeta se renombra (habito-borrado-<fecha>) y,
 * si fue un error, se puede devolver a mano. Las sesiones de las otras PC se van con ella.
 */
function archivar(datos) {
  const carpeta = carpetaHabito(datos);
  if (!fs.existsSync(carpeta)) return { ok: true };
  const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.renameSync(carpeta, path.join(datos, `habito-borrado-${marca}`));
  return { ok: true };
}

// ---------- Columna «Estado» ----------

const ETIQUETA_COLUMNA = 'estado_lectura'; // nombre interno (no se traduce); Calibre lo muestra como #estado_lectura
const ESTADOS = ['porLeer', 'leyendo', 'pausa', 'leido', 'abandonado'];

/**
 * Crea la columna «Estado» con la herramienta oficial de Calibre (calibredb add_custom_column), con
 * respaldo previo como cualquier cambio. Solo cuando el usuario lo pide con el botón (nunca sola).
 * Las opciones salen en el idioma de Broots de ese momento.
 */
function crearColumna(libraryPath) {
  const valores = ESTADOS.map((e) => t(`habito.estados.${e}`));
  const display = { enum_values: valores, enum_colors: [], default_value: valores[0], use_decorations: false, description: '' };
  // JSON solo con caracteres ASCII (cada letra con tilde va como código): pasa intacto por la línea de comandos de Windows.
  const json = JSON.stringify(display).replace(/[^ -~]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return calibre.calibredb(libraryPath, ['add_custom_column', '--display', json, ETIQUETA_COLUMNA, t('habito.columna'), 'enumeration']);
}

module.exports = { crearColumna, ETIQUETA_COLUMNA, guardarSesion, terminar, retomar, releer, alAbrir, todo, archivar, leerSesiones, leerLecturas };
