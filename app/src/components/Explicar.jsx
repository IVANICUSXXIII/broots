// 1.9 «Explicar»: seleccionás una palabra o una frase, tocás «Explicar» en la barrita de subrayar y Gemini te cuenta
// qué quiere decir en ese contexto (el párrafo donde aparece), en el idioma de Broots y sin spoilers.
//
// useExplicar() maneja la tarjetita: pensando → la explicación (o el error, o que falta la clave). Desde ahí se puede
// guardar como nota del subrayado (si no estaba subrayado, se subraya) o copiar. Electron guarda cada explicación
// 30 días (traduccion.cjs), así preguntar dos veces lo mismo no gasta cupo.
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { resorte, resortePresion, t } from '../lib/index.js';
import { IconoCerrar, IconoCopiar, IconoEditar, IconoExplicar } from './Iconos.jsx';

export const LARGO_EXPLICABLE = 400; // caracteres: para más que eso ya no es «explicame esta palabra»

/** ¿Se ofrece «Explicar» para este texto? (una palabra, una frase o un pedazo corto) */
export const explicable = (texto) => {
  const limpio = String(texto ?? '').trim();
  return limpio.length > 0 && limpio.length <= LARGO_EXPLICABLE && /\p{L}/u.test(limpio);
};

export function useExplicar({ libro, sub, avisar }) {
  const [tarjeta, setTarjeta] = useState(null); // { texto, parrafo, caja, ancla?, id?, modo, estado, explicacion?, mensaje? }
  const turno = useRef(0);

  const pedir = async (datos) => {
    const mio = ++turno.current;
    setTarjeta({ ...datos, estado: 'pensando' });
    let res;
    try {
      res = await window.lector.explicar(libro.id, { texto: datos.texto, parrafo: datos.parrafo });
    } catch {
      res = { ok: false, mensaje: t('explicar.noPude') };
    }
    if (mio !== turno.current) return; // se cerró o se pidió otra cosa mientras tanto
    setTarjeta((x) =>
      !x ? x : res?.ok ? { ...x, estado: 'listo', explicacion: res.explicacion } : { ...x, estado: res?.sinClave ? 'sinClave' : 'error', mensaje: res?.mensaje ?? t('explicar.noPude') },
    );
  };

  /** Desde la barrita: lo seleccionado (o el subrayado tocado) con su párrafo. */
  const abrir = () => {
    const datos = sub.paraExplicar();
    if (!datos || !explicable(datos.texto)) return;
    sub.cerrarBarra();
    pedir(datos);
  };

  const cerrar = () => {
    turno.current++;
    setTarjeta(null);
  };

  /** Guarda la explicación como nota: si era una selección nueva, la subraya; si ya era un subrayado, se suma a su nota. */
  const guardarComoNota = async () => {
    const x = tarjeta;
    if (!x?.explicacion) return;
    cerrar();
    const nota = `${t('explicar.prefijoNota')}${x.explicacion}`;
    const ok = x.modo === 'nuevo' ? await sub.crearConNota(x.ancla, nota) : await sub.sumarANota(x.id, nota);
    if (ok) avisar(t('explicar.guardadaComoNota'), 'subrayado');
  };

  const copiar = async () => {
    if (!tarjeta?.explicacion) return;
    await window.club.copiar(tarjeta.explicacion);
    avisar(t('subrayados.lector.copiado'), 'subrayado');
  };

  return { tarjeta, abrir, cerrar, guardarComoNota, copiar, reintentar: () => tarjeta && pedir(tarjeta) };
}

function Accion({ children, ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95, transition: resortePresion }}
      className="inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[0.74rem] font-medium text-acento transition-colors hover:bg-superficie-2"
      {...props}
    >
      {children}
    </motion.button>
  );
}

/**
 * La tarjetita: debajo de lo seleccionado si entra; si no, arriba (pero nunca pegada al borde de arriba, donde
 * aparecen los avisos del lector). onConfigurar abre el panel de la clave de Gemini.
 */
