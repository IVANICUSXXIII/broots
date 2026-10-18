// Las dos formas de ver los libros: grilla de portadas y lista.
//
// Rendimiento: las tarjetas y filas se crean UNA sola vez y nunca se destruyen. Al filtrar,
// las que no coinciden se ocultan y las demás se deslizan a su nuevo lugar. Crear y destruir
// cientos de piezas en cada filtro era lo que congelaba la pantalla.
//
// Al abrir un libro, una copia de su portada vuela al panel (ver Vuelo.jsx); el original se queda.
// Los atributos data-tarjeta / data-portada-lista sirven para ubicar cada portada en pantalla.
import { memo, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { año, fechaCorta, nombreIdioma, valoraciones, resorte, t, useIdioma } from '../lib/index.js';
import { Estrellas, EtiquetaEstado, Portada } from './Piezas.jsx';
import { IconoCita } from './Iconos.jsx';

// Las animaciones de reacomodo se apagan con bibliotecas muy grandes para que todo siga fluido.
const LIMITE_ANIMACION = 600;
// Solo las primeras tarjetas (las visibles en pantalla) entran en cascada.
const CASCADA = 36;

export const RADIO_PORTADA = 7;

function EstrellasDelLibro({ libro, colValoracion, className }) {
  const { propia, importada } = valoraciones(libro, colValoracion);
  return propia ? <Estrellas valor={propia} className={className} /> : <Estrellas valor={importada} tipo="importada" className={className} />;
}

/**
 * Ordena todos los libros: primero los visibles (en su orden), después los ocultos.
 * Devuelve [{ libro, indice }] con indice = posición entre los visibles, o -1 si está oculto.
 */
function usarOrdenCompleto(todos, visibles) {
  return useMemo(() => {
    const posicion = new Map(visibles.map((l, i) => [l.id, i]));
    return [
      ...visibles.map((libro, indice) => ({ libro, indice })),
      ...todos.filter((l) => !posicion.has(l.id)).map((libro) => ({ libro, indice: -1 })),
    ];
  }, [todos, visibles]);
}

/** true solo en el render en que algo pasa de oculto a visible (ahí no hay "lugar anterior" desde el cual deslizarse). */
function usarReaparece(visible) {
  const antes = useRef(visible);
  const reaparece = visible && !antes.current;
  useEffect(() => {
    antes.current = visible;
  });
  return reaparece;
}

/*
 * Tarjetas en pantalla. Cuando cambia el ancho disponible (se pliega la barra o se abre el panel),
 * solo las tarjetas visibles se redibujan y se deslizan; las de más abajo se acomodan sin animación,
 * total no se ven. Recalcular las 211 en cada cambio causaba un tirón al arrancar.
 */
const enPantalla = new Set();
let observador = null;
function observarTarjeta(elemento, id) {
  observador ??= new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) enPantalla.add(e.target.dataset.tarjeta);
        else enPantalla.delete(e.target.dataset.tarjeta);
      }
    },
    { rootMargin: '200px 0px' },
  );
  observador.observe(elemento);
  return () => {
    observador.unobserve(elemento);
    enPantalla.delete(id);
  };
}

/** Comparación para memo: si solo cambió la disposición, las tarjetas fuera de pantalla no se redibujan. */
function mismaTarjeta(antes, despues) {
  for (const clave in despues) {
    if (clave !== 'disposicion' && antes[clave] !== despues[clave]) return false;
  }
  return antes.disposicion === despues.disposicion || !enPantalla.has(String(despues.libro.id));
}

// Entrada: cascada al abrir la app; al reaparecer por un filtro, entra con un leve zoom.
const entrada = {
  oculta: { opacity: 0, scale: 0.94, y: 16, transition: { duration: 0 } },
  visible: (i) => ({ opacity: 1, scale: 1, y: 0, transition: { ...resorte, delay: i < CASCADA ? i * 0.012 : 0 } }),
};

/**
 * Una tarjeta. Está "memorizada": al abrir un libro solo se vuelve a dibujar esa tarjeta, no todas.
 * El hover y el clic los anima CSS (ver .tarjeta en index.css). Solo dos piezas usan JavaScript:
 * la tarjeta (para deslizarse al filtrar) y la portada (que vuela al panel).
 */
