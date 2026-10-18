// Avisos de las actualizaciones de Broots, en una ventana en el centro de la pantalla:
// - AvisoLista: la versión nueva ya se bajó; se instala al cerrar Broots, o ya con «Reiniciar ahora».
// - Festejo: es la primera vez que se abre la versión nueva: confeti, matasuegras y lo que cambió.
// Las frases (actualizacion.frases.* en idiomas/*.json) salen al azar y no se repiten hasta pasar por
// todas: main.cjs recuerda cuáles faltan.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { lista, resorte, resorteElastico, t, useIdioma } from '../lib/index.js';
import { tocarMatasuegras } from '../lib/matasuegras.js';
import { Boton } from './Piezas.jsx';
import { Confeti } from './Confeti.jsx';
import { IconoCafe, IconoCorazon, LogoBroots } from './Iconos.jsx';

/** La frase que toca de una lista (lista, instalada o cafe), o null mientras main.cjs la elige. */
function useFrase(tipo) {
  useIdioma(); // al cambiar de idioma se muestra la misma frase, traducida
  const [indice, setIndice] = useState(null);
  useEffect(() => {
    window.actualizaciones
      .frase(tipo, lista(`actualizacion.frases.${tipo}`).length)
      .then(setIndice)
      .catch(() => setIndice(0));
  }, [tipo]);
  return indice == null ? null : lista(`actualizacion.frases.${tipo}`)[indice] ?? null;
}

function Novedades({ novedades }) {
  const idioma = useIdioma();
  const items = novedades?.[idioma]?.length ? novedades[idioma] : (novedades?.es ?? []);
  if (!items.length) return null;
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-[0.7rem] font-semibold tracking-wide text-tinta-tenue">{t('actualizacion.novedades')}</h3>
      <ul className="space-y-1.5 text-[0.8rem] leading-relaxed text-tinta-suave" data-novedades>
        {items.map((n) => (
          <li key={n} className="flex gap-2.5">
            <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-verde" />
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ventana en el centro, con fondo oscurecido (sin desenfoque en vivo: en placas integradas da tirones). */
function Ventana({ etiqueta, juguetona, onCerrar, children, ...datos }) {
  // Esc cierra la ventana, y solo la ventana (no el panel ni la hoja que quedan detrás).
  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCerrar();
    };
    window.addEventListener('keydown', alPresionar, true);
    return () => window.removeEventListener('keydown', alPresionar, true);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center p-8">
      <motion.div className="absolute inset-0 bg-[rgb(var(--sombra))]" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} transition={resorte} />
      <motion.div
        role="dialog"
        aria-label={etiqueta}
        {...datos}
        initial={{ opacity: 0, transform: 'translateY(18px) scale(0.92)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.97)', transition: { duration: 0.15 } }}
        transition={juguetona ? resorteElastico : resorte}
        className="squircle relative w-[min(31rem,100%)] rounded-[26px] bg-superficie px-8 pt-7 pb-6 shadow-flotante"
      >
        {children}
      </motion.div>
    </div>
  );
}

function Cabecera({ titulo }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-verde text-[#fefae3] shadow-sm">
        <LogoBroots className="size-7" />
      </span>
      <h2 className="font-serif text-xl font-semibold">{titulo}</h2>
    </div>
  );
}

function Frase({ texto }) {
  return (
    <motion.p
      data-frase
      initial={{ opacity: 0 }}
      animate={{ opacity: texto ? 1 : 0 }}
      transition={resorte}
      className="mt-4 min-h-[3lh] font-serif text-[1.02rem] leading-snug text-tinta"
    >
      {texto}
    </motion.p>
  );
}

/** La versión nueva ya está bajada y verificada. */
export function AvisoLista({ estado, onCerrar }) {
  const frase = useFrase('lista');
  const [reiniciando, setReiniciando] = useState(false);
  const [error, setError] = useState(null);
  const reiniciar = async () => {
    setReiniciando(true);
    const r = await window.actualizaciones.reiniciar();
    if (!r.ok) {
      setReiniciando(false);
      setError(r.mensaje);
    }
  };
  return (
    <Ventana etiqueta={t('actualizacion.etiqueta')} onCerrar={onCerrar} data-actualizacion="lista">
      <Cabecera titulo={t('actualizacion.listaTitulo', { version: estado.version })} />
      <Frase texto={frase} />
      <Novedades novedades={estado.novedades} />
      <p className="mt-5 text-[0.76rem] leading-relaxed text-tinta-tenue">{error ?? t('actualizacion.listaDetalle')}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Boton onClick={onCerrar} disabled={reiniciando}>
          {t('actualizacion.masTarde')}
        </Boton>
        <Boton primario onClick={reiniciar} disabled={reiniciando}>
          {reiniciando && <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {reiniciando ? t('actualizacion.reiniciando') : t('actualizacion.reiniciar')}
        </Boton>
      </div>
    </Ventana>
  );
}

/** Primera vez que se abre la versión nueva: confeti, matasuegras (si está prendido) y lo que cambió. */
export function Festejo({ datos, onCerrar }) {
  // datos.cafe: a qué sitio de donaciones invitar ('cafecito' o 'sponsors'), o null.
  const frase = useFrase(datos.cafe ? 'cafe' : 'instalada');
  const [confeti, setConfeti] = useState(true);
  const [sonido, setSonido] = useState('esperando'); // para las pruebas: 'sono', 'apagado' o 'sin-audio'
  useEffect(() => {
    window.preferencias
      .leer()
      .then(async (p) => setSonido(p.festejarConSonido === false ? 'apagado' : (await tocarMatasuegras()) ? 'sono' : 'sin-audio'))
      .catch(() => setSonido('sin-audio'));
  }, []);
  return (
    <>
      <Ventana etiqueta={t('actualizacion.etiqueta')} juguetona onCerrar={onCerrar} data-actualizacion="festejo" data-sonido={sonido}>
        <Cabecera titulo={t('actualizacion.festejoTitulo', { version: datos.version })} />
        <Frase texto={frase} />
        <Novedades novedades={datos.novedades} />
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <Boton onClick={() => window.preferencias.abrir('novedades')} className="mr-auto">
            {t('actualizacion.verNovedades')}
          </Boton>
          {datos.cafe && (
            <Boton onClick={() => window.preferencias.abrir(datos.cafe)}>
              {datos.cafe === 'cafecito' ? <IconoCafe className="size-3.5" /> : <IconoCorazon className="size-3.5" />}
              {datos.cafe === 'cafecito' ? t('actualizacion.cafecito') : t('actualizacion.sponsors')}
            </Boton>
          )}
          <Boton primario onClick={onCerrar}>
            {t('actualizacion.aLeer')}
          </Boton>
        </div>
      </Ventana>
      {confeti && <Confeti onTerminar={() => setConfeti(false)} />}
    </>
  );
}
