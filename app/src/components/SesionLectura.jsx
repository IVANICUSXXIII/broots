// 1.7 «Hábito de lectura»: la sesión de lectura dentro del lector.
//
// Cada vez que leés, Broots anota la sesión solo (si está prendido en Configuración → Lectura): cuánto tiempo
// leíste de verdad, cuántas páginas y de qué porcentaje a qué porcentaje del libro. El reloj cuenta solo
// mientras leés: si pasan 5 minutos sin pasar de página (o la ventana está minimizada), se frena.
//
// El temporizador es opcional: libre (sin reloj a la vista), por minutos o «hasta el fin del capítulo».
// Los avisos (meta cumplida, fin del capítulo, descanso para la vista) nunca cortan a mitad de un párrafo:
// esperan a que pases de página, que es la pausa natural de la lectura.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { resorte, resortePresion, resorteRapido, t, tipoEstado, valorDeEstado } from '../lib/index.js';
import { Interruptor } from './Piezas.jsx';
import { IconoReloj } from './Iconos.jsx';

const MINUTO = window.habito?.minuto ?? 60000; // más corto solo en las pruebas (BROOTS_MINUTO_PRUEBA)
const TICK = MINUTO / 4;
const INACTIVO = 5; // minutos sin pasar de página: el reloj se frena
const CADA_DESCANSO = 20; // regla 20-20-20: cada 20 minutos, 20 segundos mirando a 6 metros
const DURA_DESCANSO = 20000;
const PARA_LEYENDO = 5; // minutos leídos para pasar un libro «Por leer» a «Leyendo»
const GUARDAR_CADA = 30000;
export const METAS = [15, 20, 30, 45, 60];

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
const nuevoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * El reloj y los avisos de una sesión. El lector le avisa cada vez que pasás de página (alPasarPagina) y
 * le cuenta por dónde vas (datos.current = { progreso, totalPaginas, estimado }).
 */
