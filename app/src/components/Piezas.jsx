// Piezas visuales reutilizables: portada, estrellas, estado, interruptor, control segmentado y botón.
import { useId, useState } from 'react';
import { motion } from 'motion/react';
import { colorDesdeTexto, normalizar, numero, resortePresion, resorteRapido, t } from '../lib/index.js';

/** completa: versión nítida para el panel; original: la imagen original (visor a pantalla completa). */
export function Portada({ libro, completa = false, original = false, className = '' }) {
  const [falla, setFalla] = useState(false);
  const [nitida, setNitida] = useState(false);

  if (!libro.hasCover || falla) {
    return (
      <div
        className={`flex flex-col justify-between overflow-hidden p-3 text-white ${className}`}
        style={{ background: `linear-gradient(160deg, ${colorDesdeTexto(libro.title)}, #2b361c)` }}
      >
        <span className="font-serif text-[0.8rem] leading-snug font-semibold line-clamp-5">{libro.title}</span>
        <span className="text-[0.65rem] opacity-80 line-clamp-2">{libro.authors.join(', ')}</span>
      </div>
    );
  }

  const version = encodeURIComponent(libro.lastModified);
  const miniatura = (
    <img
      src={`cover://thumb/${libro.id}?v=${version}`}
      alt={t('piezas.portadaDe', { titulo: libro.title })}
      loading={completa || original ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFalla(true)}
      className={`object-cover ${className}`}
    />
  );
  if (!completa && !original) return miniatura;

  // Versión grande: la miniatura (ya en memoria) se ve al instante y la imagen nítida aparece encima.
  return (
    <span className={`relative block ${className}`}>
      {miniatura}
      <img
        src={`cover://${original ? 'full' : 'media'}/${libro.id}?v=${version}`}
        alt=""
        decoding="async"
        draggable={false}
        onLoad={() => setNitida(true)}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${nitida ? 'opacity-100' : 'opacity-0'}`}
      />
    </span>
  );
}

const ESTRELLA = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';

/**
 * Estrellas de 0 a 10 (como Calibre: 2 = una estrella).
 * tipo "propia": rellenas color cuero. tipo "importada": solo contorno, en gris.
 */
export function Estrellas({ valor, tipo = 'propia', className = 'size-3.5' }) {
  const id = useId();
  if (valor == null || valor <= 0) return null;
  const estrellas = valor / 2;
  const propia = tipo === 'propia';
  return (
    <span
      className={`inline-flex items-center gap-px ${propia ? 'text-estrella' : 'text-tinta-tenue'}`}
      title={t('piezas.estrellas', { n: numero(estrellas), origen: t(propia ? 'piezas.tuValoracion' : 'piezas.importada') })}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const relleno = estrellas >= n ? 1 : estrellas >= n - 0.5 ? 0.5 : 0;
        const gradiente = `${id}-${n}`;
        return (
          <svg key={n} viewBox="0 0 24 24" className={className} aria-hidden="true">
            {relleno === 0.5 && (
              <defs>
                <linearGradient id={gradiente}>
                  <stop offset="50%" stopColor="currentColor" stopOpacity={propia ? 1 : 0.35} />
                  <stop offset="50%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
            )}
            {propia ? (
              <path d={ESTRELLA} fill={relleno === 0.5 ? `url(#${gradiente})` : 'currentColor'} fillOpacity={relleno === 0 ? 0.22 : 1} />
            ) : (
              <path
                d={ESTRELLA}
                fill={relleno === 0.5 ? `url(#${gradiente})` : relleno === 1 ? 'currentColor' : 'none'}
                fillOpacity={relleno === 1 ? 0.18 : 1}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeOpacity={relleno === 0 ? 0.4 : 1}
              />
            )}
          </svg>
        );
      })}
    </span>
  );
}

const COLORES_ESTADO = {
  'por leer': 'bg-superficie-2 text-tinta-suave',
  leyendo: 'bg-[#d4a369]/25 text-acento',
  leido: 'bg-[#636b3f]/18 text-verde',
  abandonado: 'bg-tinta-tenue/15 text-tinta-tenue',
};

export function EtiquetaEstado({ estado }) {
  if (!estado) return null;
  const color = COLORES_ESTADO[normalizar(estado)] ?? 'bg-acento-suave text-acento';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${color}`}>{estado}</span>;
}

/** Interruptor estilo macOS: la perilla se desliza con resorte. */
export function Interruptor({ activo, onCambiar, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-[0.8rem] text-tinta hover:bg-superficie-2/70"
    >
      <span>{etiqueta}</span>
      <span className={`flex h-[18px] w-8 shrink-0 rounded-full p-[2px] transition-colors duration-200 ${activo ? 'justify-end bg-verde' : 'justify-start bg-tinta-tenue/35'}`}>
        <motion.span layout transition={resorteRapido} className="size-[14px] rounded-full bg-white shadow-sm" />
      </span>
    </button>
  );
}

/** Control segmentado estilo macOS: el fondo del botón activo se desliza entre opciones. */
export function ControlSegmentado({ opciones, valor, onCambiar, grupo }) {
  return (
    <div className="flex rounded-[10px] bg-superficie-2 p-[3px] shadow-[inset_0_0_0_1px_var(--borde)]">
      {opciones.map((o) => (
        <button
          type="button"
          key={o.id}
          onClick={() => onCambiar(o.id)}
          title={o.titulo}
          className={`relative grid h-7 w-9 place-items-center rounded-[7px] transition-colors ${valor === o.id ? 'text-tinta' : 'text-tinta-tenue hover:text-tinta-suave'}`}
        >
          {valor === o.id && (
            <motion.span
              layoutId={`segmento-${grupo}`}
              transition={resorteRapido}
              className="absolute inset-0 rounded-[7px] bg-superficie shadow-[0_1px_2px_rgb(var(--sombra)/0.15),0_0_0_0.5px_var(--borde)]"
            />
          )}
          <span className="relative">{o.icono}</span>
        </button>
      ))}
    </div>
  );
}

/** Botón de las hojas (Configuración, avisos): primario va en el color de acento. */
export function Boton({ primario, children, className = '', ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96, transition: resortePresion }}
      transition={resorteRapido}
      className={`squircle inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[0.78rem] font-medium transition-colors disabled:opacity-50 ${
        primario ? 'bg-acento text-sobre-acento hover:brightness-110' : 'bg-superficie text-tinta shadow-[inset_0_0_0_1px_var(--borde)] hover:text-acento'
      } ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
