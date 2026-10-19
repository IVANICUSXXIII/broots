// 1.9 «Lectura a medida»: los controles de tema, letra, fuente, interlineado, márgenes y justificado.
//
// ControlesLectura se usa en dos lugares: en el panel del botón «Aa» del lector (PanelLectura) y en Configuración →
// Lectura y traducción. Los dos leen y guardan lo mismo (src/lib/lectura.js), así que lo que cambiás en uno se ve
// en el otro. En el lector, cada cambio reacomoda la página en el momento sin perder el párrafo donde estabas.
import { AnimatePresence, motion } from 'motion/react';
import { COLORES_BARRA, FUENTES, INTERLINEADOS, LETRA, MARGENES, TEMAS, resorte, resortePresion, resorteRapido, t } from '../lib/index.js';
import { IconoCerrar, IconoMedida } from './Iconos.jsx';
import { Interruptor } from './Piezas.jsx';

function Titulo({ children }) {
  return <p className="mt-3 mb-1.5 text-[0.66rem] font-semibold tracking-wide text-tinta-tenue first:mt-0">{children}</p>;
}

/** Muestrita de cada tema: «Aa» con su papel y su tinta (el automático, mitad claro y mitad oscuro, sin letras). */
function MuestraTema({ tema, activo, onElegir }) {
  const fondo =
    tema === 'auto'
      ? { background: `linear-gradient(135deg, ${COLORES_BARRA.claro.fondo} 50%, ${COLORES_BARRA.oscuro.fondo} 50%)` }
      : { background: COLORES_BARRA[tema].fondo, color: COLORES_BARRA[tema].simbolos };
  return (
    <motion.button
      type="button"
      data-tema={tema}
      aria-pressed={activo}
      whileTap={{ scale: 0.92, transition: resortePresion }}
      onClick={() => onElegir(tema)}
      title={t(`lectura.temasExplica.${tema}`)}
      className="flex min-w-0 flex-1 flex-col items-center gap-1"
    >
      <span
        className={`grid h-9 w-full place-items-center rounded-[10px] font-serif text-[0.86rem] ${
          activo ? 'shadow-[0_0_0_2px_var(--superficie),0_0_0_3.5px_var(--acento)]' : 'shadow-[inset_0_0_0_1px_rgb(var(--sombra)/0.2)]'
        }`}
        style={fondo}
      >
        {tema === 'auto' ? '' : 'Aa'}
      </span>
      <span className={`max-w-full truncate text-[0.64rem] ${activo ? 'font-medium text-tinta' : 'text-tinta-suave'}`}>{t(`lectura.temas.${tema}`)}</span>
    </motion.button>
  );
}

/** Tres opciones de texto, una al lado de la otra; la elegida lleva un fondo que se desliza. */
function Opciones({ grupo, opciones, valor, onCambiar }) {
  return (
    <div className="flex rounded-[10px] bg-superficie-2 p-[3px] shadow-[inset_0_0_0_1px_var(--borde)]" data-grupo={grupo}>
      {opciones.map((o) => (
        <button
          type="button"
          key={o.id}
          data-opcion={o.id}
          aria-pressed={valor === o.id}
          onClick={() => onCambiar(o.id)}
          title={o.titulo}
          className={`relative h-7 min-w-0 flex-1 rounded-[7px] px-1 text-[0.72rem] transition-colors ${valor === o.id ? 'text-tinta' : 'text-tinta-tenue hover:text-tinta-suave'}`}
          style={o.estilo}
        >
          {valor === o.id && (
            <motion.span
              layoutId={`opcion-lectura-${grupo}`}
              transition={resorteRapido}
              className="absolute inset-0 rounded-[7px] bg-superficie shadow-[0_1px_2px_rgb(var(--sombra)/0.15),0_0_0_0.5px_var(--borde)]"
            />
          )}
          <span className="relative block truncate">{o.texto}</span>
        </button>
      ))}
    </div>
  );
}

