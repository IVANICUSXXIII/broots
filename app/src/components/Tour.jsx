// 1.10: el tour de bienvenida. Dos recorridos cortos: uno por la biblioteca (la primera vez que se abre Broots) y otro
// por el lector (la primera vez que se abre un libro). Cada paso ilumina un botón de verdad y explica para qué sirve;
// si ese botón no está a la vista (ventana angosta, biblioteca compartida), el paso se saltea.
// Los textos están en tour.<recorrido>.<paso>. Solo se anima opacity y transform; la sombra alrededor del hueco no se mueve.
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { resorte, resortePresion, t } from '../lib/index.js';

const RECORRIDOS = {
  biblioteca: [
    { id: 'inicio' },
    { id: 'lateral', selector: '[data-tour="lateral"]' },
    { id: 'buscador', selector: '[data-tour="buscador"]' },
    { id: 'libro', selector: '[data-tarjeta]' },
    { id: 'agregar', selector: '[data-tour="agregar"]' },
    { id: 'kindle', selector: '[data-tour="kindle"]' },
    { id: 'familia', selector: '[data-tour="familia"]' },
    { id: 'miLectura', selector: '[data-boton-mi-lectura]' },
    { id: 'ayuda', selector: '[data-tour="ayuda"]' },
  ],
  lector: [
    { id: 'pasar' },
    { id: 'medida', selector: '[data-boton-medida]' },
    { id: 'seleccionar' },
    { id: 'indice', selector: '[data-tour="indice"]' },
    { id: 'traducir', selector: '[data-tour="traducir"]' },
    { id: 'sesion', selector: '[data-sesion]' },
    { id: 'enfoque', selector: '[data-boton-enfoque]' },
    { id: 'cerrar' },
  ],
};

const ANCHO_BURBUJA = 340;
const ALTO_BURBUJA = 220;
const MARGEN = 14;

const seVe = (el) => {
  const caja = el?.getBoundingClientRect();
  return Boolean(caja && caja.width > 0 && caja.height > 0);
};

/** Dónde va la burbuja: al costado de lo que es muy alto (la barra lateral); si no, abajo o arriba. */
function lugarDe(caja) {
  const { innerWidth: W, innerHeight: H } = window;
  const encerrar = (v, max) => Math.max(MARGEN, Math.min(v, max));
  if (!caja) return { left: (W - ANCHO_BURBUJA) / 2, top: (H - ALTO_BURBUJA) / 2 };
  if (caja.height > H * 0.5) {
    const left = caja.right + MARGEN + ANCHO_BURBUJA < W ? caja.right + MARGEN : caja.left - MARGEN - ANCHO_BURBUJA;
    return { left: encerrar(left, W - ANCHO_BURBUJA - MARGEN), top: encerrar(caja.top + 40, H - ALTO_BURBUJA - MARGEN) };
  }
  const left = encerrar(caja.left + caja.width / 2 - ANCHO_BURBUJA / 2, W - ANCHO_BURBUJA - MARGEN);
  const top = caja.bottom + MARGEN + ALTO_BURBUJA < H ? caja.bottom + MARGEN : caja.top - MARGEN - ALTO_BURBUJA;
  return { left, top: encerrar(top, H - ALTO_BURBUJA - MARGEN) };
}

export function Tour({ recorrido, onTerminar }) {
  const pasos = useMemo(() => RECORRIDOS[recorrido].filter((p) => !p.selector || seVe(document.querySelector(p.selector))), [recorrido]);
  const [indice, setIndice] = useState(0);
  const [caja, setCaja] = useState(null);
  const paso = pasos[indice];
  const ultimo = indice === pasos.length - 1;

  useLayoutEffect(() => {
    const medir = () => {
      const el = paso.selector ? document.querySelector(paso.selector) : null;
      setCaja(el ? el.getBoundingClientRect() : null);
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [paso]);

  const avanzar = () => (ultimo ? onTerminar() : setIndice((i) => i + 1));
  const volver = () => setIndice((i) => Math.max(0, i - 1));

  // Mientras dura el tour, el teclado es suyo: las flechas no pasan de página ni Esc cierra el libro de abajo.
  useEffect(() => {
    const alPresionar = (e) => {
      e.stopImmediatePropagation();
      if (e.key === 'Escape') onTerminar();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        avanzar();
      } else if (e.key === 'ArrowLeft') volver();
    };
    window.addEventListener('keydown', alPresionar, true);
    return () => window.removeEventListener('keydown', alPresionar, true);
  });

  return (
    <motion.div
      data-tour-abierto={recorrido}
      className="fixed inset-0 z-[90]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      {caja ? (
        <div
          key={paso.id}
          className="squircle absolute rounded-[10px] shadow-[0_0_0_200vmax_rgb(var(--sombra)/0.5),0_0_0_2px_var(--acento)]"
          style={{ left: caja.left - 4, top: caja.top - 4, width: caja.width + 8, height: caja.height + 8 }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgb(var(--sombra)/0.5)]" />
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={paso.id}
          data-tour-paso={paso.id}
          role="dialog"
          aria-label={t(`tour.${recorrido}.${paso.id}.titulo`)}
          initial={{ opacity: 0, transform: 'translateY(8px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={resorte}
          style={{ ...lugarDe(caja), width: ANCHO_BURBUJA }}
          className="squircle absolute rounded-[16px] bg-superficie p-4 text-tinta shadow-flotante"
        >
          <p className="font-serif text-[1.02rem] font-semibold">{t(`tour.${recorrido}.${paso.id}.titulo`)}</p>
          <p className="mt-1.5 text-[0.82rem] leading-relaxed text-tinta-suave">{t(`tour.${recorrido}.${paso.id}.texto`)}</p>
          <div className="mt-3.5 flex items-center gap-2 text-[0.76rem]">
            <span className="text-tinta-tenue tabular-nums">{t('tour.paso', { n: indice + 1, total: pasos.length })}</span>
            {!ultimo && (
              <button type="button" onClick={onTerminar} data-tour-saltear className="ml-1 text-tinta-tenue underline-offset-2 hover:text-tinta hover:underline">
                {t('tour.saltear')}
              </button>
            )}
            <span className="flex-1" />
            {indice > 0 && (
              <button type="button" onClick={volver} data-tour-anterior className="rounded-full px-2.5 py-1 font-medium text-tinta-suave hover:bg-superficie-2">
                {t('tour.anterior')}
              </button>
            )}
            <motion.button
              type="button"
              onClick={avanzar}
              data-tour-siguiente
              whileTap={{ scale: 0.95, transition: resortePresion }}
              className="rounded-full bg-verde px-3 py-1 font-medium text-superficie"
            >
              {ultimo ? t('tour.listo') : t('tour.siguiente')}
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
