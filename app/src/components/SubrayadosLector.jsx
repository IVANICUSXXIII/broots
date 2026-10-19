// 1.8 «Subrayados y notas» dentro del lector.
//
// useSubrayados() trae los subrayados del libro (los de Broots y los del Kindle, en una sola lista), los pinta en
// el capítulo abierto y maneja la barrita que aparece al seleccionar texto: cuatro colores, Nota, Copiar y, si ya
// estaba subrayado, Borrar. El lector le avisa cuando cambia lo que se ve (capítulo nuevo, llega una traducción,
// «ver el original») para que vuelva a pintar. Los subrayados se anclan en el texto (ver lib/subrayados.js), nunca
// en la página: así aparecen igual con cualquier letra o tamaño de ventana.
//
// Lo que se ve: BarraSubrayado (la barrita), NotaSubrayado (el papelito para escribir la nota) y PanelSubrayados
// (la lista de la derecha, para saltar a cada uno). Se cierran con Esc o con un clic afuera, sin pasar de página.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fechaCorta, idiomaActual, resorte, resortePresion, resorteRapido, t } from '../lib/index.js';
import { COLORES, anclaDeSeleccion, buscarEnParrafos, despintar, envolver, indiceNormalizado, normalizar, ordenar, textoDeAncla } from '../lib/subrayados.js';
import { IconoBorrar, IconoCerrar, IconoCopiar, IconoEditar, IconoSubrayar } from './Iconos.jsx';

const LARGO_MAXIMO = 8000; // caracteres: más que eso ya no es un subrayado, es medio capítulo

const preferencia = (clave, defecto) => {
  try {
    const v = localStorage.getItem(clave);
    return v == null ? defecto : JSON.parse(v);
  } catch {
    return defecto;
  }
};
const recordar = (clave, valor) => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {}
};
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Lo que guarda la lista de cada subrayado de Broots (los del Kindle ya llegan así desde anotaciones.cjs). */
const comoEntrada = (registro) => ({ ...registro, origen: 'broots', tipo: 'subrayado', fecha: registro.creado, titulo: registro.tituloCapitulo || null });

/** Color de la rayita de cada subrayado en las listas. */
export const colorDeLinea = (e) => (e.origen === 'kindle' ? 'var(--linea-kindle)' : `var(--linea-${e.color ?? 'amarillo'})`);

/**
 * El lector le pasa su estado de párrafos (r: parrafos, textosOriginales, traducidos, viendoOriginal…), el texto y
 * el marco (para ubicar la barrita) y avisar(texto, tipo, accion) para los cartelitos.
 */