export function ControlesLectura({ ajustes, onCambiar, idGrupo = 'lector' }) {
  const boton = 'grid h-7 w-9 place-items-center rounded-[8px] bg-superficie-2 text-tinta shadow-[inset_0_0_0_1px_var(--borde)] transition-colors hover:text-acento disabled:opacity-40';
  return (
    <div data-controles-lectura>
      <Titulo>{t('lectura.tema')}</Titulo>
      <div className="flex gap-1.5">
        {TEMAS.map((tema) => (
          <MuestraTema key={tema} tema={tema} activo={ajustes.tema === tema} onElegir={(v) => onCambiar({ tema: v })} />
        ))}
      </div>

      <Titulo>{t('lectura.letra')}</Titulo>
      <div className="flex items-center gap-2">
        <motion.button type="button" whileTap={{ scale: 0.92, transition: resortePresion }} className={boton} disabled={ajustes.letra <= LETRA.min} onClick={() => onCambiar({ letra: ajustes.letra - 1 })} title={t('configuracion.letraChica')} data-letra-menos>
          <span className="text-[0.7rem]">A</span>
        </motion.button>
        <span className="min-w-12 flex-1 text-center text-[0.78rem] text-tinta-suave tabular-nums" data-letra>
          {t('lectura.px', { n: ajustes.letra })}
        </span>
        <motion.button type="button" whileTap={{ scale: 0.92, transition: resortePresion }} className={boton} disabled={ajustes.letra >= LETRA.max} onClick={() => onCambiar({ letra: ajustes.letra + 1 })} title={t('configuracion.letraGrande')} data-letra-mas>
          <span className="text-[0.98rem] leading-none">A</span>
        </motion.button>
      </div>

      <Titulo>{t('lectura.fuente')}</Titulo>
      <div className="grid grid-cols-2 gap-1.5">
        {FUENTES.map((f) => (
          <motion.button
            type="button"
            key={f.id}
            data-fuente={f.id}
            aria-pressed={ajustes.fuente === f.id}
            whileTap={{ scale: 0.95, transition: resortePresion }}
            onClick={() => onCambiar({ fuente: f.id })}
            title={t(`lectura.fuentes.${f.id}`)}
            style={{ fontFamily: f.familia }}
            className={`h-8 truncate rounded-[9px] px-2 text-[0.8rem] transition-colors last:col-span-2 ${
              ajustes.fuente === f.id ? 'bg-seleccion text-tinta shadow-[inset_0_0_0_1.5px_var(--acento)]' : 'bg-superficie-2 text-tinta-suave shadow-[inset_0_0_0_1px_var(--borde)] hover:text-tinta'
            }`}
          >
            {f.nombre}
          </motion.button>
        ))}
      </div>

      <Titulo>{t('lectura.interlineado')}</Titulo>
      <Opciones
        grupo={`interlineado-${idGrupo}`}
        valor={ajustes.interlineado}
        onCambiar={(v) => onCambiar({ interlineado: v })}
        opciones={Object.keys(INTERLINEADOS).map((id) => ({ id, texto: t(`lectura.interlineados.${id}`) }))}
      />

      <Titulo>{t('lectura.margenes')}</Titulo>
      <Opciones
        grupo={`margenes-${idGrupo}`}
        valor={ajustes.margenes}
        onCambiar={(v) => onCambiar({ margenes: v })}
        opciones={Object.keys(MARGENES).map((id) => ({ id, texto: t(`lectura.margenesOpciones.${id}`) }))}
      />

      <div className="-mx-2 mt-2.5" data-justificar={ajustes.justificar ? 'si' : 'no'}>
        <Interruptor activo={ajustes.justificar} onCambiar={(v) => onCambiar({ justificar: v })} etiqueta={t('lectura.justificar')} />
        <p className="px-2 text-[0.68rem] leading-snug text-tinta-tenue">{t('lectura.justificarDetalle')}</p>
      </div>
    </div>
  );
}

/** El panel del botón «Aa» del lector. El velo hace que el clic afuera solo lo cierre (no pasa de página). */
export function PanelLectura({ abierto, onCerrar, ajustes, onCambiar }) {
  return (
    <AnimatePresence>
      {abierto && (
        <>
          <motion.div key="velo-medida" data-velo-medida className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCerrar} />
          <motion.aside
            key="panel-medida"
            data-panel-medida
            initial={{ opacity: 0, transform: 'translateY(-8px) scale(0.98)' }}
            animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
            exit={{ opacity: 0, transform: 'translateY(-6px) scale(0.98)', transition: { duration: 0.14 } }}
            transition={resorte}
            style={{ transformOrigin: 'top right' }}
            className="squircle absolute top-2 right-3 z-10 max-h-[calc(100%-1.25rem)] w-[18rem] overflow-y-auto rounded-[18px] bg-superficie p-4 shadow-flotante"
          >
            <div className="mb-3 flex items-center gap-2">
              <IconoMedida className="size-4 text-acento" />
              <p className="min-w-0 flex-1 text-[0.8rem] font-semibold">{t('lectura.titulo')}</p>
              <button type="button" onClick={onCerrar} className="grid size-6 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta" title={t('lector.cerrar')}>
                <IconoCerrar className="size-3" />
              </button>
            </div>
            <ControlesLectura ajustes={ajustes} onCambiar={onCambiar} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
