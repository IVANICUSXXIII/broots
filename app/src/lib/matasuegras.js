// Sonido de matasuegras (lengua de suegra) para festejar una versión nueva.
//
// Es una grabación: «Party horn 2» de BigSoundBank.com (Joseph Sardin), libre de derechos. Va dentro de
// Broots (src/assets), así suena siempre igual y no hace falta internet.
import grabacion from '../assets/matasuegras.mp3';

/** Espera a que la ventana esté a la vista (al abrir Broots puede seguir oculta un momento), hasta `maximo` ms. */
function aLaVista(maximo) {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise((listo) => {
    const seguir = () => {
      document.removeEventListener('visibilitychange', alCambiar);
      clearTimeout(reloj);
      listo();
    };
    const alCambiar = () => document.visibilityState === 'visible' && seguir();
    const reloj = setTimeout(seguir, maximo);
    document.addEventListener('visibilitychange', alCambiar);
  });
}

/** Toca el matasuegras. Devuelve true si sonó (false si la PC no tiene sonido disponible). */
export async function tocarMatasuegras({ volumen = 0.6 } = {}) {
  try {
    await aLaVista(10000);
    const sonido = new Audio(grabacion);
    sonido.volume = volumen;
    await sonido.play();
    return true;
  } catch {
    return false;
  }
}
