// 1.12 «Definir»: seleccionás una palabra, tocás «Definir» en la barrita de subrayar y aparece qué significa, al
// instante y sin internet. Sale de un diccionario armado con Wiktionary, uno por idioma, que se baja la primera vez que
// se pide (electron/diccionario.cjs). Para el sentido en ese párrafo sigue estando «Explicar» (Gemini), a un toque.
//
// useDefinir() maneja la tarjetita: buscando → la definición (o que no está, o la descarga con su avance). Cerrar la
// tarjeta no corta una descarga; solo «Cancelar».
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { idiomaActual, resorte, t, tamaño } from '../lib/index.js';
import { elegirDiccionario } from '../lib/diccionario.js';
import { AccionTarjeta, lugarTarjeta } from './Explicar.jsx';
import { IconoCerrar, IconoCopiar, IconoDefinir, IconoEditar, IconoExplicar } from './Iconos.jsx';

const SENTIDOS_EN_NOTA = 3;

/** La definición en una línea, para una nota o para copiar: la primera categoría y sus primeros sentidos, con el crédito. */
function comoTexto(entradas) {
  const entrada = entradas[0];
  const sentidos = entrada.categorias[0].sentidos.slice(0, SENTIDOS_EN_NOTA).map((s, i) => `${i + 1}. ${s.texto}`);
  return `${t('definir.prefijoNota', { palabra: entrada.palabra })}${sentidos.join(' ')}`;
}

export function useDefinir({ sub, explicar, avisar, r, idiomaLibro }) {
  const [tarjeta, setTarjeta] = useState(null); // { texto, parrafo, caja, ancla?, id?, modo, idioma, estado, ... }
  const turno = useRef(0);

  // El avance de la descarga (si la tarjeta abierta está esperando ese idioma).
  useEffect(
    () =>
      window.lector.alProgresoDiccionario((p) => {
        setTarjeta((x) => (x?.estado === 'bajando' && x.idioma === p.idioma ? { ...x, fase: p.fase, hecho: p.hecho ?? x.hecho, total: p.total ?? x.total } : x));
      }),
    [],
  );

  const consultar = async (datos) => {
    const mio = ++turno.current;
    setTarjeta({ ...datos, estado: 'buscando' });
    let res;
    try {
      res = await window.lector.definir(datos.idioma, datos.texto);
    } catch {
      res = { estado: 'error', mensaje: t('definir.noPude') };
    }
    if (mio !== turno.current) return;
    if (res.estado === 'falta') return bajar(datos, res.bajar);
    setTarjeta((x) => (x ? { ...x, ...res } : x));
  };

  const bajar = async (datos, total) => {
    const mio = ++turno.current;
    setTarjeta({ ...datos, estado: 'bajando', fase: 'bajando', hecho: 0, total });
    const res = await window.lector.bajarDiccionario(datos.idioma).catch(() => ({ ok: false, mensaje: t('definir.noPude') }));
    if (mio !== turno.current) return; // se cerró la tarjeta: la descarga siguió sola y queda lista para la próxima
    if (res.ok) return consultar(datos);
    if (res.cancelado) return setTarjeta(null);
    setTarjeta({ ...datos, estado: 'error', mensaje: res.mensaje });
  };

  const abrir = () => {
    const datos = sub.paraExplicar();
    if (!datos) return;
    const traducido = r.traducir && r.traducidos.has(datos.indice) && !r.viendoOriginal.has(datos.indice);
    // Los párrafos de alrededor, como vienen en el libro (r.originales guarda su HTML): para cuando este es muy corto.
    const vecinos = r.originales.slice(Math.max(0, (datos.indice ?? 0) - 10), (datos.indice ?? 0) + 10).join(' ').replace(/<[^>]+>/g, ' ');
    const idioma = elegirDiccionario({ parrafo: datos.parrafo, vecinos, traducido, idiomaLibro, idiomaBroots: idiomaActual() });
    sub.cerrarBarra();
    consultar({ ...datos, idioma });
  };

  const cerrar = () => {
    turno.current++;
    setTarjeta(null);
  };

  const cancelar = () => {
    const x = tarjeta;
    cerrar();
    if (x) window.lector.cancelarDiccionario(x.idioma);
  };

  /** Del diccionario a Gemini: lo mismo seleccionado, con su párrafo. */
  const pasarAExplicar = () => {
    const x = tarjeta;
    if (!x) return;
    cerrar();
    explicar.pedir(x);
  };

  const guardarComoNota = async () => {
    const x = tarjeta;
    if (!x?.entradas) return;
    cerrar();
    const nota = comoTexto(x.entradas);
    const ok = x.modo === 'nuevo' ? await sub.crearConNota(x.ancla, nota) : await sub.sumarANota(x.id, nota);
    if (ok) avisar(t('explicar.guardadaComoNota'), 'subrayado');
  };

  const copiar = async () => {
    if (!tarjeta?.entradas) return;
    await window.club.copiar(comoTexto(tarjeta.entradas));
    avisar(t('subrayados.lector.copiado'), 'subrayado');
  };

  return { tarjeta, abrir, cerrar, cancelar, pasarAExplicar, guardarComoNota, copiar, reintentar: () => tarjeta && consultar(tarjeta) };
}

