// 1.13 «Escuchar»: el lector lee el libro en voz alta, párrafo por párrafo, resaltando el que suena y pasando de página
// solo; al terminar el capítulo sigue con el próximo. Lee lo que se ve: si el párrafo está traducido, la traducción.
//
// La voz sale de electron/voz.cjs: sin internet (Daniela, Kristin o Faber, según el idioma del párrafo) o con Gemini.
// Sin internet se pide de a pedazos cortos (unas oraciones): el primero suena enseguida y los siguientes se preparan
// mientras tanto. Con Gemini cada pedido junta varios párrafos, porque el cupo gratis es de pocos pedidos por minuto.
//
// useVozAlta() lleva la lectura; BarraVoz es la barrita de abajo (pausa, párrafo anterior y siguiente, velocidad, voz).
// Si pasás de página a mano y lo que suena deja de verse, sigue desde lo que ves.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { idiomaActual, resorte, resortePresion, resorteRapido, t, tamaño } from '../lib/index.js';
import { elegirDiccionario } from '../lib/diccionario.js';
import { LARGO_GEMINI, LARGO_LOCAL, VELOCIDADES, lugarSegunAvance, oracionesDe, pedazosDe, seLee, wavDe } from '../lib/voz.js';
import { IconoCerrar, IconoParrafoAnterior, IconoParrafoSiguiente, IconoPausa, IconoReproducir, IconoVoz } from './Iconos.jsx';

const ADELANTE = { local: 3, gemini: 1 }; // pedazos que se preparan por adelantado (Gemini: el cupo es por minuto)
const ESPERA_TRADUCCION = 30000; // ms que se espera una traducción antes de leer el original
const NOTAS = 'aside, [epub\\:type~="footnote"], [epub\\:type~="endnote"], [role="doc-footnote"], [role="doc-endnote"]';

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
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * acciones: ref con lo que la voz necesita del lector ({ irVista, abrirCapitulo, pedirTraduccion, anclaActual,
 * vistaDeLugar, alPasarPagina, actividad, totalCapitulos, tieneClave }); se actualiza en cada render.
 */
