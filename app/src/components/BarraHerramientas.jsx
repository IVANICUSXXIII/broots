// Barra superior unificada con la barra de título (como las apps de macOS).
// Toda la franja sirve para arrastrar la ventana; a la derecha quedan los botones de Windows.
// En una ventana angosta se achican primero el título y el buscador; después se esconden el nombre «Broots»
// y el tema (que también está en Configuración). Ayuda y Configuración quedan siempre a la vista.
import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ORDENES, resorte, resorteRapido, t } from '../lib/index.js';
import {
  IconoAuto, IconoAyuda, IconoBarraLateral, IconoBuscar, IconoCompartir, IconoDuplicados, IconoEngranaje, IconoKindle, IconoMas, IconoCerrar, IconoGrilla, IconoLista, IconoLuna, IconoRecargar, IconoSol, LogoBroots,
} from './Iconos.jsx';
import { ControlSegmentado } from './Piezas.jsx';

function BotonBarra({ children, ...props }) {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      transition={resorteRapido}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-tinta-suave transition-colors hover:bg-superficie-2 hover:text-tinta"
      {...props}
    >
      {children}
    </motion.button>
  );
}

export const BarraHerramientas = forwardRef(function BarraHerramientas(
  {
    titulo, cantidad, busqueda, onBusqueda, errorBusqueda, vista, onVista, orden, onOrden,
    tema, onTema, barraVisible, onAlternarBarra, onRecargar, onConfiguracion, onAyuda, onKindle, onAgregarLibros, onDuplicados, onCompartir, soloLectura, cargando,
  },
  refBusqueda,
) {
  return (
    <header className="arrastrable flex h-11 shrink-0 items-center gap-3 pr-[150px] pl-4">
      <div className="flex w-[13.5rem] shrink-0 items-center gap-2 max-[1180px]:w-auto">
        <span className="grid size-7 place-items-center rounded-lg bg-verde text-[#fefae3] shadow-sm">
          <LogoBroots className="size-[18px]" />
        </span>
        <span className="font-serif text-[1.05rem] font-semibold tracking-tight max-[1180px]:hidden">Broots</span>
        <span className="ml-auto">
          <BotonBarra onClick={onAlternarBarra} title={barraVisible ? t('barra.ocultarLateral') : t('barra.mostrarLateral')}>
            <IconoBarraLateral className={`size-4 transition-colors ${barraVisible ? 'text-tinta' : ''}`} />
          </BotonBarra>
        </span>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={titulo}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={resorte}
          className="min-w-0 truncate pl-1 whitespace-nowrap"
        >
          <span className="text-[0.95rem] font-semibold">{titulo}</span>
          <span className="ml-2 text-xs text-tinta-tenue tabular-nums">{t('barra.libros', { n: cantidad })}</span>
        </motion.div>
      </AnimatePresence>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="relative w-72 min-w-28 shrink-[2]">
          <IconoBuscar className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-tinta-tenue" />
          <input
            ref={refBusqueda}
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onBusqueda('')}
            placeholder={t('barra.buscar')}
            spellCheck={false}
            className={`h-8 w-full rounded-lg bg-superficie-2 pr-8 pl-8 text-[0.82rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none transition-shadow placeholder:text-tinta-tenue focus:shadow-[inset_0_0_0_1px_var(--acento),0_0_0_3px_color-mix(in_srgb,var(--acento)_25%,transparent)] ${
              errorBusqueda ? 'shadow-[inset_0_0_0_1px_#bc4749]' : ''
            }`}
          />
          <AnimatePresence>
            {busqueda && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={resorteRapido}
                onClick={() => onBusqueda('')}
                className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-tinta-tenue/30 text-tinta-suave hover:bg-tinta-tenue/50"
                title={t('comun.borrarBusqueda')}
              >
                <IconoCerrar className="size-3" />
              </motion.button>
            )}
          </AnimatePresence>
          {errorBusqueda && <p className="absolute top-full left-1 mt-1 text-[0.7rem] text-[#bc4749]">{t('barra.incompleta', { error: errorBusqueda })}</p>}
        </div>

        <select
          value={orden}
          onChange={(e) => onOrden(e.target.value)}
          title={t('barra.ordenar')}
          className="h-8 w-44 min-w-24 shrink rounded-lg bg-superficie-2 px-2 text-[0.8rem] text-tinta shadow-[inset_0_0_0_1px_var(--borde)] outline-none"
        >
          {ORDENES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>

        <div className="shrink-0">
          <ControlSegmentado
            grupo="vista"
            valor={vista}
            onCambiar={onVista}
            opciones={[
              { id: 'grilla', titulo: t('barra.vistaPortadas'), icono: <IconoGrilla /> },
              { id: 'lista', titulo: t('barra.vistaLista'), icono: <IconoLista /> },
            ]}
          />
        </div>

        <div className="shrink-0 max-[1360px]:hidden">
          <ControlSegmentado
            grupo="tema"
            valor={tema}
            onCambiar={onTema}
            opciones={[
              { id: 'system', titulo: t('barra.temaAuto'), icono: <IconoAuto /> },
              { id: 'light', titulo: t('barra.temaClaro'), icono: <IconoSol /> },
              { id: 'dark', titulo: t('barra.temaOscuro'), icono: <IconoLuna /> },
            ]}
          />
        </div>

        {/* En una biblioteca compartida (solo lectura) no se agrega ni se cambia nada */}
        {!soloLectura && (
          <>
            <BotonBarra onClick={onAgregarLibros} title={t('barra.agregar')}>
              <IconoMas />
            </BotonBarra>
            <BotonBarra onClick={onDuplicados} title={t('barra.duplicados')}>
              <IconoDuplicados />
            </BotonBarra>
            <BotonBarra onClick={onCompartir} title={t('barra.familia')}>
              <IconoCompartir />
            </BotonBarra>
            <BotonBarra onClick={onKindle} title={t('barra.kindle')}>
              <IconoKindle />
            </BotonBarra>
          </>
        )}
        <BotonBarra onClick={onRecargar} title={t('barra.recargar')}>
          <IconoRecargar className={`size-4 ${cargando ? 'animate-spin' : ''}`} />
        </BotonBarra>
        <BotonBarra onClick={onAyuda} title={t('barra.ayuda')}>
          <IconoAyuda />
        </BotonBarra>
        <BotonBarra onClick={onConfiguracion} title={t('comun.configuracion')}>
          <IconoEngranaje />
        </BotonBarra>
      </div>
    </header>
  );
});