/** Una palabra del diccionario: sus categorías y sentidos. Si era una forma («corrió»), lo dice. */
function Entrada({ entrada, idioma }) {
  return (
    <div data-entrada={entrada.palabra} className="mb-2 last:mb-0">
      {entrada.forma && (
        <p className="mb-1 text-[0.74rem] text-tinta-suave">
          {t('definir.formaDe')} <button type="button" data-credito-palabra onClick={() => window.lector.abrirDiccionario('entrada', idioma, entrada.palabra)} className="font-serif font-semibold text-tinta hover:underline">{entrada.palabra}</button>
        </p>
      )}
      {entrada.categorias.map((c) => (
        <div key={c.nombre} className="mb-1.5 last:mb-0">
          <p className="mb-0.5 text-[0.66rem] font-medium tracking-wide text-tinta-tenue">{c.nombre}</p>
          <ol className="list-decimal pl-4 text-[0.8rem] leading-relaxed text-tinta marker:text-tinta-tenue">
            {c.sentidos.map((s, i) => (
              <li key={i} data-sentido>
                {s.marcas && <span className="text-[0.72rem] text-acento italic">{s.marcas} </span>}
                {s.texto.charAt(0).toLocaleUpperCase() + s.texto.slice(1)}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function TarjetaDefinicion({ definir }) {
  const x = definir.tarjeta;
  const ANCHO = 348;
  const lugar = x ? lugarTarjeta(x.caja, ANCHO, 330) : null;
  const idioma = x?.idioma ? t(`definir.idiomas.${x.idioma}`) : '';
  const principal = x?.entradas?.[0]?.palabra ?? x?.texto;
  return (
    <AnimatePresence>
      {x && (
        <motion.div
          key={`definir-${x.texto}`}
          data-tarjeta-definir={x.estado}
          data-idioma={x.idioma}
          initial={{ opacity: 0, transform: 'translate(-50%, 8px) scale(0.97)' }}
          animate={{ opacity: 1, transform: 'translate(-50%, 0px) scale(1)' }}
          exit={{ opacity: 0, transform: 'translate(-50%, 6px) scale(0.98)', transition: { duration: 0.12 } }}
          transition={resorte}
          style={{ ...lugar, width: ANCHO }}
          className="squircle absolute z-30 rounded-[16px] bg-superficie p-3.5 shadow-flotante"
        >
          <div className="mb-1.5 flex items-start gap-2">
            <IconoDefinir className="mt-0.5 size-4 shrink-0 text-acento" />
            <p className="line-clamp-2 min-w-0 flex-1 font-serif text-[0.86rem] font-semibold">{x.texto}</p>
            <button type="button" onClick={definir.cerrar} className="grid size-6 shrink-0 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta" title={t('lector.cerrar')}>
              <IconoCerrar className="size-3" />
            </button>
          </div>

          {x.estado === 'buscando' && (
            <p className="flex items-center gap-2 py-2 text-[0.78rem] text-tinta-tenue">
              <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" />
              {t('definir.buscando')}
            </p>
          )}

          {x.estado === 'bajando' && (
            <div className="py-1">
              <p data-bajando-mensaje className="text-[0.78rem] leading-relaxed text-tinta-suave">
                {x.fase === 'preparando' ? t('definir.preparando') : t('definir.bajando', { idioma, peso: tamaño(x.total) })}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-superficie-2">
                {/* transform y no width: lo único que se anima en Broots */}
                <div data-bajando-avance className="h-full origin-left rounded-full bg-acento transition-transform duration-150" style={{ transform: `scaleX(${x.fase === 'preparando' ? 1 : Math.min(1, (x.hecho ?? 0) / (x.total || 1))})` }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[0.68rem] text-tinta-tenue">{t('definir.unaSolaVez')}</span>
                <AccionTarjeta data-bajando-cancelar onClick={definir.cancelar}>{t('definir.cancelar')}</AccionTarjeta>
              </div>
            </div>
          )}

          {x.estado === 'listo' && (
            <>
              <div data-definicion className="seleccionable max-h-56 overflow-y-auto pr-1">
                {x.entradas.map((e) => (
                  <Entrada key={`${e.palabra}-${e.forma}`} entrada={e} idioma={x.idioma} />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1 border-t border-borde pt-2">
                <AccionTarjeta data-definir-explicar onClick={definir.pasarAExplicar} title={t('explicar.botonExplica')}>
                  <IconoExplicar className="size-3.5" /> {t('explicar.boton')}
                </AccionTarjeta>
                {x.modo !== 'kindle' && (
                  <AccionTarjeta data-definir-guardar onClick={definir.guardarComoNota} title={t('explicar.guardarExplica')}>
                    <IconoEditar className="size-3.5" /> {t('explicar.guardarComoNota')}
                  </AccionTarjeta>
                )}
                <AccionTarjeta data-definir-copiar onClick={definir.copiar}>
                  <IconoCopiar className="size-3.5" /> {t('subrayados.lector.copiar')}
                </AccionTarjeta>
              </div>
              {/* El crédito que pide la licencia: de dónde sale (con enlace), que está resumido y bajo qué licencia. */}
              <p data-credito className="mt-1 text-right text-[0.64rem] text-tinta-tenue" title={t('definir.creditoExplica')}>
                <button type="button" data-credito-entrada onClick={() => window.lector.abrirDiccionario('entrada', x.idioma, principal)} className="hover:text-tinta hover:underline">Wiktionary</button>
                {` (${t('definir.resumido')}) · `}
                <button type="button" data-credito-licencia onClick={() => window.lector.abrirDiccionario('licencia', idiomaActual())} className="hover:text-tinta hover:underline">CC BY-SA 4.0</button>
              </p>
            </>
          )}

          {x.estado === 'noEsta' && (
            <div className="py-1">
              <p data-no-esta className="text-[0.78rem] leading-relaxed text-tinta-suave">{t('definir.noEsta', { idioma })}</p>
              <div className="mt-1.5 flex gap-1">
                <AccionTarjeta data-definir-explicar onClick={definir.pasarAExplicar} title={t('explicar.botonExplica')}>
                  <IconoExplicar className="size-3.5" /> {t('definir.explicarConGemini')}
                </AccionTarjeta>
              </div>
            </div>
          )}

          {x.estado === 'sinDiccionario' && (
            <div className="py-1">
              <p data-sin-diccionario className="text-[0.78rem] leading-relaxed text-tinta-suave">{t('definir.sinDiccionario')}</p>
              <div className="mt-1.5 flex gap-1">
                <AccionTarjeta data-definir-explicar onClick={definir.pasarAExplicar} title={t('explicar.botonExplica')}>
                  <IconoExplicar className="size-3.5" /> {t('definir.explicarConGemini')}
                </AccionTarjeta>
              </div>
            </div>
          )}

          {x.estado === 'error' && (
            <div className="py-1">
              <p data-error-definir className="text-[0.78rem] leading-relaxed text-[#bc4749]">{x.mensaje}</p>
              <div className="mt-1.5 flex gap-1">
                <AccionTarjeta data-definir-reintentar onClick={definir.reintentar}>{t('lector.reintentar')}</AccionTarjeta>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