export function TarjetaExplicacion({ explicar, onConfigurar }) {
  const x = explicar.tarjeta;
  const ANCHO = 336;
  const lugar = x
    ? {
        left: Math.min(Math.max(x.caja.x + x.caja.ancho / 2, ANCHO / 2 + 8), x.caja.anchoMarco - ANCHO / 2 - 8),
        ...(x.caja.y + x.caja.alto + 210 < x.caja.altoMarco
          ? { top: x.caja.y + x.caja.alto + 10 }
          : { bottom: Math.min(x.caja.altoMarco - x.caja.y + 10, x.caja.altoMarco - 250) }),
      }
    : null;
  return (
    <AnimatePresence>
      {x && (
        <motion.div
          key={`explicar-${x.texto}`}
          data-tarjeta-explicar={x.estado}
          initial={{ opacity: 0, transform: 'translate(-50%, 8px) scale(0.97)' }}
          animate={{ opacity: 1, transform: 'translate(-50%, 0px) scale(1)' }}
          exit={{ opacity: 0, transform: 'translate(-50%, 6px) scale(0.98)', transition: { duration: 0.12 } }}
          transition={resorte}
          style={{ ...lugar, width: ANCHO }}
          className="squircle absolute z-30 rounded-[16px] bg-superficie p-3.5 shadow-flotante"
        >
          <div className="mb-1.5 flex items-start gap-2">
            <IconoExplicar className="mt-0.5 size-4 shrink-0 text-acento" />
            <p className="line-clamp-2 min-w-0 flex-1 font-serif text-[0.86rem] font-semibold">{x.texto}</p>
            <button type="button" onClick={explicar.cerrar} className="grid size-6 shrink-0 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta" title={t('lector.cerrar')}>
              <IconoCerrar className="size-3" />
            </button>
          </div>

          {x.estado === 'pensando' && (
            <p className="flex items-center gap-2 py-2 text-[0.78rem] text-tinta-tenue">
              <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" />
              {t('explicar.pensando')}
            </p>
          )}

          {x.estado === 'listo' && (
            <>
              <p data-explicacion className="seleccionable max-h-56 overflow-y-auto text-[0.8rem] leading-relaxed text-tinta">
                {x.explicacion}
              </p>
              <div className="mt-2 flex items-center gap-1 border-t border-borde pt-2">
                {x.modo !== 'kindle' && (
                  <Accion data-guardar-explicacion onClick={explicar.guardarComoNota} title={t('explicar.guardarExplica')}>
                    <IconoEditar className="size-3.5" /> {t('explicar.guardarComoNota')}
                  </Accion>
                )}
                <Accion data-copiar-explicacion onClick={explicar.copiar}>
                  <IconoCopiar className="size-3.5" /> {t('subrayados.lector.copiar')}
                </Accion>
                <span className="min-w-0 flex-1 truncate text-right text-[0.64rem] text-tinta-tenue" title={t('explicar.cuantoDura')}>
                  {t('explicar.deGemini')}
                </span>
              </div>
            </>
          )}

          {(x.estado === 'error' || x.estado === 'sinClave') && (
            <div className="py-1">
              <p className={`text-[0.78rem] leading-relaxed ${x.estado === 'error' ? 'text-[#bc4749]' : 'text-tinta-suave'}`}>{x.estado === 'sinClave' ? t('explicar.faltaClave') : x.mensaje}</p>
              <div className="mt-1.5 flex gap-1">
                {x.estado === 'sinClave' ? (
                  <Accion
                    onClick={() => {
                      explicar.cerrar();
                      onConfigurar();
                    }}
                  >
                    {t('lector.configurar')}
                  </Accion>
                ) : (
                  <Accion onClick={explicar.reintentar}>{t('lector.reintentar')}</Accion>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
