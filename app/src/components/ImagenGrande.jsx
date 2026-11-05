// 1.10: una imagen del libro a pantalla completa. Abre entera, ajustada a la ventana. Un clic en la imagen la acerca o la
// vuelve a alejar; pellizcar el trackpad (o Ctrl + rueda) la acerca de a poco. Acercada, se recorre arrastrando o con la
// rueda. Se cierra con el botón, un clic afuera de la imagen, Esc o la cruz de la ventana (ver Lector.jsx).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { t } from '../lib/index.js';
import { IconoCerrar } from './Iconos.jsx';

const ZOOM_CLIC = 2;
const ZOOM_MAXIMO = 5;
const MARGEN = 16;
const ARRASTRE_MINIMO = 4; // px: moverse menos que esto sigue siendo un clic
const encerrar = (v, min, max) => Math.min(max, Math.max(min, v));

export function ImagenGrande({ imagen, onCerrar }) {
  const marco = useRef(null);
  const foto = useRef(null);
  const [lugar, setLugar] = useState(null); // lo que mide el marco
  const [zoom, setZoom] = useState(1);
  const refZoom = useRef(zoom);
  refZoom.current = zoom;
  const punto = useRef(null); // el punto de la imagen que tiene que quedar debajo del mouse al cambiar el zoom
  const arrastre = useRef(null);

  useLayoutEffect(() => {
    const medir = () => setLugar({ ancho: marco.current.clientWidth, alto: marco.current.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(marco.current);
    marco.current.focus(); // para recorrerla también con las flechas
    return () => observador.disconnect();
  }, []);

  /** Cambia el zoom dejando quieto lo que está debajo del mouse. */
  const cambiarZoom = (nuevo, { clientX, clientY }) => {
    const caja = foto.current.getBoundingClientRect();
    punto.current = { x: clientX, y: clientY, fx: (clientX - caja.left) / caja.width, fy: (clientY - caja.top) / caja.height };
    setZoom(encerrar(nuevo, 1, ZOOM_MAXIMO));
  };
  useLayoutEffect(() => {
    if (!punto.current) return;
    const { x, y, fx, fy } = punto.current;
    punto.current = null;
    const caja = foto.current.getBoundingClientRect();
    marco.current.scrollLeft += caja.left + fx * caja.width - x;
    marco.current.scrollTop += caja.top + fy * caja.height - y;
  }, [zoom]);

  // Se escucha a mano: en onWheel de React no se puede cancelar el zoom del pellizco.
  useEffect(() => {
    const el = marco.current;
    const alRodar = (e) => {
      if (!e.ctrlKey) return; // sin Ctrl, la rueda recorre la imagen
      e.preventDefault();
      cambiarZoom(refZoom.current * Math.exp(encerrar(-e.deltaY, -30, 30) * 0.01), e);
    };
    el.addEventListener('wheel', alRodar, { passive: false });
    return () => el.removeEventListener('wheel', alRodar);
  }, []);

  const alApretar = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // que arrastrar no «levante» la imagen ni seleccione nada
    const el = marco.current;
    arrastre.current = { x: e.clientX, y: e.clientY, izquierda: el.scrollLeft, arriba: el.scrollTop, seMovio: false, sobreLaFoto: e.target === foto.current };
  };
  useEffect(() => {
    const alMover = (e) => {
      const a = arrastre.current;
      if (!a) return;
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      if (Math.hypot(dx, dy) > ARRASTRE_MINIMO) a.seMovio = true;
      if (!a.seMovio) return;
      marco.current.scrollLeft = a.izquierda - dx;
      marco.current.scrollTop = a.arriba - dy;
    };
    const alSoltar = (e) => {
      const a = arrastre.current;
      arrastre.current = null;
      if (!a || a.seMovio) return;
      if (a.sobreLaFoto) cambiarZoom(refZoom.current > 1 ? 1 : ZOOM_CLIC, e);
      else onCerrar();
    };
    window.addEventListener('mousemove', alMover);
    window.addEventListener('mouseup', alSoltar);
    return () => {
      window.removeEventListener('mousemove', alMover);
      window.removeEventListener('mouseup', alSoltar);
    };
  }, [onCerrar]);

  // Ajustada a la ventana (una imagen chica también se agranda hasta ocupar el lugar).
  const ajuste = lugar ? Math.min((lugar.ancho - MARGEN * 2) / imagen.ancho, (lugar.alto - MARGEN * 2) / imagen.alto) : 0;

  return (
    <motion.div
      data-imagen-grande
      className="absolute inset-0 z-50 bg-superficie"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
    >
      <div ref={marco} tabIndex={-1} onMouseDown={alApretar} data-imagen-marco className="size-full overflow-auto outline-none">
        <div className="grid min-h-full min-w-full w-max place-items-center" style={{ padding: MARGEN }}>
          <img
            ref={foto}
            src={imagen.src}
            alt=""
            draggable={false}
            style={{ width: imagen.ancho * ajuste * zoom, height: imagen.alto * ajuste * zoom, maxWidth: 'none' }}
            className={zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onCerrar}
        title={t('lector.cerrarImagen')}
        data-imagen-cerrar
        className="absolute top-14 right-4 grid size-9 place-items-center rounded-full bg-superficie-2 text-tinta-suave shadow-[inset_0_0_0_1px_var(--borde)] hover:text-tinta"
      >
        <IconoCerrar className="size-4" />
      </button>
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-superficie-2 px-3 py-1 text-[0.72rem] whitespace-nowrap text-tinta-suave shadow-[inset_0_0_0_1px_var(--borde)]">
        {t('lector.imagenPista')}
      </p>
    </motion.div>
  );
}
