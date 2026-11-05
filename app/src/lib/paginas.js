// 1.11: cuentas puras del lector de páginas (PDF y cómics): qué formato abrir y qué páginas van juntas.

// Orden de preferencia: el EPUB tiene subrayados y traducción; entre los otros, el cómic antes que su PDF.
const FORMATOS_LEGIBLES = ['EPUB', 'CBZ', 'CBR', 'PDF'];

/** Los formatos de este libro que Broots sabe abrir, el preferido primero. */
export function formatosParaLeer(libro) {
  const tiene = new Set((libro?.formats ?? []).map((f) => f.format));
  return FORMATOS_LEGIBLES.filter((f) => tiene.has(f));
}

/** ¿Lo abre el lector de páginas? (El EPUB tiene su propio lector.) */
export const esDePaginas = (formato) => formato === 'PDF' || formato === 'CBZ' || formato === 'CBR';

/** Etiqueta «Manga», también colgada de otra («Cómics.Manga»). */
export const tieneEtiquetaManga = (libro) => (libro?.tags ?? []).some((e) => /(^|\.)manga$/i.test(String(e).trim()));

const ASPECTO_COMUN = 0.7; // el de una página que todavía no se midió
export const aspectoDe = (tamano) => (tamano?.ancho && tamano?.alto ? tamano.ancho / tamano.alto : ASPECTO_COMUN);
const esAncha = (tamano) => aspectoDe(tamano) > 1;

/**
 * Qué páginas se ven juntas. Con una por vez, cada una sola. Con dos: la tapa va sola, las que ya vienen a doble
 * página (más anchas que altas) también, y el resto de a pares.
 */
export function armarPliegos(tamanos, dos) {
  const pliegos = [];
  for (let i = 0; i < tamanos.length; i++) {
    if (dos && i > 0 && !esAncha(tamanos[i]) && i + 1 < tamanos.length && !esAncha(tamanos[i + 1])) {
      pliegos.push([i, i + 1]);
      i++;
    } else pliegos.push([i]);
  }
  return pliegos;
}

/** En qué pliego está una página. */
export function pliegoDe(pliegos, pagina) {
  const i = pliegos.findIndex((p) => p.includes(pagina));
  return i < 0 ? 0 : i;
}

/** Automático: de a dos si la ventana da para que cada página se vea bien (el mismo corte que el lector de EPUB). */
export const entranDos = (ancho, alto) => ancho >= 1000 && ancho / Math.max(1, alto) >= 1.2;

/** El alto común de las páginas de un pliego para que entren enteras en el lugar disponible. */
export function altoAjustado(tamanos, ancho, alto) {
  const aspectos = tamanos.reduce((suma, tamano) => suma + aspectoDe(tamano), 0);
  return Math.max(1, Math.min(alto, ancho / Math.max(0.01, aspectos)));
}
