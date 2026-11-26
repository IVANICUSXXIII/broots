// 1.14: subrayar, anotar, «Explicar», «Definir» y traducir en un PDF (en el lector de páginas, LectorPaginas.jsx).
//
// useSubrayadosPdf() hace con la capa de texto del PDF lo mismo que useSubrayados() (SubrayadosLector.jsx) con los
// párrafos del EPUB, y devuelve lo mismo: así la barrita, la nota, la lista, «Explicar» y «Definir» son las mismas.
// La diferencia está en el ancla: acá es la página y las letras dentro del texto de esa página (ver lib/textoPdf.js), y
// en el archivo se guarda con formato 'PDF' (ver electron/anotaciones.cjs). Cada subrayado se pinta solo en el formato
// donde se hizo.
//
// PanelTraduccionPdf: la traducción va en un panel al costado, porque las letras de un PDF son un dibujo fijo y no se
// pueden reemplazar. Muestra la página (o las dos) que estás viendo, párrafo por párrafo, y adelanta la siguiente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { idiomaActual, resorte, t } from '../lib/index.js';
import { COLORES, despintar, envolver, ordenar } from '../lib/subrayados.js';
import { anclaDeSeleccionPdf, buscarEnPagina, compacto, parrafoEn, textoCrudoDeAncla, textoEntre } from '../lib/textoPdf.js';
import { IconoCerrar, IconoTraducir } from './Iconos.jsx';

const LARGO_MAXIMO = 8000; // el mismo tope que en el EPUB

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
const comoEntrada = (registro) => ({ ...registro, origen: 'broots', tipo: 'subrayado', fecha: registro.creado, titulo: registro.tituloCapitulo || null });
export const esDelPdf = (e) => e?.formato === 'PDF';

/**
 * capas: las capas de texto ya armadas (lista(n), listas()); pedirModelo(n): el texto de cualquier página (aunque no se
 * vea); paginas: las que se ven, en orden; zona: donde se ubican la barrita y las tarjetas; tituloDe(n) y etiquetaDe(n):
 * la sección del índice y el número impreso de una página.
 */
