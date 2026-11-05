// Barra lateral estilo macOS: bibliotecas arriba y filtros abajo.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { arbolDeEtiquetas, normalizar, ramasDeEtiqueta, resorte, resorteRapido, resorteSuave, t } from '../lib/index.js';
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

function FilaValor({ valor, nombre, cantidad, marcado, onAlternar }) {
  return (
    <motion.button
      type="button"
      data-filtro={valor}
      onClick={onAlternar}
      whileTap={{ scale: 0.98 }}
      transition={resorteRapido}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-[5px] text-left text-[0.8rem] transition-colors ${
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
      <span className="min-w-0 flex-1 truncate" title={nombre}>{nombre}</span>
      <span className="text-[0.7rem] text-tinta-tenue tabular-nums">{cantidad}</span>
    </motion.button>
  );
}

/**
 * 1.10: una etiqueta con sus subetiquetas. El triangulito pliega la rama; marcarla incluye todo lo que cuelga de ella.
 * Con un filtro escrito se ve abierta entera.
 */
function NodoArbol({ nodo, grupo, seleccion, onAlternar, abiertos, onPlegar, forzarAbierto, conTriangulos }) {
  const abierto = forzarAbierto || abiertos.has(nodo.valor);
  return (
    <div data-rama={nodo.valor}>
      <div className="flex items-center" style={{ paddingLeft: `${nodo.nivel * 12}px` }}>
        {nodo.hijos.length > 0 ? (
          <button
            type="button"
            onClick={() => onPlegar(nodo.valor)}
            aria-expanded={abierto}
            title={t(abierto ? 'lateral.plegar' : 'lateral.desplegar')}
            data-plegar={nodo.valor}
            className="grid size-5 shrink-0 place-items-center rounded text-tinta-tenue hover:text-tinta"
          >
            <motion.span animate={{ rotate: abierto ? 0 : -90 }} transition={resorteRapido} className="grid place-items-center">
              <IconoFlecha className="size-3.5" />
            </motion.span>
          </button>
        ) : (
          conTriangulos && <span className="w-5 shrink-0" />
        )}
        <FilaValor valor={nodo.valor} nombre={nodo.nombre} cantidad={nodo.cantidad} marcado={seleccion?.has(nodo.valor)} onAlternar={() => onAlternar(grupo.id, nodo.valor)} />
      </div>
      {nodo.hijos.length > 0 && (
        <Desplegable abierto={abierto}>
          {nodo.hijos.map((h) => (
            <NodoArbol key={h.valor} nodo={h} grupo={grupo} seleccion={seleccion} onAlternar={onAlternar} abiertos={abiertos} onPlegar={onPlegar} forzarAbierto={forzarAbierto} conTriangulos={conTriangulos} />
          ))}
        </Desplegable>
      )}
    </div>
  );
}

function Grupo({ grupo, conteos, seleccion, onAlternar, total }) {
  const [abierto, setAbierto] = useState(!grupo.plegado);
  const [verTodos, setVerTodos] = useState(false);
  const [filtro, setFiltro] = useState('');

  const [abiertos, setAbiertos] = useState(() => new Set());

  const disponibles = conteos.filter((c) => c.cantidad > 0 || seleccion?.has(c.valor));
  const coincide = (c) => normalizar(grupo.etiqueta(c.valor)).includes(normalizar(filtro));
  // En el árbol, una etiqueta encontrada se muestra con las ramas de las que cuelga.
  const conRamas = useMemo(() => {
    if (!grupo.arbol) return null;
    const lista = filtro ? disponibles.filter(coincide) : disponibles;
    const quedan = new Set(lista.flatMap((c) => ramasDeEtiqueta(c.valor)));
    return arbolDeEtiquetas(disponibles.filter((c) => quedan.has(c.valor)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteos, seleccion, filtro, grupo.arbol]);
  const items = conRamas ?? (filtro ? disponibles.filter(coincide) : disponibles);
  const mostrados = verTodos || filtro ? items : items.slice(0, VISIBLES);
  const conTriangulos = conRamas?.some((n) => n.hijos.length > 0);

  // Una subetiqueta elegida (por ejemplo, desde el panel de un libro) no queda escondida en una rama plegada.
  useEffect(() => {
    if (!grupo.arbol || !seleccion?.size) return;
    setAbiertos((a) => new Set([...a, ...[...seleccion].flatMap((v) => ramasDeEtiqueta(v).slice(0, -1))]));
  }, [seleccion, grupo.arbol]);
  const plegar = (valor) =>
    setAbiertos((a) => {
      const nuevo = new Set(a);
      if (!nuevo.delete(valor)) nuevo.add(valor);
      return nuevo;
    });

  if (!disponibles.length) return null;
  // 1.10: si todos los libros caen en la misma opción, el grupo no sirve para filtrar: no se muestra.
  if (disponibles.length === 1 && disponibles[0].cantidad >= total && !seleccion?.size) return null;

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
          {conRamas
            ? mostrados.map((nodo) => (
                <NodoArbol key={nodo.valor} nodo={nodo} grupo={grupo} seleccion={seleccion} onAlternar={onAlternar} abiertos={abiertos} onPlegar={plegar} forzarAbierto={Boolean(filtro)} conTriangulos={conTriangulos} />
              ))
            : mostrados.map(({ valor, cantidad }) => (
                <div key={valor} className="flex">
                  <FilaValor valor={valor} nombre={grupo.etiqueta(valor)} cantidad={cantidad} marcado={seleccion?.has(valor)} onAlternar={() => onAlternar(grupo.id, valor)} />
                </div>
              ))}
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
  hayFiltros, onLimpiar, total,
}) {
  return (
    <aside data-tour="lateral" className="flex w-60 shrink-0 flex-col overflow-y-auto px-2 pb-4">
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
        <Grupo key={g.id} grupo={g} conteos={conteos[g.id] ?? []} seleccion={filtros[g.id]} onAlternar={onAlternar} total={total} />
      ))}
    </aside>
  );
}
