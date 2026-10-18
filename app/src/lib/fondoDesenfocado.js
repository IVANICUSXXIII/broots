// Fondo desenfocado para el visor de portada, preparado de antemano.
//
// Un desenfoque "en vivo" (backdrop-filter) obliga a la placa de video a recalcularlo en cada
// cuadro de la animación y en una laptop baja a ~30 cuadros por segundo. En cambio, cuando el
// panel de detalle termina de abrirse y todo está quieto, se toma una foto reducida de la
// ventana, se desenfoca UNA vez y se guarda como imagen. Al abrir el visor, esa imagen solo
// aparece con un fundido: cuesta lo mismo que mostrar una foto.
import { useEffect, useState } from 'react';

const ESPERA_TRAS_ABRIR = 1000; // ms: que terminen las animaciones del panel antes de la foto

async function desenfocar(url) {
  const imagen = new Image();
  imagen.src = url;
  await imagen.decode();
  const lienzo = document.createElement('canvas');
  lienzo.width = imagen.width;
  lienzo.height = imagen.height;
  const ctx = lienzo.getContext('2d');
  // La foto está a 1/4 del tamaño: 4 px acá equivalen a ~16 px en pantalla.
  ctx.filter = 'blur(4px) saturate(0.45) brightness(0.82)';
  // Se dibuja un poco más grande para que el desenfoque no deje bordes transparentes.
  ctx.drawImage(imagen, -10, -10, lienzo.width + 20, lienzo.height + 20);
  return lienzo.toDataURL('image/jpeg', 0.85);
}

/** Mientras `activo` sea true (panel abierto), mantiene lista una foto desenfocada del fondo. */
export function useFondoDesenfocado(activo) {
  const [fondo, setFondo] = useState(null);

  useEffect(() => {
    if (!activo) {
      setFondo(null);
      return undefined;
    }
    let vigente = true;
    let temporizador;
    const preparar = (espera) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => requestIdleCallback(async () => {
        try {
          const foto = await window.biblioteca.instantanea();
          const listo = foto ? await desenfocar(foto) : null;
          if (vigente) setFondo(listo);
        } catch {
          if (vigente) setFondo(null);
        }
      }, { timeout: 600 }), espera);
    };
    // Si cambia el tamaño de la ventana, la foto queda vieja: se descarta y se rehace.
    const alRedimensionar = () => {
      setFondo(null);
      preparar(400);
    };
    preparar(ESPERA_TRAS_ABRIR);
    window.addEventListener('resize', alRedimensionar);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
      window.removeEventListener('resize', alRedimensionar);
    };
  }, [activo]);

  return fondo;
}
