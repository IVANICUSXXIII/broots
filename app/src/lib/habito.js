// 1.7 «Hábito de lectura»: cuentas sobre las sesiones (racha, mapa de calor, ritmo, «te quedan») y los
// estados del libro. Las sesiones las guarda electron/habito.cjs; acá solo se leen y se suman.
import { normalizar } from './calibreSearch.js';
import { region, t } from './idioma.js';

// ---------- Estados ----------

// Cada estado de Broots y cómo puede llamarse en una columna de Calibre (en cualquiera de los tres idiomas,
// o como la haya nombrado el usuario). Se compara sin tildes ni mayúsculas.
const PATRONES = {
  porLeer: /^(por leer|para leer|pendiente|sin leer|no leido|to read|unread|want to read|para ler|a ler|nao lido)$/,
  leyendo: /^(leyendo|en curso|reading|currently reading|in progress|lendo|em andamento)$/,
  pausa: /(pausa|paused|on hold)/,
  leido: /^(leido|terminado|read|finished|done|lido|terminei)$/,
  abandonado: /(abandon|dnf|did not finish|no terminado)/,
};
export const ESTADOS = Object.keys(PATRONES);

/** Qué estado de Broots es un valor de la columna ('Leído' -> 'leido'), o null. */
export function tipoEstado(valor) {
  const v = normalizar(valor ?? '').trim();
  if (!v) return null;
  return ESTADOS.find((e) => PATRONES[e].test(v)) ?? null;
}

/** El valor de la columna que corresponde a un estado de Broots ('leido' -> 'Leído'), o null si no lo tiene. */
export function valorDeEstado(colEstado, tipo) {
  return colEstado?.enumValues?.find((v) => tipoEstado(v) === tipo) ?? null;
}

// ---------- Días y horas ----------

const dosCifras = (n) => String(n).padStart(2, '0');
/** Día local de una fecha ISO: '2026-10-18'. */
export function diaLocal(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
}
function sumarDias(dia, n) {
  const [a, m, d] = dia.split('-').map(Number);
  return diaLocal(new Date(a, m - 1, d + n));
}

/** Minutos leídos por día: { '2026-10-18': 42.5, … } */
export function minutosPorDia(sesiones) {
  const dias = {};
  for (const s of sesiones) {
    const dia = diaLocal(s.inicio);
    dias[dia] = (dias[dia] ?? 0) + s.minutos;
  }
  return dias;
}

/**
 * Racha: días seguidos con alguna sesión. La de hoy no se corta hasta que termina el día: si hoy todavía
 * no leíste, cuenta desde ayer.
 */
export function rachas(dias, hoy = diaLocal(new Date())) {
  let actual = 0;
  let desde = dias[hoy] ? hoy : sumarDias(hoy, -1);
  while (dias[desde]) {
    actual++;
    desde = sumarDias(desde, -1);
  }
  let record = 0;
  let seguidos = 0;
  let anterior = null;
  for (const dia of Object.keys(dias).sort()) {
    seguidos = anterior && sumarDias(anterior, 1) === dia ? seguidos + 1 : 1;
    record = Math.max(record, seguidos);
    anterior = dia;
  }
  return { actual, record: Math.max(record, actual), leyoHoy: Boolean(dias[hoy]) };
}

/** Todo lo que muestra «Mi lectura». */
export function resumen(sesiones, lecturas = {}, ahora = new Date()) {
  const hoy = diaLocal(ahora);
  const dias = minutosPorDia(sesiones);
  const mes = hoy.slice(0, 7);
  const delMes = sesiones.filter((s) => diaLocal(s.inicio).startsWith(mes));
  const porHora = Array(24).fill(0);
  const porDiaSemana = Array(7).fill(0); // 0 = lunes
  for (const s of sesiones) {
    const d = new Date(s.inicio);
    porHora[d.getHours()] += s.minutos;
    porDiaSemana[(d.getDay() + 6) % 7] += s.minutos;
  }
  const recientes = sesiones.slice(-300);
  const minutosRecientes = recientes.reduce((t, s) => t + s.minutos, 0);
  const año = String(ahora.getFullYear());
  const vueltas = Object.values(lecturas).flat();
  const terminadas = vueltas.filter((v) => v.resultado === 'leido' && v.fin?.startsWith(año));
  return {
    dias,
    racha: rachas(dias, hoy),
    mes: { minutos: delMes.reduce((t, s) => t + s.minutos, 0), sesiones: delMes.length },
    ritmo: minutosRecientes >= 10 ? recientes.reduce((t, s) => t + s.paginas, 0) / minutosRecientes : null, // páginas por minuto
    porHora,
    porDiaSemana,
    terminados: terminadas.length,
    relecturas: terminadas.filter((v) => v.n > 1).length,
    total: { minutos: sesiones.reduce((t, s) => t + s.minutos, 0), sesiones: sesiones.length },
  };
}

