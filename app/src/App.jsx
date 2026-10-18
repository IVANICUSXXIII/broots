import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  aplicarFiltros,
  columnasEspeciales,
  compilarBusqueda,
  construirGrupos,
  contarValores,
  formatoParaKindle,
  nombreIdioma,
  ordenar,
  region,
  resorte,
  resorteRapido,
  resorteRegreso,
  resorteVuelo,
  t,
  tipoEstado,
  tx,
  useIdioma,
  valorDeEstado,
} from './lib/index.js';
import { BarraHerramientas } from './components/BarraHerramientas.jsx';
import { BarraLateral } from './components/BarraLateral.jsx';
import { Grilla, Lista, RADIO_PORTADA } from './components/Vistas.jsx';
import { ANCHO_DETALLE, PanelDetalle, RADIO_PORTADA_PANEL, RADIO_PORTADA_VISOR, VisorPortada } from './components/Detalle.jsx';
import { CapaVuelo, rectDe } from './components/Vuelo.jsx';
import { HojaKindle } from './components/Kindle.jsx';
import { HojaClub } from './components/Club.jsx';
import { HojaEditar } from './components/Editar.jsx';
import { Lector } from './components/Lector.jsx';
import { HojaCompartir, etiquetaDe, idBibliotecaFamilia } from './components/Compartir.jsx';
import { HojaDuplicados } from './components/Duplicados.jsx';
import { Configuracion } from './components/Configuracion.jsx';
import { MiLectura } from './components/MiLectura.jsx';
import { useFondoDesenfocado } from './lib/fondoDesenfocado.js';
import { Bienvenida, Cargando } from './components/Bienvenida.jsx';
import { AvisoLista, Festejo } from './components/Actualizacion.jsx';
import { IconoCandado, IconoCerrar } from './components/Iconos.jsx';

// Preferencias de pantalla que se recuerdan entre sesiones (solo en esta PC).
function usePreferencia(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(clave)) ?? inicial;
    } catch {
      return inicial;
    }
  });
  const guardar = useCallback(
    (nuevo) => {
      setValor((previo) => {
        const siguiente = typeof nuevo === 'function' ? nuevo(previo) : nuevo;
        try {
          localStorage.setItem(clave, JSON.stringify(siguiente));
        } catch {}
        return siguiente;
      });
    },
    [clave],
  );
  return [valor, guardar];
}

