// Ayuda: el manual de Broots (src/lib/manual/<idioma>.js) con un índice y un buscador.
// Se muestra en Configuración → Ayuda; también se abre con el botón «?» de la barra o con F1.
// Buscar filtra los temas que tienen todas las palabras (sin importar tildes ni mayúsculas) y las resalta.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { normalizar, resorte, resortePresion, t, useIdioma } from '../lib/index.js';
import { manualEn } from '../lib/manual/index.js';
import { IconoBuscar, IconoCerrar } from './Iconos.jsx';

/** Todo el texto de un bloque, para buscar. */
function textosDe(bloque) {
  if (bloque.texto) return [bloque.texto];
  if (bloque.subtitulo) return [bloque.subtitulo];
  if (bloque.pasos) return bloque.pasos;
  if (bloque.lista) return bloque.lista;
  if (bloque.teclas) return bloque.teclas.map(([teclas, que]) => `${teclas.join(' ')} ${que}`);
  if (bloque.preguntas) return bloque.preguntas.flat();
  return [];
}

const contiene = (texto, palabras) => {
  const t = normalizar(texto);
  return palabras.every((p) => t.includes(p));
};

/**
 * Qué mostrar de cada tema según la búsqueda. Si el título coincide, el tema entero; si no, el tema
 * entero si coincide su texto, salvo en Preguntas frecuentes, donde quedan solo las preguntas que coinciden.
 */
function filtrar(palabras, manual) {
  if (!palabras.length) return manual;
  const resultado = [];
  for (const tema of manual) {
    if (contiene(tema.titulo, palabras)) {
      resultado.push(tema);
      continue;
    }
    if (!contiene([tema.titulo, ...tema.bloques.flatMap(textosDe)].join(' '), palabras)) continue;
    const bloques = tema.bloques
      .map((b) => (b.preguntas ? { preguntas: b.preguntas.filter((par) => contiene(par.join(' '), palabras)) } : b))
      .filter((b) => !b.preguntas || b.preguntas.length);
    resultado.push({ ...tema, bloques: bloques.length ? bloques : tema.bloques });
  }
  return resultado;
}

/** El texto con las palabras buscadas resaltadas. normalizar() conserva el largo (solo quita tildes), así las posiciones coinciden. */
function Resaltado({ texto, palabras }) {
  if (!palabras.length) return texto;
  const t = normalizar(texto);
  const marcas = new Array(texto.length).fill(false);
  for (const p of palabras) {
    for (let i = t.indexOf(p); i >= 0; i = t.indexOf(p, i + p.length)) marcas.fill(true, i, i + p.length);
  }
  const partes = [];
  let desde = 0;
  for (let i = 1; i <= texto.length; i++) {
    if (i === texto.length || marcas[i] !== marcas[desde]) {
      const pedazo = texto.slice(desde, i);
      partes.push(marcas[desde] ? <mark key={desde} className="rounded-[3px] bg-acento-suave text-tinta">{pedazo}</mark> : pedazo);
      desde = i;
    }
  }
  return partes;
}

function Tecla({ children }) {
  return (
    <kbd className="squircle inline-grid h-6 min-w-6 place-items-center rounded-[7px] bg-superficie px-1.5 font-sans text-[0.72rem] font-medium shadow-[inset_0_0_0_1px_var(--borde),0_1px_0_var(--borde)]">
      {children}
    </kbd>
  );
}