// disposicion: cambia cuando cambia el ancho disponible (panel o barra lateral); obliga a las
// tarjetas a redibujarse para deslizarse a su nueva posición en vez de saltar.
const Tarjeta = memo(function Tarjeta({ libro, indice, disposicion, animar, onAbrir, colEstado, colValoracion, cantidadSubrayados }) {
  useIdioma(); // memorizada: se redibuja sola al cambiar el idioma
  const visible = indice >= 0;
  const reaparece = usarReaparece(visible);
  const refTarjeta = useRef(null);
  useEffect(() => observarTarjeta(refTarjeta.current, String(libro.id)), [libro.id]);
  return (
    <motion.div
      ref={refTarjeta}
      layout={animar && visible && !reaparece ? 'position' : false}
      custom={indice}
      variants={entrada}
      initial="oculta"
      animate={visible ? 'visible' : 'oculta'}
      transition={resorte}
      style={{ display: visible ? undefined : 'none' }}
      data-tarjeta={libro.id}
      data-disposicion={disposicion}
    >
      <button
        type="button"
        onClick={(e) => onAbrir(libro.id, e.currentTarget.querySelector('.portada'))}
        className="tarjeta group flex w-full flex-col text-left outline-none"
      >
        <div className="elevacion relative aspect-[2/3] w-full">
          {/* Marco del libro abierto en el panel (se muestra con una regla CSS, sin redibujar la grilla) */}
          <div className="marco-seleccion squircle pointer-events-none absolute -inset-[5px] rounded-[11px] opacity-0 shadow-[0_0_0_2.5px_var(--acento)] transition-opacity duration-200" />
          {/* Sombras dibujadas una sola vez; solo cambia su opacidad. */}
          <div className="pointer-events-none absolute inset-0">
            <div className="squircle absolute inset-0 rounded-[7px] shadow-[0_1px_2px_rgb(var(--sombra)/0.16),0_6px_14px_-8px_rgb(var(--sombra)/0.4)]" />
            <div className="sombra-profunda squircle absolute inset-0 rounded-[7px] shadow-[0_6px_12px_rgb(var(--sombra)/0.12),0_22px_34px_-14px_rgb(var(--sombra)/0.55)]" />
          </div>

          <div
            style={{ borderRadius: RADIO_PORTADA }}
            className="portada squircle absolute inset-0 overflow-hidden outline-offset-[3px] group-focus-visible:outline-2 group-focus-visible:outline-acento"
          >
            <Portada libro={libro} className="size-full" />
            <div className="oscurecer pointer-events-none absolute inset-0 bg-black" />
          </div>
        </div>

        <p className="mt-3 line-clamp-2 font-serif text-[0.88rem] leading-snug font-semibold transition-colors duration-200 group-hover:text-acento">
          {libro.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-tinta-suave">{libro.authors.join(', ')}</p>
        <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5">
          <EstrellasDelLibro libro={libro} colValoracion={colValoracion} className="size-3" />
          {colEstado && <EtiquetaEstado estado={libro.custom[colEstado.label]} />}
          {cantidadSubrayados > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[0.68rem] font-medium text-acento" title={t('vistas.subrayados', { n: cantidadSubrayados })}>
              <IconoCita className="size-3" />
              {cantidadSubrayados}
            </span>
          )}
        </div>
      </button>
    </motion.div>
  );
}, mismaTarjeta);

export function Grilla({ todos, visibles, disposicion, onAbrir, colEstado, colValoracion, subrayadosPorUuid = {} }) {
  const animar = todos.length <= LIMITE_ANIMACION;
  const orden = usarOrdenCompleto(todos, visibles);
  return (
    <div className="relative grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-7 gap-y-9 px-7 pt-6 pb-10">
      {orden.map(({ libro, indice }) => (
        <Tarjeta
          key={libro.id}
          libro={libro}
          indice={indice}
          disposicion={disposicion}
          cantidadSubrayados={subrayadosPorUuid[libro.uuid]?.subrayados.length ?? 0}
          animar={animar}
          onAbrir={onAbrir}
          colEstado={colEstado}
          colValoracion={colValoracion}
        />
      ))}
    </div>
  );
}