/** Guarda el último valor en una referencia (para usarlo en funciones que no deben cambiar). */
/** Aviso en la barra de abajo mientras Broots descarga o actualiza sus herramientas de Calibre. */
function EstadoCalibre({ estado }) {
  if (!estado || !['descargando', 'preparando', 'listo', 'error'].includes(estado.fase)) return null;
  if (estado.fase === 'error') {
    return (
      <span className="inline-flex max-w-[28rem] items-center gap-2 text-[#bc4749]" title={estado.mensaje}>
        <span className="truncate">{estado.mensaje}</span>
        <button type="button" onClick={() => window.herramientasCalibre.reintentar()} className="shrink-0 font-medium text-acento hover:underline">
          {t('app.reintentar')}
        </button>
      </span>
    );
  }
  const texto =
    estado.fase === 'descargando'
      ? t(estado.actualizando ? 'app.calibreActualizando' : 'app.calibreDescargando', { version: estado.version, porcentaje: estado.total ? Math.round((estado.hecho / estado.total) * 100) : 0 })
      : estado.fase === 'preparando'
        ? t('app.calibrePreparando', { version: estado.version })
        : t('app.calibreListas', { version: estado.version });
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${estado.fase === 'listo' ? 'text-verde' : 'text-tinta-suave'}`}
      title={t('app.calibreExplicacion')}
    >
      {estado.fase !== 'listo' && <span className="size-2.5 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" />}
      {texto}
    </span>
  );
}

function useUltimo(valor) {
  const ref = useRef(valor);
  ref.current = valor;
  return ref;
}

const TODOS = '';
let contadorVuelos = 0;

/** Contenedor de una vista: oculto al instante; al mostrarse aparece con un leve zoom. */
function Vista({ activa, children }) {
  return (
    <motion.div
      initial={false}
      animate={activa ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.985, transition: { duration: 0 } }}
      transition={resorte}
      style={{ display: activa ? undefined : 'none' }}
      className="origin-top"
    >
      {children}
    </motion.div>
  );
}

// --- Dónde está cada portada en pantalla (para la capa de vuelo) ---

function ubicarEnPanel(id) {
  const r = rectDe(document.querySelector(`[data-portada-panel="${id}"]`));
  return r && { ...r, radio: RADIO_PORTADA_PANEL };
}

function ubicarEnVisor(id) {
  const r = rectDe(document.querySelector(`[data-portada-visor="${id}"]`));
  return r && { ...r, radio: RADIO_PORTADA_VISOR };
}

/**
 * Lugar FINAL de la portada en la grilla o la lista. En la grilla se calcula con offsets y no con la
 * posición visible, porque las tarjetas pueden estar deslizándose y lo que importa es dónde terminan.
 */
function ubicarEnVista(id, vista) {
  if (vista === 'lista') {
    const r = rectDe(document.querySelector(`[data-portada-lista="${id}"]`));
    return r && { ...r, radio: 4 };
  }
  const tarjeta = document.querySelector(`[data-tarjeta="${id}"]`);
  if (!tarjeta?.offsetParent) return null;
  const grilla = tarjeta.parentElement.getBoundingClientRect();
  const ancho = tarjeta.offsetWidth;
  return { x: grilla.left + tarjeta.offsetLeft, y: grilla.top + tarjeta.offsetTop, w: ancho, h: ancho * 1.5, radio: RADIO_PORTADA };
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user" transition={resorte}>
      <Aplicacion />
    </MotionConfig>
  );
}

function Aplicacion() {
  // Al cambiar el idioma (Configuración → General) se vuelve a dibujar toda la interfaz.
  const idioma = useIdioma();
  const [carga, setCarga] = useState({ status: 'loading' });
  const [recargando, setRecargando] = useState(false);
  const [vista, setVista] = usePreferencia('vista', 'grilla');
  // La lista se crea la primera vez que se usa y después queda creada.
  const listaUsada = useRef(false);
  if (vista === 'lista') listaUsada.current = true;
  const listaCreada = listaUsada.current;
  const [orden, setOrden] = usePreferencia('orden', 'titulo');
  const [bibliotecaVirtual, setBibliotecaVirtual] = usePreferencia('bibliotecaVirtual', TODOS);
  const [barraVisible, setBarraVisible] = usePreferencia('barraLateral', true);
  const [tema, setTema] = useState('system');
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({});
  const [minEstrellas, setMinEstrellas] = useState(0);
  const [soloPropias, setSoloPropias] = useState(false);
  const refBusqueda = useRef(null);
  const busquedaDiferida = useDeferredValue(busqueda);

  // Libro abierto, visor, portada en vuelo y espacio reservado para el panel.
  const [seleccionado, setSeleccionado] = useState(null);
  const [ampliada, setAmpliada] = useState(false);
  const [vuelo, setVuelo] = useState(null);
  const [espacioPanel, setEspacioPanel] = useState(false);
  const refSeleccionado = useUltimo(seleccionado);
  const refVista = useUltimo(vista);
  const refVuelo = useUltimo(vuelo);

  const cargar = useCallback(async (accion = 'cargar') => {
    setRecargando(true);
    try {
      const resultado = await window.biblioteca[accion]();
      if (resultado.status !== 'cancelled') setCarga(resultado);
    } catch (error) {
      setCarga({ status: 'error', message: error.message });
    } finally {
      setRecargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    window.biblioteca.obtenerTema().then(setTema).catch(() => {});
  }, [cargar]);

  const cambiarTema = (nuevo) => {
    setTema(nuevo);
    window.biblioteca.cambiarTema(nuevo);
  };

  // Familia: integrantes con quienes se comparten libros (cada uno es además una biblioteca virtual de Broots).
  const [familia, setFamilia] = useState([]);
  // Descarga o actualización de las herramientas de Calibre propias (solo si Calibre no está instalado).
  const [estadoCalibre, setEstadoCalibre] = useState(null);
  useEffect(() => {
    window.herramientasCalibre.estado().then(setEstadoCalibre).catch(() => {});
    let ocultar = null;
    const quitar = window.herramientasCalibre.alCambiar((estado) => {
      setEstadoCalibre(estado);
      clearTimeout(ocultar);
      if (estado?.fase === 'listo') ocultar = setTimeout(() => setEstadoCalibre(null), 6000);
    });
    return () => {
      quitar();
      clearTimeout(ocultar);
    };
  }, []);
  // Actualizaciones de Broots: estado de la búsqueda o descarga (main.cjs) y el festejo de una versión recién instalada.
  const [actualizacion, setActualizacion] = useState(null);
  const [festejo, setFestejo] = useState(null);
  const refActualizacion = useUltimo(actualizacion);
  useEffect(() => {
    window.actualizaciones.estado().then(setActualizacion).catch(() => {});
    window.actualizaciones.festejo().then(setFestejo).catch(() => {});
    return window.actualizaciones.alCambiar(setActualizacion);
  }, []);
  const cerrarFestejo = useCallback(() => {
    setFestejo(null);
    window.actualizaciones.festejoVisto();
  }, []);
  const cerrarAvisoLista = useCallback(() => {
    window.actualizaciones.marcarAvisada(refActualizacion.current?.version).then(setActualizacion).catch(() => {});
  }, []);
  const [hojaCompartir, setHojaCompartir] = useState(false);
  // Configuración abierta en una sección ('general', 'kindle'…) o null.
  const [configuracion, setConfiguracion] = useState(null);
  const datos = carga.status === 'ok' ? carga.data : null;
  const soloLectura = Boolean(datos?.soloLectura);
  const libros = datos?.books ?? [];
  const columnas = datos?.customColumns ?? [];
  const virtuales = useMemo(
    () => ({
      ...(datos?.virtualLibraries ?? {}),
      ...Object.fromEntries((soloLectura ? [] : familia).map((p) => [idBibliotecaFamilia(p), `tags:"=${etiquetaDe(p)}"`])),
    }),
    [datos?.virtualLibraries, familia, soloLectura],
  );
  // Hasta la 1.4.0, la biblioteca elegida de alguien de Familia se recordaba por su nombre ("Libros de Ana").
  useEffect(() => {
    const persona = familia.find((p) => bibliotecaVirtual === `Libros de ${p.nombre}`);
    if (persona) setBibliotecaVirtual(idBibliotecaFamilia(persona));
  }, [familia]);
  const { estado: colEstado, valoracion: colValoracion } = useMemo(() => columnasEspeciales(columnas), [columnas]);
  // Etapa 2: subrayados importados del Kindle y envíos (se guardan en .broots, en la carpeta de Drive).
  const [subrayados, setSubrayados] = useState(null);
  const [historialEnvios, setHistorialEnvios] = useState({});
  const [estadoEnvio, setEstadoEnvio] = useState(null);
  const [hojaKindle, setHojaKindle] = useState(false);
  const [hojaClub, setHojaClub] = useState(false);
  const [resultadoImportacion, setResultadoImportacion] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const subrayadosPorUuid = subrayados?.libros ?? {};
  const grupos = useMemo(
    () => construirGrupos(columnas, (l) => subrayadosPorUuid[l.uuid]?.subrayados.length ?? 0),
    [columnas, subrayados],
  );

  useEffect(() => {
    if (!datos) return;
    window.kindle.leerSubrayados().then(setSubrayados).catch(() => {});
    window.kindle.historialEnvios().then(setHistorialEnvios).catch(() => {});
    window.kindle.estadoEnvio().then(setEstadoEnvio).catch(() => {});
    window.familia.estado().then((e) => setFamilia(e.familia)).catch(() => {});
  }, [datos?.loadedAt]);

  const importarSubrayados = async (origen) => {
    const resultado =
      origen === 'kindle' ? await window.kindle.importarDesdeKindle()
        : origen === 'archivo' ? await window.kindle.elegirArchivo()
          : await window.kindle.importarArchivo(origen);
    if (resultado.cancelado) return;
    setResultadoImportacion(resultado);
    if (resultado.ok) setSubrayados(resultado.datos);
    setHojaKindle(true);
  };
  const asignarSubrayados = async (clave, uuid) => setSubrayados(await window.kindle.asignar(clave, uuid));
  const ignorarSubrayados = async (clave) => setSubrayados(await window.kindle.ignorar(clave));
  const restaurarSubrayados = async (clave) => setSubrayados(await window.kindle.restaurar(clave));
  // Agrega a Calibre un libro del Kindle; al terminar se recarga la biblioteca (ya con el libro nuevo).
  const agregarLibro = async (clave) => {
    const resultado = await window.kindle.agregarLibro(clave);
    if (resultado.biblioteca?.status === 'ok') setCarga(resultado.biblioteca);
    if (resultado.subrayados) setSubrayados(resultado.subrayados);
    return resultado;
  };
  const enviarAlKindle = async (id, integranteId) => {
    const resultado = await window.kindle.enviar(id, integranteId);
    if (resultado.ok) setHistorialEnvios(resultado.historial);
    return resultado;
  };

  // Etapa 4: cada escritura devuelve la biblioteca ya recargada.
  const [hojaEditar, setHojaEditar] = useState(false);
  // Etapa 5: id del libro abierto en el lector (o null).
  const [leyendo, setLeyendo] = useState(null);
  const refLeyendo = useUltimo(leyendo);
  const refSoloLectura = useUltimo(soloLectura);
  const [hojaDuplicados, setHojaDuplicados] = useState(false);
  const [aviso, setAviso] = useState(null);
  const refHojaEditar = useUltimo(hojaEditar);
  const actualizarBiblioteca = (biblioteca) => {
    if (biblioteca?.status === 'ok') setCarga(biblioteca);
  };
  const editarRapido = async (id, cambios) => {
    const r = await window.edicion.editar(id, cambios);
    if (r.ok) actualizarBiblioteca(r.biblioteca);
    return r;
  };
  const convertirLibro = async (id, destino) => {
    const r = await window.edicion.convertir(id, destino);
    if (r.ok) actualizarBiblioteca(r.biblioteca);
    return r;
  };
  // 1.7: hábito de lectura. Sesiones, vueltas y posiciones (de .broots/habito); se releen al cerrar el lector.
  const [datosHabito, setDatosHabito] = useState(null);
  const [miLectura, setMiLectura] = useState(false);
  const recargarHabito = useCallback(() => window.habito.todo().then(setDatosHabito).catch(() => {}), []);
  useEffect(() => {
    if (datos && !leyendo) recargarHabito();
  }, [datos?.loadedAt, leyendo, recargarHabito]);
  /** Al cambiar el estado desde el panel, la vuelta del libro acompaña: Leído o Abandonado la cierran, Leyendo la retoma. */
  const editarEstado = async (libro, cambios) => {
    const r = await editarRapido(libro.id, cambios);
    const tipo = colEstado ? tipoEstado(cambios.custom?.[colEstado.label]) : null;
    if (r.ok && (tipo === 'leido' || tipo === 'abandonado')) await window.habito.terminar(libro.uuid, tipo).catch(() => {});
    else if (r.ok && (tipo === 'leyendo' || tipo === 'pausa')) await window.habito.retomar(libro.uuid).catch(() => {});
    recargarHabito();
    return r;
  };
  /** Releer: vuelta nueva desde el principio (las estadísticas de las anteriores quedan) y el libro pasa a Leyendo. */
  const releer = async (libro) => {
    const tipo = colEstado ? tipoEstado(libro.custom[colEstado.label]) : null;
    await window.habito.releer(libro.uuid, tipo === 'leido' && !datosHabito?.lecturas?.[libro.uuid]?.length);
    const valor = valorDeEstado(colEstado, 'leyendo');
    if (valor && !soloLectura) await editarRapido(libro.id, { custom: { [colEstado.label]: valor } });
    await recargarHabito();
    setLeyendo(libro.id);
  };
  const crearColumnaEstado = async () => {
    const r = await window.habito.crearColumna();
    if (r.ok) actualizarBiblioteca(r.biblioteca);
    return r;
  };
  const mostrarAviso = (texto, error = false) => {
    setAviso({ texto, error, clave: Date.now() });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), 7000);
  };
  const agregarLibros = async (archivosSoltados) => {
    mostrarAviso(archivosSoltados ? t('app.agregando', { n: archivosSoltados.length }) : t('app.eligiendo'));
    const r = archivosSoltados ? await window.edicion.agregarArchivos(archivosSoltados) : await window.edicion.elegirArchivos();
    if (r.cancelado) return setAviso(null);
    actualizarBiblioteca(r.biblioteca);
    const ok = r.resultados.filter((x) => x.ok).length;
    const fallidos = r.resultados.filter((x) => !x.ok);
    const detalle = fallidos.map((x) => t('app.fallo', { nombre: x.nombre, mensaje: x.mensaje })).join(' · ');
    mostrarAviso(`${ok ? `${t('app.agregados', { n: ok })} ` : ''}${detalle}`, ok === 0);
  };

  // Arrastrar a la ventana: My Clippings.txt importa subrayados; los libros (EPUB, PDF…) se agregan.
  useEffect(() => {
    const esArchivo = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const encima = (e) => {
      if (!esArchivo(e) || refHojaEditar.current || refSoloLectura.current) return;
      e.preventDefault();
      setArrastrando(true);
    };
    const salir = (e) => {
      if (e.relatedTarget == null) setArrastrando(false);
    };
    const soltar = (e) => {
      e.preventDefault();
      setArrastrando(false);
      const soltados = [...(e.dataTransfer?.files ?? [])];
      const clippings = soltados.find((a) => a.name.toLowerCase().endsWith('.txt') && /clipping/i.test(a.name));
      if (clippings) return importarSubrayados(clippings);
      if (soltados.length) agregarLibros(soltados);
    };
    window.addEventListener('dragover', encima);
    window.addEventListener('dragleave', salir);
    window.addEventListener('drop', soltar);
    return () => {
      window.removeEventListener('dragover', encima);
      window.removeEventListener('dragleave', salir);
      window.removeEventListener('drop', soltar);
    };
  }, [datos?.loadedAt]);

  // 1) Biblioteca virtual  2) Búsqueda  3) Filtros laterales  4) Orden
  const contexto = { customColumns: columnas, nombreIdioma };
  const vlActiva = virtuales[bibliotecaVirtual] != null ? bibliotecaVirtual : TODOS;
  const enBiblioteca = useMemo(() => {
    if (!vlActiva) return libros;
    const { filtro } = compilarBusqueda(virtuales[vlActiva], contexto);
    return filtro ? libros.filter(filtro) : libros;
  }, [libros, virtuales, vlActiva, columnas]);

  const { filtro: filtroBusqueda, error: errorBusqueda } = useMemo(
    () => compilarBusqueda(busquedaDiferida, contexto),
    [busquedaDiferida, columnas],
  );
  const encontrados = useMemo(
    () => (filtroBusqueda ? enBiblioteca.filter(filtroBusqueda) : enBiblioteca),
    [enBiblioteca, filtroBusqueda],
  );
  const conteos = useMemo(() => contarValores(grupos, encontrados), [grupos, encontrados]);
  const visibles = useMemo(
    () => ordenar(aplicarFiltros(encontrados, grupos, filtros, { minEstrellas, soloPropias }, colValoracion), orden, colValoracion),
    [encontrados, grupos, filtros, minEstrellas, soloPropias, orden, colValoracion],
  );
  const bibliotecas = useMemo(() => {
    // Las de Familia tienen un id fijo ("familia:<id>"); su nombre se arma en el idioma de Broots.
    const nombreDe = (id) => {
      const persona = familia.find((p) => idBibliotecaFamilia(p) === id);
      return persona ? t('familia.librosDe', { nombre: persona.nombre }) : id;
    };
    return [
      { id: TODOS, nombre: t('app.todos'), cantidad: libros.length },
      ...Object.entries(virtuales).map(([id, expresion]) => {
        const { filtro } = compilarBusqueda(expresion, contexto);
        return { id, nombre: nombreDe(id), expresion, cantidad: filtro ? libros.filter(filtro).length : 0 };
      }),
    ];
  }, [libros, virtuales, columnas, familia, idioma]);

  const libroSeleccionado = libros.find((l) => l.id === seleccionado) ?? null;
  const fondoVisor = useFondoDesenfocado(libroSeleccionado != null);
  const hayFiltros = minEstrellas > 0 || soloPropias || Object.values(filtros).some((s) => s.size);

  const alternarFiltro = (grupo, valor) => {
    setFiltros((previos) => {
      const conjunto = new Set(previos[grupo]);
      conjunto.has(valor) ? conjunto.delete(valor) : conjunto.add(valor);
      return { ...previos, [grupo]: conjunto };
    });
  };
  const limpiarFiltros = () => {
    setFiltros({});
    setMinEstrellas(0);
    setSoloPropias(false);
  };

  // --- Abrir, cambiar, cerrar y ampliar un libro (cada uno lanza un vuelo de la portada) ---

  const despegar = (tipo, libroId, desde) => {
    setVuelo(desde ? { clave: ++contadorVuelos, tipo, libroId, desde, hacia: null } : null);
  };

  const cerrar = useCallback(() => {
    const id = refSeleccionado.current;
    if (id == null) return;
    const desde = ubicarEnPanel(id);
    setSeleccionado(null);
    setAmpliada(false);
    setEspacioPanel(false);
    despegar('cerrar', id, desde);
  }, []);

  // Estable (no cambia entre renders) para no redibujar las tarjetas memorizadas.
  const abrir = useCallback((id, elementoPortada) => {
    if (id === refSeleccionado.current) {
      cerrar();
      return;
    }
    const tipo = refSeleccionado.current == null ? 'abrir' : 'cambiar';
    setSeleccionado(id);
    despegar(tipo, id, rectDe(elementoPortada));
  }, [cerrar]);

  const ampliar = (elementoPortada) => {
    setAmpliada(true);
    despegar('ampliar', refSeleccionado.current, rectDe(elementoPortada));
  };

  const reducir = useCallback(() => {
    const id = refSeleccionado.current;
    const desde = ubicarEnVisor(id); // incluye cuánto se arrastró: vuelve desde donde quedó
    setAmpliada(false);
    despegar('reducir', id, desde);
  }, []);

  // Recién dibujado el destino, se mide dónde quedó y la copia sale volando.
  useLayoutEffect(() => {
    if (!vuelo || vuelo.hacia) return;
    const { tipo, libroId } = vuelo;
    const hacia =
      tipo === 'ampliar' ? ubicarEnVisor(libroId)
        : tipo === 'cerrar' ? ubicarEnVista(libroId, refVista.current)
          : ubicarEnPanel(libroId);
    const regreso = tipo === 'cerrar' || tipo === 'reducir';
    setVuelo({
      ...vuelo,
      hacia: hacia ?? vuelo.desde, // sin destino visible (p. ej. filtrado): se desvanece en el lugar
      desvanecer: !hacia,
      transicion: regreso ? resorteRegreso : resorteVuelo,
      original: tipo === 'ampliar' || tipo === 'reducir',
    });
  }, [vuelo]);

  const aterrizar = useCallback((clave) => {
    const actual = refVuelo.current;
    if (!actual || actual.clave !== clave) return;
    // Recién cuando la portada aterrizó en el panel, la grilla le hace lugar (y se desliza).
    if (actual.tipo === 'abrir' || actual.tipo === 'cambiar') setEspacioPanel(true);
    setVuelo(null);
  }, []);

  // Reglas de estilo que dependen del estado, sin redibujar cientos de tarjetas:
  // marcar el libro abierto y ocultar el original mientras su copia vuela hacia él.
  const reglas = [];
  if (seleccionado != null) reglas.push(`[data-tarjeta="${seleccionado}"] .marco-seleccion{opacity:1}`);
  if (vuelo && vuelo.tipo !== 'ampliar') reglas.push(`[data-portada-panel="${vuelo.libroId}"]{visibility:hidden}`);
  if (ampliada && seleccionado != null) reglas.push(`[data-portada-panel="${seleccionado}"]{visibility:hidden}`);
  if (vuelo?.tipo === 'ampliar') reglas.push(`[data-portada-visor="${vuelo.libroId}"]{visibility:hidden}`);

  // Atajos: "/" o Ctrl+F buscar · Esc cerrar visor o panel · Ctrl+B mostrar/ocultar la barra lateral · F1 ayuda.
  const refAmpliada = useUltimo(ampliada);
  // Con una hoja abierta (Kindle, club, Configuración…), Esc cierra solo la hoja y "/" o Ctrl+F no
  // saltan al buscador de la biblioteca, que queda detrás (la Ayuda tiene su propio buscador).
  const refHojaAbierta = useUltimo(hojaKindle || hojaClub || hojaEditar || hojaDuplicados || hojaCompartir || configuracion || miLectura);
  useEffect(() => {
    const alPresionar = (e) => {
      if (refLeyendo.current) return; // el lector maneja su propio teclado
      const escribiendo = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if (((e.key === '/' && !escribiendo) || (e.key === 'f' && e.ctrlKey)) && !refHojaAbierta.current) {
        e.preventDefault();
        refBusqueda.current?.focus();
      } else if (e.key === 'b' && e.ctrlKey) {
        e.preventDefault();
        setBarraVisible((v) => !v);
      } else if (e.key === 'F1') {
        e.preventDefault();
        setConfiguracion('ayuda');
      } else if (e.key === 'Escape' && !escribiendo && !refHojaAbierta.current) {
        if (refAmpliada.current) reducir();
        else cerrar();
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [cerrar, reducir, setBarraVisible]);

  if (carga.status === 'loading') return <Cargando />;
  if (carga.status === 'no-library' || carga.status === 'invalid') {
    return <Bienvenida onElegir={() => cargar('elegirCarpeta')} mensaje={carga.message} />;
  }
  if (carga.status === 'error') {
    return (
      <Bienvenida
        onElegir={() => cargar('elegirCarpeta')}
        mensaje={carga.libraryPath ? t('app.noPudeLeerEn', { ruta: carga.libraryPath, error: carga.message }) : t('app.noPudeLeer', { error: carga.message })}
      />
    );
  }

  const chips = [
    ...grupos.flatMap((g) => [...(filtros[g.id] ?? [])].map((v) => ({ clave: `${g.id}:${v}`, texto: `${g.titulo}: ${g.etiqueta(v)}`, quitar: () => alternarFiltro(g.id, v) }))),
    ...(minEstrellas > 0 ? [{ clave: 'estrellas', texto: t('app.estrellasOMas', { n: minEstrellas }), quitar: () => setMinEstrellas(0) }] : []),
    ...(soloPropias ? [{ clave: 'propias', texto: t('lateral.soloMias'), quitar: () => setSoloPropias(false) }] : []),
  ];
  const tituloBiblioteca = bibliotecas.find((b) => b.id === vlActiva)?.nombre ?? t('app.todos');
  // Cambia cuando cambia el ancho disponible: las tarjetas se deslizan a su nuevo lugar.
  const disposicion = `${espacioPanel ? 'panel' : ''}-${barraVisible ? 'barra' : ''}`;

  return (
    <>
      <style>{reglas.join('\n')}</style>

      <motion.div
        initial={{ opacity: 0, transform: 'scale(0.985)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={resorte}
        className="flex h-full flex-col"
      >
        <BarraHerramientas
          ref={refBusqueda}
          titulo={tituloBiblioteca}
          cantidad={visibles.length}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          errorBusqueda={busqueda === busquedaDiferida ? errorBusqueda : null}
          vista={vista}
          onVista={setVista}
          orden={orden}
          onOrden={setOrden}
          tema={tema}
          onTema={cambiarTema}
          barraVisible={barraVisible}
          onAlternarBarra={() => setBarraVisible((v) => !v)}
          onRecargar={() => cargar()}
          onConfiguracion={() => setConfiguracion('general')}
          onAyuda={() => setConfiguracion('ayuda')}
          onKindle={() => setHojaKindle(true)}
          onAgregarLibros={() => agregarLibros()}
          onDuplicados={() => setHojaDuplicados(true)}
          onCompartir={() => setHojaCompartir(true)}
          onMiLectura={() => {
            recargarHabito();
            setMiLectura(true);
          }}
          soloLectura={soloLectura}
          cargando={recargando}
        />

        <div className={`relative flex min-h-0 flex-1 pr-2 pb-2 ${barraVisible ? '' : 'pl-2'}`}>
          {/* popLayout: al plegarse, la barra suelta su lugar en el acto (la grilla se desliza enseguida)
              y se desvanece flotando por encima, en vez de dejar un hueco vacío hasta terminar. */}
          <AnimatePresence initial={false} mode="popLayout">
            {barraVisible && (
              <motion.div
                key="barra"
                className="z-10 flex h-full shrink-0 bg-ventana"
                initial={{ opacity: 0, transform: 'translateX(-24px)' }}
                animate={{ opacity: 1, transform: 'translateX(0px)' }}
                exit={{ opacity: 0, transform: 'translateX(-24px)', transition: { ...resorte, opacity: { duration: 0.18 } } }}
                transition={resorte}
              >
                <BarraLateral
                  bibliotecas={bibliotecas}
                  bibliotecaActiva={vlActiva}
                  onBiblioteca={setBibliotecaVirtual}
                  grupos={grupos}
                  conteos={conteos}
                  filtros={filtros}
                  onAlternar={alternarFiltro}
                  minEstrellas={minEstrellas}
                  onMinEstrellas={setMinEstrellas}
                  soloPropias={soloPropias}
                  onSoloPropias={setSoloPropias}
                  tituloValoracion={colValoracion?.name ?? t('vistas.columnas.valoracion')}
                  hayFiltros={hayFiltros}
                  onLimpiar={limpiarFiltros}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <main className="squircle flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-superficie shadow-panel">
            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* Sin animar la altura: las portadas se reacomodan solas (y sin tirones) */}
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2 px-7 pt-5">
                  <AnimatePresence mode="popLayout">
                    {chips.map((c) => (
                      <motion.span
                        key={c.clave}
                        layout
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={resorteRapido}
                        className="inline-flex items-center gap-1 rounded-full bg-acento-suave py-1 pr-1.5 pl-3 text-xs font-medium text-acento"
                      >
                        {c.texto}
                        <button type="button" onClick={c.quitar} className="grid size-4 place-items-center rounded-full hover:bg-acento/15" title={t('app.quitarFiltro')}>
                          <IconoCerrar className="size-3" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Las dos vistas quedan creadas y solo se muestran u ocultan: cambiar de vista es instantáneo. */}
              <Vista activa={vista === 'grilla'}>
                <Grilla
                  todos={libros}
                  subrayadosPorUuid={subrayadosPorUuid}
                  visibles={visibles}
                  disposicion={disposicion}
                  onAbrir={abrir}
                  colEstado={colEstado}
                  colValoracion={colValoracion}
                />
              </Vista>
              {listaCreada && (
                <Vista activa={vista === 'lista'}>
                  <Lista
                    todos={libros}
                    visibles={visibles}
                    abierto={seleccionado}
                    onAbrir={abrir}
                    orden={orden}
                    onOrden={setOrden}
                    colEstado={colEstado}
                    colValoracion={colValoracion}
                  />
                </Vista>
              )}

              <AnimatePresence>
                {visibles.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    className="grid min-h-[60vh] place-items-center text-center text-tinta-suave"
                  >
                    <div>
                      <p className="font-serif text-lg text-tinta">{t('app.sinResultados')}</p>
                      <p className="mt-1 text-sm">{t('app.sinResultadosDetalle')}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <footer className="flex items-center gap-4 border-t border-borde px-5 py-1.5 text-[0.7rem] text-tinta-tenue">
              <span className="min-w-0 flex-1 truncate" title={datos.libraryPath}>
                {datos.libraryPath}
              </span>
              <span className="inline-flex items-center gap-1" title={t('app.protegidoExplicacion')}>
                <IconoCandado className="size-3" />
                {soloLectura
                  ? datos.compartidaPara ? t('configuracion.compartidaDe', { nombre: datos.compartidaPara }) : t('configuracion.compartida')
                  : t('app.protegido')}
              </span>
              <span>{t('app.leida', { hora: new Date(datos.loadedAt).toLocaleTimeString(region(), { hour: '2-digit', minute: '2-digit' }) })}</span>
              <EstadoCalibre estado={estadoCalibre} />
            </footer>
          </main>

          {/* Espacio reservado para el panel: la grilla se achica y las tarjetas se deslizan */}
          <div className="shrink-0" style={{ width: espacioPanel ? ANCHO_DETALLE + 8 : 0 }} />
        </div>
      </motion.div>

      {/* El panel flota a la derecha y no bloquea: se puede seguir tocando otros libros */}
      <AnimatePresence>
        {libroSeleccionado && (
          <PanelDetalle
            key="panel"
            libro={libroSeleccionado}
            columnas={columnas}
            colEstado={colEstado}
            colValoracion={colValoracion}
            onCerrar={cerrar}
            onEtiqueta={(etiqueta) => setFiltros((f) => ({ ...f, etiqueta: new Set([etiqueta]) }))}
            onAmpliar={ampliar}
            subrayados={subrayadosPorUuid[libroSeleccionado.uuid]?.subrayados ?? []}
            envio={{
              listo: Boolean(estadoEnvio?.tieneClave && estadoEnvio?.destino),
              destino: estadoEnvio?.destino,
              formato: formatoParaKindle(libroSeleccionado),
              ultimo: historialEnvios[libroSeleccionado.uuid]?.at(-1) ?? null,
            }}
            onEnviar={enviarAlKindle}
            onConfigurarKindle={() => setConfiguracion('kindle')}
            onConfigurarClub={() => setHojaClub(true)}
            onEditar={() => setHojaEditar(true)}
            onEditarRapido={editarRapido}
            onEditarEstado={(cambios) => editarEstado(libroSeleccionado, cambios)}
            habito={datosHabito}
            onReleer={() => releer(libroSeleccionado)}
            onConvertir={convertirLibro}
            onLeer={setLeyendo}
            soloLectura={soloLectura}
            familia={soloLectura ? [] : familia}
            onMarcarPara={async (integranteId, libroId, marcar) => {
              const r = await window.familia.marcar(integranteId, [libroId], marcar);
              if (r.ok) actualizarBiblioteca(r.biblioteca);
              return r;
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{ampliada && libroSeleccionado && <VisorPortada key="visor" libro={libroSeleccionado} fondo={fondoVisor} onCerrar={reducir} />}</AnimatePresence>

      <CapaVuelo vuelo={vuelo} libro={libros.find((l) => l.id === vuelo?.libroId)} onAterrizar={aterrizar} />

      {/* Aviso flotante (resultado de agregar libros, etc.) */}
      <AnimatePresence>
        {aviso && (
          <motion.div
            key={aviso.clave}
            initial={{ opacity: 0, transform: 'translate(-50%, 16px)' }}
            animate={{ opacity: 1, transform: 'translate(-50%, 0px)' }}
            exit={{ opacity: 0, transform: 'translate(-50%, 8px)', transition: { duration: 0.15 } }}
            transition={resorte}
            onClick={() => setAviso(null)}
            className={`squircle fixed bottom-6 left-1/2 z-[90] max-w-[min(40rem,90vw)] cursor-pointer rounded-[16px] px-4 py-2.5 text-[0.82rem] shadow-flotante ${
              aviso.error ? 'bg-[#bc4749] text-white' : 'bg-tinta text-ventana'
            }`}
          >
            {aviso.texto}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hojaClub && <HojaClub key="club" onCerrar={() => setHojaClub(false)} />}
        {hojaCompartir && (
          <HojaCompartir
            key="compartir"
            libros={libros}
            familia={familia}
            virtuales={virtuales}
            contexto={contexto}
            onFamilia={setFamilia}
            onBiblioteca={actualizarBiblioteca}
            onVerLibros={(p) => {
              setBibliotecaVirtual(idBibliotecaFamilia(p));
              setHojaCompartir(false);
            }}
            onCerrar={() => setHojaCompartir(false)}
          />
        )}
        {leyendo && libros.some((l) => l.id === leyendo) && (
          <Lector
            key={`lector-${leyendo}`}
            libro={libros.find((l) => l.id === leyendo)}
            colEstado={colEstado}
            soloLectura={soloLectura}
            onEditarRapido={editarRapido}
            onCerrar={() => setLeyendo(null)}
          />
        )}
        {hojaEditar && libroSeleccionado && (
          <HojaEditar
            key="editar"
            libro={libroSeleccionado}
            columnas={columnas}
            todosLosIdiomas={[...new Set(libros.flatMap((l) => l.languages))]}
            onGuardado={actualizarBiblioteca}
            onCerrar={() => setHojaEditar(false)}
          />
        )}
        {hojaDuplicados && (
          <HojaDuplicados
            key="duplicados"
            libros={libros}
            subrayadosPorUuid={subrayadosPorUuid}
            onCambio={(biblioteca) => {
              actualizarBiblioteca(biblioteca);
              window.kindle.leerSubrayados().then(setSubrayados).catch(() => {});
            }}
            onCerrar={() => setHojaDuplicados(false)}
          />
        )}
        {hojaKindle && (
          <HojaKindle
            key="kindle"
            estadoEnvio={estadoEnvio}
            onConfigurarEnvio={() => {
              setHojaKindle(false);
              setConfiguracion('kindle');
            }}
            subrayados={subrayados}
            ultimoResultado={resultadoImportacion}
            libros={libros}
            onImportar={importarSubrayados}
            onAsignar={asignarSubrayados}
            onIgnorar={ignorarSubrayados}
            onRestaurar={restaurarSubrayados}
            onAgregar={agregarLibro}
            onCerrar={() => setHojaKindle(false)}
          />
        )}
        {miLectura && (
          <MiLectura
            key="mi-lectura"
            datos={datosHabito}
            libros={libros}
            colEstado={colEstado}
            soloLectura={soloLectura}
            onLeer={(id) => {
              setMiLectura(false);
              setLeyendo(id);
            }}
            onEditarRapido={async (id, cambios) => {
              const r = await editarRapido(id, cambios);
              recargarHabito();
              return r;
            }}
            onCrearColumna={crearColumnaEstado}
            onRecargar={() => cargar()}
            onCerrar={() => setMiLectura(false)}
          />
        )}
        {configuracion && (
          <Configuracion
            key="configuracion"
            seccionInicial={configuracion}
            tema={tema}
            onTema={cambiarTema}
            libraryPath={datos.libraryPath}
            soloLectura={soloLectura}
            compartidaPara={datos.compartidaPara}
            onCambiarCarpeta={() => cargar('elegirCarpeta')}
            estadoEnvio={estadoEnvio}
            onEstadoEnvio={setEstadoEnvio}
            onAbrirKindle={
              soloLectura
                ? null
                : () => {
                    setConfiguracion(null);
                    setHojaKindle(true);
                  }
            }
            libros={libros}
            familia={familia}
            virtuales={virtuales}
            contexto={contexto}
            onFamilia={setFamilia}
            onBiblioteca={actualizarBiblioteca}
            onVerLibros={(p) => {
              setBibliotecaVirtual(idBibliotecaFamilia(p));
              setConfiguracion(null);
            }}
            onCerrar={() => setConfiguracion(null)}
          />
        )}
      </AnimatePresence>

      {/* Versión nueva lista para instalar (si estás leyendo, espera a que cierres el libro) y festejo de la recién
          instalada. Van por encima de todo, también de Configuración. */}
      <AnimatePresence>
        {festejo && <Festejo key="festejo" datos={festejo} onCerrar={cerrarFestejo} />}
        {!festejo && !leyendo && actualizacion?.fase === 'lista' && !actualizacion.avisada && (
          <AvisoLista key={`lista-${actualizacion.version}`} estado={actualizacion} onCerrar={cerrarAvisoLista} />
        )}
      </AnimatePresence>

      {/* Aviso al arrastrar un archivo sobre la ventana */}
      <AnimatePresence>
        {arrastrando && (
          <motion.div
            key="soltar"
            className="pointer-events-none fixed inset-3 z-[80] grid place-items-center rounded-[28px] border-2 border-dashed border-acento bg-superficie/85"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={resorteRapido}
          >
            <div className="text-center">
              <p className="font-serif text-xl text-tinta">{t('app.soltar')}</p>
              <p className="mt-1 text-sm text-tinta-suave">{tx('app.soltarClippings', { b: (s) => <strong>{s}</strong> })}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