export function useSesionLectura({ libro, abierto, colEstado, soloLectura, onEditarRapido }) {
  const [modo, setModoEstado] = useState(() => preferencia('broots-sesion-modo', 'libre'));
  const [meta, setMetaEstado] = useState(() => preferencia('broots-sesion-meta', 30));
  const [minutos, setMinutos] = useState(0);
  const [aviso, setAviso] = useState(null); // { tipo: 'meta' | 'capitulo' | 'descanso' | 'leyendo' | 'terminado' | 'marcado', clave }
  const [preferencias, setPreferencias] = useState({ anotarSesiones: true, descansoVista: true });
  const [panelAbierto, setPanelAbierto] = useState(false); // el panel del botón «Sesión»
  const [ritmos, setRitmos] = useState(null); // de las sesiones anteriores (habito.cjs → alAbrir)
  const datos = useRef({ progreso: 0, totalPaginas: 0, estimado: true });
  const refLibro = useRef(libro);
  refLibro.current = libro;
  const s = useRef({
    id: nuevoId(), inicio: new Date().toISOString(), lectura: 1, minutos: 0, paginas: 0, desde: null, hasta: 0, paginasLibro: 0,
    actividad: Date.now(), guardado: 0, descanso: 0, metaAvisada: false, descansoPendiente: false, leyendoHecho: false,
    terminadoAvisado: false, temporizador: null,
  }).current;
  const refModo = useRef(modo);
  refModo.current = modo;
  const refMeta = useRef(meta);
  refMeta.current = meta;
  const refPreferencias = useRef(preferencias);
  refPreferencias.current = preferencias;

  const setModo = (m) => {
    setModoEstado(m);
    recordar('broots-sesion-modo', m);
    s.metaAvisada = false;
  };
  const setMeta = (n) => {
    setMetaEstado(n);
    recordar('broots-sesion-meta', n);
    s.metaAvisada = s.minutos >= n; // si ya la pasaste, no avisa de golpe
  };
  const cambiarDescanso = async (activo) => {
    setPreferencias((p) => ({ ...p, descansoVista: activo }));
    const guardadas = await window.preferencias.guardar({ descansoVista: activo });
    setPreferencias((p) => ({ ...p, ...guardadas }));
  };

  const mostrar = useCallback(
    (tipo, extra = {}) => {
      clearTimeout(s.temporizador);
      setAviso({ tipo, clave: Date.now(), ...extra });
      const dura = tipo === 'descanso' ? DURA_DESCANSO : tipo === 'leyendo' || tipo === 'marcado' ? 6000 : 0;
      if (dura) s.temporizador = setTimeout(() => setAviso((a) => (a?.tipo === tipo ? null : a)), dura);
    },
    [s],
  );
  const cerrarAviso = () => {
    clearTimeout(s.temporizador);
    setAviso(null);
  };

  const guardar = useCallback(
    (forzar = false) => {
      const { progreso, totalPaginas, estimado } = datos.current;
      if (!estimado && totalPaginas > 1) s.paginasLibro = totalPaginas;
      if (totalPaginas > 1 && s.desde != null) s.hasta = progreso;
      if (s.minutos < 1 || !refPreferencias.current.anotarSesiones) return;
      if (!forzar && Date.now() - s.guardado < GUARDAR_CADA) return;
      s.guardado = Date.now();
      const l = refLibro.current;
      window.habito
        .guardarSesion({
          id: s.id, uuid: l.uuid, titulo: l.title, lectura: s.lectura, inicio: s.inicio, minutos: s.minutos,
          paginas: s.paginas, paginasLibro: s.paginasLibro, desde: s.desde ?? s.hasta, hasta: s.hasta,
        })
        .catch(() => {});
    },
    [s],
  );

  /** A los 5 minutos de leer, un libro «Por leer» (o en pausa, o sin estado) pasa a «Leyendo». */
  const pasarALeyendo = useCallback(async () => {
    s.leyendoHecho = true;
    const l = refLibro.current;
    if (!colEstado || soloLectura || !onEditarRapido) return;
    const tipo = tipoEstado(l.custom[colEstado.label]);
    const valor = valorDeEstado(colEstado, 'leyendo');
    if (!valor || (tipo && !['porLeer', 'pausa', 'abandonado'].includes(tipo))) return;
    const r = await onEditarRapido(l.id, { custom: { [colEstado.label]: valor } });
    if (!r?.ok) return;
    if (tipo === 'abandonado') window.habito.retomar(l.uuid).catch(() => {});
    mostrar('leyendo', { valor });
  }, [colEstado, soloLectura, onEditarRapido, mostrar, s]);

  // Lo que ya se sabe de este libro y las preferencias.
  useEffect(() => {
    let vivo = true;
    window.habito.abrir(libro.uuid).then((r) => {
      if (!vivo) return;
      s.lectura = r.lectura;
      setRitmos(r.ritmos);
    }).catch(() => {});
    window.preferencias.leer().then((p) => vivo && setPreferencias({ anotarSesiones: p.anotarSesiones !== false, descansoVista: p.descansoVista !== false })).catch(() => {});
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro.uuid]);

  // El reloj: suma de a un cuarto de minuto mientras estás leyendo.
  const refPasar = useRef(pasarALeyendo);
  refPasar.current = pasarALeyendo;
  useEffect(() => {
    if (!abierto) return;
    const reloj = setInterval(() => {
      if (document.hidden || Date.now() - s.actividad > INACTIVO * MINUTO) return;
      s.minutos += TICK / MINUTO;
      setMinutos(s.minutos);
      if (refPreferencias.current.descansoVista && s.minutos - s.descanso >= CADA_DESCANSO) s.descansoPendiente = true;
      if (!s.leyendoHecho && s.minutos >= PARA_LEYENDO) refPasar.current();
      guardar();
    }, TICK);
    return () => clearInterval(reloj);
  }, [abierto, guardar, s]);

  // Al cerrar el libro se guarda lo último.
  useEffect(
    () => () => {
      clearTimeout(s.temporizador);
      guardar(true);
    },
    [guardar, s],
  );

  const actividad = useCallback(() => {
    s.actividad = Date.now();
  }, [s]);

  /**
   * El lector la llama al pasar de página. paginas: cuántas páginas nuevas se ven (1 o 2);
   * capitulo: si se pasó al capítulo siguiente.
   */
  const alPasarPagina = useCallback(
    ({ adelante, paginas = 1, capitulo = false }) => {
      s.actividad = Date.now();
      const { progreso, totalPaginas } = datos.current;
      if (totalPaginas > 1) {
        if (s.desde == null) s.desde = progreso;
        s.hasta = progreso;
      }
      if (adelante) s.paginas += paginas;
      if (refModo.current === 'minutos' && !s.metaAvisada && s.minutos >= refMeta.current) {
        s.metaAvisada = true;
        mostrar('meta', { n: refMeta.current });
      } else if (refModo.current === 'capitulo' && capitulo && adelante) {
        mostrar('capitulo');
      } else if (s.descansoPendiente && refPreferencias.current.descansoVista) {
        s.descansoPendiente = false;
        s.descanso = s.minutos;
        mostrar('descanso');
      }
    },
    [mostrar, s],
  );

  /** Última página del libro: si todavía no figura como Leído, se ofrece marcarlo. */
  const alLlegarAlFinal = useCallback(() => {
    if (s.terminadoAvisado || !s.paginas) return; // abrir un libro ya en la última página no cuenta
    s.terminadoAvisado = true;
    const l = refLibro.current;
    if (colEstado && tipoEstado(l.custom[colEstado.label]) === 'leido') return;
    mostrar('terminado');
  }, [colEstado, mostrar, s]);

  const marcarLeido = async () => {
    const l = refLibro.current;
    const valor = valorDeEstado(colEstado, 'leido');
    if (colEstado && valor && !soloLectura && onEditarRapido) {
      const r = await onEditarRapido(l.id, { custom: { [colEstado.label]: valor } });
      if (!r?.ok) return mostrar('error', { texto: r?.mensaje });
    }
    guardar(true);
    await window.habito.terminar(l.uuid, 'leido').catch(() => {});
    mostrar('marcado');
  };

  /** Datos para «te quedan»: lo de las sesiones anteriores más lo de esta. */
  const ritmosConEsta = ritmos && {
    libro: { minutos: ritmos.libro.minutos + s.minutos, fraccion: ritmos.libro.fraccion + (datos.current.totalPaginas > 1 ? s.paginas / datos.current.totalPaginas : 0) },
    general: { minutos: ritmos.general.minutos + s.minutos, paginas: ritmos.general.paginas + s.paginas },
  };

  return {
    datos, modo, setModo, meta, setMeta, minutos, aviso, cerrarAviso, preferencias, cambiarDescanso, panelAbierto, setPanelAbierto,
    actividad, alPasarPagina, alLlegarAlFinal, marcarLeido, ritmos: ritmosConEsta, paginas: s.paginas,
  };
}

