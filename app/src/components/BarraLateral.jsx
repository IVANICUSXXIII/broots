// Barra lateral estilo macOS: bibliotecas arriba y filtros abajo.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { normalizar, resorte, resorteRapido, resorteSuave, t } from '../lib/index.js';
import { IconoColeccion, IconoFlecha, IconoLibros } from './Iconos.jsx';
import { Interruptor } from './Piezas.jsx';

const VISIBLES = 8;

function TituloSeccion({ children, abierto, onAlternar, extra }) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      className="group flex w-full items-center gap-1 px-2 pt-1 pb-1.5 text-left text-[0.7rem] font-semibold tracking-wide text-tinta-tenue"
    >
      <span className="flex-1">
        {children}
        {extra}
      </span>
      {onAlternar && (
        <motion.span animate={{ rotate: abierto ? 0 : -90 }} transition={resorteRapido} className="opacity-0 transition-opacity group-hover:opacity-100">
          <IconoFlecha className="size-3.5" />
        </motion.span>
      )}
    </button>
  );
}

/** Contenido que se despliega y repliega con resorte (como las secciones de Finder). */
function Desplegable({ abierto, children }) {
  return (
    <AnimatePresence initial={false}>
      {abierto && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={resorteSuave}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Bibliotecas({ opciones, activa, onElegir }) {
  return (
    <nav className="space-y-px">
      {opciones.map(({ id, nombre, cantidad, expresion }) => {
        const elegida = activa === id;
        const Icono = id ? IconoColeccion : IconoLibros;
        return (
          <button
            type="button"
            key={id || '__todos'}
            onClick={() => onElegir(id)}
            title={expresion ? t('lateral.virtual', { expresion }) : undefined}
            className={`relative flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left text-[0.84rem] transition-colors ${
              elegida ? 'font-medium text-tinta' : 'text-tinta-suave hover:bg-superficie-2/70'
            }`}
          >
            {elegida && <motion.span layoutId="biblioteca-elegida" transition={resorte} className="absolute inset-0 rounded-lg bg-seleccion" />}
            <Icono className={`relative size-4 ${elegida ? 'text-verde' : 'text-tinta-tenue'}`} />
            <span className="relative flex-1 truncate">{nombre}</span>
            <span className="relative text-xs text-tinta-tenue tabular-nums">{cantidad}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Grupo({ grupo, conteos, seleccion, onAlternar }) {
  const [abierto, setAbierto] = useState(!grupo.plegado);
  const [verTodos, setVerTodos] = useState(false);
  const [filtro, setFiltro] = useState('');

  const disponibles = conteos.filter((c) => c.cantidad > 0 || seleccion?.has(c.valor));
  const items = filtro ? disponibles.filter((c) => normalizar(grupo.etiqueta(c.valor)).includes(normalizar(filtro))) : disponibles;
  if (!disponibles.length) return null;
  const mostrados = verTodos || filtro ? items : items.slice(0, VISIBLES);

  return (
    <section className="pt-3">
      <TituloSeccion
        abierto={abierto}
        onAlternar={() => setAbierto(!abierto)}
        extra={seleccion?.size ? <span className="ml-1.5 text-acento">· {seleccion.size}</span> : null}
      >
        {grupo.titulo}
      </TituloSeccion>
      <Desplegable abierto={abierto}>
        <div className="space-y-px pb-1">
          {grupo.buscable && disponibles.length > VISIBLES && (
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder={t('lateral.filtrar', { que: grupo.titulo.toLowerCase() })}
              className="mb-1 h-7 w-full rounded-md bg-superficie-2 px-2.5 text-xs outline-none placeholder:text-tinta-tenue focus:ring-2 focus:ring-acento/40"
            />
          )}
          {mostrados.map(({ valor, cantidad }) => {
            const marcado = seleccion?.has(valor);
            return (
              <motion.button
                type="button"
                key={valor}
                onClick={() => onAlternar(grupo.id, valor)}
                whileTap={{ scale: 0.98 }}
                transition={resorteRapido}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-[5px] text-left text-[0.8rem] transition-colors ${
                  marcado ? 'bg-acento-suave font-medium text-acento' : 'text-tinta hover:bg-superficie-2/70'
                }`}
              >
                <span
                  className={`grid size-[14px] shrink-0 place-items-center rounded-[4px] text-[0.55rem] text-sobre-acento transition-colors ${
                    marcado ? 'bg-acento' : 'shadow-[inset_0_0_0_1.5px_var(--tinta-tenue)]'
                  }`}
                >
                  {marcado ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 truncate">{grupo.etiqueta(valor)}</span>
                <span className="text-[0.7rem] text-tinta-tenue tabular-nums">{cantidad}</span>
              </motion.button>
            );
          })}
          {!filtro && items.length > VISIBLES && (
            <button type="button" onClick={() => setVerTodos(!verTodos)} className="px-2 pt-1 text-xs font-medium text-acento hover:underline">
              {verTodos ? t('lateral.verMenos') : t('lateral.verTodos', { n: items.length })}
            </button>
          )}
        </div>
      </Desplegable>
    </section>
  );
}

function FiltroValoracion({ minimo, onMinimo, soloPropias, onSoloPropias, titulo }) {
  return (
    <section className="pt-3">
      <TituloSeccion>{titulo}</TituloSeccion>
      <div className="flex items-center gap-0.5 px-2 pb-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            type="button"
            key={n}
            onClick={() => onMinimo(minimo === n ? 0 : n)}
            title={t('lateral.estrellasOMas', { n })}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            transition={resorteRapido}
            className={`text-lg leading-none transition-colors ${n <= minimo ? 'text-estrella' : 'text-tinta-tenue/40 hover:text-estrella/60'}`}
          >
            ★
          </motion.button>
        ))}
        {minimo > 0 && <span className="ml-2 text-xs text-tinta-suave">{t('lateral.oMas')}</span>}
      </div>
      <Interruptor activo={soloPropias} onCambiar={onSoloPropias} etiqueta={t('lateral.soloMias')} />
    </section>
  );
}

export function BarraLateral({
  bibliotecas, bibliotecaActiva, onBiblioteca,
  grupos, conteos, filtros, onAlternar,
  minEstrellas, onMinEstrellas, soloPropias, onSoloPropias, tituloValoracion,
  hayFiltros, onLimpiar,
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto px-2 pb-4">
      <TituloSeccion>{t('lateral.bibliotecas')}</TituloSeccion>
      <Bibliotecas opciones={bibliotecas} activa={bibliotecaActiva} onElegir={onBiblioteca} />

      <div className="mt-5 flex items-center justify-between px-2">
        <span className="text-[0.7rem] font-semibold tracking-wide text-tinta-tenue">{t('lateral.filtros')}</span>
        <AnimatePresence>
          {hayFiltros && (
            <motion.button
              type="button"
              onClick={onLimpiar}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={resorteRapido}
              className="text-xs font-medium text-acento hover:underline"
            >
              {t('lateral.limpiar')}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <FiltroValoracion minimo={minEstrellas} onMinimo={onMinEstrellas} soloPropias={soloPropias} onSoloPropias={onSoloPropias} titulo={tituloValoracion} />
      {grupos.map((g) => (
        <Grupo key={g.id} grupo={g} conteos={conteos[g.id] ?? []} seleccion={filtros[g.id]} onAlternar={onAlternar} />
      ))}
    </aside>
  );
}
