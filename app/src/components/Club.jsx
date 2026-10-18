// Hoja "Club de lectura": cómo configurar una sola vez el Project de Claude y la skill de Gemini.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { idiomaActual, resorte, resortePresion, t } from '../lib/index.js';
import { instruccionesClub } from '../lib/club/index.js';
import { IconoCerrar, IconoCheck, IconoCita } from './Iconos.jsx';

function Configuracion({ titulo, sitio, nombreSitio, pasos, instrucciones }) {
  const [copiado, setCopiado] = useState(false);
  const [ver, setVer] = useState(false);
  const copiar = async () => {
    await window.club.copiar(instrucciones);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };
  return (
    <section className="squircle rounded-[18px] bg-superficie-2/60 p-5">
      <h3 className="text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">{titulo}</h3>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[0.82rem] text-tinta-suave">
        {pasos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <motion.button
          type="button"
          onClick={copiar}
          whileTap={{ scale: 0.96, transition: resortePresion }}
          className="squircle inline-flex items-center gap-2 rounded-[11px] bg-acento px-3.5 py-2 text-[0.8rem] font-medium text-sobre-acento hover:brightness-110"
        >
          {copiado ? <IconoCheck className="size-4" /> : null}
          {copiado ? t('club.copiadas') : t('club.copiar')}
        </motion.button>
        <button
          type="button"
          onClick={() => window.club.abrir(sitio)}
          className="squircle rounded-[11px] bg-superficie px-3.5 py-2 text-[0.8rem] font-medium shadow-[inset_0_0_0_1px_var(--borde)] hover:text-acento"
        >
          {t('club.abrir', { sitio: nombreSitio })}
        </button>
        <button type="button" onClick={() => setVer(!ver)} className="px-1 text-[0.78rem] text-tinta-suave hover:text-tinta">
          {ver ? t('club.ocultar') : t('club.ver')}
        </button>
      </div>
      {ver && (
        <pre className="seleccionable mt-3 max-h-64 overflow-y-auto rounded-xl bg-superficie p-4 font-sans text-[0.75rem] leading-relaxed whitespace-pre-wrap text-tinta-suave shadow-[inset_0_0_0_1px_var(--borde)]">
          {instrucciones}
        </pre>
      )}
    </section>
  );
}

export function HojaClub({ onCerrar }) {
  const club = instruccionesClub(idiomaActual());
  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-8">
      <motion.div
        className="absolute inset-0 bg-[rgb(var(--sombra))]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        exit={{ opacity: 0 }}
        transition={resorte}
        onClick={onCerrar}
      />
      <motion.div
        role="dialog"
        aria-label={t('club.titulo')}
        initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative flex max-h-full w-[min(40rem,100%)] flex-col overflow-hidden rounded-[26px] bg-superficie shadow-flotante"
      >
        <header className="flex items-center gap-3 px-6 pt-5 pb-3">
          <span className="grid size-9 place-items-center rounded-xl bg-verde text-[#fefae3]">
            <IconoCita className="size-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-lg font-semibold">{t('club.titulo')}</h2>
            <p className="text-xs text-tinta-tenue">{t('club.subtitulo')}</p>
          </div>
          <button type="button" onClick={onCerrar} title={t('comun.cerrarEsc')} className="grid size-7 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta">
            <IconoCerrar className="size-3.5" />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          <Configuracion titulo={t('club.claude')} sitio="claude" nombreSitio="Claude" pasos={club.PASOS_CLAUDE} instrucciones={club.INSTRUCCIONES_CLAUDE} />
          <Configuracion titulo={t('club.gemini')} sitio="gemini" nombreSitio="Gemini" pasos={club.PASOS_GEMINI} instrucciones={club.INSTRUCCIONES_GEMINI} />
          <p className="px-1 text-[0.74rem] text-tinta-tenue">{t('club.archivos')}</p>
        </div>
      </motion.div>
    </div>
  );
}