// ---------- Botón «Sesión» y su panel ----------

function Opcion({ activa, children, ...props }) {
  return (
    <button
      type="button"
      className={`h-7 rounded-full px-2.5 text-[0.74rem] font-medium transition-colors ${activa ? 'bg-verde text-superficie' : 'bg-superficie-2 text-tinta-suave hover:text-tinta'}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Botón de la barra del lector: en modo libre, solo el ícono (sin reloj a la vista, para no mirar la hora). */
export function BotonSesion({ sesion, restanteCapitulo }) {
  // El panel abierto vive en la sesión: así el Esc del lector lo cierra primero, antes que el libro.
  const { panelAbierto: abierto, setPanelAbierto: setAbierto } = sesion;

  const { modo, meta, minutos } = sesion;
  const enCurso = Math.floor(minutos);
  let etiqueta = null;
  if (modo === 'minutos') etiqueta = t('habito.lector.deMeta', { n: Math.min(enCurso, meta), meta });
  else if (modo === 'capitulo') etiqueta = restanteCapitulo ? t('habito.lector.capituloQueda', { tiempo: restanteCapitulo }) : t('habito.lector.capituloCorto');
  const cumplida = modo === 'minutos' && minutos >= meta;

  return (
    <div className="relative">
      <motion.button
        type="button"
        data-sesion={modo}
        whileTap={{ scale: 0.94, transition: resortePresion }}
        onClick={() => setAbierto((v) => !v)}
        title={t('habito.lector.sesion')}
        className={`squircle inline-flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 text-[0.76rem] font-medium tabular-nums transition-colors ${
          abierto ? 'bg-seleccion text-tinta' : etiqueta ? (cumplida ? 'bg-verde/15 text-verde' : 'bg-superficie-2 text-tinta-suave hover:text-tinta') : 'text-tinta-suave hover:bg-superficie-2 hover:text-tinta'
        }`}
      >
        <IconoReloj className="size-4" />
        {etiqueta}
      </motion.button>
      {/* Velo invisible: el clic afuera solo cierra el panel (no pasa de página ni toca otro botón) */}
      {abierto && <div data-velo-sesion className="no-arrastrable fixed inset-0 z-20" onClick={() => setAbierto(false)} />}
      <AnimatePresence>
        {abierto && (
          <motion.div
            data-panel-sesion
            initial={{ opacity: 0, transform: 'translateY(-6px) scale(0.98)' }}
            animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
            exit={{ opacity: 0, transform: 'translateY(-4px) scale(0.98)', transition: { duration: 0.12 } }}
            transition={resorteRapido}
            className="squircle no-arrastrable absolute top-9 right-0 z-30 w-72 origin-top-right rounded-[16px] bg-superficie p-3.5 text-[0.78rem] shadow-flotante"
          >
            <p className="font-semibold">{t('habito.lector.sesion')}</p>
            <p className="mt-0.5 mb-2.5 text-[0.72rem] text-tinta-tenue">
              {t('habito.lector.estaSesion', { tiempo: Math.floor(minutos) < 1 ? t('habito.menosDeUnMinuto') : t('habito.minutos', { n: enCurso }), n: sesion.paginas })}
            </p>
            <div className="flex flex-wrap gap-1">
              <Opcion activa={modo === 'libre'} onClick={() => sesion.setModo('libre')}>{t('habito.lector.libre')}</Opcion>
              <Opcion activa={modo === 'minutos'} onClick={() => sesion.setModo('minutos')}>{t('habito.lector.porMinutos')}</Opcion>
              <Opcion activa={modo === 'capitulo'} onClick={() => sesion.setModo('capitulo')}>{t('habito.lector.hastaCapitulo')}</Opcion>
            </div>
            {modo === 'minutos' && (
              <div className="mt-2 flex gap-1">
                {METAS.map((n) => (
                  <Opcion key={n} activa={meta === n} onClick={() => sesion.setMeta(n)}>{n}</Opcion>
                ))}
              </div>
            )}
            <p className="mt-2 text-[0.7rem] leading-relaxed text-tinta-tenue">{t(`habito.lector.explica.${modo}`)}</p>
            <div className="-mx-2 mt-2 border-t border-borde pt-1.5">
              <Interruptor activo={sesion.preferencias.descansoVista} onCambiar={sesion.cambiarDescanso} etiqueta={t('habito.lector.descansoVista')} />
              <p className="px-2 text-[0.7rem] leading-relaxed text-tinta-tenue">{t('habito.lector.descansoExplica')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Avisos ----------

function BotonAviso({ principal, children, ...props }) {
  return (
    <button type="button" className={`shrink-0 rounded-full px-2.5 py-1 font-medium ${principal ? 'bg-verde text-superficie' : 'text-acento hover:underline'}`} {...props}>
      {children}
    </button>
  );
}

/**
 * Cartelito abajo, al centro: suave, sin tapar el texto ni cortar la lectura. En modo enfoque va más arriba,
 * fuera de la franja donde se asoma la barra de abajo (si no, al ir a tocarlo, la barra lo tapaba).
 */
export function AvisoSesion({ sesion, onCerrarLibro, enfoque = false }) {
  const { aviso, cerrarAviso } = sesion;
  return (
    <AnimatePresence>
      {aviso && (
        <motion.div
          key={aviso.clave}
          data-aviso-sesion={aviso.tipo}
          initial={{ opacity: 0, transform: 'translate(-50%, 10px)' }}
          animate={{ opacity: 1, transform: 'translate(-50%, 0px)' }}
          exit={{ opacity: 0, transform: 'translate(-50%, 6px)', transition: { duration: 0.2 } }}
          transition={resorte}
          className={`squircle absolute ${enfoque ? 'bottom-16' : 'bottom-3'} left-1/2 z-40 flex max-w-[min(36rem,86%)] items-center gap-3 overflow-hidden rounded-full bg-superficie-2 py-1.5 pr-1.5 pl-4 text-[0.76rem] shadow-[0_8px_22px_-10px_rgb(var(--sombra)/0.55),inset_0_0_0_1px_var(--borde)]`}
        >
          <span className={`min-w-0 ${aviso.tipo === 'error' ? 'text-[#bc4749]' : ''}`}>
            {aviso.tipo === 'meta' && t('habito.lector.metaCumplida', { n: aviso.n })}
            {aviso.tipo === 'capitulo' && t('habito.lector.finCapitulo')}
            {aviso.tipo === 'descanso' && t('habito.lector.descanso')}
            {aviso.tipo === 'leyendo' && t('habito.lector.pasoALeyendo', { estado: aviso.valor })}
            {aviso.tipo === 'terminado' && t('habito.lector.terminaste')}
            {aviso.tipo === 'marcado' && t('habito.lector.marcado')}
            {aviso.tipo === 'error' && aviso.texto}
          </span>
          {(aviso.tipo === 'meta' || aviso.tipo === 'capitulo') && (
            <>
              <BotonAviso onClick={cerrarAviso}>{aviso.tipo === 'meta' ? t('habito.lector.sigo') : t('habito.lector.unoMas')}</BotonAviso>
              <BotonAviso principal onClick={onCerrarLibro}>{t('habito.lector.cerrarLibro')}</BotonAviso>
            </>
          )}
          {aviso.tipo === 'descanso' && <BotonAviso onClick={cerrarAviso}>{t('habito.lector.listo')}</BotonAviso>}
          {aviso.tipo === 'terminado' && (
            <>
              <BotonAviso onClick={cerrarAviso}>{t('habito.lector.todaviaNo')}</BotonAviso>
              <BotonAviso principal onClick={sesion.marcarLeido}>{t('habito.lector.marcarLeido')}</BotonAviso>
            </>
          )}
          {['leyendo', 'marcado', 'error'].includes(aviso.tipo) && <span className="w-1" />}
          {/* El descanso dura 20 segundos: la barrita se vacía sola (solo transform) */}
          {aviso.tipo === 'descanso' && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-verde/60"
              initial={{ transform: 'scaleX(1)' }}
              animate={{ transform: 'scaleX(0)' }}
              transition={{ duration: DURA_DESCANSO / 1000, ease: 'linear' }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
