// 1.11: lector de páginas, para PDF y cómics (CBZ y CBR). El EPUB sigue en Lector.jsx: allá el texto se acomoda a la
// ventana; acá cada página es como una foto y lo que se acomoda es la foto.
//
// Cómo muestra: un «pliego» son las páginas que se ven juntas (una o dos, ver lib/paginas.js). Se ajusta a la ventana y, si
// te acercás (pellizco, Ctrl + rueda, Ctrl + y Ctrl -, doble clic), todo se mueve con transform: es lo que la placa de video
// mueve sin tirones. Cuando el zoom se queda quieto, el PDF se vuelve a dibujar con más detalle.
//
// Las páginas vecinas se preparan por adelantado (crearHojas): pasar de página no espera. Se guarda por dónde vas (también
// el zoom, el sentido manga y una o dos páginas) en lectura.json, aparte para cada formato del libro.
//
// Manga: de derecha a izquierda. Se prende solo si el archivo lo dice o el libro tiene la etiqueta «Manga», y el botón
// de la barra lo cambia para ese libro. En manga también se dan vuelta las flechas, los costados y la barra de abajo.
//
// 1.14, solo en PDF: encima de cada página va su capa de texto invisible (lib/pdf.js), para seleccionar como en un
// navegador. Arrastrar sobre texto selecciona; fuera del texto, mueve la página acercada. El doble clic sobre una
// palabra la selecciona; fuera del texto, acerca y aleja. Lo seleccionado abre la misma barrita del EPUB: subrayar,
// nota, «Definir», «Explicar», buscar (SubrayadosPdf.jsx). La traducción va en un panel al costado. Un PDF escaneado
// (fotos de las páginas, sin texto) se sigue leyendo, y un cartel avisa una vez que ahí no se puede subrayar.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { COLORES_BARRA, altoAjustado, armarPliegos, aspectoDe, entranDos, estimacion, pliegoDe, resorte, resorteRapido, ritmoParaEstimar, t, tieneEtiquetaManga, useAjustesLectura } from '../lib/index.js';
import { abrirComicEnLector, abrirPdf } from '../lib/pdf.js';
import { sinTextoUtil } from '../lib/textoPdf.js';
import { IconoAnterior, IconoCerrar, IconoDosPaginas, IconoEnfoque, IconoIndice, IconoManga, IconoMedida, IconoSiguiente, IconoSubrayar, IconoTraducir, IconoUnaPagina } from './Iconos.jsx';
import { PanelLectura } from './LecturaAMedida.jsx';
import { BotonBarra, ClaveGemini, IrAPagina } from './Lector.jsx';
import { AvisoSesion, BotonSesion, useSesionLectura } from './SesionLectura.jsx';
import { BarraSubrayado, NotaSubrayado, PanelSubrayados } from './SubrayadosLector.jsx';
import { PanelTraduccionPdf, useSubrayadosPdf } from './SubrayadosPdf.jsx';
import { TarjetaExplicacion, useExplicar } from './Explicar.jsx';
import { TarjetaDefinicion, useDefinir } from './Definir.jsx';

const COSTADO = 56; // px a cada lado para las flechas: la página nunca queda debajo de ellas
const MARGEN_VERTICAL = 12;
const ZOOM_MAXIMO = 5;
const ZOOM_CLIC = 2;
const ZOOM_NITIDO_MAXIMO = 3; // más que esto, el lienzo pesa demasiado y ya no se nota
const ARRASTRE_MINIMO = 4; // px: moverse menos que esto sigue siendo un clic
const DOBLE_CLIC = 280; // ms que espera un clic para saber si viene otro
const encerrar = (v, min, max) => Math.min(max, Math.max(min, v));
const PISTA = 'broots-lector-pista-pellizco';
const PISTA_PDF = 'broots-lector-pista-texto-pdf';
const PAGINAS_A_REVISAR = 8; // para saber si un PDF es escaneado
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

/** Las páginas ya dibujadas, para no volver a dibujarlas. Se sueltan las que quedaron lejos (cada lienzo ocupa memoria). */
function crearHojas(fuente) {
  const cache = new Map(); // página -> { ancho, promesa, tarea, el }
  const soltar = (entrada) => {
    entrada.tarea?.cancelar();
    if (entrada.el?.tagName === 'CANVAS') entrada.el.width = 0;
  };
  return {
    pedir(n, anchoPixeles) {
      const previa = cache.get(n);
      if (previa && (fuente.tipo === 'comic' || previa.ancho >= anchoPixeles * 0.9)) return previa.promesa;
      const tarea = fuente.hoja(n, anchoPixeles);
      const entrada = { ancho: anchoPixeles, tarea, el: null, promesa: null };
      entrada.promesa = tarea.promesa.then(
        (el) => {
          entrada.el = el;
          entrada.tarea = null;
          if (previa) soltar(previa); // ya está la versión con más detalle
          return el;
        },
        (error) => {
          if (cache.get(n) === entrada) cache.delete(n);
          throw error;
        },
      );
      cache.set(n, entrada);
      return entrada.promesa;
    },
    soltarLejos(cerca) {
      for (const [n, entrada] of cache) {
        if (cerca.has(n)) continue;
        soltar(entrada);
        cache.delete(n);
      }
    },
  };
}

/** 1.14: las capas de texto de un PDF, armadas una vez por página (como las hojas, se sueltan las lejanas). */
function crearCapas(fuente) {
  const cache = new Map(); // página -> { promesa, valor }
  return {
    pedir(n) {
      if (!cache.has(n)) {
        const entrada = { valor: null, promesa: null };
        entrada.promesa = fuente.capa(n).then((valor) => (entrada.valor = valor));
        entrada.promesa.catch(() => cache.get(n) === entrada && cache.delete(n));
        cache.set(n, entrada);
      }
      return cache.get(n).promesa;
    },
    lista: (n) => cache.get(n)?.valor ?? null,
    listas: () => [...cache].filter(([, e]) => e.valor).map(([n, e]) => [n, e.valor]).sort((a, b) => a[0] - b[0]),
    soltarLejos(cerca) {
      for (const n of cache.keys()) if (!cerca.has(n)) cache.delete(n);
    },
  };
}

