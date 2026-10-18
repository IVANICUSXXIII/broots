// Configuración de Broots: navegación lateral por secciones, como la configuración de macOS.
// Reúne lo que antes estaba disperso (carpeta y tema en la barra, clave de Gemini en el lector, envío
// por mail en la hoja Kindle, Familia) y suma Calibre, Privacidad, Ayuda y Acerca de.
// Las preferencias nuevas (p. ej. Amazon o el idioma) se guardan en config.json de esta PC (window.preferencias).
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IDIOMAS, ponerIdioma, region, resorte, resorteRapido, t, useIdioma } from '../lib/index.js';
import {
  IconoAyuda, IconoCafe, IconoCarpeta, IconoCerrar, IconoCheck, IconoCompartir, IconoCorazon, IconoEngranaje, IconoEscudo, IconoInfo, IconoKindle, IconoLibros,
  IconoRecargar, IconoTraducir, LogoBroots,
} from './Iconos.jsx';
import { Boton, Interruptor } from './Piezas.jsx';
import { FormularioGemini } from './Gemini.jsx';
import { ConfigEnvio } from './Kindle.jsx';
import { ContenidoFamilia } from './Compartir.jsx';
import { ContenidoAyuda } from './Ayuda.jsx';
import { Confeti } from './Confeti.jsx';
import { tocarMatasuegras } from '../lib/matasuegras.js';

// El nombre y la descripción de cada sección se leen al dibujar (configuracion.secciones.<id> en los textos).
export const SECCIONES = [
  { id: 'general', icono: IconoEngranaje },
  { id: 'lectura', icono: IconoTraducir },
  { id: 'kindle', icono: IconoKindle },
  { id: 'familia', icono: IconoCompartir },
  { id: 'calibre', icono: IconoLibros },
  { id: 'actualizaciones', icono: IconoRecargar },
  { id: 'privacidad', icono: IconoEscudo },
  { id: 'ayuda', icono: IconoAyuda },
  { id: 'acerca', icono: IconoInfo },
].map((s) => ({
  ...s,
  get nombre() {
    return t(`configuracion.secciones.${s.id}.nombre`);
  },
  get descripcion() {
    return t(`configuracion.secciones.${s.id}.descripcion`);
  },
}));

// Tamaño de letra del lector: es el mismo valor que recuerda el lector (Lector.jsx) en esta PC.
const CLAVE_LETRA = 'broots-lector-letra';
const LETRA = { defecto: 19, min: 14, max: 30 };
function leerLetra() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LETRA));
    return typeof v === 'number' ? v : LETRA.defecto;
  } catch {
    return LETRA.defecto;
  }
}

// ---------- Piezas ----------

/** Grupo de filas con título, como los cuadros de la configuración de macOS. */
function Grupo({ titulo, nota, children }) {
  return (
    <section>
      {titulo && <h3 className="mb-1.5 px-1 text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">{titulo}</h3>}
      <div className="squircle divide-y divide-borde rounded-[16px] bg-superficie-2/60 px-4 shadow-[inset_0_0_0_1px_var(--borde)]">{children}</div>
      {nota && <p className="mt-1.5 px-1 text-[0.72rem] leading-relaxed text-tinta-tenue">{nota}</p>}
    </section>
  );
}