export function useSubrayados({ libro, r, texto, marco, abierto, avisar }) {
  const [entradas, setEntradas] = useState([]); // la lista única del libro, en orden de lectura
  const [md, setMd] = useState(false); // ¿se guarda el .md en la carpeta del libro?
  const [barra, setBarra] = useState(null); // { modo: 'nuevo' | 'editar' | 'kindle', ancla?, id?, caja }
  const [nota, setNota] = useState(null); // { id, texto, caja }
  const [panelAbierto, setPanelAbierto] = useState(false);
  const lista = useRef([]); // lo mismo que entradas, para pintar sin esperar a React
  const estado = useRef({});
  estado.current = { barra, nota, panelAbierto };
  const contexto = useRef({ titulo: null }); // el lector deja acá el título del capítulo que se ve
  const refAvisar = useRef(avisar);
  refAvisar.current = avisar;

  const ponerLista = (nueva) => {
    lista.current = nueva;
    setEntradas(nueva);
  };

  // ---------- Pintar ----------

  /** ¿El párrafo se ve en su idioma original o traducido? */
  const versionDe = (k) => (r.traducir && r.traducidos.has(k) && !r.viendoOriginal.has(k) ? 'traduccion' : 'original');

  const anclaDe = (e, lugar = e) => ({
    parrafo: lugar.parrafo, inicio: lugar.inicio, parrafoFin: lugar.parrafoFin, fin: lugar.fin,
    version: e.origen === 'kindle' ? 'original' : e.version, idioma: e.idioma, color: e.color, nota: e.nota, origen: e.origen, texto: e.texto,
  });

  /**
   * Dónde cae cada subrayado de este capítulo. Los de Broots en el original se comprueban contra el texto (si el
   * EPUB cambió, se los busca); los del Kindle se buscan por su texto; los hechos sobre la traducción se comprueban
   * al pintar. Lo que no aparece no se pinta (sigue en la lista).
   */
  const ubicarCapitulo = () => {
    r.anclas = new Map();
    const textos = r.textosOriginales ?? [];
    let indice = null;
    const buscar = (aguja, cerca) => buscarEnParrafos((indice ??= indiceNormalizado(textos)), aguja, cerca);
    for (const e of lista.current) {
      if (e.href !== r.href || e.tipo === 'nota') continue;
      let lugar = null;
      if (e.origen === 'kindle') lugar = buscar(e.texto, Math.round((e.orden ?? 0) * textos.length));
      else if (e.version === 'traduccion') lugar = e;
      else {
        const sigue = e.parrafoFin < textos.length && normalizar(textoDeAncla(textos, e)).trim() === normalizar(e.texto).trim();
        lugar = sigue ? e : buscar(e.texto, e.parrafo);
      }
      if (lugar) r.anclas.set(e.id, anclaDe(e, lugar));
    }
  };

  const clasesDe = (a) => ['subrayado', a.origen === 'kindle' ? 'kindle' : a.color, a.nota ? 'con-nota' : ''].filter(Boolean).join(' ');

  /** Pinta un párrafo con lo que le toca: exacto si se ve en la versión subrayada; si no, una línea bajo el párrafo. */
  const pintarParrafo = (k) => {
    const p = r.parrafos[k];
    if (!p || !r.anclas) return;
    despintar(p);
    const version = versionDe(k);
    const visto = p.textContent;
    const tramos = [];
    let otro = null;
    for (const [id, a] of r.anclas) {
      if (k < a.parrafo || k > a.parrafoFin) continue;
      const desde = k === a.parrafo ? a.inicio : 0;
      const hasta = Math.min(visto.length, k === a.parrafoFin ? a.fin : visto.length);
      let igual = a.version === version && (version === 'original' || a.idioma === idiomaActual());
      // La traducción pudo cambiar (otra vuelta de Gemini): se confirma que el texto subrayado siga ahí.
      if (igual && version === 'traduccion') igual = normalizar(visto.slice(desde, hasta)).trim() === normalizar(a.texto.split('\n')[k - a.parrafo] ?? '').trim();
      if (!igual) otro ??= a;
      else if (hasta > desde) tramos.push({ id, desde, hasta, a });
    }
    for (const tramo of tramos.sort((x, y) => x.desde - y.desde)) envolver(p, tramo.desde, tramo.hasta, { id: tramo.id, clases: clasesDe(tramo.a) });
    if (otro) {
      p.classList.add('subrayado-otro');
      p.dataset.colorOtro = otro.origen === 'kindle' ? 'kindle' : otro.color;
    }
  };

  const pintarCapitulo = () => {
    ubicarCapitulo();
    r.parrafos.forEach((_, k) => pintarParrafo(k));
  };

  const repintar = (a) => {
    if (a) for (let k = a.parrafo; k <= a.parrafoFin; k++) pintarParrafo(k);
  };

  /** Pone (o cambia) un subrayado en la lista y en la página. */
  const aplicar = (entrada) => {
    const previo = r.anclas?.get(entrada.id);
    ponerLista(ordenar([...lista.current.filter((e) => e.id !== entrada.id), entrada]));
    if (entrada.href !== r.href || !r.anclas) return;
    r.anclas.set(entrada.id, anclaDe(entrada, previo ?? entrada));
    repintar(previo);
    repintar(r.anclas.get(entrada.id));
  };
  const quitar = (id) => {
    const previo = r.anclas?.get(id);
    ponerLista(lista.current.filter((e) => e.id !== id));
    if (!previo) return;
    r.anclas.delete(id);
    repintar(previo);
  };

  // ---------- Cargar ----------

  const cargar = useCallback(async () => {
    try {
      const res = await window.subrayados.delLibro(libro.id, { ubicar: true });
      if (!res?.ok) return;
      ponerLista(res.entradas);
      setMd(Boolean(res.md));
      if (r.parrafos?.length) pintarCapitulo();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro.id]);
  useEffect(() => {
    if (abierto) cargar();
  }, [abierto, cargar]);

  // ---------- Seleccionar y tocar ----------

  const cajaDe = (rect) => {
    const m = marco.current.getBoundingClientRect();
    return { x: rect.left - m.left, y: rect.top - m.top, ancho: rect.width, alto: rect.height, anchoMarco: m.width, altoMarco: m.height };
  };

  /** Al soltar el mouse después de seleccionar: aparece la barrita arriba de la selección. */
  const alSoltar = () => {
    setTimeout(() => {
      const seleccion = window.getSelection();
      if (!seleccion || seleccion.isCollapsed || !texto.current?.contains(seleccion.anchorNode)) return;
      const ancla = anclaDeSeleccion(seleccion, r.parrafos);
      if (!ancla) return;
      if (ancla.texto.length > LARGO_MAXIMO) return refAvisar.current(t('subrayados.lector.muyLargo'), 'errorSubrayado');
      const rango = seleccion.getRangeAt(0);
      const rect = [...rango.getClientRects()].find((c) => c.width > 0) ?? rango.getBoundingClientRect();
      setNota(null);
      setBarra({ modo: 'nuevo', ancla: { ...ancla, version: versionDe(ancla.parrafo) }, caja: cajaDe(rect) });
    }, 0);
  };

  /** Clic en un subrayado: la barrita para cambiarle el color, anotarlo o borrarlo. Devuelve true si era uno. */
  const alTocar = (e) => {
    const marca = e.target.closest?.('mark[data-subrayado]');
    const entrada = marca && lista.current.find((x) => x.id === marca.dataset.subrayado);
    if (!entrada) return false;
    setNota(null);
    setBarra({ modo: entrada.origen === 'kindle' ? 'kindle' : 'editar', id: entrada.id, caja: cajaDe(marca.getBoundingClientRect()) });
    return true;
  };

  // ---------- Crear, cambiar y borrar ----------

  /** En qué parte del capítulo está (0 al principio, 1 al final): para ordenarlo junto con los del Kindle. */
  const ordenDe = (ancla) => {
    const largos = (r.textosOriginales ?? []).map((x) => normalizar(x).length + 1);
    const total = largos.reduce((s, n) => s + n, 0) || 1;
    const antes = largos.slice(0, ancla.parrafo).reduce((s, n) => s + n, 0);
    const dentro = ancla.version === 'original' ? normalizar((r.textosOriginales[ancla.parrafo] ?? '').slice(0, ancla.inicio)).length : 0;
    return Math.min(1, (antes + dentro) / total);
  };

  const nuevoRegistro = (ancla, color) => {
    const vistos = r.parrafos.map((p) => p.textContent);
    return {
      id: nuevoId(),
      href: r.href,
      capitulo: r.cap,
      tituloCapitulo: contexto.current.titulo ?? '',
      parrafo: ancla.parrafo,
      inicio: ancla.inicio,
      parrafoFin: ancla.parrafoFin,
      fin: ancla.fin,
      version: ancla.version,
      idioma: ancla.version === 'traduccion' ? idiomaActual() : null,
      texto: ancla.texto,
      antes: vistos[ancla.parrafo].slice(Math.max(0, ancla.inicio - 40), ancla.inicio),
      despues: vistos[ancla.parrafoFin].slice(ancla.fin, ancla.fin + 40),
      orden: ordenDe(ancla),
      color,
      nota: '',
      creado: new Date().toISOString(),
    };
  };

  const guardar = async (registro) => {
    try {
      const res = await window.subrayados.guardar(libro.id, registro);
      if (res?.ok) return res.registro;
      refAvisar.current(res?.mensaje ?? t('subrayados.lector.noPudeGuardar'), 'errorSubrayado');
    } catch {
      refAvisar.current(t('subrayados.lector.noPudeGuardar'), 'errorSubrayado');
    }
    return null;
  };

  const abrirNotaDe = (id, caja) => {
    const e = lista.current.find((x) => x.id === id);
    if (!e) return;
    const marca = texto.current?.querySelector(`mark[data-subrayado="${CSS.escape(id)}"]`);
    setBarra(null);
    setNota({ id, texto: e.nota ?? '', caja: marca ? cajaDe(marca.getBoundingClientRect()) : caja });
  };

  const crear = async (color, conNota = false) => {
    const actual = estado.current.barra;
    if (actual?.modo !== 'nuevo') return;
    const registro = nuevoRegistro(actual.ancla, color);
    recordar('broots-subrayado-color', color);
    window.getSelection()?.removeAllRanges();
    setBarra(null);
    aplicar(comoEntrada(registro));
    if (conNota) abrirNotaDe(registro.id, actual.caja);
    const guardado = await guardar(registro);
    if (!guardado) {
      quitar(registro.id);
      setNota((n) => (n?.id === registro.id ? null : n));
    }
  };

  const cambiarColor = async (id, color) => {
    const e = lista.current.find((x) => x.id === id);
    setBarra(null);
    if (!e || e.color === color) return;
    recordar('broots-subrayado-color', color);
    aplicar({ ...e, color });
    if (!(await guardar({ ...e, color }))) aplicar(e);
  };

  const abrirNota = () => {
    const b = estado.current.barra;
    if (b?.modo === 'nuevo') return crear(preferencia('broots-subrayado-color', COLORES[0]), true);
    if (b?.id) abrirNotaDe(b.id, b.caja);
  };

  /** Guarda lo escrito y cierra (lo usan el botón, Ctrl+Enter, Esc y el clic afuera: lo escrito nunca se pierde). */
  const guardarNota = async () => {
    const n = estado.current.nota;
    setNota(null);
    const e = lista.current.find((x) => x.id === n?.id);
    const limpia = String(n?.texto ?? '').trim();
    if (!e || (e.nota ?? '') === limpia) return;
    aplicar({ ...e, nota: limpia });
    if (!(await guardar({ ...e, nota: limpia }))) aplicar(e);
  };

  const borrar = async (id) => {
    const e = lista.current.find((x) => x.id === id);
    setBarra(null);
    if (!e) return;
    quitar(id);
    const res = await window.subrayados.borrar(libro.id, id).catch(() => null);
    if (!res?.ok) {
      aplicar(e);
      return refAvisar.current(t('subrayados.lector.noPudeBorrar'), 'errorSubrayado');
    }
    refAvisar.current(e.nota ? t('subrayados.lector.borradoConNota') : t('subrayados.lector.borrado'), 'subrayado', {
      texto: t('subrayados.lector.deshacer'),
      alTocar: async () => {
        aplicar(e);
        if (!(await guardar(e))) quitar(id);
      },
    });
  };

  const copiar = async () => {
    const b = estado.current.barra;
    const copiado = b?.modo === 'nuevo' ? b.ancla.texto : lista.current.find((x) => x.id === b?.id)?.texto;
    window.getSelection()?.removeAllRanges();
    setBarra(null);
    if (!copiado) return;
    await window.club.copiar(copiado);
    refAvisar.current(t('subrayados.lector.copiado'), 'subrayado');
  };

  const cerrarBarra = () => {
    if (estado.current.barra?.modo === 'nuevo') window.getSelection()?.removeAllRanges();
    setBarra(null);
  };

  /** Esc: cierra la nota (guardándola), la barrita o la lista, en ese orden. Devuelve true si cerró algo. */
  const cerrarAlgo = () => {
    if (estado.current.nota) guardarNota();
    else if (estado.current.barra) cerrarBarra();
    else if (estado.current.panelAbierto) setPanelAbierto(false);
    else return false;
    return true;
  };

  /** Recién llegado desde la lista: un anillo un momento, para encontrarlo en la página. */
  const destacar = (id) => {
    const marcas = [...(texto.current?.querySelectorAll(`mark[data-subrayado="${CSS.escape(id)}"]`) ?? [])];
    marcas.forEach((m) => m.classList.add('destacado'));
    setTimeout(() => marcas.forEach((m) => m.classList.remove('destacado')), 1600);
  };

  return {
    entradas, md, barra, nota, panelAbierto, setPanelAbierto, contexto,
    alAbrirCapitulo: pintarCapitulo, alCambiarParrafo: pintarParrafo,
    alSoltar, alTocar, crear, cambiarColor, abrirNota, guardarNota, borrar, copiar, cerrarBarra, cerrarAlgo, destacar,
    escribiendo: () => Boolean(estado.current.nota), // con la nota abierta, las flechas no pasan de página
    escribirNota: (escrita) => setNota((n) => (n ? { ...n, texto: escrita } : n)),
    descartarNota: () => setNota(null),
  };
}

// ---------- La barrita ----------

const ANCHO_BARRA = 300;

function BotonBarrita({ children, ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94, transition: resortePresion }}
      className="inline-flex h-7 items-center gap-1 rounded-[8px] px-2 font-medium text-tinta-suave transition-colors hover:bg-superficie-2 hover:text-tinta"
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Arriba de la selección (o abajo, si no entra), sin salirse del marco del lector. */
function posicion(caja) {
  const centro = Math.min(Math.max(caja.x + caja.ancho / 2, ANCHO_BARRA / 2 + 8), caja.anchoMarco - ANCHO_BARRA / 2 - 8);
  return { left: centro, top: caja.y > 54 ? caja.y - 46 : caja.y + caja.alto + 8 };
}

export function BarraSubrayado({ sub }) {
  const { barra } = sub;
  const entrada = barra?.id ? sub.entradas.find((e) => e.id === barra.id) : null;
  return (
    <AnimatePresence>
      {barra && (
        <motion.div
          key={`${barra.modo}-${barra.id ?? 'nuevo'}`}
          data-barra-subrayado={barra.modo}
          initial={{ opacity: 0, transform: 'translate(-50%, 6px) scale(0.96)' }}
          animate={{ opacity: 1, transform: 'translate(-50%, 0px) scale(1)' }}
          exit={{ opacity: 0, transform: 'translate(-50%, 4px) scale(0.97)', transition: { duration: 0.12 } }}
          transition={resorteRapido}
          style={posicion(barra.caja)}
          // Que tocar un botón no borre la selección antes de tiempo.
          onMouseDown={(e) => e.preventDefault()}
          className="squircle absolute z-30 flex h-10 items-center gap-0.5 rounded-[13px] bg-superficie px-1.5 text-[0.74rem] whitespace-nowrap shadow-flotante"
        >
          {barra.modo === 'kindle' ? (
            <span className="px-2 text-tinta-tenue">{t('subrayados.lector.delKindle')}</span>
          ) : (
            COLORES.map((color) => (
              <motion.button
                type="button"
                key={color}
                data-color={color}
                whileTap={{ scale: 0.85, transition: resortePresion }}
                onClick={() => (barra.modo === 'nuevo' ? sub.crear(color) : sub.cambiarColor(barra.id, color))}
                title={t(`subrayados.colores.${color}`)}
                className="grid size-7 place-items-center rounded-full hover:bg-superficie-2"
              >
                <span
                  className={`block size-[18px] rounded-full ${entrada?.color === color ? 'shadow-[0_0_0_2px_var(--superficie),0_0_0_3.5px_var(--tinta-suave)]' : 'shadow-[inset_0_0_0_1px_rgb(var(--sombra)/0.18)]'}`}
                  style={{ background: `var(--subrayado-${color})` }}
                />
              </motion.button>
            ))
          )}
          <span className="mx-1 h-4 w-px bg-borde" />
          {barra.modo !== 'kindle' && (
            <BotonBarrita data-accion="nota" onClick={sub.abrirNota}>
              <IconoEditar className="size-3.5" /> {entrada?.nota ? t('subrayados.lector.verNota') : t('subrayados.lector.nota')}
            </BotonBarrita>
          )}
          <BotonBarrita data-accion="copiar" onClick={sub.copiar}>
            <IconoCopiar className="size-3.5" /> {t('subrayados.lector.copiar')}
          </BotonBarrita>
          {barra.modo === 'editar' && (
            <BotonBarrita data-accion="borrar" onClick={() => sub.borrar(barra.id)} title={t('subrayados.lector.borrar')}>
              <IconoBorrar className="size-3.5" />
            </BotonBarrita>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- La nota ----------

export function NotaSubrayado({ sub }) {
  const { nota } = sub;
  const entrada = nota ? sub.entradas.find((e) => e.id === nota.id) : null;
  // Debajo del subrayado si entra; si no, arriba.
  const lugar = nota
    ? {
        left: Math.min(Math.max(nota.caja.x + nota.caja.ancho / 2, 168), nota.caja.anchoMarco - 168),
        ...(nota.caja.y + nota.caja.alto + 230 < nota.caja.altoMarco ? { top: nota.caja.y + nota.caja.alto + 10 } : { bottom: nota.caja.altoMarco - nota.caja.y + 10 }),
      }
    : null;
  return (
    <AnimatePresence>
      {nota && entrada && (
        <motion.div
          key={`nota-${nota.id}`}
          data-nota-subrayado={nota.id}
          initial={{ opacity: 0, transform: 'translate(-50%, 8px) scale(0.97)' }}
          animate={{ opacity: 1, transform: 'translate(-50%, 0px) scale(1)' }}
          exit={{ opacity: 0, transform: 'translate(-50%, 6px) scale(0.98)', transition: { duration: 0.12 } }}
          transition={resorte}
          style={lugar}
          className="squircle absolute z-30 w-80 rounded-[16px] bg-superficie p-3 shadow-flotante"
        >
          <p className="mb-2 line-clamp-2 border-l-[3px] pl-2 font-serif text-[0.78rem] text-tinta-suave italic" style={{ borderColor: colorDeLinea(entrada) }}>
            {entrada.texto}
          </p>
          <textarea
            autoFocus
            rows={4}
            value={nota.texto}
            onChange={(e) => sub.escribirNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                sub.guardarNota();
              }
            }}
            placeholder={t('subrayados.lector.notaEjemplo')}
            className="squircle block w-full resize-none rounded-[10px] bg-superficie-2 px-2.5 py-2 text-[0.8rem] leading-relaxed text-tinta shadow-[inset_0_0_0_1px_var(--borde)] outline-none focus:shadow-[inset_0_0_0_1px_var(--acento)]"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[0.66rem] text-tinta-tenue">{t('subrayados.lector.ctrlEnter')}</span>
            <button type="button" onClick={sub.descartarNota} className="h-7 rounded-full px-3 text-[0.74rem] font-medium text-tinta-suave hover:bg-superficie-2 hover:text-tinta">
              {t('comun.cancelar')}
            </button>
            <button type="button" data-guardar-nota onClick={sub.guardarNota} className="h-7 rounded-full bg-verde px-3 text-[0.74rem] font-medium text-superficie hover:brightness-110">
              {t('comun.guardar')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- El .md ----------

/** «Mostrar el .md» (si se guarda en la carpeta del libro) y «Guardar una copia…». alResultado(texto, error). */
export function AccionesMd({ libroId, md, alResultado, className = '' }) {
  const [ocupado, setOcupado] = useState(false);
  const hacer = async (accion) => {
    setOcupado(true);
    try {
      const r = await (accion === 'mostrar' ? window.subrayados.mostrarMd(libroId) : window.subrayados.guardarCopia(libroId));
      if (r?.cancelado) return;
      if (r?.ok) alResultado?.(t(accion === 'mostrar' ? 'subrayados.mdMostrado' : 'subrayados.copiaGuardada', { nombre: r.nombre }));
      else alResultado?.(r?.mensaje ?? t('subrayados.noPudeMd'), true);
    } finally {
      setOcupado(false);
    }
  };
  const enlace = 'font-medium text-acento hover:underline disabled:opacity-50';
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {md && (
        <button type="button" data-mostrar-md disabled={ocupado} className={enlace} onClick={() => hacer('mostrar')} title={t('subrayados.mostrarMdExplica')}>
          {t('subrayados.mostrarMd')}
        </button>
      )}
      <button type="button" data-copia-md disabled={ocupado} className={enlace} onClick={() => hacer('copia')} title={t('subrayados.guardarCopiaExplica')}>
        {t('subrayados.guardarCopia')}
      </button>
    </div>
  );
}

// ---------- La lista de la derecha ----------

/** Agrupa por capítulo (los del Kindle que no se ubicaron, al final): [{ titulo, entradas }]. */
export function porCapitulo(entradas) {
  const grupos = [];
  for (const e of entradas) {
    const titulo = e.capitulo == null ? t('subrayados.delKindleSinCapitulo') : e.titulo || t('subrayados.seccion', { n: e.capitulo + 1 });
    if (grupos.at(-1)?.titulo !== titulo) grupos.push({ titulo, entradas: [] });
    grupos.at(-1).entradas.push(e);
  }
  return grupos;
}

/** Debajo de cada subrayado: de dónde sale. */
export function lugarDe(e) {
  const partes =
    e.origen === 'kindle'
      ? ['Kindle', e.pagina && t('detalle.pagina', { n: e.pagina[0] }), e.ubicacion && t('detalle.posicion', { n: e.ubicacion[0] }), e.fecha && fechaCorta(e.fecha)]
      : ['Broots', e.version === 'traduccion' && t('subrayados.enLaTraduccion'), fechaCorta(e.fecha)];
  return partes.filter(Boolean).join(' · ');
}

export function PanelSubrayados({ sub, libroId, onIr, alResultado }) {
  const grupos = porCapitulo(sub.entradas);
  return (
    <AnimatePresence>
      {sub.panelAbierto && (
        <>
          <motion.div key="velo-subrayados" data-velo-subrayados className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => sub.setPanelAbierto(false)} />
          <motion.aside
            key="panel-subrayados"
            data-panel-subrayados
            initial={{ opacity: 0, transform: 'translateX(24px)' }}
            animate={{ opacity: 1, transform: 'translateX(0px)' }}
            exit={{ opacity: 0, transform: 'translateX(16px)', transition: { duration: 0.14 } }}
            transition={resorte}
            className="squircle absolute top-2 right-3 bottom-3 z-10 flex w-80 flex-col overflow-hidden rounded-[18px] bg-superficie shadow-flotante"
          >
            <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
              <IconoSubrayar className="size-4 text-acento" />
              <p className="min-w-0 flex-1 text-[0.8rem] font-semibold">{t('subrayados.lector.titulo', { n: sub.entradas.length })}</p>
              <button type="button" onClick={() => sub.setPanelAbierto(false)} className="grid size-6 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta" title={t('lector.cerrar')}>
                <IconoCerrar className="size-3" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {!sub.entradas.length && <p className="px-2.5 py-3 text-[0.78rem] leading-relaxed text-tinta-tenue">{t('subrayados.lector.vacio')}</p>}
              {grupos.map((g, k) => (
                <div key={`${g.titulo}-${k}`} className="mt-2">
                  <p className="truncate px-2.5 py-1 text-[0.66rem] font-semibold tracking-wide text-tinta-tenue">{g.titulo}</p>
                  {g.entradas.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      data-item-subrayado={e.id}
                      data-origen={e.origen}
                      disabled={!e.href}
                      onClick={() => onIr(e)}
                      title={e.href ? t('subrayados.lector.irAlSubrayado') : t('subrayados.noEncontrado')}
                      className="block w-full rounded-[10px] px-2.5 py-2 text-left transition-colors enabled:hover:bg-superficie-2"
                    >
                      <span className="block border-l-[3px] pl-2.5" style={{ borderColor: colorDeLinea(e) }}>
                        <span className="line-clamp-4 font-serif text-[0.8rem] leading-snug text-tinta">{e.tipo === 'nota' ? `✎ ${e.texto}` : e.texto}</span>
                        {e.nota && <span className="mt-1 line-clamp-3 block rounded-md bg-acento-suave/70 px-2 py-1 text-[0.72rem] text-tinta-suave">✎ {e.nota}</span>}
                        <span className="mt-1 block text-[0.64rem] text-tinta-tenue">{lugarDe(e)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="border-t border-borde px-4 py-2.5 text-[0.7rem] text-tinta-tenue">
              {sub.md && <p className="mb-1 leading-relaxed">{t('subrayados.lector.mdSolo')}</p>}
              <AccionesMd libroId={libroId} md={sub.md} alResultado={alResultado} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