export function useVozAlta({ r, acciones, idiomaLibro, avisar }) {
  const [estado, setEstado] = useState(null); // null (apagada) | { fase: 'preparando' | 'sonando' | 'pausado' | 'falta' | 'bajando' | 'error' | 'fin', ... }
  const [velocidad, setVelocidad] = useState(() => preferencia('broots-voz-velocidad', 1));
  const [motor, setMotor] = useState(() => preferencia('broots-voz-motor', 'local'));
  const v = useRef({
    gen: 0, activo: false, pausado: false, cola: new Map(), audio: null, cortar: null, unidad: null, pos: null,
    moviendo: 0, marcado: null, idiomas: new Map(), estados: new Map(), forzados: new Set(), esperaBajada: null,
    motorSesion: null, velocidad: 1, motor: 'local',
  }).current;
  v.velocidad = velocidad;
  v.motor = motor;
  const a = () => acciones.current;

  // ---------- El texto ----------

  const vivo = (gen) => gen === v.gen;
  const textoDe = (p) => r.parrafos[p]?.textContent ?? '';
  const esNota = (p) => Boolean(r.parrafos[p]?.closest(NOTAS));
  const traducido = (p) => r.traducir && r.traducidos.has(p) && !r.viendoOriginal.has(p);
  /** ¿El párrafo ya muestra lo que se va a leer? Con la traducción prendida, hay que esperar a que llegue. */
  const listo = (p) => !r.traducir || r.traducidos.has(p) || r.fallidos.has(p) || r.viendoOriginal.has(p) || v.forzados.has(`${r.cap}|${p}`);
  const pedirSiFalta = (p) => {
    if (!listo(p) && !r.enCurso.has(p)) a().pedirTraduccion([p], true);
  };
  const idiomaDe = (p) => {
    const texto = textoDe(p);
    const clave = `${r.cap}|${p}|${traducido(p)}|${texto.length}`;
    if (!v.idiomas.has(clave)) {
      const vecinos = (r.textosOriginales ?? []).slice(Math.max(0, p - 10), p + 10).join(' ');
      v.idiomas.set(clave, elegirDiccionario({ parrafo: texto, vecinos, traducido: traducido(p), idiomaLibro, idiomaBroots: idiomaActual() }));
    }
    return v.idiomas.get(clave);
  };
  /** El primer párrafo que se lee desde p (incluido); -1 si en el capítulo no queda ninguno. */
  const proximoLeible = (p) => {
    for (let i = Math.max(0, p); i < r.parrafos.length; i++) if (!esNota(i) && seLee(textoDe(i))) return i;
    return -1;
  };

  /** Con qué se lee un idioma: 'local', 'gemini' o null (no hay voz para ese idioma). */
  const motorPara = async (idioma) => {
    const elegido = v.motorSesion ?? v.motor;
    if (elegido === 'gemini' && a().tieneClave) return 'gemini';
    if (!v.estados.has(idioma)) v.estados.set(idioma, await window.lector.estadoVoz(idioma).catch(() => ({ tiene: false })));
    if (v.estados.get(idioma).tiene) return 'local';
    return a().tieneClave ? 'gemini' : null;
  };

  /**
   * Lo próximo que se lee desde pos ({ cap, parrafo, lugar }): { partes: [{ parrafo, desde, hasta }], texto, idioma,
   * motor, sigue }. null si el capítulo terminó; { espera: p } si falta la traducción de p; { sinVoz: idioma }.
   */
  const unidadEn = async (pos) => {
    if (pos.cap !== r.cap) return null;
    const p = proximoLeible(pos.parrafo);
    if (p < 0) return null;
    if (!listo(p)) {
      pedirSiFalta(p);
      return { espera: p };
    }
    const lugar = p === pos.parrafo ? pos.lugar : 0;
    const texto = textoDe(p);
    const idioma = idiomaDe(p);
    const conMotor = await motorPara(idioma);
    if (!conMotor) return { sinVoz: idioma };
    const resto = texto.slice(lugar);
    const primero = pedazosDe(resto, conMotor === 'gemini' ? LARGO_GEMINI.maximo : LARGO_LOCAL)[0] ?? { desde: 0, hasta: resto.length };
    const partes = [{ parrafo: p, desde: lugar + primero.desde, hasta: lugar + primero.hasta }];
    let sigue = partes[0].hasta < texto.length ? { cap: r.cap, parrafo: p, lugar: partes[0].hasta } : { cap: r.cap, parrafo: p + 1, lugar: 0 };
    // Con Gemini se suman párrafos enteros del mismo idioma hasta llegar a un buen tamaño.
    if (conMotor === 'gemini' && sigue.parrafo !== p) {
      let total = partes[0].hasta - partes[0].desde;
      for (let q = p + 1; total < LARGO_GEMINI.minimo; ) {
        const n = proximoLeible(q);
        if (n < 0) break;
        const largo = textoDe(n).length;
        if (!listo(n)) {
          pedirSiFalta(n);
          break;
        }
        if (idiomaDe(n) !== idioma || total + largo > LARGO_GEMINI.maximo) break;
        partes.push({ parrafo: n, desde: 0, hasta: largo });
        total += largo;
        sigue = { cap: r.cap, parrafo: n + 1, lugar: 0 };
        q = n + 1;
      }
    }
    const unidad = { cap: r.cap, partes, idioma, motor: conMotor, sigue };
    unidad.texto = partes.map((x) => textoDe(x.parrafo).slice(x.desde, x.hasta)).join('\n');
    unidad.clave = `${unidad.cap}|${partes.map((x) => `${x.parrafo}:${x.desde}-${x.hasta}`).join(',')}|${conMotor}|${unidad.texto}`;
    return unidad;
  };

  // ---------- La voz ----------

  const pedir = (u) => {
    if (!v.cola.has(u.clave)) {
      // Sin internet, la voz ya sale a la velocidad elegida (suena más natural y se arma más rápido); si después la
      // cambiás, el reproductor ajusta lo que falta (ver sonar).
      const velocidad = u.motor === 'local' ? v.velocidad : 1;
      v.cola.set(u.clave, window.lector.decir({ idioma: u.idioma, texto: u.texto, velocidad, motor: u.motor }).catch(() => ({ ok: false, motivo: 'error', mensaje: t('voz.noPudeLeer') })));
    }
    return v.cola.get(u.clave);
  };

  /** Pide por adelantado lo que viene, para que no haya silencios entre pedazos. */
  const adelantar = async (gen, desde) => {
    let pos = desde;
    const cuantos = ADELANTE[v.motorSesion ?? v.motor] ?? ADELANTE.local;
    for (let i = 0; i < cuantos && pos; i++) {
      const u = await unidadEn(pos);
      if (!vivo(gen) || !u || u.espera != null || u.sinVoz) return;
      pedir(u);
      pos = u.sigue;
    }
  };

  /** Resalta el párrafo que suena (o, en rojizo, el que no se pudo leer). */
  const marcar = (p, clase = 'voz-sonando') => {
    const el = r.parrafos[p];
    if (v.marcado?.el === el && v.marcado.clase === clase) return;
    v.marcado?.el.classList.remove('voz-sonando', 'voz-error');
    el?.classList.add(clase);
    v.marcado = el ? { el, parrafo: p, cap: r.cap, clase } : null;
  };
  const desmarcar = () => {
    v.marcado?.el.classList.remove('voz-sonando', 'voz-error');
    v.marcado = null;
  };
  /** Algo falló: queda marcado (en rojizo) el párrafo que no se pudo leer, y la barrita lo dice. */
  const fallar = (u, mensaje) => {
    if (u?.cap === r.cap) marcar(u.partes[0].parrafo, 'voz-error');
    setEstado({ fase: 'error', mensaje });
  };

  /** Mientras suena: resalta el párrafo y, si lo que suena pasó a otra página, la da vuelta. */
  const acompañar = (gen, u, audio) => {
    if (!vivo(gen) || u.cap !== r.cap) return;
    const avance = audio.duration > 0 && Number.isFinite(audio.duration) ? audio.currentTime / audio.duration : 0;
    const donde = lugarSegunAvance(u.partes, avance);
    if (!donde) return;
    v.donde = { ...donde, cap: u.cap };
    marcar(donde.parrafo);
    const vista = a().vistaDeLugar(donde.parrafo, donde.lugar);
    if (vista == null || vista === r.vista) return;
    v.moviendo = Date.now();
    const adelante = vista > r.vista;
    a().irVista(vista);
    if (adelante) a().alPasarPagina({ adelante: true, paginas: r.geo?.cols ?? 1 });
  };

  /** En pausa, lo que sigue espera acá (sin armar el audio: uno armado y sin tocar, el navegador lo da por fallado). */
  const esperarQueSiga = async (gen, u) => {
    if (!v.pausado) return;
    v.donde = { parrafo: u.partes[0].parrafo, lugar: u.partes[0].desde, cap: u.cap };
    marcar(u.partes[0].parrafo);
    await new Promise((seguir) => (v.alSeguir = seguir));
  };

  /** Hace sonar un pedazo; termina cuando se termina de escuchar (o cuando se corta). */
  const sonar = async (gen, u, res) => {
    await esperarQueSiga(gen, u);
    if (!vivo(gen)) return;
    await new Promise((terminar) => {
      const url = URL.createObjectURL(new Blob([wavDe(res.muestras, res.tasa)], { type: 'audio/wav' }));
      const audio = new Audio(url);
      audio.preservesPitch = true;
      // La voz pudo salir ya a otra velocidad (sin internet se arma a la velocidad elegida): se ajusta la diferencia.
      v.velocidadDelAudio = res.velocidad || 1;
      audio.playbackRate = v.velocidad / v.velocidadDelAudio;
      let reloj = null;
      const fin = () => {
        clearInterval(reloj);
        audio.pause();
        URL.revokeObjectURL(url);
        if (v.audio === audio) v.audio = null;
        if (v.cortar === fin) v.cortar = null;
        terminar();
      };
      audio.onended = fin;
      // Si no puede sonar, se frena y lo dice (seguir de largo ilumina párrafos sin que se oiga nada).
      audio.onerror = () => {
        v.falloAudio = audio.error?.message || `código ${audio.error?.code ?? '?'}`;
        console.error('[voz] el audio no pudo sonar:', v.falloAudio);
        fin();
      };
      v.audio = audio;
      v.cortar = fin;
      reloj = setInterval(() => acompañar(gen, u, audio), 200);
      acompañar(gen, u, audio);
      a().actividad(); // escuchar cuenta como leer (el reloj de la sesión no se frena)
      audio.play().catch((error) => {
        if (error?.name === 'AbortError') return; // se pausó antes de arrancar: sigue al reanudar
        v.falloAudio = error?.message || String(error);
        console.error('[voz] el audio no pudo sonar:', v.falloAudio);
        fin();
      });
      setEstado((e) => (e ? { fase: v.pausado ? 'pausado' : 'sonando' } : e));
    });
  };

  /** Espera a que se cumpla algo (como que llegue una traducción). false si se cortó la lectura o se pasó el tiempo. */
  const esperarHasta = async (gen, condicion, ms) => {
    const limite = Date.now() + ms;
    while (vivo(gen) && Date.now() < limite) {
      if (condicion()) return true;
      await dormir(150);
    }
    return vivo(gen) && condicion();
  };

  /** Hasta que la persona baje la voz que falta (o lo cancele). */
  const esperarBajada = (idioma, res) =>
    new Promise((resolver) => {
      v.esperaBajada = { resolver, idioma };
      setEstado({ fase: 'falta', idioma, nombre: res.nombre, bajar: res.bajar });
    });

  const leer = async (gen, desde) => {
    let pos = desde;
    while (vivo(gen)) {
      const u = await unidadEn(pos);
      if (!vivo(gen)) return;
      if (u?.espera != null) {
        setEstado((e) => (e ? { fase: 'preparando' } : e));
        // Si la traducción no llega, se lee lo que hay (el original).
        if (!(await esperarHasta(gen, () => listo(u.espera), ESPERA_TRADUCCION))) v.forzados.add(`${r.cap}|${u.espera}`);
        continue;
      }
      if (u?.sinVoz) {
        setEstado({ fase: 'error', mensaje: t('voz.sinVozIdioma') });
        return;
      }
      if (!u) {
        // Fin del capítulo: al siguiente (o fin del libro).
        if (r.cap + 1 >= a().totalCapitulos) {
          desmarcar();
          setEstado({ fase: 'fin' });
          v.activo = false;
          return;
        }
        v.moviendo = Infinity;
        await a().abrirCapitulo(r.cap + 1);
        v.moviendo = Date.now();
        if (!vivo(gen)) return;
        a().alPasarPagina({ adelante: true, paginas: r.geo?.cols ?? 1, capitulo: true });
        pos = { cap: r.cap, parrafo: 0, lugar: 0 };
        continue;
      }
      const yaEstaba = v.cola.has(u.clave);
      if (!yaEstaba) setEstado((e) => (e && !v.pausado ? { fase: 'preparando' } : e));
      const res = await pedir(u);
      v.cola.delete(u.clave);
      if (!vivo(gen)) return;
      if (!res.ok) {
        if (res.motivo === 'olvidado') continue;
        if (res.motivo === 'falta') {
          if (!(await esperarBajada(u.idioma, res))) return;
          v.cola.clear();
          continue;
        }
        // Gemini no pudo (cupo, clave, conexión): se sigue con la voz de la PC, si hay para este idioma.
        if (u.motor === 'gemini') {
          const local = await window.lector.estadoVoz(u.idioma).catch(() => ({ tiene: false }));
          if (local.tiene) {
            // Y el botón pasa a «Sin internet» (y así queda la próxima vez).
            setMotor('local');
            recordar('broots-voz-motor', 'local');
            v.motor = 'local';
            v.motorSesion = null;
            v.cola.clear();
            avisar(`${res.mensaje ?? t('voz.noPudeLeer')} ${t('voz.sigoSinInternet')}`, 'error');
            continue;
          }
        }
        v.pos = pos;
        fallar(u, res.mensaje ?? t('voz.noPudeLeer'));
        return;
      }
      v.unidad = u;
      v.pos = pos;
      adelantar(gen, u.sigue);
      v.falloAudio = null;
      await sonar(gen, u, res);
      if (!vivo(gen)) return;
      if (v.falloAudio) {
        fallar(u, t('voz.noPudeSonar'));
        return;
      }
      pos = u.sigue;
    }
  };

  // ---------- Controles ----------

  /** Corta lo que suena y lo que estaba en la fila, y lee desde pos. */
  const saltarA = (pos) => {
    const gen = ++v.gen;
    v.cortar?.();
    soltarEspera();
    v.cola.clear();
    window.lector.olvidarVoz?.();
    v.activo = true;
    leer(gen, pos);
  };

  /** Desde la primera oración que empieza en la página que se ve (no desde un párrafo que viene de la anterior). */
  const desdeLoQueSeVe = () => {
    const p = a().anclaActual();
    const g = r.rangos[p];
    if (!g || g.inicio >= r.vista) return { cap: r.cap, parrafo: p, lugar: 0 };
    const texto = textoDe(p);
    for (const o of oracionesDe(texto)) {
      let lugar = o.desde;
      while (lugar < o.hasta && /\s/.test(texto[lugar])) lugar++;
      if ((a().vistaDeLugar(p, lugar) ?? -1) >= r.vista) return { cap: r.cap, parrafo: p, lugar: o.desde };
    }
    return { cap: r.cap, parrafo: p + 1, lugar: 0 };
  };

  const empezar = (pos) => {
    v.pausado = false;
    v.motorSesion = null;
    v.forzados.clear();
    setEstado({ fase: 'preparando' });
    saltarA(pos ?? desdeLoQueSeVe());
  };

  const parar = () => {
    v.gen++;
    v.activo = false;
    v.donde = null;
    v.pausado = false;
    v.cortar?.();
    soltarEspera();
    v.cola.clear();
    window.lector.olvidarVoz?.();
    const espera = v.esperaBajada;
    v.esperaBajada = null;
    espera?.resolver(false);
    desmarcar();
    setEstado(null);
  };

  const pausar = () => {
    v.pausado = true;
    v.audio?.pause();
    setEstado((e) => (e ? { ...e, fase: 'pausado' } : e));
  };
  const soltarEspera = () => {
    const seguir = v.alSeguir;
    v.alSeguir = null;
    seguir?.();
  };
  const reanudar = () => {
    v.pausado = false;
    soltarEspera();
    if (v.audio) v.audio.play().catch(() => {});
    setEstado((e) => (e ? { ...e, fase: v.audio ? 'sonando' : 'preparando' } : e));
  };
  /** La «L» del teclado: arranca, pausa o sigue. */
  const alternar = () => {
    if (!v.activo || !estado || estado.fase === 'fin' || estado.fase === 'error') return empezar();
    if (estado.fase === 'falta' || estado.fase === 'bajando') return;
    return v.pausado ? reanudar() : pausar();
  };

  /** Párrafo anterior o siguiente. «Anterior» en medio de un párrafo vuelve a su principio. */
  const saltarParrafo = (sentido) => {
    const u = v.unidad;
    const actual = u?.cap === r.cap ? u.partes[0].parrafo : a().anclaActual();
    let p = actual;
    if (sentido > 0) p = actual + 1;
    else if (!u || u.partes[0].desde === 0) {
      for (p = actual - 1; p > 0 && (esNota(p) || !seLee(textoDe(p))); p--);
      p = Math.max(0, p);
    }
    if (!v.activo) setEstado({ fase: 'preparando' });
    saltarA({ cap: r.cap, parrafo: p, lugar: 0 });
  };

  const cambiarVelocidad = (nueva) => {
    setVelocidad(nueva);
    recordar('broots-voz-velocidad', nueva);
    v.velocidad = nueva;
    // Al instante, como en un reproductor de video: el reproductor ajusta la velocidad de lo que suena y de lo que ya
    // estaba preparado (no se tira nada: antes se rehacía y la lectura se frenaba). Lo nuevo ya sale a esta velocidad.
    if (v.audio) v.audio.playbackRate = nueva / (v.velocidadDelAudio || 1);
  };

  const cambiarMotor = (nuevo) => {
    setMotor(nuevo);
    recordar('broots-voz-motor', nuevo);
    v.motor = nuevo;
    v.motorSesion = null;
    if (v.activo && v.unidad) saltarA({ cap: v.unidad.cap, parrafo: v.unidad.partes[0].parrafo, lugar: v.unidad.partes[0].desde });
  };

  const bajar = async () => {
    const espera = v.esperaBajada;
    if (!espera) return;
    setEstado((e) => ({ ...e, fase: 'bajando', paso: 'bajando', hecho: 0, total: e?.bajar, error: null }));
    const res = await window.lector.bajarVoz(espera.idioma).catch(() => ({ ok: false, mensaje: t('voz.noPude') }));
    if (v.esperaBajada !== espera) return;
    if (res.ok) {
      v.esperaBajada = null;
      v.estados.delete(espera.idioma);
      setEstado({ fase: 'preparando' });
      espera.resolver(true);
    } else if (res.cancelado) parar();
    else setEstado((e) => ({ ...e, fase: 'falta', error: res.mensaje }));
  };
  const cancelarBajada = () => {
    const espera = v.esperaBajada;
    if (espera) window.lector.cancelarVoz(espera.idioma);
    parar();
  };

  /** Desde lo seleccionado («Escuchar desde acá» en la barrita de subrayar): desde la oración donde empieza. */
  const desdeSeleccion = (datos) => {
    if (datos?.indice == null) return;
    const lugar = datos.ancla?.inicio ?? r.anclas?.get(datos.id)?.inicio ?? 0;
    const oracion = oracionesDe(textoDe(datos.indice)).find((o) => lugar < o.hasta);
    empezar({ cap: r.cap, parrafo: datos.indice, lugar: oracion?.desde ?? 0 });
  };

  /** El lector avisa cada vez que cambia la página: si lo que suena dejó de verse, fue a mano y se sigue desde ahí. */
  const alCambiarPagina = () => {
    if (!v.activo || v.moviendo === Infinity || Date.now() - v.moviendo < 1200) return;
    const m = v.marcado;
    const g = m?.cap === r.cap ? r.rangos[m.parrafo] : null;
    if (g && g.inicio <= r.vista && g.fin >= r.vista) return;
    if (v.esperaBajada) return;
    saltarA(desdeLoQueSeVe());
  };

  /**
   * El lector se reacomodó (llegó una traducción, cambió la letra o la ventana) y quedó en el principio de un párrafo:
   * si la voz está activa, vuelve a la página donde va la voz.
   */
  const alReacomodar = () => {
    const d = v.donde;
    if (!v.activo || !d || d.cap !== r.cap) return;
    const vista = a().vistaDeLugar(d.parrafo, d.lugar);
    if (vista == null || vista === r.vista) return;
    v.moviendo = Date.now();
    a().irVista(vista, false);
  };

  // El avance de la descarga de la voz.
  useEffect(
    () =>
      window.lector.alProgresoVoz?.((p) => {
        setEstado((e) => (e?.fase === 'bajando' && e.idioma === p.idioma ? { ...e, paso: p.fase, hecho: p.hecho ?? e.hecho, total: p.total ?? e.total } : e));
      }),
    [],
  );
  // Al cerrar el libro se calla.
  useEffect(() => () => parar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    estado, activa: Boolean(estado), velocidad, motor, empezar, parar, alternar, pausar, reanudar, saltarParrafo,
    cambiarVelocidad, cambiarMotor, bajar, cancelarBajada, desdeSeleccion, alCambiarPagina, alReacomodar,
    reintentar: () => empezar(v.pos ?? undefined),
  };
}

