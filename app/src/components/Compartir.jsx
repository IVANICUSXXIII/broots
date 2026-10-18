// Familia: compartir libros con los integrantes de la familia (etapa 5).
// Cada integrante tiene su biblioteca: los libros con su etiqueta ("Para <nombre>"). "Actualizar copia" arma
// en su carpeta de Drive una mini biblioteca de Calibre con esos libros, que pueden abrir desde la app
// de Drive (celular, tablet) o, el día que tengan PC, con Broots en modo solo lectura.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { compilarBusqueda, fechaCorta, resorte, resortePresion, t } from '../lib/index.js';
import { IconoCarpeta, IconoCerrar, IconoCompartir } from './Iconos.jsx';

// La etiqueta se guarda en el integrante al crearlo (en el idioma de ese momento: "Para Ana", "For Ana").
// Los creados hasta la 1.4.0 no la tenían guardada: era siempre "Para <nombre>".
export const etiquetaDe = (persona) => persona.etiqueta || `Para ${persona.nombre}`;
// La biblioteca de cada integrante (en la barra lateral) tiene un id que no cambia con el idioma.
export const idBibliotecaFamilia = (persona) => `familia:${persona.id}`;

function Boton({ primario, children, className = '', ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96, transition: resortePresion }}
      className={`squircle inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[0.78rem] font-medium transition-colors disabled:opacity-50 ${
        primario ? 'bg-acento text-sobre-acento hover:brightness-110' : 'bg-superficie shadow-[inset_0_0_0_1px_var(--borde)] hover:text-acento'
      } ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

function Integrante({ persona, libros, virtuales, contexto, onFamilia, onBiblioteca, onVerLibros }) {
  const [estado, setEstado] = useState(null); // { fase, texto }
  const [progreso, setProgreso] = useState(null);
  const [kindle, setKindle] = useState(persona.kindle ?? '');
  const [sumarDe, setSumarDe] = useState('');
  const etiqueta = etiquetaDe(persona);
  const marcados = libros.filter((l) => l.tags.includes(etiqueta));
  const ocupado = estado?.fase === 'trabajando';

  useEffect(() => window.familia.alProgresar((p) => p.id === persona.id && setProgreso(p)), [persona.id]);

  const actualizar = async () => {
    setEstado({ fase: 'trabajando', texto: t('familia.armando') });
    const r = await window.familia.actualizar(persona.id);
    setProgreso(null);
    if (!r.ok) return setEstado({ fase: 'error', texto: r.mensaje });
    onFamilia(r.familia);
    const partes = [t('familia.libros', { n: r.libros })];
    if (r.nuevos) partes.push(t('familia.nuevos', { n: r.nuevos }));
    if (r.quitados) partes.push(t('familia.quitados', { n: r.quitados }));
    setEstado({ fase: 'ok', texto: t('familia.copiaAlDia', { detalle: partes.join(', ') }) });
  };
  const guardarKindle = async () => {
    const r = await window.familia.cambiarKindle(persona.id, kindle);
    if (!r.ok) return setEstado({ fase: 'error', texto: r.mensaje });
    onFamilia(r.familia);
    setEstado({ fase: 'ok', texto: kindle ? t('familia.kindleGuardado') : t('familia.kindleBorrado') });
  };
  const sumar = async () => {
    const { filtro } = compilarBusqueda(virtuales[sumarDe], contexto);
    const ids = filtro ? libros.filter(filtro).map((l) => l.id) : [];
    if (!ids.length) return;
    setEstado({ fase: 'trabajando', texto: t('familia.marcando', { n: ids.length }) });
    const r = await window.familia.marcar(persona.id, ids, true);
    if (!r.ok) return setEstado({ fase: 'error', texto: r.mensaje });
    onBiblioteca(r.biblioteca);
    setSumarDe('');
    setEstado({ fase: 'ok', texto: t('familia.marcados', { n: r.cambiados, nombre: persona.nombre }) });
  };
  const elegirCarpeta = async () => {
    const r = await window.familia.elegirCarpeta(persona.id);
    if (r.cancelado) return;
    if (!r.ok) return setEstado({ fase: 'error', texto: r.mensaje });
    onFamilia(r.familia);
  };
  const quitar = async () => {
    if (!window.confirm(t('familia.confirmarQuitar', { nombre: persona.nombre }))) return;
    onFamilia((await window.familia.quitar(persona.id)).familia);
  };

  const otrasBibliotecas = Object.keys(virtuales).filter((n) => !n.startsWith('familia:'));
  return (
    <section className="squircle rounded-[18px] bg-superficie-2/60 p-4">
      <div className="flex items-baseline gap-3">
        <h3 className="font-serif text-[1.05rem] font-semibold">{persona.nombre}</h3>
        <button type="button" onClick={() => onVerLibros(persona)} className="text-[0.76rem] font-medium text-acento hover:underline">
          {t('familia.verMarcados', { n: marcados.length })}
        </button>
        <span className="ml-auto text-[0.7rem] text-tinta-tenue">
          {persona.ultimo ? t('familia.copiaActualizada', { fecha: fechaCorta(persona.ultimo.fecha), n: persona.ultimo.libros }) : t('familia.sinCopia')}
        </span>
      </div>
      <p className="mt-1 text-[0.72rem] text-tinta-tenue">
        {t('familia.comoMarcar', { nombre: persona.nombre, etiqueta })}
      </p>

      {otrasBibliotecas.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-[0.76rem]">
          <span className="text-tinta-suave">{t('familia.sumarDe')}</span>
          <select
            value={sumarDe}
            onChange={(e) => setSumarDe(e.target.value)}
            className="h-7 rounded-lg bg-superficie px-2 text-[0.76rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none"
          >
            <option value="">{t('familia.elegiBiblioteca')}</option>
            {otrasBibliotecas.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <Boton onClick={sumar} disabled={!sumarDe || ocupado}>{t('familia.sumar')}</Boton>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-[0.76rem]">
        <IconoCarpeta className="size-4 shrink-0 text-tinta-tenue" />
        <span className="min-w-0 flex-1 truncate text-tinta-suave" title={persona.carpeta}>{persona.carpeta}</span>
        <Boton onClick={elegirCarpeta} disabled={ocupado}>{t('familia.cambiar')}</Boton>
        <Boton onClick={() => window.familia.abrirCarpeta(persona.id)} disabled={!persona.ultimo}>{t('familia.abrir')}</Boton>
        <Boton primario onClick={actualizar} disabled={ocupado || !marcados.length} title={t('familia.actualizarExplicacion')}>
          {t('familia.actualizar')}
        </Boton>
      </div>
      {progreso && progreso.total > 0 && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-superficie">
            <div className="h-full origin-left rounded-full bg-acento/70 transition-transform" style={{ transform: `scaleX(${progreso.hecho / progreso.total})` }} />
          </div>
          {progreso.titulo && <p className="mt-1 truncate text-[0.68rem] text-tinta-tenue">{t('familia.copiando', { hecho: progreso.hecho + 1, total: progreso.total, titulo: progreso.titulo })}</p>}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-[0.76rem]">
        <span className="shrink-0 text-tinta-suave">{t('familia.suKindle')}</span>
        <input
          value={kindle}
          onChange={(e) => setKindle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && guardarKindle()}
          placeholder={t('familia.kindleOpcional')}
          spellCheck={false}
          className="squircle h-7 min-w-0 flex-1 rounded-[8px] bg-superficie px-2.5 text-[0.76rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none focus:shadow-[inset_0_0_0_1px_var(--acento)]"
        />
        <Boton onClick={guardarKindle} disabled={kindle.trim() === (persona.kindle ?? '')}>{t('comun.guardar')}</Boton>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {estado && (
          <p className={`min-w-0 flex-1 text-[0.74rem] ${estado.fase === 'error' ? 'text-[#bc4749]' : estado.fase === 'ok' ? 'text-verde' : 'text-tinta-suave'}`}>{estado.texto}</p>
        )}
        <button type="button" onClick={quitar} className="ml-auto shrink-0 text-[0.7rem] text-tinta-tenue hover:text-[#bc4749]">
          {t('familia.quitar', { nombre: persona.nombre })}
        </button>
      </div>
    </section>
  );
}

// Cómo ven sus libros: cada paso es familia.pasos.<id> (titulo y texto) en los textos de cada idioma.
const PASOS = ['drive', 'celular', 'kindle', 'pc'];

/** Integrantes, agregar uno nuevo y cómo ven sus libros. Se usa en la hoja y en Configuración → Familia. */
export function ContenidoFamilia({ libros, familia, virtuales, contexto, onFamilia, onBiblioteca, onVerLibros }) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState(null);

  const agregar = async () => {
    const r = await window.familia.agregar({ nombre });
    if (!r.ok) return setError(r.mensaje);
    setError(null);
    setNombre('');
    onFamilia(r.familia);
  };

  return (
    <>
      {familia.map((p) => (
        <Integrante key={p.id} persona={p} libros={libros} virtuales={virtuales} contexto={contexto} onFamilia={onFamilia} onBiblioteca={onBiblioteca} onVerLibros={onVerLibros} />
      ))}

      <div className="flex items-center gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && agregar()}
          placeholder={familia.length ? t('familia.agregarOtro') : t('familia.agregarPrimero')}
          className="squircle h-9 min-w-0 flex-1 rounded-[10px] bg-superficie-2 px-3 text-[0.82rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none focus:shadow-[inset_0_0_0_1px_var(--acento)]"
        />
        <Boton primario onClick={agregar} disabled={!nombre.trim()} className="h-9">{t('familia.agregar')}</Boton>
      </div>
      {error && <p className="text-[0.76rem] text-[#bc4749]">{error}</p>}

      {familia.length > 0 && (
        <section className="squircle rounded-[18px] p-4 shadow-[inset_0_0_0_1px_var(--borde)]">
          <div className="flex items-center justify-between">
            <p className="text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">{t('familia.comoLoVen')}</p>
            <Boton onClick={() => window.familia.abrirDrive()}>{t('familia.abrirDrive')}</Boton>
          </div>
          <ol className="mt-2 space-y-2">
            {PASOS.map((paso, i) => (
              <li key={paso} className="flex gap-3 text-[0.78rem]">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-seleccion text-[0.68rem] font-semibold">{i + 1}</span>
                <span>
                  <strong className="font-medium">{t(`familia.pasos.${paso}.titulo`)}.</strong> <span className="text-tinta-suave">{t(`familia.pasos.${paso}.texto`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export function HojaCompartir({ onCerrar, ...props }) {
  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && !e.target.closest?.('input') && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-8">
      <motion.div className="absolute inset-0 bg-[rgb(var(--sombra))]" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} transition={resorte} onClick={onCerrar} />
      <motion.div
        role="dialog"
        aria-label={t('familia.titulo')}
        initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative flex max-h-full w-[min(46rem,100%)] flex-col overflow-hidden rounded-[26px] bg-superficie shadow-flotante"
      >
        <header className="flex items-center gap-3 px-6 pt-5 pb-3">
          <span className="grid size-9 place-items-center rounded-xl bg-verde text-[#fefae3]">
            <IconoCompartir className="size-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-lg font-semibold">{t('familia.titulo')}</h2>
            <p className="text-xs text-tinta-tenue">{t('familia.descripcion')}</p>
          </div>
          <button type="button" onClick={onCerrar} title={t('comun.cerrarEsc')} className="grid size-7 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta">
            <IconoCerrar className="size-3.5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          <ContenidoFamilia {...props} />
        </div>
      </motion.div>
    </div>
  );
}