export function useSubrayadosPdf({ libro, capas, pedirModelo, paginas, zona, tituloDe, etiquetaDe, abierto, avisar }) {
  const [entradas, setEntradas] = useState([]);
  const [md, setMd] = useState(false);
  const [barra, setBarra] = useState(null); // { modo: 'nuevo' | 'editar' | 'kindle' | 'lectura', ancla?, id?, texto?, caja }
  const [nota, setNota] = useState(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const lista = useRef([]);
  const estado = useRef({});
  estado.current = { barra, nota, panelAbierto };
  const r = useRef({ capas, pedirModelo, paginas, tituloDe, etiquetaDe, avisar, modelos: new Map() }).current;
  Object.assign(r, { capas, pedirModelo, paginas, tituloDe, etiquetaDe, avisar });

  const ponerLista = (nueva) => {
    lista.current = nueva;
    setEntradas(nueva);
  };

  // ---------- Pintar ----------

  /** Los textos de las páginas que se conocen (las capas armadas y las que se pidieron para un subrayado que cruza). */
  const modelos = () => {
    for (const [n, c] of r.capas?.listas() ?? []) r.modelos.set(n, c.modelo);
    return r.modelos;
  };

  /** Dónde cae un subrayado del PDF: si su texto sigue ahí, donde estaba; si no (otro pdf.js), se lo busca en su página. */
  const ubicar = (e) => {
    if (!esDelPdf(e) || e.tipo === 'nota') return null;
    const conocidos = modelos();
    const crudo = textoCrudoDeAncla(conocidos, e);
    if (crudo != null && compacto(crudo) === compacto(e.texto)) return e;
    if (e.parrafo !== e.parrafoFin || !conocidos.has(e.parrafo)) return null;
    const hallado = buscarEnPagina(conocidos.get(e.parrafo).texto, e.texto, e.inicio);
    return hallado ? { ...e, ...hallado } : null;
  };

  const clasesDe = (e) => ['subrayado', e.color ?? COLORES[0], e.nota ? 'con-nota' : ''].filter(Boolean).join(' ');

  const pintarPagina = (n) => {
    const capa = r.capas?.lista(n);
    if (!capa) return;
    despintar(capa.el);
    const largo = capa.modelo.texto.length;
    const tramos = [];
    for (const e of lista.current) {
      if (!esDelPdf(e) || n < e.parrafo || n > e.parrafoFin) continue;
      // Un subrayado que sigue en la otra página necesita también el texto de esa: se pide y se vuelve a pintar.
      const otra = e.parrafo === n ? e.parrafoFin : e.parrafo;
      if (otra !== n && !modelos().has(otra)) {
        r.pedirModelo?.(otra)
          .then((m) => {
            r.modelos.set(otra, m);
            pintarPagina(n);
          })
          .catch(() => {});
        continue;
      }
      const a = ubicar(e);
      if (!a) continue;
      const desde = n === a.parrafo ? a.inicio : 0;
      const hasta = Math.min(largo, n === a.parrafoFin ? a.fin : largo);
      if (hasta > desde) tramos.push({ id: e.id, desde, hasta, e });
    }
    for (const tramo of tramos.sort((x, y) => x.desde - y.desde)) envolver(capa.el, tramo.desde, tramo.hasta, { id: tramo.id, clases: clasesDe(tramo.e) });
  };

  const pintarTodo = () => {
    for (const [n] of r.capas?.listas() ?? []) pintarPagina(n);
  };

  const aplicar = (entrada) => {
    ponerLista(ordenar([...lista.current.filter((e) => e.id !== entrada.id), entrada]));
    pintarTodo();
  };
  const quitar = (id) => {
    ponerLista(lista.current.filter((e) => e.id !== id));
    pintarTodo();
  };

  // ---------- Cargar ----------

  const cargar = useCallback(async () => {
    try {
      const res = await window.subrayados.delLibro(libro.id, { ubicar: false });
      if (!res?.ok) return;
      ponerLista(res.entradas);
      setMd(Boolean(res.md));
      pintarTodo();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro.id]);
  useEffect(() => {
    if (abierto) cargar();
  }, [abierto, cargar]);

  // ---------- Seleccionar y tocar ----------

  const cajaDe = (rect) => {
    const m = zona.current.getBoundingClientRect();
    return { x: rect.left - m.left, y: rect.top - m.top, ancho: rect.width, alto: rect.height, anchoMarco: m.width, altoMarco: m.height };
  };
  const rectDe = (rango) => [...rango.getClientRects()].find((c) => c.width > 0) ?? rango.getBoundingClientRect();
  const visibles = () => (r.paginas ?? []).map((n) => [n, r.capas?.lista(n)]).filter(([, c]) => c);

  /** Después de soltar el mouse sobre el PDF: si quedó texto seleccionado, la barrita. Devuelve true si apareció. */
  const alSoltar = () => {
    const seleccion = window.getSelection();
    if (!seleccion || seleccion.isCollapsed) return false;
    const capasVistas = visibles();
    if (!capasVistas.some(([, c]) => c.el.contains(seleccion.anchorNode) || c.el.contains(seleccion.focusNode))) return false;
    const ancla = anclaDeSeleccionPdf(seleccion, capasVistas);
    if (!ancla) return false;
    if (ancla.texto.length > LARGO_MAXIMO) {
      r.avisar(t('subrayados.lector.muyLargo'), 'errorSubrayado');
      return true;
    }
    setNota(null);
    setBarra({ modo: 'nuevo', ancla, caja: cajaDe(rectDe(seleccion.getRangeAt(0))) });
    return true;
  };

  /** Selección dentro del panel de traducción: se puede copiar, definir, explicar o buscar (subrayar, en el PDF). */
  const alSoltarLectura = (panel) => {
    setTimeout(() => {
      const seleccion = window.getSelection();
      if (!seleccion || seleccion.isCollapsed || !panel?.contains(seleccion.anchorNode)) return;
      const texto = seleccion.toString().replace(/\s+/g, ' ').trim();
      if (!texto) return;
      const parrafo = seleccion.anchorNode.parentElement?.closest('[data-parrafo-traducido]');
      const vecinos = [...panel.querySelectorAll('[data-parrafo-traducido]')].map((p) => p.textContent).join(' ');
      setNota(null);
      setBarra({ modo: 'lectura', texto: texto.slice(0, LARGO_MAXIMO), parrafo: parrafo?.textContent ?? texto, vecinos, caja: cajaDe(rectDe(seleccion.getRangeAt(0))) });
    }, 0);
  };

  /** Clic en un subrayado: la barrita para cambiarle el color, anotarlo o borrarlo. Devuelve true si era uno. */
  const alTocar = (e) => {
    const marca = e.target.closest?.('mark[data-subrayado]');
    const entrada = marca && lista.current.find((x) => x.id === marca.dataset.subrayado);
    if (!entrada) return false;
    setNota(null);
    setBarra({ modo: 'editar', id: entrada.id, caja: cajaDe(marca.getBoundingClientRect()) });
    return true;
  };

  // ---------- Crear, cambiar y borrar ----------

  const nuevoRegistro = (ancla, color) => {
    const conocidos = modelos();
    const inicio = conocidos.get(ancla.parrafo);
    const final = conocidos.get(ancla.parrafoFin) ?? inicio;
    return {
      id: nuevoId(),
      formato: 'PDF',
      href: 'PDF',
      capitulo: ancla.parrafo,
      tituloCapitulo: r.tituloDe?.(ancla.parrafo) ?? '',
      etiquetaPagina: r.etiquetaDe?.(ancla.parrafo) ?? String(ancla.parrafo + 1),
      parrafo: ancla.parrafo,
      inicio: ancla.inicio,
      parrafoFin: ancla.parrafoFin,
      fin: ancla.fin,
      version: 'original',
      idioma: null,
      texto: ancla.texto,
      antes: inicio ? textoEntre(inicio, Math.max(0, ancla.inicio - 80), ancla.inicio).slice(-40) : '',
      despues: final ? textoEntre(final, ancla.fin, ancla.fin + 80).slice(0, 40) : '',
      orden: inicio ? Math.min(1, ancla.inicio / Math.max(1, inicio.texto.length)) : 0,
      color,
      nota: '',
      creado: new Date().toISOString(),
    };
  };

  const guardar = async (registro) => {
    try {
      const res = await window.subrayados.guardar(libro.id, registro);
      if (res?.ok) return res.registro;
      r.avisar(res?.mensaje ?? t('subrayados.lector.noPudeGuardar'), 'errorSubrayado');
    } catch {
      r.avisar(t('subrayados.lector.noPudeGuardar'), 'errorSubrayado');
    }
    return null;
  };

  const marcasDe = (id) => (r.capas?.listas() ?? []).flatMap(([, c]) => [...c.el.querySelectorAll(`mark[data-subrayado="${CSS.escape(id)}"]`)]);

  const abrirNotaDe = (id, caja) => {
    const e = lista.current.find((x) => x.id === id);
    if (!e) return;
    const marca = marcasDe(id)[0];
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
    if (!(await guardar(registro))) {
      quitar(registro.id);
      setNota((n) => (n?.id === registro.id ? null : n));
    }
  };

  /** Lo que «Explicar» y «Definir» necesitan: lo elegido y el párrafo donde está. */
  const paraExplicar = () => {
    const b = estado.current.barra;
    if (!b) return null;
    if (b.modo === 'lectura') return { modo: 'lectura', texto: b.texto, parrafo: b.parrafo, vecinos: b.vecinos, caja: b.caja };
    if (b.modo === 'nuevo') {
      const m = modelos().get(b.ancla.parrafo);
      return { modo: 'nuevo', ancla: b.ancla, texto: b.ancla.texto, indice: b.ancla.parrafo, parrafo: parrafoEn(m, b.ancla.inicio)?.texto ?? b.ancla.texto, caja: b.caja };
    }
    const e = lista.current.find((x) => x.id === b.id);
    if (!e) return null;
    const m = modelos().get(e.parrafo);
    return { modo: b.modo, id: b.id, texto: e.texto, indice: e.parrafo, parrafo: parrafoEn(m, e.inicio)?.texto ?? e.texto, caja: b.caja };
  };

  /** Para elegir el diccionario: ¿lo elegido estaba traducido (panel) y qué texto lo rodea? */
  const contextoDiccionario = (datos) => {
    if (datos.modo === 'lectura') return { traducido: true, vecinos: datos.vecinos ?? '' };
    const m = modelos().get(datos.indice);
    return { traducido: false, vecinos: (m?.parrafos ?? []).map((p) => p.texto).join(' ') };
  };

  const crearConNota = async (ancla, notaNueva) => {
    const registro = { ...nuevoRegistro(ancla, preferencia('broots-subrayado-color', COLORES[0])), nota: notaNueva };
    window.getSelection()?.removeAllRanges();
    aplicar(comoEntrada(registro));
    if (await guardar(registro)) return true;
    quitar(registro.id);
    return false;
  };

  const sumarANota = async (id, agregado) => {
    const e = lista.current.find((x) => x.id === id);
    if (!e || e.origen === 'kindle') return false;
    const cambiado = { ...e, nota: e.nota ? `${e.nota}\n\n${agregado}` : agregado };
    aplicar(cambiado);
    if (await guardar(cambiado)) return true;
    aplicar(e);
    return false;
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
      return r.avisar(t('subrayados.lector.noPudeBorrar'), 'errorSubrayado');
    }
    r.avisar(e.nota ? t('subrayados.lector.borradoConNota') : t('subrayados.lector.borrado'), 'subrayado', {
      texto: t('subrayados.lector.deshacer'),
      alTocar: async () => {
        aplicar(e);
        if (!(await guardar(e))) quitar(id);
      },
    });
  };

  const copiar = async () => {
    const b = estado.current.barra;
    const copiado = b?.modo === 'nuevo' ? b.ancla.texto : b?.modo === 'lectura' ? b.texto : lista.current.find((x) => x.id === b?.id)?.texto;
    window.getSelection()?.removeAllRanges();
    setBarra(null);
    if (!copiado) return;
    await window.club.copiar(copiado);
    r.avisar(t('subrayados.lector.copiado'), 'subrayado');
  };

  const cerrarBarra = () => {
    if (['nuevo', 'lectura'].includes(estado.current.barra?.modo)) window.getSelection()?.removeAllRanges();
    setBarra(null);
  };

  const cerrarAlgo = () => {
    if (estado.current.nota) guardarNota();
    else if (estado.current.barra) cerrarBarra();
    else if (estado.current.panelAbierto) setPanelAbierto(false);
    else return false;
    return true;
  };

  const destacar = (id) => {
    const marcas = marcasDe(id);
    marcas.forEach((m) => m.classList.add('destacado'));
    setTimeout(() => marcas.forEach((m) => m.classList.remove('destacado')), 1600);
  };

  return {
    entradas, md, barra, nota, panelAbierto, setPanelAbierto,
    alCapa: pintarPagina, // una capa de texto recién puesta en pantalla: se pintan sus subrayados
    alSoltar, alSoltarLectura, alTocar, crear, cambiarColor, abrirNota, guardarNota, borrar, copiar, cerrarBarra, cerrarAlgo, destacar,
    paraExplicar, contextoDiccionario, crearConNota, sumarANota,
    escribiendo: () => Boolean(estado.current.nota),
    escribirNota: (escrita) => setNota((n) => (n ? { ...n, texto: escrita } : n)),
    descartarNota: () => setNota(null),
  };
}

// ---------- El panel de traducción ----------

const tieneLetras = (texto) => /\p{L}/u.test(texto);

/**
 * paginas: las que se ven; siguientes: las del pliego que sigue (se adelantan); pedirModelo(n): el texto de una página;
 * etiquetaDe(n): su número impreso. alError(res) avisa si Gemini no pudo (o falta la clave).
 */
export function PanelTraduccionPdf({ libro, abierto, paginas, siguientes, pedirModelo, etiquetaDe, onCerrar, alSeleccionar, alError }) {
  const [bloques, setBloques] = useState([]); // [{ pagina, parrafos: [texto], sinTexto }]
  const [, setVersion] = useState(0);
  const traducidos = useRef(new Map()).current; // texto original -> traducción (de este libro, en esta sesión)
  const pedidos = useRef(new Set()).current;
  const panel = useRef(null);
  const clave = paginas.join('-');
  const claveSiguientes = siguientes.join('-');

  useEffect(() => {
    if (!abierto || !paginas.length) return;
    let vivo = true;
    const pedir = async (textos, urgente) => {
      const faltan = [...new Set(textos.filter((x) => tieneLetras(x) && !traducidos.has(x) && !pedidos.has(x)))];
      if (!faltan.length) return true;
      faltan.forEach((x) => pedidos.add(x));
      const res = await window.lector.traducir(libro.id, faltan, urgente).catch(() => ({ ok: false, mensaje: t('lector.noPudeTraducir') }));
      faltan.forEach((x, k) => {
        pedidos.delete(x);
        if (res?.traducciones?.[k] != null) traducidos.set(x, res.traducciones[k]);
      });
      if (vivo) setVersion((v) => v + 1);
      if (!res?.ok && vivo) alError(res);
      return Boolean(res?.ok);
    };
    (async () => {
      const modelos = await Promise.all(paginas.map((n) => pedirModelo(n).catch(() => null)));
      if (!vivo) return;
      const nuevos = paginas.map((n, k) => ({ pagina: n, parrafos: (modelos[k]?.parrafos ?? []).map((p) => p.texto), sinTexto: !modelos[k] || modelos[k].sinTexto }));
      setBloques(nuevos);
      panel.current?.scrollTo({ top: 0 });
      const bien = await pedir(nuevos.flatMap((b) => b.parrafos), true);
      if (!vivo || !bien) return;
      // Lo que sigue, de antemano: pasar de página no espera a Gemini (y queda guardado en la biblioteca).
      const proximos = await Promise.all(siguientes.map((n) => pedirModelo(n).catch(() => null)));
      if (vivo) await pedir(proximos.flatMap((m) => (m?.parrafos ?? []).map((p) => p.texto)), false);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, clave, claveSiguientes, libro.id]);

  return (
    <AnimatePresence initial={false}>
      {abierto && (
        <motion.aside
          key="traduccion"
          data-panel-traduccion
          lang={idiomaActual()}
          initial={{ opacity: 0, transform: 'translateX(16px)' }}
          animate={{ opacity: 1, transform: 'translateX(0px)' }}
          exit={{ opacity: 0, transform: 'translateX(12px)', transition: { duration: 0.12 } }}
          transition={resorte}
          className="flex w-[min(24rem,38%)] shrink-0 flex-col border-l border-borde bg-superficie"
        >
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <IconoTraducir className="size-4 text-acento" />
            <p className="min-w-0 flex-1 text-[0.8rem] font-semibold">{t('pdf.traduccion')}</p>
            <button type="button" onClick={onCerrar} className="grid size-6 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta" title={t('lector.cerrar')}>
              <IconoCerrar className="size-3" />
            </button>
          </div>
          <div ref={panel} onMouseUp={() => alSeleccionar(panel.current)} className="seleccionable min-h-0 flex-1 overflow-y-auto px-4 pb-4 font-serif text-[0.9rem] leading-relaxed">
            {bloques.map((b) => (
              <section key={b.pagina} data-pagina-traducida={b.pagina} className="mb-4">
                {bloques.length > 1 && <p className="mb-1.5 font-sans text-[0.66rem] font-semibold tracking-wide text-tinta-tenue">{t('pdf.pagina', { n: etiquetaDe(b.pagina) })}</p>}
                {b.sinTexto && <p data-pagina-imagen className="font-sans text-[0.78rem] text-tinta-tenue">{t('pdf.paginaImagen')}</p>}
                {b.parrafos.map((p, k) => {
                  const traduccion = traducidos.get(p);
                  const listo = traduccion != null || !tieneLetras(p);
                  return (
                    <p key={k} data-parrafo-traducido={listo ? 'si' : 'no'} className={`mb-2.5 ${listo ? '' : 'text-tinta-tenue'}`}>
                      {traduccion ?? p}
                    </p>
                  );
                })}
              </section>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
