// Hoja "Duplicados": libros repetidos y cuál conservar.
// Al resolver: los formatos y subrayados que solo tenía el descartado pasan al conservado, y el
// descartado va a la papelera de Calibre (se puede recuperar desde Calibre).
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { fechaCorta, resorte, resortePresion, t } from '../lib/index.js';
import { IconoCerrar, IconoDuplicados } from './Iconos.jsx';
import { Portada } from './Piezas.jsx';

function Grupo({ grupo, porId, subrayadosDe, onResuelto, onIgnorado }) {
  const [conservar, setConservar] = useState(grupo.sugerido);
  const [estado, setEstado] = useState(null);
  const libros = grupo.libros.map((id) => porId.get(id)).filter(Boolean);
  const ocupado = estado?.fase === 'trabajando';

  const resolver = async () => {
    setEstado({ fase: 'trabajando' });
    const descartar = libros.map((l) => l.id).filter((id) => id !== conservar);
    const r = await window.edicion.resolverDuplicado(conservar, descartar);
    if (!r.ok) return setEstado({ fase: 'error', texto: r.mensaje });
    onResuelto(r.biblioteca, r.pasados);
  };
  const ignorar = async () => {
    await window.edicion.ignorarDuplicado(libros.map((l) => l.id));
    onIgnorado();
  };

  return (
    <section className="squircle rounded-[18px] bg-superficie-2/60 p-4">
      <p className="text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">{grupo.motivo.toUpperCase()} · {t('duplicados.elegi')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {libros.map((l) => {
          const elegido = conservar === l.id;
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => setConservar(l.id)}
              className={`squircle flex gap-3 rounded-[14px] p-3 text-left transition-shadow ${
                elegido ? 'bg-superficie shadow-[inset_0_0_0_2px_var(--acento)]' : 'bg-superficie/60 shadow-[inset_0_0_0_1px_var(--borde)] hover:bg-superficie'
              }`}
            >
              <div className="h-24 w-16 shrink-0 overflow-hidden rounded-[5px] shadow">
                <Portada libro={l} className="size-full" />
              </div>
              <div className="min-w-0 text-[0.76rem]">
                <p className="line-clamp-2 font-serif font-semibold">{l.title}</p>
                <p className="truncate text-tinta-suave">{l.authors.join(', ')}</p>
                <p className="mt-1 text-tinta-tenue">{l.formats.map((f) => f.format).join(' · ') || t('duplicados.sinArchivo')}</p>
                <p className="text-tinta-tenue">{t('duplicados.agregado', { fecha: fechaCorta(l.added) })}{subrayadosDe(l) ? ` · ${t('duplicados.subrayados', { n: subrayadosDe(l) })}` : ''}</p>
                <p className={`mt-1 font-medium ${elegido ? 'text-acento' : 'text-tinta-tenue'}`}>
                  {elegido ? t('duplicados.seConserva') : t('duplicados.papelera')}
                  {l.id === grupo.sugerido && !elegido ? t('duplicados.sugerido') : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <motion.button
          type="button"
          disabled={ocupado}
          onClick={resolver}
          whileTap={{ scale: 0.96, transition: resortePresion }}
          className="squircle rounded-[11px] bg-acento px-3.5 py-2 text-[0.78rem] font-medium text-sobre-acento hover:brightness-110 disabled:opacity-60"
        >
          {ocupado ? t('duplicados.resolviendo') : t('duplicados.conservar')}
        </motion.button>
        <button type="button" disabled={ocupado} onClick={ignorar} className="px-2 text-[0.76rem] text-tinta-suave hover:text-tinta">
          {t('duplicados.noSon')}
        </button>
        {estado?.texto && <p className="text-[0.74rem] text-[#bc4749]">{estado.texto}</p>}
      </div>
    </section>
  );
}

export function HojaDuplicados({ libros, cantidadSubrayados, onCambio, onCerrar }) {
  const [grupos, setGrupos] = useState(null);
  const [aviso, setAviso] = useState(null);
  const porId = new Map(libros.map((l) => [l.id, l]));
  const subrayadosDe = (l) => cantidadSubrayados(l); // del Kindle y del lector de Broots
  const buscar = () => window.edicion.buscarDuplicados().then(setGrupos);

  useEffect(() => {
    buscar();
    const alPresionar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-8">
      <motion.div className="absolute inset-0 bg-[rgb(var(--sombra))]" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} transition={resorte} onClick={onCerrar} />
      <motion.div
        role="dialog"
        aria-label={t('duplicados.titulo')}
        initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative flex max-h-full w-[min(44rem,100%)] flex-col overflow-hidden rounded-[26px] bg-superficie shadow-flotante"
      >
        <header className="flex items-center gap-3 px-6 pt-5 pb-3">
          <span className="grid size-9 place-items-center rounded-xl bg-verde text-[#fefae3]">
            <IconoDuplicados className="size-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-lg font-semibold">{t('duplicados.titulo')}</h2>
            <p className="text-xs text-tinta-tenue">{t('duplicados.explicacion')}</p>
          </div>
          <button type="button" onClick={onCerrar} title={t('comun.cerrarEsc')} className="grid size-7 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta">
            <IconoCerrar className="size-3.5" />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          {aviso && <p className="text-[0.8rem] text-verde">{aviso}</p>}
          {grupos == null && <p className="text-[0.82rem] text-tinta-suave">{t('duplicados.buscando')}</p>}
          {grupos?.length === 0 && <p className="text-[0.82rem] text-tinta-suave">{t('duplicados.ninguno')}</p>}
          {grupos?.map((g) => (
            <Grupo
              key={g.libros.join('-')}
              grupo={g}
              porId={porId}
              subrayadosDe={subrayadosDe}
              onResuelto={(biblioteca, pasados) => {
                onCambio(biblioteca);
                setAviso(pasados?.length ? t('duplicados.resueltoConFormatos', { formatos: pasados.join(', ') }) : t('duplicados.resuelto'));
                buscar();
              }}
              onIgnorado={() => {
                setAviso(t('duplicados.ignorado'));
                buscar();
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