/**
 * Semanas del mapa de calor (de lunes a domingo), las últimas `semanas` hasta hoy.
 * Devuelve [[{ dia, minutos, futuro }, …7], …].
 */
export function semanasDelMapa(dias, semanas = 53, ahora = new Date()) {
  const hoy = diaLocal(ahora);
  const lunes = sumarDias(hoy, -((ahora.getDay() + 6) % 7));
  const inicio = sumarDias(lunes, -7 * (semanas - 1));
  return Array.from({ length: semanas }, (_, s) =>
    Array.from({ length: 7 }, (_, d) => {
      const dia = sumarDias(inicio, s * 7 + d);
      return { dia, minutos: dias[dia] ?? 0, futuro: dia > hoy };
    }),
  );
}

/** Nivel de color del mapa (0 a 4) según los minutos del día. */
export const nivelDelDia = (minutos) => (minutos <= 0 ? 0 : minutos < 15 ? 1 : minutos < 30 ? 2 : minutos < 60 ? 3 : 4);

// ---------- Libros ----------

/** Lo leído de un libro, separado por vuelta (las relecturas no pisan las anteriores). */
export function lecturaDelLibro(uuid, sesiones, lecturas) {
  const vueltas = lecturas[uuid] ?? [];
  const propias = sesiones.filter((s) => s.uuid === uuid);
  const numeros = new Set([...vueltas.map((v) => v.n), ...propias.map((s) => s.lectura)]);
  return [...numeros]
    .sort((a, b) => a - b)
    .map((n) => {
      const vuelta = vueltas.find((v) => v.n === n) ?? { n };
      const delas = propias.filter((s) => s.lectura === n);
      const minutos = delas.reduce((t, s) => t + s.minutos, 0);
      const paginas = delas.reduce((t, s) => t + s.paginas, 0);
      return {
        ...vuelta,
        inicio: vuelta.inicio ?? delas[0]?.inicio ?? null,
        ultima: delas.at(-1)?.fin ?? delas.at(-1)?.inicio ?? null,
        minutos,
        sesiones: delas.length,
        ritmo: minutos >= 5 ? paginas / minutos : null,
      };
    });
}

/**
 * Ritmo para «te quedan», en páginas por minuto con las páginas de ahora (cambian con la letra y la ventana):
 * el de este libro si ya hay al menos 10 minutos leídos; si no, el general; si no hay nada, null.
 * libro: { minutos, fraccion } (fracción del libro leída por página); general: { minutos, paginas }.
 */
export function ritmoParaEstimar({ libro, general }, totalPaginas) {
  if (libro.minutos >= 10 && libro.fraccion > 0) return (libro.fraccion / libro.minutos) * totalPaginas;
  if (general.minutos >= 10 && general.paginas > 0) return general.paginas / general.minutos;
  return null;
}

// ---------- Textos ----------

/** 95 -> «1 h 35 min», 12 -> «12 min», 0.4 -> «menos de 1 min». */
export function duracion(minutos) {
  const m = Math.round(minutos);
  if (m < 1) return t('habito.menosDeUnMinuto');
  if (m < 60) return t('habito.minutos', { n: m });
  const h = Math.floor(m / 60);
  return m % 60 ? t('habito.horasMinutos', { h, m: m % 60 }) : t('habito.horas', { n: h });
}

/** Lo mismo, redondeado para un «te quedan ~X» (más de una hora: de a 5 minutos). */
export function estimacion(minutos) {
  return duracion(minutos > 60 ? Math.round(minutos / 5) * 5 : Math.max(1, minutos));
}

export function ritmoTexto(paginasPorMinuto) {
  return t('habito.ritmo', { n: paginasPorMinuto.toLocaleString(region(), { maximumFractionDigits: 1 }) });
}
