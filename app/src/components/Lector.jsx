// Lector de EPUB con traducción al idioma de Broots (etapa 5; hasta la 1.4.0, siempre al español).
//
// Cómo pagina: el capítulo se acomoda en columnas CSS del alto de la pantalla; cada "vista" (una o dos
// páginas según el ancho de la ventana) es un corrimiento horizontal. Pasar de página anima solo
// transform, que es lo que la placa de video mueve sin tirones. Los números de página del libro
// entero salen de contar, en segundo plano, cuántas páginas ocupa cada capítulo.
//
// Cómo traduce: cada párrafo del capítulo es una unidad. Lo que está en pantalla se pide primero
// (pasa adelante en la cola) y en paralelo se adelantan ~5 páginas más y la anterior. Lo traducido se
// guarda en la biblioteca (.broots/traducciones), así releer no gasta cupo. Tocar un párrafo
// traducido muestra el original (y otro toque vuelve a la traducción).
//
// 1.7: la sesión de lectura (reloj opcional, descanso para la vista, «te quedan») vive en SesionLectura.jsx;
// acá se le avisa cada vez que pasás de página. El modo enfoque (F) esconde las barras y pone la ventana
// en pantalla completa; llevando el mouse al borde de arriba o de abajo, la barra se asoma.
//
// 1.8: subrayados y notas (SubrayadosLector.jsx). Seleccionar texto muestra una barrita con colores; los subrayados
// se pintan al abrir cada capítulo y cada vez que un párrafo cambia de idioma, anclados al texto (no a la página).
//
// 1.9: lectura a medida (LecturaAMedida.jsx y lib/lectura.js). El botón «Aa» elige tema, letra, fuente, interlineado,
// márgenes y justificado. La fuente, el interlineado y el justificado son variables de CSS en la caja del lector, así
// la página y el medidor (que cuenta las páginas) miden igual; los márgenes cambian el ancho de página en medir().
// «Explicar» (Explicar.jsx) le pregunta a Gemini qué quiere decir lo que seleccionaste, desde la barrita de subrayar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { limpiarCapitulo, limpiarFragmento, parrafosDe } from '../lib/epub.js';
import { COLORES_BARRA, MARGENES, cargarFuente, estimacion, idiomaActual, resorte, resortePresion, resorteRapido, ritmoParaEstimar, t, useAjustesLectura, variablesTexto } from '../lib/index.js';
import { FormularioGemini } from './Gemini.jsx';
import { IconoAnterior, IconoCerrar, IconoEnfoque, IconoIndice, IconoLlave, IconoMedida, IconoSiguiente, IconoSubrayar, IconoTraducir } from './Iconos.jsx';
import { PanelLectura } from './LecturaAMedida.jsx';
import { TarjetaExplicacion, useExplicar } from './Explicar.jsx';
import { AvisoSesion, BotonSesion, useSesionLectura } from './SesionLectura.jsx';
import { BarraSubrayado, NotaSubrayado, PanelSubrayados, useSubrayados } from './SubrayadosLector.jsx';

const ESPACIO = 64; // separación entre columnas (y entre páginas), en px
const MARGEN_VERTICAL = 26; // el ancho de página y el margen de los costados dependen de los márgenes elegidos (1.9)
const PAGINAS_ADELANTE = 5; // cuántas páginas se traducen por adelantado
const TANDA = 2800; // caracteres por pedido de traducción adelantada
const DURACION_PASO = 450; // ms aproximados del resorte al pasar de página

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
// ¿El libro ya está en el idioma de Broots? (códigos de dos o tres letras, como los guarda Calibre o el EPUB)
const CODIGOS = { es: /^(es|spa)\b/i, en: /^(en|eng)\b/i, pt: /^(pt|por)\b/i };
const esDelIdioma = (idiomaLibro, idioma) => CODIGOS[idioma]?.test(idiomaLibro ?? '') ?? false;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const esperarImagen = (img, ms = 2500) => Promise.race([img.decode().catch(() => {}), dormir(ms)]);
function nuevaMarcaDeFin() {
  const fin = document.createElement('span');
  fin.dataset.fin = '';
  return fin;
}