function Fila({ etiqueta, detalle, children }) {
  return (
    <div className="flex min-h-12 items-center gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[0.84rem]">{etiqueta}</p>
        {detalle && <p className="mt-0.5 text-[0.74rem] text-tinta-tenue">{detalle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Control segmentado con texto (el fondo de la opción elegida se desliza). */
function Segmentos({ grupo, opciones, valor, onCambiar }) {
  return (
    <div className="flex shrink-0 rounded-[10px] bg-superficie p-[3px] shadow-[inset_0_0_0_1px_var(--borde)]">
      {opciones.map((o) => (
        <button
          type="button"
          key={o.id}
          onClick={() => onCambiar(o.id)}
          className={`relative h-7 rounded-[7px] px-3 text-[0.76rem] font-medium transition-colors ${valor === o.id ? 'text-tinta' : 'text-tinta-tenue hover:text-tinta-suave'}`}
        >
          {valor === o.id && (
            <motion.span
              layoutId={`config-${grupo}`}
              transition={resorteRapido}
              className="absolute inset-0 rounded-[7px] bg-superficie-2 shadow-[0_1px_2px_rgb(var(--sombra)/0.15),0_0_0_0.5px_var(--borde)]"
            />
          )}
          <span className="relative">{o.nombre}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Secciones ----------

/** Idioma de Broots: la interfaz cambia al instante y main.cjs lo guarda en config.json. */
function SelectorIdioma() {
  const idioma = useIdioma();
  const cambiar = async (nuevo) => {
    ponerIdioma(nuevo);
    const guardadas = await window.preferencias.guardar({ idioma: nuevo });
    ponerIdioma(guardadas.idioma);
  };
  return (
    <select
      value={idioma}
      onChange={(e) => cambiar(e.target.value)}
      data-idioma
      className="h-8 rounded-lg bg-superficie px-2 text-[0.8rem] text-tinta shadow-[inset_0_0_0_1px_var(--borde)] outline-none"
    >
      {IDIOMAS.map((i) => (
        <option key={i.id} value={i.id}>
          {i.nombre}
        </option>
      ))}
    </select>
  );
}

function General({ tema, onTema, libraryPath, soloLectura, compartidaPara, onCambiarCarpeta }) {
  return (
    <>
      <Grupo titulo={t('configuracion.biblioteca')} nota={t('configuracion.bibliotecaNota')}>
        <Fila
          etiqueta={t('configuracion.carpeta')}
          detalle={soloLectura ? (compartidaPara ? t('configuracion.compartidaDe', { nombre: compartidaPara }) : t('configuracion.compartida')) : null}
        >
          <Boton onClick={onCambiarCarpeta}>
            <IconoCarpeta className="size-3.5" /> {t('configuracion.cambiar')}
          </Boton>
        </Fila>
        <p className="seleccionable truncate py-2.5 text-[0.76rem] text-tinta-suave" title={libraryPath}>
          {libraryPath}
        </p>
      </Grupo>

      <Grupo titulo={t('configuracion.apariencia')} nota={t('configuracion.aparienciaNota')}>
        <Fila etiqueta={t('configuracion.tema')} detalle={t('configuracion.temaDetalle')}>
          <Segmentos
            grupo="tema"
            valor={tema}
            onCambiar={onTema}
            opciones={[
              { id: 'system', nombre: t('configuracion.automatico') },
              { id: 'light', nombre: t('configuracion.claro') },
              { id: 'dark', nombre: t('configuracion.oscuro') },
            ]}
          />
        </Fila>
      </Grupo>

      <Grupo titulo={t('configuracion.idioma')} nota={t('configuracion.idiomaNota')}>
        <Fila etiqueta={t('configuracion.idiomaBroots')} detalle={t('configuracion.idiomaDetalle')}>
          <SelectorIdioma />
        </Fila>
      </Grupo>
    </>
  );
}

/** 1.7: sesiones de lectura y descanso para la vista (las estadísticas se ven en «Mi lectura»). */
function HabitoDeLectura({ preferencias, onPreferencias }) {
  const [borrado, setBorrado] = useState(null); // null | 'ok' | mensaje de error
  const anotar = preferencias?.anotarSesiones ?? true;
  const descanso = preferencias?.descansoVista ?? true;
  const borrar = async () => {
    if (!window.confirm(t('configuracion.habito.borrarConfirmar'))) return;
    const r = await window.habito.archivar().catch((e) => ({ ok: false, mensaje: e.message }));
    setBorrado(r?.ok ? 'ok' : r?.mensaje ?? t('configuracion.habito.noPudeBorrar'));
  };
  return (
    <Grupo titulo={t('configuracion.habito.titulo')} nota={t('configuracion.habito.nota')}>
      <div className="-mx-2 py-1.5" data-anotar={anotar ? 'si' : 'no'}>
        <Interruptor activo={anotar} onCambiar={(v) => onPreferencias({ anotarSesiones: v })} etiqueta={t('configuracion.habito.anotar')} />
        <p className="px-2 pb-1 text-[0.74rem] text-tinta-tenue">{t('configuracion.habito.anotarDetalle')}</p>
      </div>
      <div className="-mx-2 py-1.5" data-descanso={descanso ? 'si' : 'no'}>
        <Interruptor activo={descanso} onCambiar={(v) => onPreferencias({ descansoVista: v })} etiqueta={t('configuracion.habito.descanso')} />
        <p className="px-2 pb-1 text-[0.74rem] text-tinta-tenue">{t('configuracion.habito.descansoDetalle')}</p>
      </div>
      <Fila etiqueta={t('configuracion.habito.borrar')} detalle={borrado === 'ok' ? t('configuracion.habito.borrado') : borrado ?? t('configuracion.habito.borrarDetalle')}>
        <Boton onClick={borrar} disabled={borrado === 'ok'}>{t('configuracion.habito.borrarBoton')}</Boton>
      </Fila>
    </Grupo>
  );
}

function Lectura({ preferencias, onPreferencias }) {
  const [letra, setLetra] = useState(leerLetra);
  const [tieneClave, setTieneClave] = useState(null);
  const leerEstado = () => window.lector.estadoTraduccion().then((e) => setTieneClave(e.tieneClave)).catch(() => {});
  useEffect(() => {
    leerEstado();
  }, []);
  const cambiarLetra = (paso) => {
    const nueva = Math.min(LETRA.max, Math.max(LETRA.min, letra + paso));
    setLetra(nueva);
    try {
      localStorage.setItem(CLAVE_LETRA, JSON.stringify(nueva));
    } catch {}
  };

  return (
    <>
      <Grupo titulo={t('configuracion.lector')} nota={t('configuracion.lectorNota')}>
        <Fila etiqueta={t('configuracion.tamañoLetra')}>
          <div className="flex items-center gap-1.5">
            <Boton onClick={() => cambiarLetra(-1)} disabled={letra <= LETRA.min} title={t('configuracion.letraChica')}>A−</Boton>
            <span className="w-14 text-center text-[0.8rem] tabular-nums" data-letra>{letra} px</span>
            <Boton onClick={() => cambiarLetra(1)} disabled={letra >= LETRA.max} title={t('configuracion.letraGrande')}>A+</Boton>
          </div>
        </Fila>
        <p className="py-3 font-serif leading-relaxed text-tinta" style={{ fontSize: `${letra}px` }}>
          {t('configuracion.muestra')}
        </p>
      </Grupo>

      <HabitoDeLectura preferencias={preferencias} onPreferencias={onPreferencias} />

      <Grupo titulo={t('configuracion.traduccion')}>
        <Fila etiqueta={t('configuracion.claveGemini')}>
          {tieneClave != null && (
            <span className={`inline-flex items-center gap-1.5 text-[0.78rem] ${tieneClave ? 'text-verde' : 'text-tinta-tenue'}`}>
              {tieneClave ? <><IconoCheck className="size-4" /> {t('configuracion.guardada')}</> : t('configuracion.sinClave')}
            </span>
          )}
        </Fila>
        <div className="py-4">
          <FormularioGemini tieneClave={Boolean(tieneClave)} onCambio={leerEstado} />
        </div>
      </Grupo>
    </>
  );
}

function Kindle({ estadoEnvio, onEstadoEnvio, onAbrirKindle }) {
  return (
    <>
      {estadoEnvio ? <ConfigEnvio estado={estadoEnvio} onGuardado={onEstadoEnvio} /> : <p className="text-[0.8rem] text-tinta-tenue">{t('configuracion.cargando')}</p>}
      <Grupo titulo={t('configuracion.enAmazon')} nota={t('configuracion.enAmazonNota')}>
        <p className="py-3 text-[0.8rem] leading-relaxed text-tinta-suave">{t('configuracion.enAmazonTexto')}</p>
      </Grupo>
      {onAbrirKindle && (
        <Grupo titulo={t('configuracion.subrayados')}>
          <Fila etiqueta={t('configuracion.importarSubrayados')} detalle={t('configuracion.importarDetalle')}>
            <Boton onClick={onAbrirKindle}>{t('configuracion.abrirKindle')}</Boton>
          </Fila>
        </Grupo>
      )}
    </>
  );
}

function Familia({ soloLectura, ...props }) {
  if (soloLectura) {
    return (
      <Grupo>
        <p className="py-3 text-[0.82rem] text-tinta-suave">{t('configuracion.familiaCompartida')}</p>
      </Grupo>
    );
  }
  return (
    <div className="space-y-4">
      <ContenidoFamilia {...props} />
    </div>
  );
}

function Calibre() {
  const [info, setInfo] = useState(null);
  const [estado, setEstado] = useState(null); // descarga o actualización en curso (de main.cjs)
  const [resultado, setResultado] = useState(null);
  const leerInfo = () => window.preferencias.calibre().then(setInfo).catch(() => setInfo({ fuente: 'ninguna' }));
  useEffect(() => {
    leerInfo();
    window.herramientasCalibre.estado().then(setEstado).catch(() => {});
    return window.herramientasCalibre.alCambiar(setEstado);
  }, []);

  const buscando = estado?.fase === 'buscando' || estado?.fase === 'descargando' || estado?.fase === 'preparando';
  const buscar = async () => {
    setResultado(null);
    setEstado({ fase: 'buscando' });
    const r = await window.herramientasCalibre.reintentar();
    setEstado((e) => (e?.fase === 'buscando' ? null : e));
    setResultado(r.ok ? { ok: true, texto: t('configuracion.ultimaVersion', { version: r.version }) } : { ok: false, texto: r.mensaje });
    leerInfo();
  };
  const progreso =
    estado?.fase === 'buscando' ? t('configuracion.buscandoVersion')
      : estado?.fase === 'descargando' ? t('configuracion.descargando', { version: estado.version, porcentaje: estado.total ? Math.round((estado.hecho / estado.total) * 100) : 0 })
        : estado?.fase === 'preparando' ? t('configuracion.preparando', { version: estado.version })
          : null;

  const fuente = {
    instalado: t('configuracion.fuenteInstalado'),
    propia: t('configuracion.fuentePropia'),
    ninguna: t('configuracion.fuenteNinguna'),
  };

  return (
    <>
      <Grupo titulo={t('configuracion.herramientas')} nota={t('configuracion.herramientasNota')}>
        <Fila etiqueta={t('configuracion.queUsa')} detalle={info ? fuente[info.fuente] : t('configuracion.revisando')}>
          {info?.version && <span className="text-[0.8rem] text-tinta-suave tabular-nums">Calibre {info.version}</span>}
        </Fila>
        {info?.carpeta && (
          <p className="seleccionable truncate py-2.5 text-[0.76rem] text-tinta-suave" title={info.carpeta}>
            {info.carpeta}
          </p>
        )}
      </Grupo>

      {info && info.fuente !== 'instalado' && (
        <Grupo titulo={t('configuracion.actualizacion')} nota={t('configuracion.actualizacionNota')}>
          <Fila etiqueta={t('configuracion.buscarVersion')} detalle={progreso ?? resultado?.texto}>
            <Boton onClick={buscar} disabled={buscando}>
              {buscando && <span className="size-3 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" />}
              {t('configuracion.buscarActualizacion')}
            </Boton>
          </Fila>
        </Grupo>
      )}
      {info?.fuente === 'instalado' && (
        <Grupo titulo={t('configuracion.actualizacion')}>
          <p className="py-3 text-[0.8rem] leading-relaxed text-tinta-suave">{t('configuracion.mismaVersion')}</p>
        </Grupo>
      )}
    </>
  );
}

/** Qué dice la fila de búsqueda según el estado de las actualizaciones (main.cjs → actualizaciones.cjs). */
function textoActualizacion(estado) {
  if (!estado) return null;
  const fecha = estado.revisado ? new Date(estado.revisado).toLocaleString(region(), { dateStyle: 'medium', timeStyle: 'short' }) : null;
  if (estado.fase === 'buscando') return t('configuracion.act.buscando');
  if (estado.fase === 'descargando') {
    return t('configuracion.act.descargando', { version: estado.version, porcentaje: estado.total ? Math.round((estado.hecho / estado.total) * 100) : 0 });
  }
  if (estado.fase === 'lista') return t('configuracion.act.lista', { version: estado.version });
  if (estado.fase === 'error') return estado.mensaje;
  if (estado.fase === 'al-dia') return t('configuracion.act.alDia', { fecha });
  return fecha ? t('configuracion.act.revisado', { fecha }) : t('configuracion.act.nunca');
}

function Actualizaciones({ preferencias, onPreferencias }) {
  const [estado, setEstado] = useState(null);
  const [mensaje, setMensaje] = useState(null); // si la búsqueda ni empezó (p. ej. en las pruebas)
  useEffect(() => {
    window.actualizaciones.estado().then(setEstado).catch(() => {});
    return window.actualizaciones.alCambiar(setEstado);
  }, []);
  const ocupada = estado?.fase === 'buscando' || estado?.fase === 'descargando';
  const buscar = async () => {
    setMensaje(null);
    const r = await window.actualizaciones.buscar();
    if (!r.ok && !r.fase) setMensaje(r.mensaje);
  };
  const reiniciar = async () => {
    const r = await window.actualizaciones.reiniciar();
    if (!r.ok) setMensaje(r.mensaje);
  };
  // Para ver (y escuchar) el festejo sin esperar una versión nueva.
  const [probando, setProbando] = useState(false);
  const probar = () => {
    setProbando(true);
    if (preferencias?.festejarConSonido !== false) tocarMatasuegras();
  };
  return (
    <>
      <Grupo titulo={t('configuracion.broots')}>
        <Fila etiqueta={t('configuracion.versionInstalada')}>
          <span className="text-[0.8rem] text-tinta-suave tabular-nums">{preferencias?.version ?? '…'}</span>
        </Fila>
        <Fila etiqueta={t('configuracion.act.buscar')} detalle={<span data-estado-actualizacion={estado?.fase ?? ''}>{mensaje ?? textoActualizacion(estado)}</span>}>
          {estado?.fase === 'lista' ? (
            <Boton primario onClick={reiniciar}>{t('configuracion.act.reiniciar')}</Boton>
          ) : (
            <Boton onClick={buscar} disabled={ocupada}>
              {ocupada && <span className="size-3 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" />}
              {t('configuracion.act.buscarAhora')}
            </Boton>
          )}
        </Fila>
      </Grupo>

      <Grupo titulo={t('configuracion.act.automaticas')} nota={t('configuracion.act.automaticasNota')}>
        <div className="-mx-2 py-1.5" data-actualizar-sola={preferencias?.actualizarSola === false ? 'no' : 'si'}>
          <Interruptor activo={preferencias?.actualizarSola !== false} onCambiar={(v) => onPreferencias({ actualizarSola: v })} etiqueta={t('configuracion.act.sola')} />
        </div>
      </Grupo>

      <Grupo titulo={t('configuracion.act.festejo')} nota={t('configuracion.act.festejoNota')}>
        <div className="-mx-2 py-1.5" data-festejar-con-sonido={preferencias?.festejarConSonido === false ? 'no' : 'si'}>
          <Interruptor activo={preferencias?.festejarConSonido !== false} onCambiar={(v) => onPreferencias({ festejarConSonido: v })} etiqueta={t('configuracion.act.sonido')} />
        </div>
        <Fila etiqueta={t('configuracion.act.probarFila')}>
          <Boton onClick={probar} disabled={probando}>{t('configuracion.act.probar')}</Boton>
        </Fila>
      </Grupo>
      {probando && <Confeti onTerminar={() => setProbando(false)} />}

      <Grupo titulo={t('configuracion.act.novedades')}>
        <Fila etiqueta={t('configuracion.act.novedadesFila')} detalle={t('configuracion.act.novedadesDetalle')}>
          <Boton onClick={() => window.preferencias.abrir('novedades')}>{t('configuracion.act.verNovedades')}</Boton>
        </Fila>
      </Grupo>
    </>
  );
}

// Qué sale de la PC, hacia dónde y cuándo: configuracion.salidas.<id> (que, donde, detalle) en los textos.
const SALIDAS = ['traduccion', 'kindle', 'datos', 'drive', 'calibre', 'actualizaciones'];

function Privacidad({ preferencias, onPreferencias }) {
  const amazon = preferencias?.amazon ?? false; // apagado de fábrica (main.cjs)
  const salidas = SALIDAS.map((id) => {
    const texto = (campo) => t(`configuracion.salidas.${id}.${campo}`);
    const apagadas = id === 'actualizaciones' && preferencias?.actualizarSola === false;
    return [texto('que'), id === 'datos' && amazon ? texto('dondeConAmazon') : texto('donde'), apagadas ? texto('detalleApagado') : texto('detalle')];
  });
  return (
    <>
      <Grupo nota={t('configuracion.privacidadNota')}>
        <p className="py-3 text-[0.8rem] leading-relaxed text-tinta-suave">{t('configuracion.privacidadIntro')}</p>
      </Grupo>
      <Grupo titulo={t('configuracion.queSale')}>
        {salidas.map(([que, donde, detalle]) => (
          <div key={que} className="py-2.5">
            <p className="flex items-baseline gap-2 text-[0.84rem]">
              {que}
              <span className="text-[0.72rem] font-medium text-acento">→ {donde}</span>
            </p>
            <p className="mt-0.5 text-[0.74rem] leading-relaxed text-tinta-tenue">{detalle}</p>
          </div>
        ))}
      </Grupo>
      <Grupo titulo={t('configuracion.amazon')} nota={t('configuracion.amazonNota')}>
        <div className="-mx-2 py-1.5" data-amazon={amazon ? 'si' : 'no'}>
          <Interruptor activo={amazon} onCambiar={(v) => onPreferencias({ amazon: v })} etiqueta={t('configuracion.amazonInterruptor')} />
        </div>
      </Grupo>
      <Grupo titulo={t('configuracion.claves')}>
        <p className="py-3 text-[0.8rem] leading-relaxed text-tinta-suave">{t('configuracion.clavesTexto')}</p>
      </Grupo>
    </>
  );
}

function Acerca({ preferencias }) {
  const donaciones = preferencias?.donaciones ?? []; // botones de donación al autor (SITIOS en main.cjs)
  return (
    <>
      <div className="flex items-center gap-4 px-1">
        <span className="grid size-14 place-items-center rounded-[16px] bg-verde text-[#fefae3] shadow-sm">
          <LogoBroots className="size-9" />
        </span>
        <div>
          <p className="font-serif text-xl font-semibold">Broots</p>
          <p className="text-[0.8rem] text-tinta-suave">{t('configuracion.version', { version: preferencias?.version ?? '…' })}</p>
        </div>
      </div>

      <Grupo titulo={t('configuracion.licencia')}>
        <Fila etiqueta={t('configuracion.libre')} detalle={t('configuracion.libreDetalle')}>
          <Boton onClick={() => window.preferencias.abrir('licenciaBroots')}>{t('configuracion.botonLicencia')}</Boton>
        </Fila>
      </Grupo>

      <Grupo titulo={t('configuracion.creditos')} nota={t('configuracion.creditosNota')}>
        <Fila etiqueta="Calibre" detalle={t('configuracion.calibreDetalle')}>
          <div className="flex gap-1.5">
            <Boton onClick={() => window.preferencias.abrir('calibre')}>{t('configuracion.sitio')}</Boton>
            <Boton onClick={() => window.preferencias.abrir('licenciaCalibre')}>{t('configuracion.botonLicencia')}</Boton>
          </div>
        </Fila>
        <Fila etiqueta={t('configuracion.sonidoFila')} detalle={t('configuracion.sonidoDetalle')} />
      </Grupo>

      <Grupo
        titulo={t('configuracion.donaciones')}
        nota={`${t('configuracion.donacionesNota')}${donaciones.length > 1 ? ` ${t('configuracion.donacionesPaises')}` : ''}`}
      >
        <div className="flex flex-wrap gap-2 py-3">
          <Boton primario onClick={() => window.preferencias.abrir('donarCalibre')}>
            <IconoCorazon className="size-3.5" /> {t('configuracion.donarCalibre')}
          </Boton>
          {donaciones.includes('cafecito') && (
            <Boton onClick={() => window.preferencias.abrir('cafecito')}>
              <IconoCafe className="size-3.5" /> {t('configuracion.cafecito')}
            </Boton>
          )}
          {donaciones.includes('sponsors') && (
            <Boton onClick={() => window.preferencias.abrir('sponsors')}>
              <IconoCorazon className="size-3.5" /> {t('configuracion.sponsors')}
            </Boton>
          )}
        </div>
      </Grupo>
    </>
  );
}

// ---------- Pantalla ----------

export function Configuracion({ seccionInicial = 'general', onCerrar, ...props }) {
  const [seccion, setSeccion] = useState(seccionInicial);
  const [preferencias, setPreferencias] = useState(null);
  const contenido = useRef(null);
  const actual = SECCIONES.find((s) => s.id === seccion) ?? SECCIONES[0];

  useEffect(() => {
    window.preferencias.leer().then(setPreferencias).catch(() => {});
  }, []);
  useEffect(() => setSeccion(seccionInicial), [seccionInicial]);
  useEffect(() => {
    if (contenido.current) contenido.current.scrollTop = 0;
  }, [seccion]);
  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && !e.target.closest?.('input, select, textarea') && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  const guardarPreferencias = async (cambios) => {
    setPreferencias((p) => ({ ...p, ...cambios })); // el interruptor responde al instante
    const guardadas = await window.preferencias.guardar(cambios);
    setPreferencias((p) => ({ ...p, ...guardadas }));
  };

  const vistas = {
    general: () => <General {...props} />,
    lectura: () => <Lectura preferencias={preferencias} onPreferencias={guardarPreferencias} />,
    kindle: () => <Kindle {...props} />,
    familia: () => <Familia {...props} />,
    calibre: () => <Calibre />,
    actualizaciones: () => <Actualizaciones preferencias={preferencias} onPreferencias={guardarPreferencias} />,
    privacidad: () => <Privacidad preferencias={preferencias} onPreferencias={guardarPreferencias} />,
    ayuda: () => <ContenidoAyuda onCerrar={onCerrar} />,
    acerca: () => <Acerca preferencias={preferencias} />,
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-8">
      <motion.div className="absolute inset-0 bg-[rgb(var(--sombra))]" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} transition={resorte} onClick={onCerrar} />
      <motion.div
        role="dialog"
        aria-label={t('comun.configuracion')}
        initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative flex h-[min(46rem,100%)] w-[min(62rem,100%)] overflow-hidden rounded-[26px] bg-superficie shadow-flotante"
      >
        <nav className="flex w-[14rem] shrink-0 flex-col gap-0.5 border-r border-borde bg-ventana px-3 pt-5 pb-3">
          <p className="mb-3 px-2.5 font-serif text-lg font-semibold">{t('comun.configuracion')}</p>
          {SECCIONES.map((s) => {
            const Icono = s.icono;
            const activa = s.id === seccion;
            return (
              <button
                type="button"
                key={s.id}
                data-seccion={s.id}
                onClick={() => setSeccion(s.id)}
                className={`relative flex h-8 items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[0.82rem] transition-colors ${
                  activa ? 'font-medium text-tinta' : 'text-tinta-suave hover:bg-superficie-2/70 hover:text-tinta'
                }`}
              >
                {activa && <motion.span layoutId="config-seccion" transition={resorteRapido} className="absolute inset-0 rounded-[9px] bg-seleccion" />}
                <Icono className={`relative size-4 shrink-0 ${activa ? 'text-verde' : ''}`} />
                <span className="relative truncate">{s.nombre}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start gap-3 px-8 pt-6 pb-4">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={actual.id}
                initial={{ opacity: 0, transform: 'translateY(6px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={resorte}
                className="min-w-0 flex-1"
              >
                <h2 className="font-serif text-xl font-semibold">{actual.nombre}</h2>
                <p className="mt-0.5 text-[0.78rem] text-tinta-tenue">{actual.descripcion}</p>
              </motion.div>
            </AnimatePresence>
            <button type="button" onClick={onCerrar} title={t('comun.cerrarEsc')} className="grid size-7 shrink-0 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta">
              <IconoCerrar className="size-3.5" />
            </button>
          </header>

          <div ref={contenido} className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={actual.id}
                data-config-seccion={actual.id}
                initial={{ opacity: 0, transform: 'translateY(8px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={resorte}
                className="space-y-6"
              >
                {vistas[actual.id]()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
