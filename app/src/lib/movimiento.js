// Sistema de movimiento de Broots, inspirado en "Designing Fluid Interfaces" (Apple, WWDC 2018).
//
// Reglas:
//  1. Todo es un resorte (física), nunca una duración fija con curva ease.
//  2. Casi sin rebote para transiciones del sistema; el rebote se guarda para "aterrizajes"
//     (cuando algo vuelve a su lugar), como en iOS.
//  3. Solo se animan transform (posición/escala), opacidad y filtros: van por la placa de video
//     y no obligan a redibujar la página, así no hay tirones.
//
// visualDuration = cuánto "parece" durar el movimiento; bounce = rebote (0 = nada, 0.3 = juguetón).

/** Transiciones generales: entra y frena suave, sin rebote (como .smooth de SwiftUI). */
export const resorte = { type: 'spring', visualDuration: 0.42, bounce: 0 };
/** Respuestas rápidas de controles (como .snappy). */
export const resorteRapido = { type: 'spring', visualDuration: 0.26, bounce: 0.06 };
/** Pasar el mouse: ágil y sin rebote para que no parezca gelatina. */
export const resorteHover = { type: 'spring', visualDuration: 0.3, bounce: 0 };
/** Presionar: casi instantáneo, da sensación de contacto físico. */
export const resortePresion = { type: 'spring', visualDuration: 0.12, bounce: 0 };
/** Vuelo de una portada hacia su destino (abrir). */
export const resorteVuelo = { type: 'spring', visualDuration: 0.5, bounce: 0.1 };
/** Aterrizaje al volver a su lugar (cerrar): se pasa apenas y se acomoda. */
export const resorteRegreso = { type: 'spring', visualDuration: 0.48, bounce: 0.2 };
/** Elementos lúdicos (logo, interruptores destacados). */
export const resorteElastico = { type: 'spring', visualDuration: 0.5, bounce: 0.3 };
/** Alias de compatibilidad. */
export const resorteSuave = resorte;

/**
 * Convierte un resorte en una transición CSS nativa (curva linear() muestreada).
 * Así el hover y el clic de cientos de portadas los anima directamente el motor gráfico,
 * sin JavaScript, con exactamente la misma física que el resto de la app.
 * La conversión rigidez/amortiguación es la misma que usa la librería motion.
 */
export function resorteCss({ visualDuration, bounce = 0 }) {
  const raiz = (2 * Math.PI) / (visualDuration * 1.2);
  const rigidez = raiz * raiz;
  const amortiguacion = 2 * Math.min(1, Math.max(0.05, 1 - bounce)) * Math.sqrt(rigidez);
  const dt = 1 / 240;
  let x = 0;
  let v = 0;
  const muestras = [0];
  let t = 0;
  while (t < 3 && (Math.abs(1 - x) > 0.0005 || Math.abs(v) > 0.005)) {
    v += (rigidez * (1 - x) - amortiguacion * v) * dt;
    x += v * dt;
    t += dt;
    muestras.push(x);
  }
  const pasos = 48;
  const puntos = Array.from({ length: pasos + 1 }, (_, i) => {
    const valor = i === pasos ? 1 : muestras[Math.round((i / pasos) * (muestras.length - 1))];
    return Number(valor.toFixed(4));
  });
  return `${Math.round(t * 1000)}ms linear(${puntos.join(', ')})`;
}

/** Publica los resortes como variables CSS (--t-hover, --t-presion, --t-suave) para usarlos en estilos. */
export function instalarResortesCss() {
  const raiz = document.documentElement.style;
  raiz.setProperty('--t-hover', resorteCss(resorteHover));
  raiz.setProperty('--t-presion', resorteCss(resortePresion));
  raiz.setProperty('--t-suave', resorteCss(resorte));
}