function Bloque({ bloque, palabras }) {
  const R = (texto) => <Resaltado texto={texto} palabras={palabras} />;
  if (bloque.subtitulo) return <h4 className="pt-1 text-[0.72rem] font-semibold tracking-wide text-tinta-tenue uppercase">{R(bloque.subtitulo)}</h4>;
  if (bloque.texto) return <p>{R(bloque.texto)}</p>;
  if (bloque.pasos) {
    return (
      <ol className="space-y-2">
        {bloque.pasos.map((paso, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-seleccion text-[0.68rem] font-semibold text-tinta">{i + 1}</span>
            <span>{R(paso)}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (bloque.lista) {
    return (
      <ul className="space-y-1.5">
        {bloque.lista.map((linea, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-verde" />
            <span>{R(linea)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (bloque.teclas) {
    return (
      <div className="divide-y divide-borde">
        {bloque.teclas.map(([teclas, que]) => (
          <div key={que} className="flex items-center gap-4 py-2">
            <span className="flex w-28 shrink-0 items-center gap-1.5">
              {teclas.map((tecla, i) => (
                <span key={tecla} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-[0.7rem] text-tinta-tenue">{t('ayuda.o')}</span>}
                  <Tecla>{tecla}</Tecla>
                </span>
              ))}
            </span>
            <span>{R(que)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (bloque.preguntas) {
    return (
      <div className="space-y-3.5">
        {bloque.preguntas.map(([pregunta, respuesta]) => (
          <div key={pregunta}>
            <p className="font-medium text-tinta">{R(pregunta)}</p>
            <p className="mt-0.5">{R(respuesta)}</p>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

/** onCerrar: Esc con el buscador vacío cierra Configuración (con texto, primero lo borra). */
export function ContenidoAyuda({ onCerrar }) {
  const idioma = useIdioma();
  const [busqueda, setBusqueda] = useState('');
  const campo = useRef(null);
  const palabras = useMemo(() => normalizar(busqueda).split(/\s+/).filter(Boolean), [busqueda]);
  const temas = useMemo(() => filtrar(palabras, manualEn(idioma)), [palabras, idioma]);

  useEffect(() => {
    campo.current?.focus();
    // Ctrl+F o "/" buscan en el manual (y no en la biblioteca, que está detrás).
    const alPresionar = (e) => {
      const escribiendo = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if ((e.key === 'f' && e.ctrlKey) || (e.key === '/' && !escribiendo)) {
        e.preventDefault();
        e.stopPropagation();
        campo.current?.focus();
        campo.current?.select();
      }
    };
    window.addEventListener('keydown', alPresionar, true);
    return () => window.removeEventListener('keydown', alPresionar, true);
  }, []);

  const irA = (id) => document.querySelector(`[data-tema="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div data-ayuda className="space-y-6">
      {/* Buscador e índice: quedan fijos arriba mientras se lee. */}
      <div className="sticky top-0 z-10 -mx-8 space-y-3 bg-superficie px-8 pt-1 pb-3">
        <div className="relative">
          <IconoBuscar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue" />
          <input
            ref={campo}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              if (busqueda) setBusqueda('');
              else onCerrar?.();
            }}
            placeholder={t('ayuda.buscar')}
            aria-label={t('ayuda.buscarEtiqueta')}
            spellCheck={false}
            className="squircle h-9 w-full rounded-[10px] bg-superficie-2 pr-9 pl-9 text-[0.84rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none placeholder:text-tinta-tenue focus:shadow-[inset_0_0_0_1px_var(--acento),0_0_0_3px_color-mix(in_srgb,var(--acento)_25%,transparent)]"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                campo.current?.focus();
              }}
              title={t('ayuda.borrarBusqueda')}
              className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-superficie text-tinta-suave hover:text-tinta"
            >
              <IconoCerrar className="size-3" />
            </button>
          )}
        </div>
        <nav aria-label={t('ayuda.indice')} className="flex flex-wrap gap-1.5">
          {temas.map((tema) => (
            <motion.button
              type="button"
              key={tema.id}
              data-indice={tema.id}
              onClick={() => irA(tema.id)}
              whileTap={{ scale: 0.95, transition: resortePresion }}
              className="rounded-full bg-superficie-2 px-2.5 py-1 text-[0.74rem] text-tinta-suave shadow-[inset_0_0_0_1px_var(--borde)] transition-colors hover:text-acento"
            >
              {tema.titulo}
            </motion.button>
          ))}
        </nav>
      </div>

      {temas.length === 0 && (
        <p data-sin-resultados className="px-1 text-[0.84rem] text-tinta-suave">
          {t('ayuda.sinResultados', { busqueda: busqueda.trim() })}
        </p>
      )}

      {temas.map((tema) => (
        <motion.section
          key={tema.id}
          data-tema={tema.id}
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={resorte}
          className="scroll-mt-28"
        >
          <h3 className="mb-2 px-1 font-serif text-[1.05rem] font-semibold">
            <Resaltado texto={tema.titulo} palabras={palabras} />
          </h3>
          <div className="squircle space-y-3 rounded-[16px] bg-superficie-2/60 px-4 py-3.5 text-[0.82rem] leading-relaxed text-tinta-suave shadow-[inset_0_0_0_1px_var(--borde)]">
            {tema.bloques.map((bloque, i) => (
              <Bloque key={i} bloque={bloque} palabras={palabras} />
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  );
}
