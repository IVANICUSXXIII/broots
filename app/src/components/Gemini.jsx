// Formulario para pegar la clave gratuita de Gemini (la escribe el usuario; se guarda cifrada y nunca
// vuelve a la interfaz). Se usa en el lector y en Configuración → Lectura y traducción.
import { useState } from 'react';
import { motion } from 'motion/react';
import { resortePresion, t, tx } from '../lib/index.js';

/** onCambio(ok): se llama cuando se guardó (ok = true) o se borró (ok = false) la clave. */
export function FormularioGemini({ tieneClave, onCambio, autoFocus = false }) {
  const [clave, setClave] = useState('');
  const [estado, setEstado] = useState(null);
  const guardar = async () => {
    setEstado({ fase: 'probando', texto: t('gemini.probando') });
    const r = await window.lector.guardarClave(clave);
    setEstado({ fase: r.ok ? 'ok' : 'error', texto: r.mensaje });
    if (r.ok) {
      setClave('');
      onCambio(true);
    }
  };
  const borrar = async () => {
    await window.lector.borrarClave();
    setEstado({ fase: 'ok', texto: t('gemini.borrada') });
    onCambio(false);
  };
  return (
    <>
      <p className="text-[0.82rem] text-tinta-suave">{t('gemini.intro')}</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[0.8rem]">
        <li>
          {tx('gemini.paso1', {
            boton: (s) => (
              <button type="button" onClick={() => window.lector.ayudaClave()} className="font-medium text-acento hover:underline">
                {s}
              </button>
            ),
          })}
        </li>
        <li>{tx('gemini.paso2', { b: (s) => <strong>{s}</strong> })}</li>
        <li>{t('gemini.paso3')}</li>
      </ol>
      <div className="mt-4 flex gap-2">
        <input
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && clave.trim() && guardar()}
          placeholder={tieneClave ? t('gemini.yaTenes') : t('gemini.pega')}
          className="squircle h-9 min-w-0 flex-1 rounded-[10px] bg-superficie-2 px-3 text-[0.82rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none focus:shadow-[inset_0_0_0_1px_var(--acento)]"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.96, transition: resortePresion }}
          disabled={!clave.trim() || estado?.fase === 'probando'}
          onClick={guardar}
          className="squircle shrink-0 rounded-[10px] bg-acento px-4 text-[0.8rem] font-medium text-sobre-acento hover:brightness-110 disabled:opacity-50"
        >
          {t('gemini.guardar')}
        </motion.button>
      </div>
      {estado && (
        <p className={`mt-2 text-[0.76rem] ${estado.fase === 'error' ? 'text-[#bc4749]' : estado.fase === 'ok' ? 'text-verde' : 'text-tinta-suave'}`}>{estado.texto}</p>
      )}
      <p className="mt-4 text-[0.7rem] leading-relaxed text-tinta-tenue">{t('gemini.privacidad')}</p>
      {tieneClave && (
        <button type="button" onClick={borrar} className="mt-2 text-[0.72rem] text-tinta-tenue hover:text-[#bc4749]">
          {t('gemini.borrar')}
        </button>
      )}
    </>
  );
}