// El título de cada columna es vistas.columnas.<id> en los textos de cada idioma.
const COLUMNAS_LISTA = [
  { id: 'titulo', orden: 'titulo', clase: 'min-w-64' },
  { id: 'autor', orden: 'autor', clase: 'min-w-40' },
  { id: 'serie', orden: 'serie', clase: 'min-w-36' },
  { id: 'estado', clase: 'w-28' },
  { id: 'valoracion', orden: 'valoracion', clase: 'w-28' },
  { id: 'idioma', clase: 'w-24' },
  { id: 'formatos', clase: 'w-32' },
  { id: 'publicado', orden: 'publicado', clase: 'w-16' },
  { id: 'agregado', orden: 'agregado', clase: 'w-36' },
];

const Fila = memo(function Fila({ libro, indice, activo, onAbrir, colEstado, colValoracion }) {
  useIdioma(); // memorizada: se redibuja sola al cambiar el idioma (fechas e idiomas)
  const visible = indice >= 0;
  const celda = `py-1.5 px-3 first:rounded-l-lg last:rounded-r-lg ${activo ? '' : indice % 2 ? 'bg-superficie-2/45' : ''}`;
  return (
    <tr
      onClick={(e) => onAbrir(libro.id, e.currentTarget.querySelector('[data-portada-lista]'))}
      style={{ display: visible ? undefined : 'none' }}
      className={`cursor-default transition-colors ${activo ? 'bg-seleccion' : 'hover:bg-superficie-2'}`}
    >
      <td className={`${celda} pl-3`}>
        <div
          data-portada-lista={libro.id}
          style={{ borderRadius: 4 }}
          className="squircle h-11 w-[30px] overflow-hidden shadow-[0_1px_3px_rgb(var(--sombra)/0.3)]"
        >
          <Portada libro={libro} className="size-full" />
        </div>
      </td>
      <td className={`${celda} font-medium`}>{libro.title}</td>
      <td className={`${celda} text-tinta-suave`}>{libro.authors.join(', ')}</td>
      <td className={`${celda} text-tinta-suave`}>{libro.series && `${libro.series} ${libro.seriesIndex != null ? `#${libro.seriesIndex}` : ''}`}</td>
      <td className={celda}>{colEstado && <EtiquetaEstado estado={libro.custom[colEstado.label]} />}</td>
      <td className={celda}>
        <EstrellasDelLibro libro={libro} colValoracion={colValoracion} className="size-3" />
      </td>
      <td className={`${celda} text-tinta-suave`}>{libro.languages.map(nombreIdioma).join(', ')}</td>
      <td className={`${celda} text-xs text-tinta-suave`}>{libro.formats.map((f) => f.format).join(' · ')}</td>
      <td className={`${celda} text-tinta-suave tabular-nums`}>{año(libro.pubdate)}</td>
      <td className={`${celda} whitespace-nowrap text-tinta-suave tabular-nums`}>{fechaCorta(libro.added)}</td>
    </tr>
  );
});

export function Lista({ todos, visibles, abierto, onAbrir, orden, onOrden, colEstado, colValoracion }) {
  const filas = usarOrdenCompleto(todos, visibles);
  return (
    <div className="px-3 pb-6">
      <table className="w-full border-separate border-spacing-0 text-[0.82rem]">
        <thead className="sticky top-0 z-10 bg-superficie">
          <tr>
            <th className="w-14 border-b border-borde" />
            {COLUMNAS_LISTA.map((c) => (
              <th key={c.id} className={`border-b border-borde px-3 py-2.5 text-left text-[0.72rem] font-semibold text-tinta-tenue ${c.clase}`}>
                {c.orden ? (
                  <button type="button" onClick={() => onOrden(c.orden)} className={`hover:text-tinta ${orden === c.orden ? 'text-acento' : ''}`}>
                    {t(`vistas.columnas.${c.id}`)}
                    {orden === c.orden && ' ↓'}
                  </button>
                ) : (
                  t(`vistas.columnas.${c.id}`)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ libro, indice }) => (
            <Fila
              key={libro.id}
              libro={libro}
              indice={indice}
              activo={libro.id === abierto}
              onAbrir={onAbrir}
              colEstado={colEstado}
              colValoracion={colValoracion}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