function BotonBarra({ activo, children, ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94, transition: resortePresion }}
      className={`squircle inline-flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 text-[0.76rem] font-medium transition-colors disabled:opacity-40 ${
        activo ? 'bg-seleccion text-tinta' : 'text-tinta-suave hover:bg-superficie-2 hover:text-tinta'
      }`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Panel para pegar la clave gratuita de Gemini (la escribe el usuario; se guarda cifrada). */
function ClaveGemini({ tieneClave, onListo, onCerrar }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center p-6">
      <motion.div className="absolute inset-0 bg-[rgb(var(--sombra))]" initial={{ opacity: 0 }} animate={{ opacity: 0.25 }} exit={{ opacity: 0 }} onClick={onCerrar} />
      <motion.div
        initial={{ opacity: 0, transform: 'translateY(14px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(8px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative w-[min(30rem,100%)] rounded-[22px] bg-superficie p-6 shadow-flotante"
      >
        <button type="button" onClick={onCerrar} className="absolute top-4 right-4 grid size-7 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta" title={t('lector.cerrar')}>
          <IconoCerrar className="size-3.5" />
        </button>
        <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
          <IconoTraducir className="size-5 text-acento" /> {t('lector.traduccionGemini')}
        </h2>
        <FormularioGemini tieneClave={tieneClave} autoFocus onCambio={(ok) => (ok ? setTimeout(onListo, 1200) : onListo())} />
      </motion.div>
    </div>
  );
}

/** "Página [45] de 312": el número se puede editar para ir directo a otra página. */
function IrAPagina({ actual, ultimaVisible, total, aproximado, sinEstimar, onIr }) {
  const [texto, setTexto] = useState(null); // null = mostrando la página actual
  const ir = () => {
    const n = parseInt(texto, 10);
    setTexto(null);
    if (n >= 1) onIr(Math.min(n, total));
  };
  return (
    <form
      className="flex shrink-0 items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        ir();
        e.currentTarget.querySelector('input')?.blur();
      }}
    >
      <span>{ultimaVisible > actual ? t('lector.paginas') : t('lector.pagina')}</span>
      <input
        value={texto ?? String(actual)}
        onChange={(e) => setTexto(e.target.value.replace(/\D/g, '').slice(0, 5))}
        onFocus={(e) => {
          setTexto(String(actual));
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => setTexto(null)}
        onKeyDown={(e) => e.key === 'Escape' && (setTexto(null), e.currentTarget.blur())}
        title={t('lector.irExplicacion')}
        className="squircle h-6 w-11 rounded-[7px] bg-superficie-2 text-center text-[0.72rem] text-tinta shadow-[inset_0_0_0_1px_var(--borde)] outline-none focus:shadow-[inset_0_0_0_1px_var(--acento)]"
      />
      {ultimaVisible > actual && <span>–{ultimaVisible}</span>}
      <span>{t('lector.de', { total: sinEstimar ? '…' : `${aproximado ? '~' : ''}${total}` })}</span>
    </form>
  );
}

export function Lector({ libro, onCerrar, colEstado, soloLectura, onEditarRapido }) {
  const [datos, setDatos] = useState(null); // { capitulos, indice, idioma, posicion }
  const [error, setError] = useState(null);
  const [info, setInfo] = useState({ cap: 0, vista: 0, total: 1, columnas: 1, cols: 1 });
  const [medidas, setMedidas] = useState(null); // { ancho, alto, cols }: cambia al redimensionar
  const [paginasCap, setPaginasCap] = useState([]); // páginas de cada capítulo (texto original)
  const [ajustes, cambiarAjustes] = useAjustesLectura(); // 1.9: tema, letra, fuente, interlineado, márgenes, justificar
  const { letra } = ajustes;
  const [panelMedida, setPanelMedida] = useState(false);
  const [traducir, setTraducir] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'traduciendo' | 'error' | 'sinClave' | 'pista', texto }
  const [indiceAbierto, setIndiceAbierto] = useState(false);
  const [claveAbierta, setClaveAbierta] = useState(false);
  const [tieneClave, setTieneClave] = useState(false);
  const [enfoque, setEnfoque] = useState(false);
  const [asomar, setAsomar] = useState(null); // en modo enfoque: 'arriba' | 'abajo' | null (qué barra se asoma)
  const [sobreBarra, setSobreBarra] = useState(false);
  const sesion = useSesionLectura({ libro, abierto: Boolean(datos), colEstado, soloLectura, onEditarRapido });
  const { alPasarPagina, actividad } = sesion;

  const marco = useRef(null);
  const recorte = useRef(null);
  const texto = useRef(null);
  const medidor = useRef(null);
  // Estado del lector que no necesita volver a dibujar React (se lee y escribe en cada página).
  const r = useRef({
    cap: 0, href: '', vista: 0, total: 1, columnas: 1, token: 0, geo: null, parrafos: [], originales: [], rangos: [],
    traducidos: new Map(), viendoOriginal: new Set(), enCurso: new Map(), fallidos: new Set(), traducir: false,
    prefetch: new Set(), quietoDesde: 0,
    textosOriginales: [], anclas: new Map(), // 1.8: el texto de cada párrafo en su idioma y dónde cae cada subrayado
    margenes: MARGENES.normales, // 1.9: { ancho, lateral } de los márgenes elegidos
  }).current;
  r.margenes = MARGENES[ajustes.margenes] ?? MARGENES.normales;
  r.ajustes = ajustes;

  // Cartelitos de los subrayados (borrado con «Deshacer», copiado, errores): se van solos a los 6 segundos.
  const avisar = useCallback((texto, tipo = 'subrayado', accion = null) => {
    const clave = Date.now();
    setAviso({ tipo, texto, accion, clave });
    setTimeout(() => setAviso((a) => (a?.clave === clave ? null : a)), 6000);
  }, []);
  const sub = useSubrayados({ libro, r, texto, marco, abierto: Boolean(datos), avisar });
  const explicar = useExplicar({ libro, sub, avisar }); // 1.9

  // ---------- Medidas y páginas ----------

  const medir = useCallback(() => {
    const caja = marco.current.getBoundingClientRect();
    const disponible = caja.width - r.margenes.lateral * 2;
    const cols = disponible >= 1000 ? 2 : 1;
    const ancho = Math.floor(Math.min(r.margenes.ancho, (disponible - ESPACIO * (cols - 1)) / cols));
    const alto = Math.floor(caja.height - MARGEN_VERTICAL * 2);
    const anchoTotal = cols * ancho + (cols - 1) * ESPACIO;
    if (!r.geo || r.geo.ancho !== ancho || r.geo.alto !== alto || r.geo.cols !== cols) setMedidas({ ancho, alto, cols });
    r.geo = { cols, ancho, alto, paso: cols * (ancho + ESPACIO) };
    marco.current.style.setProperty('--ancho-texto', `${anchoTotal}px`);
    Object.assign(recorte.current.style, { width: `${anchoTotal}px`, height: `${alto}px` });
    Object.assign(texto.current.style, { width: `${anchoTotal}px`, height: `${alto}px`, columnCount: cols, columnGap: `${ESPACIO}px` });
    texto.current.style.setProperty('--alto-pagina', `${alto - 24}px`);
  }, [r]);

  /** En qué columna (página) y en qué vista cae un rectángulo de la pantalla. */
  const columnaDe = (rect, base) => Math.floor((rect.left - base + 2) / (r.geo.ancho + ESPACIO));
  const vistaDe = (rect, base) => Math.floor(columnaDe(rect, base) / r.geo.cols);

  const mapear = useCallback(() => {
    const base = texto.current.getBoundingClientRect().left;
    r.rangos = r.parrafos.map((el) => {
      const rects = el.getClientRects();
      if (!rects.length) return null;
      return { inicio: vistaDe(rects[0], base), fin: vistaDe(rects[rects.length - 1], base) };
    });
    r.columnas = Math.max(1, columnaDe(texto.current.querySelector('[data-fin]').getBoundingClientRect(), base) + 1);
    r.total = Math.ceil(r.columnas / r.geo.cols);
  }, [r]);

  const publicar = () => setInfo({ cap: r.cap, vista: r.vista, total: r.total, columnas: r.columnas, cols: r.geo.cols });

  const mover = (animar) => {
    const el = texto.current;
    el.style.transition = animar ? 'transform var(--t-suave)' : 'none';
    el.style.transform = `translate3d(${-r.vista * r.geo.paso}px, 0, 0)`;
    if (animar) r.quietoDesde = Date.now() + DURACION_PASO;
  };
  /** Espera a que termine la animación de pasar de página (cambiar el texto en pleno movimiento lo corta). */
  const esperarQuieto = async () => {
    while (Date.now() < r.quietoDesde) await dormir(r.quietoDesde - Date.now());
  };

  /** Primer párrafo visible: es el que se mantiene arriba cuando cambia el tamaño o el texto. */
  const anclaActual = () => {
    const i = r.rangos.findIndex((g) => g && g.fin >= r.vista);
    return i >= 0 ? i : Math.max(0, r.parrafos.length - 1);
  };

  const reacomodar = useCallback(
    (ancla) => {
      if (!texto.current || !r.geo || !r.parrafos) return;
      medir();
      mapear();
      const destino = r.rangos[ancla]?.inicio ?? r.vista;
      r.vista = Math.min(Math.max(0, destino), r.total - 1);
      mover(false);
      publicar();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [medir, mapear, r],
  );

  // ---------- Traducción ----------

  const ponerTexto = (i, html) => {
    r.parrafos[i].replaceChildren(limpiarFragmento(html, r.href, libro.id));
    sub.alCambiarParrafo(i); // el párrafo cambió de idioma: sus subrayados se vuelven a pintar
  };

  const enPantalla = (i) => r.rangos[i] && r.rangos[i].inicio <= r.vista && r.rangos[i].fin >= r.vista;

  /** El aviso "Traduciendo…" aparece solo si falta algo de lo que se está viendo. */
  const actualizarAviso = () => {
    const falta = r.traducir && r.parrafos.some((_, i) => enPantalla(i) && !r.traducidos.has(i) && r.enCurso.has(i));
    r.parrafos.forEach((p, i) => p.classList.toggle('pendiente', r.traducir && !r.traducidos.has(i) && r.enCurso.has(i) && enPantalla(i)));
    setAviso((a) => (falta ? (a?.tipo === 'error' || a?.tipo === 'sinClave' ? a : { tipo: 'traduciendo', texto: t('lector.traduciendo') }) : a?.tipo === 'traduciendo' ? null : a));
  };

  const precargarSiguiente = useCallback(async () => {
    const siguiente = r.cap + 1;
    if (!r.traducir || !datos || siguiente >= datos.capitulos.length || r.vista < r.total - 2 || r.prefetch.has(siguiente)) return;
    r.prefetch.add(siguiente);
    try {
      const html = await window.lector.capitulo(libro.id, datos.capitulos[siguiente].href);
      const caja = document.createElement('div');
      caja.append(limpiarCapitulo(html, datos.capitulos[siguiente].href, libro.id));
      const primeros = parrafosDe(caja).slice(0, 20).map((p) => p.innerHTML);
      if (primeros.length) await window.lector.traducir(libro.id, primeros, false); // queda en la caché
    } catch {}
  }, [datos, libro.id, r]);

  const asegurarTraduccionRef = useRef(null);

  /** Pide la traducción de unos párrafos y, cuando llega, la pone en el texto sin mover la página. */
  const pedirTraduccion = async (indices, urgente) => {
    const token = r.token;
    indices.forEach((i) => r.enCurso.set(i, urgente || r.enCurso.get(i) === true));
    actualizarAviso();
    const res = await window.lector.traducir(libro.id, indices.map((i) => r.originales[i]), urgente);
    if (token !== r.token) return; // cambió el capítulo mientras tanto
    await esperarQuieto();
    if (token !== r.token) return;
    const ancla = anclaActual();
    let cambio = false;
    indices.forEach((i, k) => {
      if (r.enCurso.get(i) === true && !urgente && !r.traducidos.has(i) && res.traducciones?.[k] == null) return; // la urgente sigue en camino
      r.enCurso.delete(i);
      const traduccion = res.traducciones?.[k];
      if (traduccion == null || r.traducidos.has(i)) return;
      r.traducidos.set(i, traduccion);
      r.parrafos[i].classList.add('traducido');
      if (r.traducir && !r.viendoOriginal.has(i)) {
        ponerTexto(i, traduccion);
        cambio = true;
      }
    });
    if (!res.ok) {
      indices.filter((i) => !r.traducidos.has(i)).forEach((i) => {
        r.fallidos.add(i);
        r.enCurso.delete(i);
      });
      setAviso(res.sinClave ? { tipo: 'sinClave', texto: t('lector.faltaClave') } : { tipo: 'error', texto: res.mensaje });
    }
    if (cambio) reacomodar(ancla);
    actualizarAviso();
    if (res.ok) {
      if (cambio && !preferencia('broots-lector-pista-original', false)) {
        recordar('broots-lector-pista-original', true);
        setAviso({ tipo: 'pista', texto: t('lector.pistaOriginal') });
        setTimeout(() => setAviso((a) => (a?.tipo === 'pista' ? null : a)), 6000);
      }
      asegurarTraduccionRef.current?.();
    }
  };

  /** Traduce lo que se ve (urgente) y adelanta las próximas páginas y la anterior. */
  const asegurarTraduccion = useCallback(() => {
    if (!r.traducir || !r.geo || !r.rangos.length) return;
    const v = r.vista;
    const adelante = Math.ceil(PAGINAS_ADELANTE / r.geo.cols);
    const urgentes = [];
    const resto = [];
    r.rangos.forEach((g, i) => {
      if (!g || r.traducidos.has(i) || r.fallidos.has(i)) return;
      if (g.inicio <= v && g.fin >= v) {
        if (r.enCurso.get(i) !== true) urgentes.push(i); // si estaba en una tanda adelantada, se pide ya
      } else if (g.inicio <= v + adelante && g.fin >= v - 1 && !r.enCurso.has(i)) resto.push(i);
    });
    if (urgentes.length) pedirTraduccion(urgentes, true);
    let tanda = [];
    let largo = 0;
    for (const i of resto) {
      if (tanda.length && largo + r.originales[i].length > TANDA) {
        pedirTraduccion(tanda, false);
        tanda = [];
        largo = 0;
      }
      tanda.push(i);
      largo += r.originales[i].length;
    }
    if (tanda.length) pedirTraduccion(tanda, false);
    actualizarAviso();
    if (!urgentes.length && !resto.length && !r.enCurso.size) precargarSiguiente();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, precargarSiguiente]);
  asegurarTraduccionRef.current = asegurarTraduccion;

  // ---------- Capítulos y navegación ----------

  const guardarPosicion = useCallback(
    (progreso) => window.lector.guardarPosicion(libro.id, { capitulo: r.cap, parrafo: anclaActual(), progreso }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libro.id, r],
  );

  const irVista = useCallback(
    (v, animar = true) => {
      r.vista = Math.min(Math.max(0, v), r.total - 1);
      mover(animar);
      publicar();
      asegurarTraduccion();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, asegurarTraduccion],
  );

  const abrirCapitulo = useCallback(
    async (i, destino = {}) => {
      if (!datos) return;
      const token = ++r.token;
      const el = texto.current;
      el.style.transition = 'opacity 140ms ease-out';
      el.style.opacity = '0';
      let html;
      try {
        html = await window.lector.capitulo(libro.id, datos.capitulos[i].href);
      } catch (e) {
        setError(e.message);
        return;
      }
      if (token !== r.token) return;
      r.cap = i;
      r.href = datos.capitulos[i].href;
      el.replaceChildren(limpiarCapitulo(html, r.href, libro.id), nuevaMarcaDeFin());
      el.classList.toggle('solo-imagenes', !parrafosDe(el).length);
      r.parrafos = parrafosDe(el);
      r.parrafos.forEach((p, k) => (p.dataset.p = k));
      r.originales = r.parrafos.map((p) => p.innerHTML);
      r.textosOriginales = r.parrafos.map((p) => p.textContent);
      r.traducidos = new Map();
      r.viendoOriginal = new Set();
      r.enCurso = new Map();
      r.fallidos = new Set();
      r.rangos = [];
      sub.alAbrirCapitulo(); // pinta los subrayados de este capítulo (solo el fondo: no mueve el texto)
      // Las imágenes y la fuente elegida, cargadas antes de medir (si no, las páginas no dan).
      await Promise.all([...[...el.querySelectorAll('img')].map((img) => esperarImagen(img)), cargarFuente(r.ajustes)]);
      if (token !== r.token) return;

      medir();
      mapear();
      let vista = 0;
      if (destino.fin) vista = r.total - 1;
      else if (destino.vista != null) vista = destino.vista;
      else if (destino.subrayado) {
        const objetivo = el.querySelector(`mark[data-subrayado="${CSS.escape(destino.subrayado)}"]`) ?? r.parrafos[destino.parrafo ?? 0];
        if (objetivo) vista = vistaDe(objetivo.getBoundingClientRect(), el.getBoundingClientRect().left);
      } else if (destino.parrafo != null) vista = r.rangos[destino.parrafo]?.inicio ?? 0;
      else if (destino.ancla) {
        const objetivo = el.querySelector(`[data-ancla="${CSS.escape(destino.ancla)}"]`);
        if (objetivo) vista = vistaDe(objetivo.getBoundingClientRect(), el.getBoundingClientRect().left);
      }
      r.vista = Math.min(Math.max(0, vista), r.total - 1);
      mover(false);
      // Si lo que se va a ver ya está traducido (caché), se aplica antes de mostrar: sin destello en inglés.
      if (r.traducir) {
        const visibles = r.parrafos.map((_, k) => k).filter(enPantalla);
        if (visibles.length) await Promise.race([pedirTraduccion(visibles, true), dormir(250)]);
        if (token !== r.token) return;
      }
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 200ms ease-out';
        el.style.opacity = '1';
      });
      publicar();
      asegurarTraduccion();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, libro.id, r, medir, mapear, asegurarTraduccion],
  );

  const siguiente = useCallback(() => {
    if (r.vista < r.total - 1) {
      irVista(r.vista + 1);
      alPasarPagina({ adelante: true, paginas: r.geo?.cols ?? 1 });
    } else if (datos && r.cap < datos.capitulos.length - 1) {
      abrirCapitulo(r.cap + 1);
      alPasarPagina({ adelante: true, paginas: r.geo?.cols ?? 1, capitulo: true });
    }
  }, [r, datos, irVista, abrirCapitulo, alPasarPagina]);

  const anterior = useCallback(() => {
    if (r.vista > 0) irVista(r.vista - 1);
    else if (r.cap > 0) abrirCapitulo(r.cap - 1, { fin: true });
    else return;
    alPasarPagina({ adelante: false });
  }, [r, irVista, abrirCapitulo, alPasarPagina]);

  const irA = useCallback(
    (destino) => {
      if (!datos) return;
      const [ruta, ancla] = destino.split('#');
      const i = datos.capitulos.findIndex((c) => c.href === ruta);
      if (i < 0) return;
      setIndiceAbierto(false);
      if (i === r.cap && ancla) {
        const objetivo = texto.current.querySelector(`[data-ancla="${CSS.escape(ancla)}"]`);
        if (objetivo) return irVista(vistaDe(objetivo.getBoundingClientRect(), texto.current.getBoundingClientRect().left), false);
      }
      abrirCapitulo(i, { ancla });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, r, irVista, abrirCapitulo],
  );

  /** Desde la lista de subrayados: a la página donde está (y un anillo un momento, para encontrarlo). */
  const irASubrayado = async (e) => {
    if (!datos || !e.href) return;
    sub.setPanelAbierto(false);
    const i = datos.capitulos.findIndex((c) => c.href === e.href);
    if (i < 0) return;
    if (i === r.cap) {
      const objetivo = texto.current.querySelector(`mark[data-subrayado="${CSS.escape(e.id)}"]`) ?? r.parrafos[e.parrafo ?? 0];
      if (objetivo) irVista(vistaDe(objetivo.getBoundingClientRect(), texto.current.getBoundingClientRect().left), false);
    } else await abrirCapitulo(i, { subrayado: e.id, parrafo: e.parrafo });
    sub.destacar(e.id);
  };

  // ---------- Números de página del libro entero ----------

  const capitulos = datos?.capitulos ?? [];
  // Páginas por byte de HTML: para estimar los capítulos que todavía no se contaron.
  const contados = paginasCap.map((n, i) => (n ? i : -1)).filter((i) => i >= 0);
  const densidad = contados.length
    ? contados.reduce((s, i) => s + paginasCap[i], 0) / Math.max(1, contados.reduce((s, i) => s + capitulos[i].largo, 0))
    : info.columnas / Math.max(1, capitulos[info.cap]?.largo ?? 1);
  const paginasDe = (i) => (i === info.cap ? info.columnas : paginasCap[i] ?? Math.max(1, Math.round(capitulos[i].largo * densidad)));
  const antes = capitulos.slice(0, info.cap).reduce((s, _, i) => s + paginasDe(i), 0);
  const totalPaginas = capitulos.reduce((s, _, i) => s + paginasDe(i), 0) || 1;
  const paginaActual = antes + info.vista * info.cols + 1;
  const ultimaVisible = Math.min(paginaActual + info.cols - 1, antes + info.columnas);
  const aproximado = capitulos.length > 0 && contados.length < capitulos.length;
  // Con muy pocos capítulos contados la estimación puede errar mucho (p. ej. si el primero es la portada).
  const sinEstimar = aproximado && contados.length < Math.min(4, capitulos.length);
  const progreso = capitulos.length ? Math.min(1, ultimaVisible / totalPaginas) : 0;
  sesion.datos.current = { progreso, totalPaginas, estimado: aproximado };

  // «Te quedan ~X»: páginas que faltan divididas por tu ritmo (el de este libro o, mientras es nuevo, el general).
  const porMinuto = sesion.ritmos && capitulos.length && !sinEstimar ? ritmoParaEstimar(sesion.ritmos, totalPaginas) : null;
  const faltanCapitulo = antes + info.columnas - ultimaVisible;
  const faltanLibro = totalPaginas - ultimaVisible;
  const quedaCapitulo = porMinuto && faltanCapitulo > 0 ? estimacion(faltanCapitulo / porMinuto) : null;
  const quedaLibro = porMinuto && faltanLibro > 0 ? estimacion(faltanLibro / porMinuto) : null;

  // Mientras se cuentan las páginas, los números son estimados: un "Ir a" espera a que termine el conteo.
  const paginaPendiente = useRef(null);
  const irAPagina = (pagina) => {
    if (!capitulos.length) return;
    if (aproximado) {
      paginaPendiente.current = pagina;
      setAviso({ tipo: 'traduciendo', contando: true, texto: t('lector.contando', { pagina }) });
      return;
    }
    let acumulado = 0;
    for (let i = 0; i < capitulos.length; i++) {
      const n = paginasDe(i);
      if (pagina <= acumulado + n || i === capitulos.length - 1) {
        const vista = Math.floor(Math.max(0, Math.min(pagina - acumulado, n) - 1) / info.cols);
        if (i === r.cap) irVista(vista, false);
        else abrirCapitulo(i, { vista });
        return;
      }
      acumulado += n;
    }
  };

  useEffect(() => {
    if (aproximado || paginaPendiente.current == null) return;
    const pagina = paginaPendiente.current;
    paginaPendiente.current = null;
    setAviso((a) => (a?.contando ? null : a));
    irAPagina(pagina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aproximado]);

  // Guarda por dónde vas cada vez que cambia la página (y la barrita de subrayar, si quedó abierta, se va).
  useEffect(() => {
    if (capitulos.length) guardarPosicion(Math.round(progreso * 1000) / 1000);
    sub.cerrarBarra();
    explicar.cerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.cap, info.vista]);

  // Última página del libro: la sesión ofrece marcarlo como Leído.
  useEffect(() => {
    if (capitulos.length && info.cap === capitulos.length - 1 && info.vista >= info.total - 1) sesion.alLlegarAlFinal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.cap, info.vista, info.total, capitulos.length]);

  // Modo enfoque: pantalla completa mientras dura (y siempre se sale al cerrar el libro).
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    window.habito.pantallaCompleta(enfoque);
    setAsomar(null);
  }, [enfoque]);
  useEffect(() => () => window.habito.pantallaCompleta(false), []);
  const alMoverMouse = (e) => {
    actividad();
    if (!enfoque) return;
    const lado = e.clientY < 56 ? 'arriba' : e.clientY > window.innerHeight - 48 ? 'abajo' : null;
    if (lado !== asomar) setAsomar(lado);
  };

  // Cuenta en segundo plano las páginas de cada capítulo (con la letra, la fuente, el interlineado y el tamaño
  // actuales: el medidor está dentro de la caja del lector, así que hereda las mismas variables que la página).
  useEffect(() => {
    if (!datos || !medidas) return;
    let vivo = true;
    setPaginasCap([]);
    (async () => {
      await Promise.all([dormir(600), cargarFuente(ajustes)]); // que primero se muestre la página
      if (!vivo) return;
      const el = medidor.current;
      Object.assign(el.style, { width: `${medidas.ancho}px`, height: `${medidas.alto}px`, columnCount: 1, columnGap: `${ESPACIO}px`, fontSize: `${letra}px` });
      el.style.setProperty('--alto-pagina', `${medidas.alto - 24}px`);
      const cuentas = [];
      for (let i = 0; i < datos.capitulos.length && vivo; i++) {
        try {
          const html = await window.lector.capitulo(libro.id, datos.capitulos[i].href);
          if (!vivo) return;
          el.replaceChildren(limpiarCapitulo(html, datos.capitulos[i].href, libro.id), nuevaMarcaDeFin());
          await Promise.all([...el.querySelectorAll('img')].map((img) => esperarImagen(img, 1200)));
          const base = el.getBoundingClientRect().left;
          const fin = el.querySelector('[data-fin]').getBoundingClientRect().left;
          cuentas[i] = Math.max(1, Math.floor((fin - base + 2) / (medidas.ancho + ESPACIO)) + 1);
        } catch {
          cuentas[i] = null;
        }
        if (i % 6 === 5 || i === datos.capitulos.length - 1) setPaginasCap([...cuentas]);
        await dormir(0);
      }
      el.replaceChildren();
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, medidas, letra, ajustes.fuente, ajustes.interlineado, ajustes.justificar, libro.id]);

  // ---------- Efectos ----------

  // Abrir el libro.
  useEffect(() => {
    let vivo = true;
    window.lector.abrir(libro.id).then((d) => {
      if (!vivo) return;
      if (!d.ok) return setError(d.mensaje);
      setDatos(d);
      const idioma = d.idioma || libro.languages[0];
      const traducirAlAbrir = preferencia(`broots-traducir-${libro.uuid}`, !esDelIdioma(idioma, idiomaActual()));
      r.traducir = traducirAlAbrir;
      setTraducir(traducirAlAbrir);
      // Pistas de la primera vez: cómo pasar de página y, la vez siguiente, que se puede subrayar (1.8).
      const pista = !preferencia('broots-lector-pista-paginas', false) ? 'paginas' : !preferencia('broots-lector-pista-subrayar', false) ? 'subrayar' : null;
      if (pista) {
        recordar(`broots-lector-pista-${pista}`, true);
        setAviso({ tipo: 'pista', texto: pista === 'paginas' ? t('lector.pistaPaginas') : t('subrayados.lector.pista') });
        setTimeout(() => setAviso((a) => (a?.tipo === 'pista' ? null : a)), 7000);
      }
    });
    window.lector.estadoTraduccion().then((e) => vivo && setTieneClave(e.tieneClave));
    return () => {
      vivo = false;
      r.token++;
    };
    // Solo al cambiar de libro (no cuando se recarga la biblioteca).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro.id]);

  // Primer capítulo (o donde se había quedado).
  useEffect(() => {
    if (!datos) return;
    const p = datos.posicion;
    if (p && p.capitulo < datos.capitulos.length) abrirCapitulo(p.capitulo, { parrafo: p.parrafo });
    else abrirCapitulo(0);
    // Solo al abrir el libro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  // Letra, fuente, interlineado, márgenes y tamaño de ventana: se reacomoda manteniendo el párrafo de arriba. El
  // párrafo se busca antes de esperar la fuente nueva (r.rangos todavía es del acomodo anterior).
  useEffect(() => {
    texto.current.style.fontSize = `${letra}px`;
    if (!r.parrafos.length) return;
    const ancla = anclaActual();
    let vivo = true;
    cargarFuente(ajustes).then(() => vivo && reacomodar(ancla));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letra, ajustes.fuente, ajustes.interlineado, ajustes.margenes, ajustes.justificar]);

  // La barra de título de Windows (sus botones se dibujan encima del lector) toma el color del tema elegido.
  useEffect(() => {
    window.lector.colorBarra?.(ajustes.tema === 'auto' ? null : COLORES_BARRA[ajustes.tema]);
  }, [ajustes.tema]);
  useEffect(() => () => window.lector.colorBarra?.(null), []);

  useEffect(() => {
    let espera = null;
    const observador = new ResizeObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(() => r.parrafos.length && reacomodar(anclaActual()), 120);
    });
    observador.observe(marco.current);
    return () => {
      observador.disconnect();
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reacomodar]);

  // Teclado: flechas, Av Pág/Re Pág, espacio; F, modo enfoque; Esc cierra paneles (clave, índice, sesión), sale del
  // enfoque o, si no queda nada abierto, cierra el lector.
  useEffect(() => {
    const alPresionar = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      actividad();
      if (e.key === 'Escape') {
        if (explicar.tarjeta) return explicar.cerrar(); // 1.9: la tarjetita de «Explicar»
        if (sub.cerrarAlgo()) return; // la nota, la barrita de subrayar o la lista de subrayados
        if (claveAbierta) setClaveAbierta(false);
        else if (panelMedida) setPanelMedida(false);
        else if (indiceAbierto) setIndiceAbierto(false);
        else if (sesion.panelAbierto) sesion.setPanelAbierto(false);
        else if (enfoque) setEnfoque(false);
        else onCerrar();
      } else if (sub.escribiendo()) {
        // Escribiendo una nota (aunque el cursor haya salido del cuadro): ni F ni las flechas hacen nada.
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setEnfoque((v) => !v);
      } else if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        siguiente();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        anterior();
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [siguiente, anterior, onCerrar, explicar.tarjeta, claveAbierta, panelMedida, indiceAbierto, enfoque, actividad, sesion.panelAbierto, sesion.setPanelAbierto]);

  // Rueda del mouse o del touchpad: una página por gesto.
  const ultimaRueda = useRef(0);
  const alRodar = (e) => {
    if (sub.nota || sub.panelAbierto || panelMedida || explicar.tarjeta) return; // escribiendo una nota o con un panel abierto, la rueda no pasa de página
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 12 || Date.now() - ultimaRueda.current < 380) return;
    ultimaRueda.current = Date.now();
    delta > 0 ? siguiente() : anterior();
  };

  const cambiarTraducir = () => (!tieneClave ? setClaveAbierta(true) : cambiarTraducirA(!traducir));

  /**
   * Clic en la página: un enlace interno navega; un subrayado abre su barrita (color, nota, borrar); un párrafo
   * traducido alterna con el original; en cualquier otro lugar pasa de página (mitad izquierda: atrás, derecha: adelante).
   */
  const alTocarPagina = (e) => {
    clearTimeout(r.clicPendiente);
    if (window.getSelection()?.toString()) return;
    const enlace = e.target.closest('a[data-destino]');
    if (enlace) return irA(enlace.dataset.destino);
    if (sub.alTocar(e)) return;
    // 1.8: el clic espera un instante antes de hacer algo. Si llega un segundo clic (doble clic para elegir una
    // palabra y subrayarla), no se pasa de página ni se cambia de idioma.
    if (e.detail > 1) return;
    const { clientX } = e;
    const p = e.target.closest('[data-p]');
    r.clicPendiente = setTimeout(() => {
      if (!window.getSelection()?.toString()) tocarPagina(p, clientX);
    }, 260);
  };
  const tocarPagina = (p, clientX) => {
    const i = p ? Number(p.dataset.p) : -1;
    if (p && r.traducir && r.traducidos.has(i)) {
      const ancla = anclaActual();
      if (r.viendoOriginal.has(i)) {
        r.viendoOriginal.delete(i);
        p.classList.remove('original');
        ponerTexto(i, r.traducidos.get(i));
      } else {
        r.viendoOriginal.add(i);
        p.classList.add('original');
        ponerTexto(i, r.originales[i]);
      }
      return reacomodar(ancla);
    }
    const caja = recorte.current.getBoundingClientRect();
    clientX < caja.left + caja.width / 2 ? anterior() : siguiente();
  };

  const claveLista = async () => {
    setClaveAbierta(false);
    const e = await window.lector.estadoTraduccion();
    setTieneClave(e.tieneClave);
    r.fallidos.clear();
    if (e.tieneClave && !r.traducir) cambiarTraducirA(true);
    else if (e.tieneClave) {
      setAviso(null);
      asegurarTraduccion();
    } else if (r.traducir) cambiarTraducirA(false);
  };
  function cambiarTraducirA(valor) {
    setAviso(null);
    setTraducir(valor);
    r.traducir = valor;
    recordar(`broots-traducir-${libro.uuid}`, valor);
    const ancla = anclaActual();
    for (const [i, traducido] of r.traducidos) if (!r.viendoOriginal.has(i)) ponerTexto(i, valor ? traducido : r.originales[i]);
    reacomodar(ancla);
    actualizarAviso();
    if (valor) asegurarTraduccion();
  }
  const reintentar = () => {
    r.fallidos.clear();
    setAviso(null);
    asegurarTraduccion();
  };

  // ---------- Pantalla ----------

  const entradaActual = (() => {
    if (!datos) return null;
    let actual = null;
    for (const e of datos.indice) {
      const i = capitulos.findIndex((c) => c.href === e.href.split('#')[0]);
      if (i >= 0 && i <= info.cap) actual = e;
    }
    return actual;
  })();
  sub.contexto.current.titulo = entradaActual?.titulo ?? null; // cada subrayado nuevo recuerda su capítulo
  // En modo enfoque las barras flotan escondidas y se asoman al acercar el mouse al borde (o mientras lo tenés encima).
  const barraEscondida = (lado) => enfoque && asomar !== lado && !(lado === 'arriba' && sobreBarra);
  const flotante = (lado) => {
    if (!enfoque) return '';
    const borde = lado === 'arriba' ? 'top-0 shadow-[0_6px_18px_-12px_rgb(var(--sombra)/0.5)]' : 'bottom-0 shadow-[0_-6px_18px_-12px_rgb(var(--sombra)/0.5)]';
    const escondida = barraEscondida(lado) ? `pointer-events-none opacity-0 ${lado === 'arriba' ? '-translate-y-2' : 'translate-y-2'}` : '';
    return `absolute inset-x-0 z-30 bg-superficie transition-[opacity,translate] duration-200 ${borde} ${escondida}`;
  };
  const flecha = 'grid size-10 place-items-center rounded-full text-tinta-tenue opacity-50 transition-[opacity,background-color,color] group-hover:bg-superficie-2 group-hover:text-tinta group-hover:opacity-100';

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col bg-superficie text-tinta"
      initial={{ opacity: 0, transform: 'scale(0.985)' }}
      animate={{ opacity: 1, transform: 'scale(1)' }}
      exit={{ opacity: 0, transform: 'scale(0.985)', transition: { duration: 0.16 } }}
      transition={resorte}
      onMouseMove={alMoverMouse}
      data-enfoque={enfoque ? 'si' : 'no'}
      // 1.9: el tema pinta todo el lector; la fuente, el interlineado y el justificado llegan a la página y al medidor.
      data-tema-lector={ajustes.tema === 'auto' ? undefined : ajustes.tema}
      style={variablesTexto(ajustes)}
    >
      <header
        onMouseEnter={() => setSobreBarra(true)}
        onMouseLeave={() => setSobreBarra(false)}
        className={`flex h-11 shrink-0 items-center gap-1.5 pr-[150px] pl-3 ${enfoque ? flotante('arriba') : 'arrastrable'}`}
      >
        <BotonBarra onClick={onCerrar} title={t('lector.volverEsc')}>
          <IconoAnterior className="size-4" /> {t('lector.biblioteca')}
        </BotonBarra>
        <BotonBarra activo={indiceAbierto} onClick={() => setIndiceAbierto((v) => !v)} disabled={!datos?.indice.length} title={t('lector.indice')}>
          <IconoIndice className="size-4" /> {t('lector.indice')}
        </BotonBarra>
        <BotonBarra activo={sub.panelAbierto} onClick={() => {
            setPanelMedida(false);
            sub.setPanelAbierto((v) => !v);
          }} disabled={!datos} title={t('subrayados.lector.boton')} data-boton-subrayados>
          <IconoSubrayar className="size-4" />
          {sub.entradas.length > 0 && <span className="tabular-nums">{sub.entradas.length}</span>}
        </BotonBarra>
        <div className="min-w-0 flex-1 px-3 text-center">
          <p className="truncate font-serif text-[0.86rem] font-semibold">{libro.title}</p>
          {entradaActual && <p className="truncate text-[0.68rem] text-tinta-tenue">{entradaActual.titulo}</p>}
        </div>
        <BotonBarra
          activo={panelMedida}
          onClick={() => {
            sub.setPanelAbierto(false); // los dos paneles van a la derecha: se abre uno a la vez
            setPanelMedida((v) => !v);
          }} title={t('lectura.boton')} data-boton-medida>
          <IconoMedida className="size-4" />
        </BotonBarra>
        <BotonBarra activo={traducir && tieneClave} onClick={cambiarTraducir} disabled={!datos} title={traducir ? t('lector.verOriginal') : t('lector.traducirAl')}>
          <IconoTraducir className="size-4" /> {traducir && tieneClave ? t('lector.traducido') : t('lector.traducir')}
        </BotonBarra>
        <BotonBarra onClick={() => setClaveAbierta(true)} title={t('configuracion.claveGemini')}>
          <IconoLlave className="size-4" />
        </BotonBarra>
        <BotonSesion sesion={sesion} restanteCapitulo={quedaCapitulo} />
        <BotonBarra activo={enfoque} onClick={() => setEnfoque((v) => !v)} title={enfoque ? t('habito.lector.salirEnfoque') : t('habito.lector.enfoque')} data-boton-enfoque>
          <IconoEnfoque className="size-4" />
        </BotonBarra>
      </header>

      <div ref={marco} className="relative min-h-0 flex-1" onWheel={alRodar}>
        <div ref={recorte} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden">
          <div
            ref={texto}
            lang={traducir ? idiomaActual() : datos?.idioma || undefined}
            onClick={alTocarPagina}
            onMouseUp={sub.alSoltar}
            className="texto-libro seleccionable"
            style={{ opacity: 0 }}
          />
        </div>

        {/* Costados: todo el margen a cada lado del texto pasa de página, con una flecha siempre visible */}
        <button
          type="button"
          onClick={anterior}
          title={t('lector.anterior')}
          className="group absolute inset-y-0 left-0 grid w-[max(4rem,calc((100%-var(--ancho-texto,0px))/2))] place-items-center"
        >
          <span className={flecha}>
            <IconoAnterior className="size-6" />
          </span>
        </button>
        <button
          type="button"
          onClick={siguiente}
          title={t('lector.siguiente')}
          className="group absolute inset-y-0 right-0 grid w-[max(4rem,calc((100%-var(--ancho-texto,0px))/2))] place-items-center"
        >
          <span className={flecha}>
            <IconoSiguiente className="size-6" />
          </span>
        </button>

        {/* Medidor invisible para contar las páginas de cada capítulo */}
        <div aria-hidden="true" className="pointer-events-none fixed top-0 left-[-20000px] overflow-hidden" style={{ visibility: 'hidden' }}>
          <div ref={medidor} lang={datos?.idioma || undefined} className="texto-libro" />
        </div>

        {!datos && !error && <p className="absolute inset-0 grid place-items-center text-sm text-tinta-tenue">{t('lector.abriendo')}</p>}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-8">
            <div className="max-w-sm text-center">
              <p className="text-[0.9rem]">{error}</p>
              <button type="button" onClick={onCerrar} className="mt-4 text-[0.8rem] font-medium text-acento hover:underline">
                {t('lector.volver')}
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {aviso && (
            <motion.div
              key={aviso.tipo}
              initial={{ opacity: 0, transform: 'translate(-50%, -8px)' }}
              animate={{ opacity: 1, transform: 'translate(-50%, 0px)' }}
              exit={{ opacity: 0, transform: 'translate(-50%, -6px)' }}
              transition={resorteRapido}
              data-aviso-lector={aviso.tipo}
              // Por encima de los paneles y de la barrita de subrayar, para que nunca quede tapado.
              className="squircle absolute top-2 left-1/2 z-[26] flex max-w-[80%] items-center gap-2 rounded-full bg-superficie-2 px-3.5 py-1.5 text-[0.74rem] shadow-[0_6px_18px_-8px_rgb(var(--sombra)/0.5),inset_0_0_0_1px_var(--borde)]"
            >
              {aviso.tipo === 'traduciendo' && <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" />}
              <span className={`truncate ${aviso.tipo === 'error' || aviso.tipo === 'errorSubrayado' ? 'text-[#bc4749]' : ''}`}>{aviso.texto}</span>
              {aviso.accion && (
                <button
                  type="button"
                  data-accion-aviso
                  onClick={() => {
                    setAviso(null);
                    aviso.accion.alTocar();
                  }}
                  className="shrink-0 font-medium text-acento hover:underline"
                >
                  {aviso.accion.texto}
                </button>
              )}
              {aviso.tipo === 'error' && (
                <button type="button" onClick={reintentar} className="shrink-0 font-medium text-acento hover:underline">
                  {t('lector.reintentar')}
                </button>
              )}
              {aviso.tipo === 'sinClave' && (
                <button type="button" onClick={() => setClaveAbierta(true)} className="shrink-0 font-medium text-acento hover:underline">
                  {t('lector.configurar')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Índice */}
        <AnimatePresence>
          {indiceAbierto && datos && (
            <>
              <motion.div key="velo" className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIndiceAbierto(false)} />
              <motion.nav
                key="indice"
                initial={{ opacity: 0, transform: 'translateX(-24px)' }}
                animate={{ opacity: 1, transform: 'translateX(0px)' }}
                exit={{ opacity: 0, transform: 'translateX(-16px)', transition: { duration: 0.14 } }}
                transition={resorte}
                className="squircle absolute top-2 bottom-3 left-3 z-10 w-80 overflow-y-auto rounded-[18px] bg-superficie p-2 shadow-flotante"
              >
                {datos.indice.map((e, k) => {
                  const actual = e === entradaActual;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => irA(e.href)}
                      style={{ paddingLeft: `${10 + e.nivel * 14}px` }}
                      className={`block w-full rounded-[10px] py-1.5 pr-2.5 text-left text-[0.8rem] transition-colors ${actual ? 'bg-seleccion font-medium' : 'hover:bg-superficie-2'}`}
                    >
                      <span className="line-clamp-2">{e.titulo}</span>
                    </button>
                  );
                })}
              </motion.nav>
            </>
          )}
        </AnimatePresence>

        {/* Subrayados: la lista de la derecha y, al seleccionar o tocar uno, la barrita y la nota. El velo hace que
            el clic afuera solo las cierre (no pasa de página); si estabas escribiendo una nota, la guarda. */}
        <PanelSubrayados sub={sub} libroId={libro.id} onIr={irASubrayado} alResultado={(texto, error) => avisar(texto, error ? 'errorSubrayado' : 'subrayado')} />
        {(sub.barra || sub.nota || explicar.tarjeta) && (
          <div data-velo-subrayado className="absolute inset-0 z-[25]" onClick={() => (sub.nota ? sub.guardarNota() : explicar.tarjeta ? explicar.cerrar() : sub.cerrarBarra())} />
        )}
        <BarraSubrayado sub={sub} onExplicar={explicar.abrir} />
        <NotaSubrayado sub={sub} />
        <TarjetaExplicacion explicar={explicar} onConfigurar={() => setClaveAbierta(true)} />

        <PanelLectura abierto={panelMedida} onCerrar={() => setPanelMedida(false)} ajustes={ajustes} onCambiar={cambiarAjustes} />

        <AvisoSesion sesion={sesion} onCerrarLibro={onCerrar} enfoque={enfoque} />

        <AnimatePresence>{claveAbierta && <ClaveGemini key="clave" tieneClave={tieneClave} onListo={claveLista} onCerrar={() => setClaveAbierta(false)} />}</AnimatePresence>
      </div>

      <footer className={`flex h-10 shrink-0 items-center gap-4 px-6 text-[0.7rem] text-tinta-tenue ${flotante('abajo')}`}>
        {capitulos.length > 0 && (
          <IrAPagina actual={paginaActual} ultimaVisible={ultimaVisible} total={totalPaginas} aproximado={aproximado} sinEstimar={sinEstimar} onIr={irAPagina} />
        )}
        <button
          type="button"
          title={t('lector.barraExplicacion')}
          onClick={(e) => {
            const caja = e.currentTarget.getBoundingClientRect();
            irAPagina(Math.max(1, Math.round(((e.clientX - caja.left) / caja.width) * totalPaginas)));
          }}
          className="group flex h-5 flex-1 items-center"
        >
          <span className="block h-1 w-full overflow-hidden rounded-full bg-superficie-2 transition-[height] group-hover:h-1.5">
            <span className="block h-full origin-left rounded-full bg-acento/70" style={{ transform: `scaleX(${progreso})`, transition: 'transform var(--t-suave)' }} />
          </span>
        </button>
        <span className="w-10 text-right">{Math.round(progreso * 100)}%</span>
        {quedaLibro && (
          <span data-quedan className="max-w-[45%] shrink-0 truncate text-tinta-suave" title={t('habito.lector.quedanExplica')}>
            {quedaCapitulo ? `${t('habito.lector.quedanCapitulo', { tiempo: quedaCapitulo })} · ` : ''}
            {t('habito.lector.quedanLibro', { tiempo: quedaLibro })}
          </span>
        )}
      </footer>
    </motion.div>
  );
}
