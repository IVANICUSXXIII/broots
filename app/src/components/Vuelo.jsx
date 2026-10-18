// Capa de vuelo: la portada que viaja entre la grilla, el panel y la pantalla completa.
//
// Es una COPIA de la portada dibujada por encima de toda la ventana, así nunca queda tapada por
// otras portadas ni recortada por los bordes de un panel. Mientras vuela, el original de destino
// se oculta; al aterrizar, la copia desaparece y el original se muestra exactamente en su lugar.
//
// Técnica FLIP: la copia se ubica en el DESTINO y arranca "deformada" (trasladada y escalada) para
// coincidir con el ORIGEN; después se anima hasta su forma natural. Es una sola transformación,
// que la placa de video resuelve sin tirones.
import { motion } from 'motion/react';
import { Portada } from './Piezas.jsx';

/** Rectángulo en pantalla de un elemento: { x, y, w, h }. */
export function rectDe(elemento) {
  if (!elemento) return null;
  const r = elemento.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function CapaVuelo({ vuelo, libro, onAterrizar }) {
  if (!vuelo?.hacia || !libro) return null;
  const { desde, hacia } = vuelo;
  const sx = desde.w / hacia.w;
  const sy = desde.h / hacia.h;
  const dx = desde.x - hacia.x;
  const dy = desde.y - hacia.y;
  const inicio = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  const final = vuelo.desvanecer ? 'translate(0px, 0px) scale(0.85, 0.85)' : 'translate(0px, 0px) scale(1, 1)';

  return (
    <motion.div
      key={vuelo.clave}
      data-vuelo={vuelo.tipo}
      className="squircle pointer-events-none fixed z-[70] overflow-hidden shadow-[0_8px_18px_rgb(0_0_0/0.18),0_28px_60px_-18px_rgb(0_0_0/0.55)]"
      style={{
        left: hacia.x,
        top: hacia.y,
        width: hacia.w,
        height: hacia.h,
        borderRadius: hacia.radio ?? 8,
        // Al desvanecerse (sin destino visible) se achica hacia su centro.
        transformOrigin: vuelo.desvanecer ? 'center' : '0 0',
      }}
      initial={{ transform: inicio, opacity: 1 }}
      animate={{ transform: final, opacity: vuelo.desvanecer ? 0 : 1 }}
      transition={vuelo.transicion}
      onAnimationComplete={() => onAterrizar(vuelo.clave)}
    >
      <Portada libro={libro} completa={!vuelo.original} original={vuelo.original} className="size-full" />
    </motion.div>
  );
}
