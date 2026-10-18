// 1.7 «Hábito de lectura»: la pantalla «Mi lectura» (botón de la llama, en la barra de arriba).
// Racha, horas del mes, ritmo, libros terminados, el mapa de calor del año, a qué hora y qué días leés,
// los libros en curso con cuánto les falta y las últimas sesiones. También ofrece crear la columna
// «Estado» (con la herramienta oficial de Calibre y permiso del usuario) o agregarle «En pausa».
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  diaLocal, duracion, estimacion, lecturaDelLibro, nivelDelDia, region, resorte, resortePresion, resumen, ritmoTexto,
  semanasDelMapa, t, tipoEstado, valorDeEstado,
} from '../lib/index.js';
import { IconoCerrar, IconoLeer, IconoRacha } from './Iconos.jsx';

const COLORES_MAPA = ['bg-superficie-2', 'bg-verde/25', 'bg-verde/45', 'bg-verde/70', 'bg-verde'];
const DIAS_SIN_ABRIR = 30; // un libro «Leyendo» sin abrir hace tanto: se sugiere pasarlo a En pausa

const fechaLarga = (dia) => new Date(`${dia}T12:00:00`).toLocaleDateString(region(), { weekday: 'short', day: 'numeric', month: 'short' });
const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

function Tarjeta({ titulo, valor, detalle, icono, datos }) {
  return (
    <div className="squircle rounded-[16px] bg-superficie-2/60 p-4 shadow-[inset_0_0_0_1px_var(--borde)]" {...datos}>
      <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">
        {icono}
        {titulo}
      </p>
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">{valor}</p>
      {detalle && <p className="mt-0.5 text-[0.72rem] text-tinta-tenue">{detalle}</p>}
    </div>
  );
}

function Seccion({ titulo, nota, children, ...props }) {
  return (
    <section {...props}>
      <h3 className="mb-2 px-1 text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">{titulo}</h3>
      {children}
      {nota && <p className="mt-1.5 px-1 text-[0.72rem] leading-relaxed text-tinta-tenue">{nota}</p>}
    </section>
  );
}