/** Una página: mientras se dibuja, un papel en blanco del mismo tamaño (así nada salta). */
function Hoja({ hojas, capas, n, ancho, alto, pixeles, alMedir, alCapa }) {
  const caja = useRef(null);
  const ranura = useRef(null);
  const [fallo, setFallo] = useState(false);
  const [capa, setCapa] = useState(null);
  const pedido = Math.round(ancho * pixeles);
  useEffect(() => {
    let vivo = true;
    hojas
      .pedir(n, pedido)
      .then((el) => {
        if (!vivo || !el) return;
        if (el.parentNode !== caja.current) caja.current.replaceChildren(el);
        caja.current.dataset.lista = 'si';
        if (el.tagName === 'IMG') alMedir(n, el.naturalWidth, el.naturalHeight);
        else alMedir(n, el.width, el.height);
      })
      .catch((error) => {
        if (vivo && error?.name !== 'RenderingCancelledException') setFallo(true);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hojas, n, pedido]);
  // 1.14: la capa de texto del PDF, encima del dibujo. Se arma una vez por página y acompaña el zoom sola.
  useEffect(() => {
    if (!capas) return;
    let vivo = true;
    capas
      .pedir(n)
      .then((c) => {
        if (!vivo || !c?.el || !ranura.current) return;
        ranura.current.replaceChildren(c.el);
        setCapa(c);
        alCapa?.(n);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capas, n]);
  useLayoutEffect(() => {
    if (capa) capa.el.style.transform = `scale(${ancho / capa.base.ancho}, ${alto / capa.base.alto}) ${capa.base.giro}`;
  }, [capa, ancho, alto]);
  return (
    <div className="relative shrink-0" style={{ width: ancho, height: alto }}>
      <div ref={caja} data-hoja={n} className="size-full bg-superficie-2 shadow-[0_2px_14px_-6px_rgb(var(--sombra)/0.45)] [&>*]:block [&>*]:size-full" />
      {capas && <div ref={ranura} data-ranura-texto={n} className="absolute inset-0 overflow-hidden" />}
      {fallo && <p className="absolute inset-0 grid place-items-center p-4 text-center text-[0.76rem] text-tinta-tenue">{t('paginas.paginaRota')}</p>}
    </div>
  );
}

export function LectorPaginas({ libro, formato, onCerrar, colEstado, soloLectura, onEditarRapido }) {
  const [doc, setDoc] = useState(null); // { tipo, total, indice }
  const [hojas, setHojas] = useState(null);
  const [tamanos, setTamanos] = useState([]); // lo que mide cada página (null: todavía no se sabe)
  const [error, setError] = useState(null);
  const [lugar, setLugar] = useState(null); // lo que mide el marco
  const [pagina, setPagina] = useState(0); // una página del pliego a la vista (el pliego se busca a partir de ella)
  const [sentido, setSentido] = useState(1); // 1: hacia adelante, -1: hacia atrás (para la animación)
  const [rtl, setRtl] = useState(false);
  const [doble, setDoble] = useState('auto'); // 'auto' | 'una' | 'dos'
  const [zoomNitido, setZoomNitido] = useState(1); // el zoom ya quieto: con este se dibuja
  const [cartelZoom, setCartelZoom] = useState(null);
  const [ajustes, cambiarAjustes] = useAjustesLectura();
  const [panelMedida, setPanelMedida] = useState(false);
  const [indiceAbierto, setIndiceAbierto] = useState(false);
  const [enfoque, setEnfoque] = useState(false);
  const [asomar, setAsomar] = useState(null);
  const [sobreBarra, setSobreBarra] = useState(false);
  const [pista, setPista] = useState(false);
  const sesion = useSesionLectura({ libro, abierto: Boolean(doc), colEstado, soloLectura, onEditarRapido });
  const { alPasarPagina, actividad } = sesion;
  // 1.14: el texto del PDF
  const [fuente, setFuente] = useState(null); // el PDF abierto (lib/pdf.js), para pedirle el texto de una página
  const [capas, setCapas] = useState(null);
  const [etiquetas, setEtiquetas] = useState(null); // números de página impresos, si el PDF los trae
  const [sinTexto, setSinTexto] = useState(null); // 'escaneado' | 'roto' | null
  const [cartelSinTexto, setCartelSinTexto] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo, texto, accion }: copiado, borrado con «Deshacer», errores
  const [traducir, setTraducir] = useState(() => preferencia(`broots-traducir-pdf-${libro.uuid}`, false));
  const [tieneClave, setTieneClave] = useState(false);
  const [claveAbierta, setClaveAbierta] = useState(false);

  const marco = useRef(null);
  const zona = useRef(null); // el marco y el panel de traducción: ahí se ubican la barrita y las tarjetas
  const lienzo = useRef(null);
  // Lo que se mueve con el mouse no pasa por React: se escribe directo en el transform.
  const vista = useRef({ zoom: 1, x: 0, y: 0 }).current;
  const r = useRef({ arrastre: null, ultimoClic: 0, clicPendiente: null, ultimaRueda: 0, ultimoPaneo: 0, finCartel: null, finZoom: null, medida: { ancho: 0, alto: 0 } }).current;

  // ---------- Abrir ----------

  useEffect(() => {
    let vivo = true;
    let fuente = null;
    (async () => {
      const d = await window.lector.abrirPaginas(libro.id, formato);
      if (!vivo) return;
      if (!d.ok) return setError(d.mensaje);
      let indice = d.indice ?? [];
      let medidas;
      if (d.tipo === 'pdf') {
        try {
          fuente = await abrirPdf(libro.id, d.largo);
        } catch (e) {
          if (vivo) setError(t(`paginas.pdf.${e.motivo ?? 'danado'}`));
          return;
        }
        if (!vivo) return fuente.cerrar();
        // Lo que mide cada página (casi siempre todas iguales). Un PDF chico alcanza a medirse antes de mostrarse, así los
        // pares de páginas no se reacomodan a la vista; en uno enorme se sigue en segundo plano.
        const pdfAbierto = fuente;
        medidas = Array(pdfAbierto.total).fill(pdfAbierto.tamanoInicial);
        let mostrado = false;
        let cambio = false;
        const medicion = (async () => {
          for (let i = 0; i < pdfAbierto.total && vivo; i++) {
            try {
              const m = await pdfAbierto.medir(i);
              if (Math.abs(aspectoDe(m) - aspectoDe(medidas[i])) > 0.01) {
                medidas[i] = m;
                cambio = true;
              }
            } catch {}
            if (vivo && mostrado && cambio && (i % 40 === 39 || i === pdfAbierto.total - 1)) {
              setTamanos([...medidas]);
              cambio = false;
            }
          }
        })();
        await Promise.race([medicion, new Promise((listo) => setTimeout(listo, 300))]);
        if (!vivo) return;
        mostrado = true;
      } else {
        fuente = abrirComicEnLector(libro.id, d);
        medidas = d.tamanos;
      }
      const p = d.posicion;
      setRtl(p?.rtl ?? (Boolean(d.manga) || tieneEtiquetaManga(libro)));
      setDoble(p?.doble ?? 'auto');
      vista.zoom = encerrar(p?.zoom ?? 1, 1, ZOOM_MAXIMO);
      setZoomNitido(vista.zoom);
      setPagina(encerrar(p?.hoja ?? 0, 0, fuente.total - 1));
      setTamanos([...medidas]); // una copia: en un PDF enorme, la medición sigue sobre el original
      setHojas(crearHojas(fuente));
      if (d.tipo === 'pdf') {
        setFuente(fuente);
        setCapas(crearCapas(fuente));
      }
      setDoc({ tipo: d.tipo, total: fuente.total, indice });
      // La pista de la primera vez: en un PDF, primero la de seleccionar texto (1.14); después, la del pellizco.
      try {
        const cual = d.tipo === 'pdf' && !localStorage.getItem(PISTA_PDF) ? PISTA_PDF : !localStorage.getItem(PISTA) ? PISTA : null;
        if (cual) {
          localStorage.setItem(cual, '1');
          setPista(cual === PISTA_PDF ? 'pdf' : 'paginas');
          setTimeout(() => setPista(false), 9000);
        }
      } catch {}
      // En segundo plano: el índice del PDF, sus números de página y si tiene texto para seleccionar.
      if (d.tipo === 'pdf') {
        const pdfAbierto = fuente;
        pdfAbierto.indice().then((lista) => vivo && setDoc((a) => a && { ...a, indice: lista })).catch(() => {});
        pdfAbierto.etiquetas().then((e) => vivo && Array.isArray(e) && setEtiquetas(e));
        const revisar = Array.from({ length: Math.min(PAGINAS_A_REVISAR, pdfAbierto.total) }, (_, i) => pdfAbierto.modelo(i).catch(() => null));
        Promise.all(revisar).then((modelos) => {
          if (!vivo) return;
          const motivo = sinTextoUtil(modelos.filter(Boolean));
          setSinTexto(motivo);
          // El cartel, una vez por libro (después queda la marca en la barra: el botón de subrayar explica por qué no hay).
          const visto = `broots-pdf-sin-texto-${libro.uuid}`;
          if (motivo && !preferencia(visto, false)) {
            recordar(visto, true);
            setCartelSinTexto(true);
          }
        });
      }
    })();
    return () => {
      vivo = false;
      fuente?.cerrar();
    };
    // Solo al cambiar de libro o de formato (no cuando se recarga la biblioteca).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro.id, formato]);

  const alMedir = useCallback((n, ancho, alto) => {
    if (!ancho || !alto) return;
    setTamanos((previos) => {
      if (previos[n] && Math.abs(aspectoDe(previos[n]) - ancho / alto) < 0.01) return previos;
      const nuevos = [...previos];
      nuevos[n] = { ancho, alto };
      return nuevos;
    });
  }, []);

  // ---------- Medidas y pliegos ----------

  useLayoutEffect(() => {
    const medir = () => setLugar({ ancho: marco.current.clientWidth, alto: marco.current.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(marco.current);
    return () => observador.disconnect();
  }, []);

  const total = doc?.total ?? 0;
  const autoDos = lugar ? entranDos(lugar.ancho, lugar.alto) : false;
  const dos = doble === 'dos' || (doble === 'auto' && autoDos);
  const pliegos = useMemo(() => armarPliegos(tamanos, dos), [tamanos, dos]);
  const iPliego = pliegoDe(pliegos, pagina);
  const pliego = pliegos[iPliego] ?? [];
  const ultimaVisible = pliego.length ? Math.max(...pliego) + 1 : 0;
  const primeraVisible = pliego.length ? pliego[0] + 1 : 0;
  const progreso = total ? ultimaVisible / total : 0;
  const pixeles = (window.devicePixelRatio || 1) * Math.min(zoomNitido, ZOOM_NITIDO_MAXIMO);

  // ---------- 1.14: subrayar, explicar, definir y traducir (solo PDF) ----------

  // Cartelitos (copiado, borrado con «Deshacer», errores): se van solos a los 6 segundos.
  const avisar = useCallback((texto, tipo = 'subrayado', accion = null) => {
    const clave = Date.now();
    setAviso({ tipo, texto, accion, clave });
    setTimeout(() => setAviso((a) => (a?.clave === clave ? null : a)), 6000);
  }, []);
  const etiquetaDe = (n) => etiquetas?.[n] || String(n + 1);
  const tituloDe = (n) => {
    let actual = null;
    for (const e of doc?.indice ?? []) if (e.pagina <= n) actual = e.titulo;
    return actual;
  };
  const pedirModelo = useCallback((n) => (fuente ? fuente.modelo(n) : Promise.reject(new Error('sin PDF'))), [fuente]);
  const conTexto = doc?.tipo === 'pdf' && !sinTexto;
  const sub = useSubrayadosPdf({ libro, capas, pedirModelo, paginas: pliego, zona, tituloDe, etiquetaDe, abierto: Boolean(capas), avisar });
  const explicar = useExplicar({ libro, sub, avisar });
  const definir = useDefinir({ sub, explicar, avisar, r: null, idiomaLibro: libro.languages?.[0] });

  useEffect(() => {
    window.lector.estadoTraduccion().then((e) => setTieneClave(e.tieneClave)).catch(() => {});
  }, []);
  const claveTraducir = `broots-traducir-pdf-${libro.uuid}`;
  const cambiarTraducir = () => {
    if (!traducir && !tieneClave) return setClaveAbierta(true);
    recordar(claveTraducir, !traducir);
    setTraducir(!traducir);
  };
  const claveLista = async () => {
    setClaveAbierta(false);
    const e = await window.lector.estadoTraduccion();
    setTieneClave(e.tieneClave);
    setAviso(null);
    if (e.tieneClave && !traducir) {
      recordar(claveTraducir, true);
      setTraducir(true);
    }
  };
  const traduccionAbierta = conTexto && traducir && tieneClave;

  /** Lo que ocupa un pliego ajustado a la ventana. */
  const medidaDe = (paginas) => {
    if (!lugar) return { alto: 0, anchos: [], ancho: 0 };
    const medidas = paginas.map((n) => tamanos[n]);
    const alto = altoAjustado(medidas, lugar.ancho - COSTADO * 2, lugar.alto - MARGEN_VERTICAL * 2);
    const anchos = medidas.map((m) => aspectoDe(m) * alto);
    return { alto, anchos, ancho: anchos.reduce((s, a) => s + a, 0) };
  };
  const medidaActual = medidaDe(pliego);
  r.medida = medidaActual;

  // ---------- Zoom y desplazamiento ----------

  const aplicarVista = () => {
    if (lienzo.current) lienzo.current.style.transform = `translate3d(${vista.x}px, ${vista.y}px, 0) scale(${vista.zoom})`;
  };
  const limites = () => ({
    x: Math.max(0, (r.medida.ancho * vista.zoom - (lugar?.ancho ?? 0)) / 2),
    y: Math.max(0, (r.medida.alto * vista.zoom - (lugar?.alto ?? 0)) / 2),
  });
  const contener = () => {
    const l = limites();
    vista.x = encerrar(vista.x, -l.x, l.x);
    vista.y = encerrar(vista.y, -l.y, l.y);
  };
  /** Cambia el zoom dejando quieto lo que está debajo del mouse. Al final, el PDF se vuelve a dibujar con más detalle. */
  const ponerZoom = (nuevo, clientX, clientY) => {
    const z = encerrar(nuevo, 1, ZOOM_MAXIMO);
    const caja = marco.current.getBoundingClientRect();
    const cx = (clientX ?? caja.left + caja.width / 2) - (caja.left + caja.width / 2);
    const cy = (clientY ?? caja.top + caja.height / 2) - (caja.top + caja.height / 2);
    vista.x = cx - ((cx - vista.x) * z) / vista.zoom;
    vista.y = cy - ((cy - vista.y) * z) / vista.zoom;
    vista.zoom = z;
    contener();
    aplicarVista();
    setCartelZoom(Math.round(z * 100));
    clearTimeout(r.finCartel);
    r.finCartel = setTimeout(() => setCartelZoom(null), 1100);
    clearTimeout(r.finZoom);
    r.finZoom = setTimeout(() => setZoomNitido(vista.zoom), 180);
  };
  useEffect(() => () => {
    clearTimeout(r.finCartel);
    clearTimeout(r.finZoom);
    clearTimeout(r.clicPendiente);
  }, [r]);

  // Al cambiar de pliego (o de tamaño de ventana): acercada, la página nueva arranca por arriba y por donde se empieza a leer.
  const clavePliego = pliego.join('-');
  const pliegoAnterior = useRef(null);
  useLayoutEffect(() => {
    if (pliegoAnterior.current !== clavePliego) {
      pliegoAnterior.current = clavePliego;
      const l = limites();
      vista.y = l.y;
      vista.x = rtl ? -l.x : l.x;
    }
    contener();
    aplicarVista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavePliego, medidaActual.alto, medidaActual.ancho, lugar, rtl]);

  // ---------- Navegación ----------

  const capitulos = useMemo(() => new Set((doc?.indice ?? []).filter((e) => e.nivel === 0).map((e) => e.pagina)), [doc?.indice]);
  const sinCapitulos = capitulos.size === 0;

  const irAPliego = (i, adelante) => {
    const destino = pliegos[i];
    if (!destino) return;
    setSentido(adelante ? 1 : -1);
    setPagina(destino[0]);
    alPasarPagina({
      adelante,
      paginas: destino.length,
      // Sin capítulos, la pausa sugerida del modo libre no tendría cuándo aparecer: cualquier página le sirve.
      capitulo: sinCapitulos || destino.some((n) => capitulos.has(n)),
    });
  };
  const siguiente = () => irAPliego(iPliego + 1, true);
  const anterior = () => irAPliego(iPliego - 1, false);
  const izquierda = () => (rtl ? siguiente() : anterior());
  const derecha = () => (rtl ? anterior() : siguiente());
  const irAPagina = (n) => {
    const destino = encerrar(n - 1, 0, total - 1);
    setSentido(destino >= pagina ? 1 : -1);
    setPagina(destino);
  };
  const cambiarDoble = () => setDoble(dos ? (autoDos ? 'una' : 'auto') : autoDos ? 'auto' : 'dos');

  // Guarda por dónde vas.
  useEffect(() => {
    if (!doc || !pliego.length) return;
    window.lector.guardarPosicion(libro.id, { formato, hoja: pliego[0], pagina: ultimaVisible, paginas: total, progreso: Math.round(progreso * 1000) / 1000, rtl, doble, zoom: zoomNitido });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.tipo, clavePliego, rtl, doble, zoomNitido]);

  // La sesión y «Mi lectura»: igual que en un EPUB.
  sesion.datos.current = { progreso, totalPaginas: total, estimado: false };
  useEffect(() => {
    if (total && ultimaVisible >= total) sesion.alLlegarAlFinal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimaVisible, total]);

  // Prepara las páginas vecinas y suelta las lejanas. Espera un instante: lo que se ve va primero.
  useEffect(() => {
    if (!hojas || !lugar || !pliego.length) return;
    let vivo = true;
    const cerca = new Set();
    for (const d of [0, 1, -1, 2, -2]) (pliegos[iPliego + d] ?? []).forEach((n) => cerca.add(n));
    hojas.soltarLejos(cerca);
    capas?.soltarLejos(cerca);
    const espera = setTimeout(async () => {
      for (const d of [1, -1, 2]) {
        const paginas = pliegos[iPliego + d];
        if (!paginas) continue;
        const { anchos } = medidaDe(paginas);
        for (let k = 0; k < paginas.length && vivo; k++) {
          await hojas.pedir(paginas[k], Math.round(anchos[k] * pixeles)).catch(() => {});
          if (vivo && d === 1) await capas?.pedir(paginas[k]).catch(() => {}); // la capa de texto de la que sigue, también
        }
      }
    }, 150);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hojas, capas, clavePliego, lugar, pixeles, pliegos]);

  // Al cambiar de página, la barrita y las tarjetas se van (como en el EPUB).
  useEffect(() => {
    sub.cerrarBarra();
    explicar.cerrar();
    definir.cerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavePliego]);

  /** Desde la lista de subrayados: a su página, y un anillo un momento para encontrarlo. */
  const irASubrayado = (e) => {
    if (e.formato !== 'PDF') return;
    sub.setPanelAbierto(false);
    irAPagina(e.parrafo + 1);
    setTimeout(() => sub.destacar(e.id), 450);
  };

  // ---------- Mouse y teclado ----------

  const alApretar = (e) => {
    if (e.button !== 0) return;
    // 1.14: sobre el texto de un PDF, arrastrar selecciona (como en un navegador). Fuera del texto, mueve la página.
    const enTexto = Boolean(conTexto && e.target.closest?.('.capa-texto > span'));
    if (enTexto) for (const [, c] of capas?.listas() ?? []) c.el.classList.add('seleccionando');
    else e.preventDefault(); // que arrastrar no «levante» la página ni seleccione nada
    r.arrastre = { x: e.clientX, y: e.clientY, ox: vista.x, oy: vista.y, seMovio: false, enTexto };
  };
  const alClic = (e) => {
    const { clientX, clientY } = e;
    if (Date.now() - r.ultimoClic < DOBLE_CLIC) {
      // Doble clic: acercar o volver a alejar.
      clearTimeout(r.clicPendiente);
      r.ultimoClic = 0;
      ponerZoom(vista.zoom > 1 ? 1 : ZOOM_CLIC, clientX, clientY);
      return;
    }
    r.ultimoClic = Date.now();
    if (vista.zoom > 1) return; // acercada, un clic no pasa de página: es fácil hacerlo sin querer al arrastrar
    clearTimeout(r.clicPendiente);
    r.clicPendiente = setTimeout(() => {
      const caja = marco.current?.getBoundingClientRect();
      if (caja) clientX < caja.left + caja.width / 2 ? manos.current.izquierda() : manos.current.derecha();
    }, DOBLE_CLIC);
  };
  // Lo que usan los manejadores que se registran una sola vez: siempre la versión de este dibujo.
  const manos = useRef({});
  manos.current = {
    izquierda, derecha, siguiente, anterior, alClic, contener, aplicarVista, ponerZoom, limites,
    /** Se soltó el mouse después de apretarlo sobre el texto del PDF. */
    alSoltarTexto(e, a) {
      for (const [, c] of capas?.listas() ?? []) c.el.classList.remove('seleccionando');
      // Quedó algo seleccionado (arrastrando o con doble clic sobre una palabra): la barrita, sin pasar de página ni acercar.
      if (sub.alSoltar() || (!a.seMovio && sub.alTocar(e))) {
        clearTimeout(r.clicPendiente);
        r.ultimoClic = 0;
        return;
      }
      if (!a.seMovio) alClic(e);
    },
    alRodar(e) {
      if (e.ctrlKey) {
        e.preventDefault(); // que no intente hacer zoom de la ventana
        return ponerZoom(vista.zoom * Math.exp(encerrar(-e.deltaY, -30, 30) * 0.01), e.clientX, e.clientY);
      }
      if (panelMedida || indiceAbierto || sub.barra || sub.nota || sub.panelAbierto || explicar.tarjeta || definir.tarjeta) return;
      const vertical = Math.abs(e.deltaY) > Math.abs(e.deltaX);
      const delta = vertical ? e.deltaY : e.deltaX;
      if (vista.zoom > 1) {
        // Acercada, la rueda recorre la página; recién en el borde, y con un gesto nuevo, pasa a la siguiente.
        const { x, y } = vista;
        vista.x -= e.deltaX;
        vista.y -= e.deltaY;
        contener();
        if (vista.x !== x || vista.y !== y) {
          r.ultimoPaneo = Date.now();
          return aplicarVista();
        }
        if (Date.now() - r.ultimoPaneo < 350) return;
      }
      if (Math.abs(delta) < 12 || Date.now() - r.ultimaRueda < 380) return;
      r.ultimaRueda = Date.now();
      // En manga, deslizar de costado también va al revés; la rueda (arriba y abajo) siempre es adelante y atrás.
      (rtl && !vertical ? -delta : delta) > 0 ? siguiente() : anterior();
    },
    alPresionar(e) {
      if (e.target.closest?.('input, textarea')) return;
      actividad();
      if (e.key === 'Escape') {
        if (claveAbierta) setClaveAbierta(false);
        else if (explicar.tarjeta) explicar.cerrar();
        else if (definir.tarjeta) definir.cerrar();
        else if (sub.cerrarAlgo()) return; // la nota, la barrita o la lista de subrayados
        else if (panelMedida) setPanelMedida(false);
        else if (indiceAbierto) setIndiceAbierto(false);
        else if (sesion.panelAbierto) sesion.setPanelAbierto(false);
        else if (enfoque) setEnfoque(false);
        else onCerrar();
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setEnfoque((v) => !v);
      } else if (e.ctrlKey && ['+', '=', '-', '0'].includes(e.key)) {
        e.preventDefault();
        ponerZoom(e.key === '0' ? 1 : vista.zoom * (e.key === '-' ? 0.8 : 1.25));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        derecha();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        izquierda();
      } else if (['PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        siguiente();
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        anterior();
      } else if (['ArrowDown', 'ArrowUp'].includes(e.key) && vista.zoom > 1) {
        e.preventDefault();
        vista.y += e.key === 'ArrowDown' ? -80 : 80;
        contener();
        aplicarVista();
      }
    },
  };

  useEffect(() => {
    const alMover = (e) => {
      const a = r.arrastre;
      if (!a) return;
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      if (Math.hypot(dx, dy) > ARRASTRE_MINIMO) a.seMovio = true;
      if (!a.seMovio || vista.zoom <= 1 || a.enTexto) return;
      vista.x = a.ox + dx;
      vista.y = a.oy + dy;
      manos.current.contener();
      manos.current.aplicarVista();
    };
    const alSoltar = (e) => {
      const a = r.arrastre;
      r.arrastre = null;
      if (a?.enTexto) manos.current.alSoltarTexto(e, a);
      else if (a && !a.seMovio) manos.current.alClic(e);
    };
    const alPresionar = (e) => manos.current.alPresionar(e);
    window.addEventListener('mousemove', alMover);
    window.addEventListener('mouseup', alSoltar);
    window.addEventListener('keydown', alPresionar);
    // La rueda se escucha a mano: en onWheel de React no se puede cancelar el zoom del pellizco.
    const el = marco.current;
    const alRodar = (e) => manos.current.alRodar(e);
    el.addEventListener('wheel', alRodar, { passive: false });
    return () => {
      window.removeEventListener('mousemove', alMover);
      window.removeEventListener('mouseup', alSoltar);
      window.removeEventListener('keydown', alPresionar);
      el.removeEventListener('wheel', alRodar);
    };
  }, [r, vista]);

  // ---------- Lo mismo que el lector de EPUB ----------

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

  // La barra de título de Windows toma el color del tema elegido.
  useEffect(() => {
    window.lector.colorBarra?.(ajustes.tema === 'auto' ? null : COLORES_BARRA[ajustes.tema]);
  }, [ajustes.tema]);
  useEffect(() => () => window.lector.colorBarra?.(null), []);

  // Con un libro abierto, la cruz de la ventana vuelve a la biblioteca (ver main.cjs).
  const refCerrar = useRef(onCerrar);
  refCerrar.current = onCerrar;
  useEffect(() => {
    window.lector.abierto(true);
    const quitar = window.lector.alPedirCierre(() => refCerrar.current());
    return () => {
      quitar();
      window.lector.abierto(false);
    };
  }, []);

  // «Te quedan ~X»: páginas que faltan divididas por tu ritmo.
  const porMinuto = sesion.ritmos && total ? ritmoParaEstimar(sesion.ritmos, total) : null;
  const quedaLibro = porMinuto && total - ultimaVisible > 0 ? estimacion((total - ultimaVisible) / porMinuto) : null;
  const siguienteCapitulo = [...capitulos].filter((n) => n >= ultimaVisible).sort((a, b) => a - b)[0];
  const quedaCapitulo = porMinuto && siguienteCapitulo > ultimaVisible ? estimacion((siguienteCapitulo - ultimaVisible) / porMinuto) : null;

  // ---------- Pantalla ----------

  const entradaActual = (() => {
    let actual = null;
    for (const e of doc?.indice ?? []) if (e.pagina <= ultimaVisible - 1) actual = e;
    return actual;
  })();
  const barraEscondida = (lado) => enfoque && asomar !== lado && !(lado === 'arriba' && sobreBarra);
  const flotante = (lado) => {
    if (!enfoque) return '';
    const borde = lado === 'arriba' ? 'top-0 shadow-[0_6px_18px_-12px_rgb(var(--sombra)/0.5)]' : 'bottom-0 shadow-[0_-6px_18px_-12px_rgb(var(--sombra)/0.5)]';
    const escondida = barraEscondida(lado) ? `pointer-events-none opacity-0 ${lado === 'arriba' ? '-translate-y-2' : 'translate-y-2'}` : '';
    return `absolute inset-x-0 z-30 bg-superficie transition-[opacity,translate] duration-200 ${borde} ${escondida}`;
  };
  const flecha = 'grid size-10 place-items-center rounded-full text-tinta-tenue opacity-50 transition-[opacity,background-color,color] group-hover:bg-superficie-2 group-hover:text-tinta group-hover:opacity-100';
  const haciaDonde = (sentido > 0) !== rtl ? 1 : -1; // de qué costado entra la página nueva
  const ordenVisual = rtl ? [...pliego].reverse() : pliego;

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col bg-superficie text-tinta"
      initial={{ opacity: 0, transform: 'scale(0.985)' }}
      animate={{ opacity: 1, transform: 'scale(1)' }}
      exit={{ opacity: 0, transform: 'scale(0.985)', transition: { duration: 0.16 } }}
      transition={resorte}
      onMouseMove={alMoverMouse}
      data-lector-paginas={doc?.tipo ?? 'abriendo'}
      data-enfoque={enfoque ? 'si' : 'no'}
      data-rtl={rtl ? 'si' : 'no'}
      data-dos={dos ? 'si' : 'no'}
      data-sin-texto={sinTexto ?? undefined}
      data-tema-lector={ajustes.tema === 'auto' ? undefined : ajustes.tema}
    >
      <header
        onMouseEnter={() => setSobreBarra(true)}
        onMouseLeave={() => setSobreBarra(false)}
        className={`flex h-11 shrink-0 items-center gap-1.5 pr-[150px] pl-3 ${enfoque ? flotante('arriba') : 'arrastrable'}`}
      >
        <BotonBarra activo={indiceAbierto} onClick={() => setIndiceAbierto((v) => !v)} disabled={!doc?.indice.length} title={t('lector.indice')} data-boton-indice>
          <IconoIndice className="size-4" /> {t('lector.indice')}
        </BotonBarra>
        <div className="min-w-0 flex-1 px-3 text-center">
          <p className="truncate font-serif text-[0.86rem] font-semibold">{libro.title}</p>
          {entradaActual && <p className="truncate text-[0.68rem] text-tinta-tenue">{entradaActual.titulo}</p>}
        </div>
        {doc?.tipo === 'pdf' && (
          <>
            <BotonBarra activo={sub.panelAbierto} onClick={() => sub.setPanelAbierto((v) => !v)} title={sinTexto ? t(`pdf.${sinTexto}`) : t('subrayados.lector.boton')} data-boton-subrayados>
              <IconoSubrayar className="size-4" />
            </BotonBarra>
            <BotonBarra activo={traduccionAbierta} onClick={cambiarTraducir} disabled={Boolean(sinTexto)} title={sinTexto ? t(`pdf.${sinTexto}`) : traduccionAbierta ? t('pdf.cerrarTraduccion') : t('pdf.abrirTraduccion')} data-boton-traducir>
              <IconoTraducir className="size-4" /> {t('lector.traducir')}
            </BotonBarra>
          </>
        )}
        <BotonBarra activo={rtl} onClick={() => setRtl((v) => !v)} disabled={!doc} title={t(rtl ? 'paginas.mangaPrendido' : 'paginas.mangaApagado')} data-boton-manga>
          <IconoManga className="size-4" /> {t('paginas.manga')}
        </BotonBarra>
        <BotonBarra onClick={cambiarDoble} disabled={!doc} title={t(dos ? 'paginas.verUna' : 'paginas.verDos')} data-boton-doble>
          {dos ? <IconoDosPaginas className="size-4" /> : <IconoUnaPagina className="size-4" />}
        </BotonBarra>
        <BotonBarra activo={panelMedida} onClick={() => setPanelMedida((v) => !v)} title={t('paginas.temaBoton')} data-boton-medida>
          <IconoMedida className="size-4" />
        </BotonBarra>
        <BotonSesion sesion={sesion} restanteCapitulo={quedaCapitulo} sinCapitulos={sinCapitulos} />
        <BotonBarra activo={enfoque} onClick={() => setEnfoque((v) => !v)} title={enfoque ? t('habito.lector.salirEnfoque') : t('habito.lector.enfoque')} data-boton-enfoque>
          <IconoEnfoque className="size-4" />
        </BotonBarra>
      </header>

      <div ref={zona} className="relative flex min-h-0 flex-1" data-zona-paginas>
        <div ref={marco} className="relative min-h-0 min-w-0 flex-1 overflow-hidden" data-marco-paginas>
          {/* La capa que recibe los clics y el arrastre; los paneles y las flechas van por encima. */}
          <div className={`absolute inset-0 ${zoomNitido > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`} onMouseDown={alApretar}>
            <div ref={lienzo} data-lienzo className="absolute inset-0 will-change-transform">
              <AnimatePresence initial={false}>
                {hojas && lugar && pliego.length > 0 && (
                  <motion.div
                    key={clavePliego}
                    data-pliego={clavePliego}
                    initial={{ opacity: 0, transform: `translateX(${haciaDonde * 36}px)` }}
                    animate={{ opacity: 1, transform: 'translateX(0px)' }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={resorteRapido}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    {ordenVisual.map((n) => (
                      <Hoja
                        key={n}
                        hojas={hojas}
                        capas={sinTexto ? null : capas}
                        n={n}
                        alto={medidaActual.alto}
                        ancho={medidaActual.anchos[pliego.indexOf(n)]}
                        pixeles={pixeles}
                        alMedir={alMedir}
                        alCapa={sub.alCapa}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Costados: pasan de página; en manga, el de la izquierda es el que avanza */}
          <button type="button" onClick={izquierda} title={t(rtl ? 'paginas.siguienteManga' : 'lector.anterior')} className="group absolute inset-y-0 left-0 z-[5] grid w-14 place-items-center" data-costado="izquierda">
            <span className={flecha}>
              <IconoAnterior className="size-6" />
            </span>
          </button>
          <button type="button" onClick={derecha} title={t(rtl ? 'paginas.anteriorManga' : 'lector.siguiente')} className="group absolute inset-y-0 right-0 z-[5] grid w-14 place-items-center" data-costado="derecha">
            <span className={flecha}>
              <IconoSiguiente className="size-6" />
            </span>
          </button>

          {!doc && !error && <p className="absolute inset-0 grid place-items-center text-sm text-tinta-tenue">{t('lector.abriendo')}</p>}
          {error && (
            <div className="absolute inset-0 z-[6] grid place-items-center bg-superficie p-8" data-error-paginas>
              <div className="max-w-sm text-center">
                <p className="text-[0.9rem]">{error}</p>
                <button type="button" onClick={onCerrar} className="mt-4 text-[0.8rem] font-medium text-acento hover:underline">
                  {t('lector.volver')}
                </button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {pista && !(pista === 'pdf' && sinTexto) && (
              <motion.div
                key="pista"
                data-aviso-lector="pista"
                data-pista={pista}
                initial={{ opacity: 0, transform: 'translate(-50%, -8px)' }}
                animate={{ opacity: 1, transform: 'translate(-50%, 0px)' }}
                exit={{ opacity: 0, transform: 'translate(-50%, -6px)' }}
                transition={resorteRapido}
                className="squircle pointer-events-none absolute top-2 left-1/2 z-[26] max-w-[80%] rounded-full bg-superficie-2 px-3.5 py-1.5 text-[0.74rem] shadow-[0_6px_18px_-8px_rgb(var(--sombra)/0.5),inset_0_0_0_1px_var(--borde)]"
              >
                {t(pista === 'pdf' ? 'pdf.pista' : 'paginas.pista')}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Índice */}
          <AnimatePresence>
            {indiceAbierto && doc && (
              <>
                <motion.div key="velo" className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIndiceAbierto(false)} />
                <motion.nav
                  key="indice"
                  data-indice-paginas
                  initial={{ opacity: 0, transform: 'translateX(-24px)' }}
                  animate={{ opacity: 1, transform: 'translateX(0px)' }}
                  exit={{ opacity: 0, transform: 'translateX(-16px)', transition: { duration: 0.14 } }}
                  transition={resorte}
                  className="squircle absolute top-2 bottom-3 left-3 z-10 w-80 overflow-y-auto rounded-[18px] bg-superficie p-2 shadow-flotante"
                >
                  {doc.indice.map((e, k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setIndiceAbierto(false);
                        irAPagina(e.pagina + 1);
                      }}
                      style={{ paddingLeft: `${10 + e.nivel * 14}px` }}
                      className={`block w-full rounded-[10px] py-1.5 pr-2.5 text-left text-[0.8rem] transition-colors ${e === entradaActual ? 'bg-seleccion font-medium' : 'hover:bg-superficie-2'}`}
                    >
                      <span className="line-clamp-2">{e.titulo}</span>
                    </button>
                  ))}
                </motion.nav>
              </>
            )}
          </AnimatePresence>

          <PanelLectura abierto={panelMedida} onCerrar={() => setPanelMedida(false)} ajustes={ajustes} onCambiar={cambiarAjustes} soloTema />
          <AvisoSesion sesion={sesion} onCerrarLibro={onCerrar} enfoque={enfoque} />

          {/* El zoom mientras se pellizca el trackpad */}
          <AnimatePresence>
            {cartelZoom != null && (
              <motion.div
                key="zoom"
                data-zoom-al-pellizcar
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-superficie-2 px-3 py-1 text-[0.76rem] tabular-nums shadow-[inset_0_0_0_1px_var(--borde)]"
              >
                {t('paginas.zoomActual', { n: cartelZoom })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 1.14: la traducción del PDF, al costado (las letras de un PDF son un dibujo: no se pueden reemplazar) */}
        {doc?.tipo === 'pdf' && (
          <PanelTraduccionPdf
            libro={libro}
            abierto={traduccionAbierta}
            paginas={pliego}
            siguientes={pliegos[iPliego + 1] ?? []}
            pedirModelo={pedirModelo}
            etiquetaDe={etiquetaDe}
            onCerrar={cambiarTraducir}
            alSeleccionar={sub.alSoltarLectura}
            alError={(res) => avisar(res?.sinClave ? t('lector.faltaClave') : res?.mensaje || t('pdf.noPudeTraducir'), res?.sinClave ? 'sinClave' : 'error')}
          />
        )}

        {/* Los cartelitos: copiado, borrado con «Deshacer», errores de la traducción */}
        <AnimatePresence>
          {aviso && (
            <motion.div
              key={aviso.tipo}
              initial={{ opacity: 0, transform: 'translate(-50%, -8px)' }}
              animate={{ opacity: 1, transform: 'translate(-50%, 0px)' }}
              exit={{ opacity: 0, transform: 'translate(-50%, -6px)' }}
              transition={resorteRapido}
              data-aviso-lector={aviso.tipo}
              className="squircle absolute top-2 left-1/2 z-[26] flex max-w-[80%] items-center gap-2 rounded-full bg-superficie-2 px-3.5 py-1.5 text-[0.74rem] shadow-[0_6px_18px_-8px_rgb(var(--sombra)/0.5),inset_0_0_0_1px_var(--borde)]"
            >
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
              {aviso.tipo === 'sinClave' && (
                <button type="button" onClick={() => setClaveAbierta(true)} className="shrink-0 font-medium text-acento hover:underline">
                  {t('lector.configurar')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Un PDF escaneado (o con el texto ilegible): se avisa una vez, claro, y se sigue leyendo */}
        <AnimatePresence>
          {cartelSinTexto && sinTexto && (
            <motion.div
              key="sin-texto"
              data-aviso-sin-texto={sinTexto}
              initial={{ opacity: 0, transform: 'translate(-50%, -8px)' }}
              animate={{ opacity: 1, transform: 'translate(-50%, 0px)' }}
              exit={{ opacity: 0, transform: 'translate(-50%, -6px)', transition: { duration: 0.12 } }}
              transition={resorte}
              className="squircle absolute top-3 left-1/2 z-[27] flex w-[min(32rem,90%)] items-start gap-3 rounded-[16px] bg-superficie p-3.5 text-[0.8rem] leading-relaxed shadow-flotante"
            >
              <p className="min-w-0 flex-1">{t(`pdf.${sinTexto}`)}</p>
              <button type="button" onClick={() => setCartelSinTexto(false)} className="grid size-6 shrink-0 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta" title={t('lector.cerrar')} data-cerrar-sin-texto>
                <IconoCerrar className="size-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Subrayados: la lista de la derecha y, al seleccionar o tocar uno, la barrita y la nota (igual que en el EPUB) */}
        {doc?.tipo === 'pdf' && (
          <>
            <PanelSubrayados sub={sub} libroId={libro.id} formato="PDF" onIr={irASubrayado} alResultado={(texto, error) => avisar(texto, error ? 'errorSubrayado' : 'subrayado')} />
            {(sub.barra || sub.nota || explicar.tarjeta || definir.tarjeta) && (
              <div data-velo-subrayado className="absolute inset-0 z-[25]" onClick={() => (sub.nota ? sub.guardarNota() : explicar.tarjeta ? explicar.cerrar() : definir.tarjeta ? definir.cerrar() : sub.cerrarBarra())} />
            )}
            <BarraSubrayado sub={sub} onExplicar={explicar.abrir} onDefinir={definir.abrir} />
            <NotaSubrayado sub={sub} />
            <TarjetaExplicacion explicar={explicar} onConfigurar={() => setClaveAbierta(true)} />
            <TarjetaDefinicion definir={definir} />
            <AnimatePresence>{claveAbierta && <ClaveGemini key="clave" tieneClave={tieneClave} onListo={claveLista} onCerrar={() => setClaveAbierta(false)} />}</AnimatePresence>
          </>
        )}
      </div>

      <footer className={`flex h-10 shrink-0 items-center gap-4 px-6 text-[0.7rem] text-tinta-tenue ${flotante('abajo')}`}>
        {total > 0 && <IrAPagina actual={primeraVisible} ultimaVisible={ultimaVisible} total={total} aproximado={false} sinEstimar={false} onIr={irAPagina} />}
        <button
          type="button"
          title={t('lector.barraExplicacion')}
          onClick={(e) => {
            const caja = e.currentTarget.getBoundingClientRect();
            const fraccion = (e.clientX - caja.left) / caja.width;
            irAPagina(Math.max(1, Math.round((rtl ? 1 - fraccion : fraccion) * total)));
          }}
          className="group flex h-5 flex-1 items-center"
          data-barra-avance
        >
          <span className="block h-1 w-full overflow-hidden rounded-full bg-superficie-2 transition-[height] group-hover:h-1.5">
            <span className={`block h-full rounded-full bg-acento/70 ${rtl ? 'origin-right' : 'origin-left'}`} style={{ transform: `scaleX(${progreso})`, transition: 'transform var(--t-suave)' }} />
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