// ---------- La barrita ----------

function BotonVoz({ children, activo, ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9, transition: resortePresion }}
      className={`grid h-8 min-w-8 place-items-center rounded-[10px] px-1.5 text-[0.74rem] font-medium transition-colors disabled:opacity-40 ${
        activo ? 'bg-seleccion text-tinta' : 'text-tinta-suave hover:bg-superficie-2 hover:text-tinta'
      }`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

const nombreVelocidad = (x) => `${String(x).replace('.', idiomaActual() === 'en' ? '.' : ',')}×`;

/** El botón de la velocidad abre un menú hacia arriba: se elige cualquiera, sin pasar por las otras. */
function MenuVelocidad({ voz }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <BotonVoz data-voz-velocidad activo={abierto} onClick={() => setAbierto((x) => !x)} title={t('voz.velocidad')}>
        <span className="w-9 tabular-nums">{nombreVelocidad(voz.velocidad)}</span>
      </BotonVoz>
      <AnimatePresence>
        {abierto && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
            <motion.div
              data-voz-velocidades
              initial={{ opacity: 0, transform: 'translate(-50%, 6px)' }}
              animate={{ opacity: 1, transform: 'translate(-50%, 0px)' }}
              exit={{ opacity: 0, transform: 'translate(-50%, 4px)', transition: { duration: 0.1 } }}
              transition={resorteRapido}
              className="squircle absolute bottom-full left-1/2 z-50 mb-2 flex flex-col rounded-[12px] bg-superficie p-1 shadow-flotante"
            >
              {[...VELOCIDADES].reverse().map((x) => (
                <button
                  key={x}
                  type="button"
                  data-velocidad={x}
                  onClick={() => {
                    voz.cambiarVelocidad(x);
                    setAbierto(false);
                  }}
                  className={`rounded-[8px] px-3 py-1 text-left text-[0.76rem] tabular-nums ${x === voz.velocidad ? 'bg-seleccion font-medium text-tinta' : 'text-tinta-suave hover:bg-superficie-2 hover:text-tinta'}`}
                >
                  {nombreVelocidad(x)}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** La barrita de la voz. Va en su propia franja, debajo del texto: no tapa lo que se está leyendo. */
export function BarraVoz({ voz, tieneClave, onConfigurarClave }) {
  const { estado } = voz;
  const fase = estado?.fase;
  const idiomaNombre = estado?.idioma ? t(`definir.idiomas.${estado.idioma}`) : '';
  return (
    <AnimatePresence>
      {estado && (
        <motion.div
          key="barra-voz"
          data-barra-voz={fase}
          initial={{ opacity: 0, transform: 'translateY(6px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{ opacity: 0, transform: 'translateY(4px)', transition: { duration: 0.14 } }}
          transition={resorte}
          className="squircle relative z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-[15px] bg-superficie px-2 py-1.5 text-[0.76rem] shadow-[0_4px_14px_-8px_rgb(var(--sombra)/0.45),inset_0_0_0_1px_var(--borde)]"
        >
          {(fase === 'falta' || fase === 'bajando') && (
            <div data-voz-bajar className="flex min-w-0 items-center gap-2 pl-1">
              <IconoVoz className="size-4 shrink-0 text-acento" />
              <div className="min-w-0">
                <p data-voz-bajar-mensaje className="text-[0.76rem] leading-snug">
                  {estado.error ? (
                    <span className="text-[#bc4749]">{estado.error}</span>
                  ) : fase === 'bajando' && estado.paso === 'preparando' ? (
                    t('voz.preparandoVoz')
                  ) : (
                    t('voz.hayQueBajar', { idioma: idiomaNombre, nombre: estado.nombre, peso: tamaño(estado.bajar ?? estado.total) })
                  )}
                </p>
                {fase === 'bajando' ? (
                  <div className="mt-1 h-1.5 w-56 overflow-hidden rounded-full bg-superficie-2">
                    {/* transform y no width: lo único que se anima en Broots */}
                    <div data-voz-avance className="h-full origin-left rounded-full bg-acento transition-transform duration-150" style={{ transform: `scaleX(${estado.paso === 'preparando' ? 1 : Math.min(1, (estado.hecho ?? 0) / (estado.total || 1))})` }} />
                  </div>
                ) : (
                  <p className="text-[0.68rem] text-tinta-tenue">{t('voz.unaSolaVez')}</p>
                )}
              </div>
              {fase === 'falta' && (
                <BotonVoz data-voz-bajar-si onClick={voz.bajar}>
                  <span className="px-1 text-acento">{estado.error ? t('voz.reintentar') : t('voz.bajar')}</span>
                </BotonVoz>
              )}
              <BotonVoz data-voz-bajar-cancelar onClick={voz.cancelarBajada}>
                <span className="px-1">{t('voz.cancelar')}</span>
              </BotonVoz>
            </div>
          )}

          {(fase === 'error' || fase === 'fin') && (
            <div className="flex min-w-0 items-center gap-2 pl-1">
              <IconoVoz className="size-4 shrink-0 text-acento" />
              <p data-voz-mensaje className={`min-w-0 truncate ${fase === 'error' ? 'text-[#bc4749]' : ''}`}>{fase === 'fin' ? t('voz.finDelLibro') : estado.mensaje}</p>
              {fase === 'error' && (
                <BotonVoz data-voz-reintentar onClick={voz.reintentar}>
                  <span className="px-1 text-acento">{t('voz.reintentar')}</span>
                </BotonVoz>
              )}
            </div>
          )}

          {(fase === 'preparando' || fase === 'sonando' || fase === 'pausado') && (
            <>
              <BotonVoz data-voz-anterior onClick={() => voz.saltarParrafo(-1)} title={t('voz.anterior')}>
                <IconoParrafoAnterior className="size-4" />
              </BotonVoz>
              <BotonVoz data-voz-pausa onClick={fase === 'pausado' ? voz.reanudar : voz.pausar} title={fase === 'pausado' ? t('voz.seguir') : t('voz.pausar')}>
                {fase === 'preparando' ? (
                  <span data-voz-preparando className="size-3.5 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" />
                ) : fase === 'pausado' ? (
                  <IconoReproducir className="size-4 text-acento" />
                ) : (
                  <IconoPausa className="size-4" />
                )}
              </BotonVoz>
              <BotonVoz data-voz-siguiente onClick={() => voz.saltarParrafo(1)} title={t('voz.siguiente')}>
                <IconoParrafoSiguiente className="size-4" />
              </BotonVoz>
              <span className="mx-1 h-4 w-px bg-borde" />
              <MenuVelocidad voz={voz} />
              {/* La voz: la de la PC (sin internet) o la de Gemini (con internet y tu clave). */}
              <div className="flex rounded-[10px] bg-superficie-2 p-0.5" role="group">
                <BotonVoz data-voz-motor="local" activo={voz.motor === 'local'} onClick={() => voz.cambiarMotor('local')} title={t('voz.sinInternetExplica')}>
                  <span className="px-1">{t('voz.sinInternet')}</span>
                </BotonVoz>
                <BotonVoz
                  data-voz-motor="gemini"
                  activo={voz.motor === 'gemini'}
                  onClick={() => (tieneClave ? voz.cambiarMotor('gemini') : onConfigurarClave())}
                  title={t('voz.geminiExplica')}
                >
                  <span className="px-1">Gemini</span>
                </BotonVoz>
              </div>
            </>
          )}

          <span className="mx-0.5 h-4 w-px bg-borde" />
          <BotonVoz data-voz-cerrar onClick={voz.parar} title={t('voz.cerrar')}>
            <IconoCerrar className="size-3.5" />
          </BotonVoz>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
