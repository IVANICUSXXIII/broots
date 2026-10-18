// Pantallas especiales: cargando, primera vez (sin biblioteca) y error.
import { motion } from 'motion/react';
import { resorteElastico, resorte, t, tx } from '../lib/index.js';
import { IconoCarpeta, LogoBroots } from './Iconos.jsx';

function Pantalla({ children }) {
  return (
    <div className="flex h-full flex-col">
      <div className="arrastrable h-11 shrink-0" />
      <div className="grid flex-1 place-items-center p-8">{children}</div>
    </div>
  );
}

function Logo({ latiendo = false }) {
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={latiendo ? { scale: [1, 1.08, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
      transition={latiendo ? { scale: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }, opacity: resorte } : resorteElastico}
      className="mx-auto grid size-16 place-items-center rounded-[1.1rem] bg-verde text-[#fefae3] shadow-flotante"
    >
      <LogoBroots className="size-9" />
    </motion.span>
  );
}

export function Cargando() {
  return (
    <Pantalla>
      <div className="flex flex-col items-center gap-5 text-tinta-suave">
        <Logo latiendo />
        <p className="text-sm">{t('bienvenida.leyendo')}</p>
      </div>
    </Pantalla>
  );
}

export function Bienvenida({ onElegir, mensaje }) {
  return (
    <Pantalla>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={resorte} className="max-w-md text-center">
        <Logo />
        <h1 className="mt-6 font-serif text-3xl font-semibold">Broots</h1>
        <p className="mt-3 text-tinta-suave">{tx('bienvenida.explicacion', { code: (s) => <code className="text-tinta">{s}</code> })}</p>
        {mensaje && <p className="mt-4 rounded-lg bg-[#bc4749]/12 px-3 py-2 text-sm text-[#bc4749]">{mensaje}</p>}
        <motion.button
          type="button"
          onClick={onElegir}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={resorteElastico}
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-acento px-5 py-2.5 text-sm font-medium text-sobre-acento shadow-flotante"
        >
          <IconoCarpeta />
          {t('bienvenida.elegir')}
        </motion.button>
      </motion.div>
    </Pantalla>
  );
}
