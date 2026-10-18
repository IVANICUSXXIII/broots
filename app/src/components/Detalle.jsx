// Panel de detalle (hoja flotante) y visor de portada a pantalla completa.
//
// Coreografía al abrir un libro:
//  1. Una copia de la portada vuela desde la grilla hasta el panel (ver Vuelo.jsx).
//  2. Detrás, el fondo del panel aparece y se desliza apenas.
//  3. El texto entra en cascada cuando la portada ya está llegando.
// El panel no bloquea: se puede tocar otro libro y el contenido cambia con un fundido.
// Las portadas llevan data-portada-panel / data-portada-visor para que la capa de vuelo las ubique.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'motion/react';
import {
  año, fechaCorta, nombreIdioma, numero, tamaño, valoraciones, etiquetasValidas,
  resorte, resorteRapido, resortePresion, resorteVuelo, t,
} from '../lib/index.js';
import { IconoAbrir, IconoCarpeta, IconoCerrar, IconoCheck, IconoCita, IconoEditar, IconoEnviar, IconoLeer } from './Iconos.jsx';
import { ElegirEstrellas } from './Editar.jsx';
import { etiquetaDe } from './Compartir.jsx';
import { Estrellas, EtiquetaEstado, Portada } from './Piezas.jsx';

export const ANCHO_DETALLE = 420;
export const RADIO_PORTADA_PANEL = 10;
export const RADIO_PORTADA_VISOR = 16;

const cascada = {
  oculto: { transition: { staggerChildren: 0.015, staggerDirection: -1 } },
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.14 } },
};
const item = {
  oculto: { opacity: 0, transform: 'translateY(12px)', transition: { duration: 0.12 } },
  visible: { opacity: 1, transform: 'translateY(0px)', transition: resorte },
};

function Dato({ titulo, children }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-wide text-tinta-tenue">{titulo}</dt>
      <dd className="mt-0.5 text-[0.84rem]">{children}</dd>
    </div>
  );
}

function BotonChico({ children, ...props }) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.95, transition: resortePresion }}
      transition={resorteRapido}
      className="squircle inline-flex items-center gap-1.5 rounded-[10px] bg-superficie-2 px-3 py-1.5 text-xs font-medium shadow-[inset_0_0_0_1px_var(--borde)] transition-colors hover:text-acento"
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Botón "Enviar al Kindle" con su estado (enviando, enviado, error) y el último envío. */
function BotonEnviar({ libro, envio, onEnviar, onConfigurar }) {
  const [estado, setEstado] = useState({ fase: 'reposo' });
  const enviar = async () => {
    setEstado({ fase: 'enviando' });
    const resultado = await onEnviar(libro.id);
    setEstado(resultado.ok ? { fase: 'ok' } : { fase: 'error', mensaje: resultado.mensaje });
  };

  let texto = null;
  if (!envio.formato) {
    texto = libro.formats.length === 0
      ? t('detalle.sinArchivo')
      : t('detalle.soloEpubPdf', { formatos: libro.formats.map((f) => f.format).join(', ') });
  }
  else if (estado.fase === 'ok') texto = t('detalle.enviadoA', { destino: envio.destino });
  else if (estado.fase === 'error') texto = estado.mensaje;
  else if (envio.ultimo) texto = t('detalle.ultimoEnvio', { fecha: fechaCorta(envio.ultimo.fecha), formato: envio.ultimo.formato });

  const listo = envio.listo && envio.formato;
  return (
    <motion.div variants={item} className="mt-6 flex flex-col items-center gap-2">
      <motion.button
        type="button"
        disabled={!envio.formato || estado.fase === 'enviando'}
        onClick={envio.listo ? enviar : onConfigurar}
        whileHover={listo ? { y: -1 } : undefined}
        whileTap={{ scale: 0.96, transition: resortePresion }}
        transition={resorteRapido}
        className={`squircle inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-[0.82rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          envio.listo ? 'bg-acento text-sobre-acento shadow-[0_6px_16px_-8px_var(--acento)] hover:brightness-110' : 'bg-superficie-2 shadow-[inset_0_0_0_1px_var(--borde)] hover:text-acento'
        }`}
      >
        {estado.fase === 'enviando' ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : estado.fase === 'ok' ? (
          <IconoCheck className="size-4" />
        ) : (
          <IconoEnviar className="size-4" />
        )}
        {estado.fase === 'enviando'
          ? t('detalle.enviando', { formato: envio.formato })
          : estado.fase === 'ok'
            ? t('detalle.enviado')
            : envio.listo
              ? `${t('detalle.enviarKindle')}${envio.formato ? ` (${envio.formato})` : ''}`
              : t('detalle.configurarEnvio')}
      </motion.button>
      {texto && (
        <p className={`max-w-xs text-center text-[0.72rem] ${estado.fase === 'error' ? 'text-[#bc4749]' : estado.fase === 'ok' ? 'text-verde' : 'text-tinta-tenue'}`}>
          {texto}
        </p>
      )}
    </motion.div>
  );
}