/** Mapa de calor del año, estilo GitHub: una columna por semana, de lunes a domingo. */
function MapaDeCalor({ dias }) {
  const semanas = useMemo(() => semanasDelMapa(dias), [dias]);
  const meses = semanas.map((semana, i) => {
    const primero = semana.find((d) => d.dia.endsWith('-01'));
    return primero && i < semanas.length - 1 ? new Date(`${primero.dia}T12:00:00`).toLocaleDateString(region(), { month: 'short' }) : null;
  });
  return (
    <div className="squircle overflow-x-auto rounded-[16px] bg-superficie-2/60 p-4 shadow-[inset_0_0_0_1px_var(--borde)]">
      <div className="mx-auto w-max">
        <div className="mb-1 flex gap-[3px] text-[0.64rem] text-tinta-tenue">
          {meses.map((m, i) => (
            <span key={i} className="w-[11px] overflow-visible whitespace-nowrap">{m ?? ''}</span>
          ))}
        </div>
        <div className="flex gap-[3px]" data-mapa>
          {semanas.map((semana, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {semana.map((d) => (
                <span
                  key={d.dia}
                  data-dia={d.dia}
                  data-minutos={Math.round(d.minutos)}
                  title={d.futuro ? undefined : `${fechaLarga(d.dia)}: ${d.minutos ? duracion(d.minutos) : t('habito.sinLectura')}`}
                  className={`size-[11px] rounded-[3px] ${d.futuro ? 'opacity-0' : COLORES_MAPA[nivelDelDia(d.minutos)]}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-end gap-[3px] text-[0.64rem] text-tinta-tenue">
          <span className="mr-1">{t('habito.menos')}</span>
          {COLORES_MAPA.map((c) => (
            <span key={c} className={`size-[11px] rounded-[3px] ${c}`} />
          ))}
          <span className="ml-1">{t('habito.mas')}</span>
        </div>
      </div>
    </div>
  );
}

/** Barras chiquitas (por hora del día o por día de la semana). Solo cambia la escala vertical (transform). */
function Barras({ valores, etiquetas, nombre }) {
  const maximo = Math.max(...valores, 1);
  return (
    <div className="squircle rounded-[16px] bg-superficie-2/60 p-4 shadow-[inset_0_0_0_1px_var(--borde)]">
      <div className="flex h-20 items-end gap-[3px]">
        {valores.map((v, i) => (
          <span key={i} title={`${nombre(i)}: ${duracion(v)}`} className="h-full flex-1">
            <motion.span
              className="block h-full origin-bottom rounded-t-[3px] bg-verde/70"
              initial={{ transform: 'scaleY(0)' }}
              animate={{ transform: `scaleY(${Math.max(v ? 0.04 : 0.015, v / maximo)})` }}
              transition={{ ...resorte, delay: i * 0.012 }}
            />
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.64rem] text-tinta-tenue">
        {etiquetas.map((e, i) => (
          <span key={i}>{e}</span>
        ))}
      </div>
    </div>
  );
}

/** Momento del día preferido, con un poco de humor. */
function momentoFavorito(porHora) {
  const total = porHora.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const tramos = { madrugada: [0, 5], manana: [5, 12], tarde: [12, 19], noche: [19, 24] };
  const suma = (de, a) => porHora.slice(de, a).reduce((x, y) => x + y, 0);
  return Object.entries(tramos).sort((a, b) => suma(...b[1]) - suma(...a[1]))[0][0];
}

/** Columna «Estado»: crearla (si no hay) o agregarle «En pausa» (si le falta). */
function TarjetaEstados({ colEstado, soloLectura, onCrearColumna, onRecargar }) {
  const [descartada, setDescartada] = useState(() => {
    try {
      return localStorage.getItem('broots-guia-pausa') === 'no';
    } catch {
      return false;
    }
  });
  const [estado, setEstado] = useState(null); // { trabajando } | { error }
  if (soloLectura) return null;

  if (!colEstado) {
    const crear = async () => {
      if (!window.confirm(t('habito.estados.confirmar'))) return;
      setEstado({ trabajando: true });
      const r = await onCrearColumna();
      setEstado(r?.ok ? null : { error: r?.mensaje ?? t('habito.estados.noPude') });
    };
    return (
      <Seccion titulo={t('habito.estados.titulo')} data-tarjeta-estados="crear">
        <div className="squircle rounded-[16px] bg-acento-suave/60 p-4 text-[0.8rem] leading-relaxed shadow-[inset_0_0_0_1px_var(--borde)]">
          <p className="font-medium">{t('habito.estados.crearTitulo')}</p>
          <p className="mt-1 text-tinta-suave">{t('habito.estados.crearTexto')}</p>
          <div className="mt-3 flex items-center gap-3">
            <motion.button
              type="button"
              disabled={estado?.trabajando}
              whileTap={{ scale: 0.96, transition: resortePresion }}
              onClick={crear}
              className="squircle rounded-[10px] bg-verde px-3.5 py-1.5 text-[0.78rem] font-medium text-superficie disabled:opacity-60"
            >
              {estado?.trabajando ? t('habito.estados.creando') : t('habito.estados.crear')}
            </motion.button>
            {estado?.error && <span className="text-[0.74rem] text-[#bc4749]">{estado.error}</span>}
          </div>
        </div>
      </Seccion>
    );
  }

  if (valorDeEstado(colEstado, 'pausa') || descartada) return null;
  const descartar = () => {
    try {
      localStorage.setItem('broots-guia-pausa', 'no');
    } catch {}
    setDescartada(true);
  };
  return (
    <Seccion titulo={t('habito.estados.titulo')} data-tarjeta-estados="pausa">
      <div className="squircle rounded-[16px] bg-superficie-2/60 p-4 text-[0.8rem] leading-relaxed shadow-[inset_0_0_0_1px_var(--borde)]">
        <p className="font-medium">{t('habito.estados.pausaTitulo', { columna: colEstado.name })}</p>
        <p className="mt-1 text-tinta-suave">{t('habito.estados.pausaPorQue')}</p>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-tinta-suave">
          {['paso1', 'paso2', 'paso3', 'paso4'].map((p) => (
            <li key={p}>{t(`habito.estados.${p}`, { columna: colEstado.name, valor: t('habito.estados.enPausa') })}</li>
          ))}
        </ol>
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={onRecargar} className="squircle rounded-[10px] bg-verde px-3.5 py-1.5 text-[0.78rem] font-medium text-superficie">
            {t('habito.estados.yaEsta')}
          </button>
          <button type="button" onClick={descartar} className="text-[0.78rem] font-medium text-acento hover:underline">
            {t('habito.estados.noGracias')}
          </button>
        </div>
      </div>
    </Seccion>
  );
}

export function MiLectura({ datos, libros, colEstado, soloLectura, onLeer, onEditarRapido, onCrearColumna, onRecargar, onCerrar }) {
  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  const sesiones = datos?.sesiones ?? [];
  const lecturas = datos?.lecturas ?? {};
  const posiciones = datos?.posiciones ?? {};
  const r = useMemo(() => resumen(sesiones, lecturas), [sesiones, lecturas]);
  const porUuid = useMemo(() => new Map(libros.map((l) => [l.uuid, l])), [libros]);
  const momento = momentoFavorito(r.porHora);

  // Leyendo ahora: los que figuran «Leyendo» en Calibre y los que leíste con Broots en los últimos 60 días sin terminar.
  const enCurso = useMemo(() => {
    const ultimaSesion = new Map();
    for (const s of sesiones) ultimaSesion.set(s.uuid, s);
    const elegidos = new Map();
    for (const l of libros) {
      const tipo = colEstado ? tipoEstado(l.custom[colEstado.label]) : null;
      const ultima = ultimaSesion.get(l.uuid);
      const vuelta = lecturas[l.uuid]?.at(-1);
      const reciente = ultima && diasDesde(ultima.inicio) <= 60 && !vuelta?.resultado && (posiciones[l.uuid]?.progreso ?? 0) < 0.99;
      if (tipo === 'leyendo' || (reciente && tipo !== 'leido' && tipo !== 'abandonado' && tipo !== 'pausa')) elegidos.set(l.uuid, { libro: l, tipo, ultima });
    }
    return [...elegidos.values()]
      .map((e) => {
        const progreso = posiciones[e.libro.uuid]?.progreso ?? null;
        const ultimaVez = e.ultima?.inicio ?? posiciones[e.libro.uuid]?.fecha ?? null;
        const vuelta = lecturaDelLibro(e.libro.uuid, sesiones, lecturas).at(-1);
        // Ritmo de este libro: fracción leída por minuto en esta vuelta.
        const propias = sesiones.filter((s) => s.uuid === e.libro.uuid && s.lectura === (vuelta?.n ?? 1) && s.paginasLibro > 0);
        const minutos = propias.reduce((a, s) => a + s.minutos, 0);
        const fraccion = propias.reduce((a, s) => a + s.paginas / s.paginasLibro, 0);
        const queda = progreso != null && minutos >= 10 && fraccion > 0 ? estimacion((1 - progreso) / (fraccion / minutos)) : null;
        return { ...e, progreso, ultimaVez, queda };
      })
      .sort((a, b) => String(b.ultimaVez ?? '').localeCompare(String(a.ultimaVez ?? '')));
  }, [libros, sesiones, lecturas, posiciones, colEstado]);

  const valorPausa = valorDeEstado(colEstado, 'pausa');
  const pasarAPausa = (libro) => onEditarRapido(libro.id, { custom: { [colEstado.label]: valorPausa } });

  const horas = (i) => t('habito.hora', { n: i });
  const diasSemana = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 12 + i).toLocaleDateString(region(), { weekday: 'short' }));
  const ultimas = sesiones.slice(-8).reverse();

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-8">
      <motion.div className="absolute inset-0 bg-[rgb(var(--sombra))]" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} transition={resorte} onClick={onCerrar} />
      <motion.div
        role="dialog"
        aria-label={t('habito.titulo')}
        data-mi-lectura
        initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative flex h-[min(48rem,100%)] w-[min(62rem,100%)] flex-col overflow-hidden rounded-[26px] bg-superficie shadow-flotante"
      >
        <header className="flex items-start gap-3 px-8 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
              <IconoRacha className="size-5 text-acento" /> {t('habito.titulo')}
            </h2>
            <p className="mt-0.5 text-[0.78rem] text-tinta-tenue">{t('habito.subtitulo')}</p>
          </div>
          <button type="button" onClick={onCerrar} title={t('comun.cerrarEsc')} className="grid size-7 shrink-0 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta">
            <IconoCerrar className="size-3.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 pb-8">
          {!datos && <p className="text-[0.8rem] text-tinta-tenue">{t('configuracion.cargando')}</p>}

          {datos && !sesiones.length && (
            <div className="squircle rounded-[16px] bg-superficie-2/60 p-6 text-center shadow-[inset_0_0_0_1px_var(--borde)]" data-sin-sesiones>
              <p className="font-serif text-lg">{t('habito.vacioTitulo')}</p>
              <p className="mx-auto mt-1 max-w-md text-[0.8rem] leading-relaxed text-tinta-suave">{t('habito.vacioTexto')}</p>
            </div>
          )}

          {datos && sesiones.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Tarjeta
                  datos={{ 'data-racha': r.racha.actual }}
                  icono={<IconoRacha className="size-3.5 text-acento" />}
                  titulo={t('habito.racha')}
                  valor={t('habito.dias', { n: r.racha.actual })}
                  detalle={r.racha.actual && !r.racha.leyoHoy ? t('habito.rachaHoy') : t('habito.record', { n: r.racha.record })}
                />
                <Tarjeta titulo={t('habito.esteMes')} valor={duracion(r.mes.minutos)} detalle={t('habito.sesiones', { n: r.mes.sesiones })} />
                <Tarjeta
                  titulo={t('habito.ritmoTitulo')}
                  valor={r.ritmo ? ritmoTexto(r.ritmo) : '—'}
                  detalle={r.ritmo ? t('habito.porHora', { n: Math.round(r.ritmo * 60) }) : t('habito.ritmoFalta')}
                />
                <Tarjeta
                  titulo={t('habito.terminados', { periodo: new Date().getFullYear() })}
                  valor={r.terminados}
                  detalle={r.relecturas ? t('habito.relecturas', { n: r.relecturas }) : t('habito.total', { tiempo: duracion(r.total.minutos) })}
                />
              </div>

              <Seccion titulo={t('habito.tuAño')}>
                <MapaDeCalor dias={r.dias} />
              </Seccion>

              <div className="grid grid-cols-2 gap-3">
                <Seccion titulo={t('habito.aQueHora')} nota={momento ? t(`habito.momento.${momento}`) : null}>
                  <Barras valores={r.porHora} etiquetas={['0', '6', '12', '18', '23']} nombre={horas} />
                </Seccion>
                <Seccion titulo={t('habito.queDias')}>
                  <Barras valores={r.porDiaSemana} etiquetas={diasSemana} nombre={(i) => diasSemana[i]} />
                </Seccion>
              </div>
            </>
          )}

          {datos && enCurso.length > 0 && (
            <Seccion titulo={t('habito.leyendoAhora')}>
              <div className="squircle divide-y divide-borde rounded-[16px] bg-superficie-2/60 px-4 shadow-[inset_0_0_0_1px_var(--borde)]">
                {enCurso.map(({ libro, tipo, progreso, ultimaVez, queda }) => {
                  const olvidado = tipo === 'leyendo' && ultimaVez && diasDesde(ultimaVez) >= DIAS_SIN_ABRIR;
                  return (
                    <div key={libro.uuid} className="flex items-center gap-3 py-2.5" data-en-curso={libro.id}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.84rem] font-medium">{libro.title}</p>
                        <p className="truncate text-[0.72rem] text-tinta-tenue">
                          {[
                            libro.authors.join(', '),
                            progreso != null ? `${Math.round(progreso * 100)}%` : null,
                            queda ? t('habito.quedaParaTerminar', { tiempo: queda }) : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                        {olvidado && (
                          <p className="mt-0.5 text-[0.72rem] text-acento">
                            {t('habito.olvidado', { n: diasDesde(ultimaVez) })}{' '}
                            {valorPausa && !soloLectura && (
                              <button type="button" onClick={() => pasarAPausa(libro)} className="font-medium underline-offset-2 hover:underline">
                                {t('habito.pasarAPausa', { estado: valorPausa })}
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                      {libro.formats.some((f) => f.format === 'EPUB') && (
                        <button
                          type="button"
                          onClick={() => onLeer(libro.id)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-superficie px-3 py-1 text-[0.74rem] font-medium text-verde shadow-[inset_0_0_0_1px_var(--borde)] hover:bg-seleccion"
                        >
                          <IconoLeer className="size-3.5" /> {t('habito.seguir')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Seccion>
          )}

          {datos && ultimas.length > 0 && (
            <Seccion titulo={t('habito.ultimas')}>
              <div className="squircle divide-y divide-borde rounded-[16px] bg-superficie-2/60 px-4 text-[0.78rem] shadow-[inset_0_0_0_1px_var(--borde)]" data-ultimas>
                {ultimas.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <span className="w-28 shrink-0 text-tinta-tenue">{fechaLarga(diaLocal(s.inicio))}</span>
                    <span className="min-w-0 flex-1 truncate">{porUuid.get(s.uuid)?.title ?? s.titulo ?? '—'}</span>
                    <span className="shrink-0 text-tinta-suave tabular-nums">{duracion(s.minutos)}</span>
                    <span className="w-20 shrink-0 text-right text-tinta-tenue tabular-nums">{t('habito.paginas', { n: s.paginas })}</span>
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          <TarjetaEstados colEstado={colEstado} soloLectura={soloLectura} onCrearColumna={onCrearColumna} onRecargar={onRecargar} />

          <p className="px-1 text-[0.72rem] leading-relaxed text-tinta-tenue">{t(soloLectura ? 'habito.dondeCompartida' : 'habito.donde')}</p>
        </div>
      </motion.div>
    </div>
  );
}