/** "Compartir con: Ana · Tomás": marca o desmarca el libro para cada integrante de la familia (su etiqueta, "Para <nombre>"). */
function CompartirCon({ libro, familia, onMarcarPara }) {
  const [trabajando, setTrabajando] = useState(null);
  const [error, setError] = useState(null);
  if (!familia.length) return null;
  const alternar = async (persona, marcado) => {
    setTrabajando(persona.id);
    const r = await onMarcarPara(persona.id, libro.id, !marcado);
    setTrabajando(null);
    setError(r.ok ? null : r.mensaje);
  };
  return (
    <motion.div variants={item} className="mt-3 flex flex-col items-center gap-1.5">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="text-[0.72rem] text-tinta-tenue">{t('detalle.compartirCon')}</span>
        {familia.map((p) => {
          const marcado = libro.tags.includes(etiquetaDe(p));
          return (
            <motion.button
              type="button"
              key={p.id}
              onClick={() => alternar(p, marcado)}
              disabled={trabajando != null}
              whileTap={{ scale: 0.94, transition: resortePresion }}
              title={marcado ? t('detalle.yaEsta', { nombre: p.nombre }) : t('detalle.sumarA', { nombre: p.nombre })}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-medium transition-colors disabled:opacity-60 ${
                marcado ? 'bg-verde text-superficie' : 'bg-superficie-2 text-tinta-suave shadow-[inset_0_0_0_1px_var(--borde)] hover:text-tinta'
              }`}
            >
              {marcado && <IconoCheck className="size-3" />}
              {p.nombre}
            </motion.button>
          );
        })}
      </div>
      {error && <p className="max-w-xs text-center text-[0.72rem] text-[#bc4749]">{error}</p>}
    </motion.div>
  );
}

/** "También al Kindle de: Ana": envía el libro al Kindle de alguien de la familia (con la misma cuenta de Gmail). */
function EnviarAFamilia({ libro, familia, envio, onEnviar }) {
  const [estado, setEstado] = useState(null); // { id, fase, texto }
  useEffect(() => setEstado(null), [libro.id]);
  const conKindle = familia.filter((p) => p.kindle);
  if (!conKindle.length || !envio.listo || !envio.formato) return null;
  const enviar = async (p) => {
    setEstado({ id: p.id, fase: 'enviando', texto: t('detalle.enviandoA', { nombre: p.nombre }) });
    const r = await onEnviar(libro.id, p.id);
    setEstado(r.ok ? { id: p.id, fase: 'ok', texto: t('detalle.enviadoAKindleDe', { nombre: p.nombre }) } : { id: p.id, fase: 'error', texto: r.mensaje });
  };
  return (
    <motion.div variants={item} className="-mt-0.5 mb-1 flex flex-col items-center gap-1">
      <p className="text-[0.72rem] text-tinta-tenue">
        {t('detalle.tambienAl')}{' '}
        {conKindle.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ' · '}
            <button type="button" disabled={estado?.fase === 'enviando'} onClick={() => enviar(p)} className="font-medium text-acento hover:underline disabled:opacity-60">
              {p.nombre}
            </button>
          </span>
        ))}
      </p>
      {estado && (
        <p className={`max-w-xs text-center text-[0.72rem] ${estado.fase === 'error' ? 'text-[#bc4749]' : estado.fase === 'ok' ? 'text-verde' : 'text-tinta-tenue'}`}>{estado.texto}</p>
      )}
    </motion.div>
  );
}

/** "Llevar al club de lectura": crea el .md del libro y abre la carpeta para arrastrarlo. */
function BotonClub({ libro, cantidad, onConfigurar }) {
  const [estado, setEstado] = useState(null);
  const llevar = async () => {
    setEstado({ fase: 'creando' });
    setEstado({ fase: 'listo', ...(await window.club.exportar(libro.id)) });
  };
  const enlace = 'font-medium text-acento hover:underline';
  return (
    <motion.div variants={item} className="mt-2 flex flex-col items-center gap-1.5">
      <motion.button
        type="button"
        onClick={llevar}
        disabled={estado?.fase === 'creando'}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.96, transition: resortePresion }}
        transition={resorteRapido}
        title={t('detalle.clubExplicacion')}
        className="squircle inline-flex items-center gap-2 rounded-[12px] bg-superficie-2 px-4 py-2 text-[0.82rem] font-medium shadow-[inset_0_0_0_1px_var(--borde)] transition-colors hover:text-acento disabled:opacity-60"
      >
        <IconoCita className="size-4 text-acento" />
        {t('detalle.llevarClub')}
        {cantidad > 0 && <span className="text-xs font-normal text-tinta-tenue">{t('detalle.clubSubrayados', { n: cantidad })}</span>}
      </motion.button>
      {estado?.fase === 'listo' && (
        <div className="max-w-xs text-center text-[0.72rem]">
          {estado.ok ? (
            <>
              <p className="text-verde">{t('detalle.clubListo', { nombre: estado.nombre })}</p>
              <p className="mt-1 text-tinta-tenue">
                {t('detalle.abrir')}{' '}
                <button type="button" className={enlace} onClick={() => window.club.abrir('claude')}>Claude</button>
                {' · '}
                <button type="button" className={enlace} onClick={() => window.club.abrir('notebooklm')}>NotebookLM</button>
                {' · '}
                <button type="button" className={enlace} onClick={() => window.club.abrir('gemini')}>Gemini</button>
                {' · '}
                <button type="button" className={enlace} onClick={() => window.club.mostrarArchivo()}>{t('detalle.verArchivo')}</button>
              </p>
            </>
          ) : (
            <p className="text-[#bc4749]">{estado.mensaje}</p>
          )}
        </div>
      )}
      <button type="button" onClick={onConfigurar} className="text-[0.7rem] text-tinta-tenue hover:text-acento">
        {t('detalle.instruccionesClub')}
      </button>
    </motion.div>
  );
}

/** Convertir a EPUB o PDF los libros que no los tienen (con el conversor de Calibre). */
function Convertir({ libro, onConvertir }) {
  const [estado, setEstado] = useState(null);
  useEffect(() => setEstado(null), [libro.id]);
  const tiene = new Set(libro.formats.map((f) => f.format));
  const faltan = ['EPUB', 'PDF'].filter((f) => !tiene.has(f));
  // Si ya tiene todos los formatos se oculta, salvo que haya un mensaje que mostrar (p. ej. "✓ Convertido").
  if (!libro.formats.length || (!faltan.length && !estado)) return null;
  const convertir = async (destino) => {
    setEstado({ fase: 'convirtiendo', destino });
    const r = await onConvertir(libro.id, destino);
    setEstado(r.ok ? { fase: 'ok', texto: t('detalle.convertido', { destino, desde: r.desde }) } : { fase: 'error', texto: r.mensaje });
  };
  const ocupado = estado?.fase === 'convirtiendo';
  return (
    <motion.div variants={item} className="mt-2 flex flex-col items-center gap-1">
      <div className="flex gap-2">
        {faltan.map((destino) => (
          <button
            type="button"
            key={destino}
            disabled={ocupado}
            onClick={() => convertir(destino)}
            className="text-[0.72rem] font-medium text-acento hover:underline disabled:opacity-50"
          >
            {ocupado && estado.destino === destino ? t('detalle.convirtiendo', { destino }) : t('detalle.convertir', { destino })}
          </button>
        ))}
      </div>
      {estado?.texto && <p className={`max-w-xs text-center text-[0.7rem] ${estado.fase === 'error' ? 'text-[#bc4749]' : 'text-verde'}`}>{estado.texto}</p>}
    </motion.div>
  );
}

const SUBRAYADOS_VISIBLES = 4;

/** Tus subrayados del Kindle para este libro. */
function ListaSubrayados({ subrayados }) {
  const [todos, setTodos] = useState(false);
  const mostrados = todos ? subrayados : subrayados.slice(0, SUBRAYADOS_VISIBLES);
  return (
    <motion.div variants={item} className="mt-7">
      <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-wide text-tinta-tenue">
        <IconoCita className="size-3.5 text-acento" /> {t('detalle.misSubrayados', { n: subrayados.length })}
      </p>
      <div className="mt-3 space-y-4">
        {mostrados.map((s) => (
          <figure key={s.id} className="border-l-2 border-acento/50 pl-3">
            {s.tipo === 'nota' ? (
              <p className="text-[0.84rem] italic text-tinta-suave">✎ {s.texto}</p>
            ) : (
              <blockquote className="font-serif text-[0.9rem] leading-relaxed text-tinta/90">{s.texto}</blockquote>
            )}
            {s.nota && <p className="mt-1.5 rounded-lg bg-acento-suave/70 px-2.5 py-1.5 text-xs text-tinta-suave">✎ {s.nota}</p>}
            <figcaption className="mt-1 text-[0.68rem] text-tinta-tenue">
              {[s.pagina && t('detalle.pagina', { n: s.pagina[0] }), s.ubicacion && t('detalle.posicion', { n: s.ubicacion[0] }), s.fecha && fechaCorta(s.fecha)].filter(Boolean).join(' · ')}
            </figcaption>
          </figure>
        ))}
      </div>
      {subrayados.length > SUBRAYADOS_VISIBLES && (
        <button type="button" onClick={() => setTodos(!todos)} className="mt-3 text-xs font-medium text-acento hover:underline">
          {todos ? t('detalle.verMenos') : t('detalle.verTodos', { n: subrayados.length })}
        </button>
      )}
    </motion.div>
  );
}

export function PanelDetalle({
  libro, columnas, colEstado, colValoracion, subrayados = [], envio, onEnviar, onConfigurarKindle, onConfigurarClub,
  onCerrar, onEtiqueta, onAmpliar, onEditar, onEditarRapido, onConvertir, onLeer,
  soloLectura = false, familia = [], onMarcarPara,
}) {
  const { propia, importada } = valoraciones(libro, colValoracion);
  // Cambios rápidos (estado, estrellas): se guardan al instante en Calibre.
  const [estadoRapido, setEstadoRapido] = useState(null);
  const guardando = estadoRapido?.guardando;
  useEffect(() => setEstadoRapido(null), [libro.id]);
  const guardarRapido = async (cambios) => {
    setEstadoRapido({ guardando: true, texto: t('detalle.guardando') });
    const r = await onEditarRapido(libro.id, cambios);
    setEstadoRapido(r.ok ? null : { error: true, texto: r.mensaje });
  };
  const otrasColumnas = columnas.filter(
    (c) => c !== colEstado && c !== colValoracion && libro.custom[c.label] != null && libro.custom[c.label] !== '',
  );
  const etiquetas = etiquetasValidas(libro);
  const etiquetasDañadas = libro.tags.length - etiquetas.length;

  // Precarga la portada original con la app quieta, para que el visor no la decodifique en pleno vuelo.
  useEffect(() => {
    const temporizador = setTimeout(() => {
      const imagen = new Image();
      imagen.src = `cover://full/${libro.id}?v=${encodeURIComponent(libro.lastModified)}`;
      imagen.decode().catch(() => {});
    }, 1600);
    return () => clearTimeout(temporizador);
  }, [libro.id, libro.lastModified]);

  return (
    <motion.div
      // Alineado con el panel central: debajo de la barra superior (h-11 = 44 px) y con el mismo margen inferior.
      className="fixed top-11 right-2 bottom-2 z-40"
      style={{ width: ANCHO_DETALLE }}
      // Este contenedor no se mueve: así la portada puede medir bien su destino.
      exit={{ opacity: 1, transition: { duration: 0.35 } }}
    >
      {/* Fondo del panel: aparece y se desliza apenas, por detrás de la portada que vuela */}
      <motion.div
        className="squircle absolute inset-0 rounded-[26px] bg-superficie shadow-flotante"
        initial={{ opacity: 0, transform: 'translateX(28px) scale(0.98)' }}
        animate={{ opacity: 1, transform: 'translateX(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateX(28px) scale(0.98)', transition: { ...resorte, delay: 0.04 } }}
        // Se vuelve opaco rápido, antes de que entre el texto, para no mezclarlo con las portadas de atrás.
        transition={{ default: resorte, opacity: { duration: 0.16 } }}
      />

      <div className="relative flex h-full flex-col">
        <motion.div
          className="flex justify-end p-2.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          {!soloLectura && (
            <motion.button
              type="button"
              onClick={onEditar}
              title={t('detalle.editarExplicacion')}
              whileTap={{ scale: 0.92, transition: resortePresion }}
              className="mr-1.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-superficie-2 px-3 text-[0.74rem] font-medium text-tinta-suave hover:text-acento"
            >
              <IconoEditar className="size-3.5" /> {t('detalle.editar')}
            </motion.button>
          )}
          <motion.button
            type="button"
            onClick={onCerrar}
            title={t('comun.cerrarEsc')}
            whileTap={{ scale: 0.88, transition: resortePresion }}
            className="grid size-7 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta"
          >
            <IconoCerrar className="size-3.5" />
          </motion.button>
        </motion.div>

        <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={libro.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className="seleccionable min-h-0 flex-1 overflow-y-auto px-7 pb-8"
        >
          <motion.button
            type="button"
            data-portada-panel={libro.id}
            onClick={(e) => onAmpliar(e.currentTarget)}
            title={t('detalle.verPortada')}
            whileHover={{ scale: 1.025, transition: resorteRapido }}
            whileTap={{ scale: 0.97, transition: resortePresion }}
            style={{ borderRadius: RADIO_PORTADA_PANEL }}
            className="squircle relative mx-auto block aspect-[2/3] w-[12.1rem] cursor-zoom-in overflow-hidden shadow-[0_2px_4px_rgb(var(--sombra)/0.15),0_22px_40px_-14px_rgb(var(--sombra)/0.55)]"
          >
            <Portada libro={libro} completa className="size-full" />
          </motion.button>

          <motion.div variants={cascada} initial="oculto" animate="visible" exit="oculto">
            <motion.h2 variants={item} className="mt-6 text-center font-serif text-xl leading-tight font-semibold text-balance">
              {libro.title}
            </motion.h2>
            <motion.p variants={item} className="mt-1.5 text-center text-sm text-tinta-suave">
              {libro.authors.join(', ')}
            </motion.p>
            {libro.series && (
              <motion.p variants={item} className="mt-1 text-center text-xs text-tinta-tenue">
                {libro.series}
                {libro.seriesIndex != null && t('detalle.libroN', { n: libro.seriesIndex })}
              </motion.p>
            )}

            <motion.div variants={item} className="mt-4 flex flex-col items-center gap-2">
              {/* Estado y valoración propios: se cambian con un clic (se guardan en Calibre) */}
              {colEstado && !soloLectura && (
                <div className="flex flex-wrap justify-center gap-1">
                  {colEstado.enumValues.map((v) => {
                    const elegido = libro.custom[colEstado.label] === v;
                    return (
                      <motion.button
                        type="button"
                        key={v}
                        disabled={guardando}
                        whileTap={{ scale: 0.94, transition: resortePresion }}
                        onClick={() => guardarRapido({ custom: { [colEstado.label]: elegido ? null : v } })}
                        title={elegido ? t('detalle.quitarEstado') : t('detalle.marcarComo', { estado: v })}
                        className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition-colors ${
                          elegido ? 'bg-verde text-superficie' : 'bg-superficie-2 text-tinta-suave hover:text-tinta'
                        }`}
                      >
                        {v}
                      </motion.button>
                    );
                  })}
                </div>
              )}
              {colValoracion && !soloLectura && (
                <div className="flex items-center gap-2 text-xs text-tinta-suave">
                  <ElegirEstrellas valor={propia} onCambiar={(v) => guardarRapido({ custom: { [colValoracion.label]: v } })} />
                </div>
              )}
              {importada && (
                <span className="flex items-center gap-2 text-xs text-tinta-tenue">
                  <Estrellas valor={importada} tipo="importada" className="size-3.5" /> {t('detalle.importada')}
                </span>
              )}
              {estadoRapido && (
                <p className={`text-[0.7rem] ${estadoRapido.error ? 'text-[#bc4749]' : 'text-tinta-tenue'}`}>{estadoRapido.texto}</p>
              )}
            </motion.div>

            {libro.formats.some((f) => f.format === 'EPUB') && (
              <motion.div variants={item} className="mt-6 flex justify-center">
                <motion.button
                  type="button"
                  onClick={() => onLeer(libro.id)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96, transition: resortePresion }}
                  transition={resorteRapido}
                  title={t('detalle.leerExplicacion')}
                  className="squircle inline-flex items-center gap-2 rounded-[12px] bg-verde px-5 py-2 text-[0.82rem] font-medium text-superficie shadow-[0_6px_16px_-8px_var(--verde)] hover:brightness-110"
                >
                  <IconoLeer className="size-4" />
                  {t('detalle.leer')}
                </motion.button>
              </motion.div>
            )}
            {!soloLectura && (
              <>
                <BotonEnviar libro={libro} envio={envio} onEnviar={onEnviar} onConfigurar={onConfigurarKindle} />
                <EnviarAFamilia libro={libro} familia={familia} envio={envio} onEnviar={onEnviar} />
                <BotonClub libro={libro} cantidad={subrayados.length} onConfigurar={onConfigurarClub} />
                <CompartirCon libro={libro} familia={familia} onMarcarPara={onMarcarPara} />
              </>
            )}

            {libro.formats.length > 0 && (
              <motion.div variants={item} className="mt-4 flex flex-wrap justify-center gap-2">
                {libro.formats.map((f) => (
                  <BotonChico
                    key={f.format}
                    onClick={() => window.biblioteca.abrirFormato(libro.id, f.format)}
                    title={t('detalle.abrirFormato', { formato: f.format })}
                  >
                    <IconoAbrir className="size-3.5" />
                    {f.format}
                    <span className="font-normal text-tinta-tenue">{tamaño(f.size)}</span>
                  </BotonChico>
                ))}
                <BotonChico onClick={() => window.biblioteca.mostrarEnCarpeta(libro.id)}>
                  <IconoCarpeta className="size-3.5" />
                  {t('detalle.mostrarCarpeta')}
                </BotonChico>
              </motion.div>
            )}
            {!soloLectura && <Convertir libro={libro} onConvertir={onConvertir} />}

            {etiquetas.length > 0 && (
              <motion.div variants={item} className="mt-6 flex flex-wrap gap-1.5">
                {etiquetas.map((etiqueta) => (
                  <motion.button
                    type="button"
                    key={etiqueta}
                    onClick={() => onEtiqueta(etiqueta)}
                    title={t('detalle.verEtiqueta')}
                    whileTap={{ scale: 0.94, transition: resortePresion }}
                    className="rounded-full bg-seleccion/70 px-2.5 py-1 text-xs text-tinta-suave transition-colors hover:bg-acento-suave hover:text-acento"
                  >
                    {etiqueta}
                  </motion.button>
                ))}
              </motion.div>
            )}

            {subrayados.length > 0 && <ListaSubrayados subrayados={subrayados} />}

            <motion.dl variants={item} className="squircle mt-6 grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-[18px] bg-superficie-2/60 p-4">
              <Dato titulo={t('detalle.publicado')}>{año(libro.pubdate)}</Dato>
              <Dato titulo={t('detalle.editorial')}>{libro.publisher}</Dato>
              <Dato titulo={t('detalle.idioma')}>{libro.languages.map(nombreIdioma).join(', ')}</Dato>
              <Dato titulo={t('detalle.agregado')}>{fechaCorta(libro.added)}</Dato>
              {otrasColumnas.map((c) => (
                <Dato key={c.label} titulo={c.name}>
                  {c.datatype === 'bool'
                    ? t(libro.custom[c.label] ? 'filtros.si' : 'filtros.no')
                    : c.datatype === 'int' || c.datatype === 'float'
                      ? numero(libro.custom[c.label])
                      : [libro.custom[c.label]].flat().join(', ')}
                </Dato>
              ))}
              <Dato titulo="ISBN">{libro.identifiers.isbn}</Dato>
            </motion.dl>

            {libro.comments && (
              <motion.div variants={item} className="mt-7">
                <p className="text-[0.68rem] font-semibold tracking-wide text-tinta-tenue">{t('detalle.descripcion')}</p>
                <p className="mt-2 font-serif text-[0.9rem] leading-relaxed whitespace-pre-line text-tinta/90">{libro.comments}</p>
              </motion.div>
            )}

            {etiquetasDañadas > 0 && (
              <motion.p variants={item} className="mt-6 text-[0.7rem] text-tinta-tenue">
                {t('detalle.dañadas', { n: etiquetasDañadas })}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Arrastre para cerrar el visor: hasta dónde hay que arrastrar o qué tan rápido soltar.
const DISTANCIA_CIERRE = 140;
const VELOCIDAD_CIERRE = 650;

/**
 * Visor a pantalla completa. La portada viaja desde el panel; el fondo aparece desenfocado,
 * oscuro y sin color (una foto preparada de antemano: ver lib/fondoDesenfocado.js).
 * Se cierra con un clic (sobre la portada o afuera), con Esc o arrastrando la portada: sigue al
 * mouse y, al soltarla, vuelve volando al panel desde donde quedó (onCerrar recibe la portada).
 */
export function VisorPortada({ libro, fondo, onCerrar }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const distancia = useTransform(() => Math.hypot(x.get(), y.get()));
  const escala = useTransform(distancia, [0, 400], [1, 0.82]);
  const intensidadFondo = useTransform(distancia, [0, 400], [1, 0.35]);

  const alSoltar = (_e, info) => {
    const lejos = Math.hypot(info.offset.x, info.offset.y) > DISTANCIA_CIERRE;
    const rapido = Math.hypot(info.velocity.x, info.velocity.y) > VELOCIDAD_CIERRE;
    if (lejos || rapido) {
      onCerrar();
    } else {
      animate(x, 0, resorteVuelo);
      animate(y, 0, resorteVuelo);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-10">
      <motion.div
        className="absolute inset-0 cursor-zoom-out"
        onClick={onCerrar}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={resorte}
      >
        <motion.div className="absolute inset-0" style={{ opacity: intensidadFondo }}>
          {fondo && <img src={fondo} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
          <div className="absolute inset-0" style={{ background: fondo ? 'rgba(16, 20, 12, 0.5)' : 'rgba(16, 20, 12, 0.82)' }} />
        </motion.div>
      </motion.div>

      <motion.div
        data-portada-visor={libro.id}
        drag
        dragMomentum={false}
        onDragEnd={alSoltar}
        onTap={() => onCerrar()}
        exit={{ opacity: 0, transition: { duration: 0 } }}
        style={{ x, y, scale: escala, borderRadius: RADIO_PORTADA_VISOR }}
        whileDrag={{ cursor: 'grabbing' }}
        className="squircle relative aspect-[2/3] h-[min(86vh,calc((100vw-5rem)*1.5))] cursor-grab overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
      >
        <Portada libro={libro} original className="pointer-events-none size-full" />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { ...resorte, delay: 0.2 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        className="pointer-events-none absolute bottom-4 text-xs text-white/70"
      >
        {t('detalle.visor', { titulo: libro.title })}
      </motion.p>
    </div>
  );
}
