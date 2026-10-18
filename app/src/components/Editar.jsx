// Hoja "Editar libro": todos los campos de la edición de Calibre, la portada, los formatos, las
// columnas propias y la búsqueda de datos (Google Books y Open Library, Amazon si está prendido, o una URL que pegue el usuario).
// Se guardan solo los campos que cambiaron, con la herramienta oficial de Calibre (y respaldo previo).
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { nombreIdioma, numero, resorte, resortePresion, t, tamaño, tx } from '../lib/index.js';
import { IconoCerrar } from './Iconos.jsx';
import { Portada } from './Piezas.jsx';

const IDIOMAS_COMUNES = ['spa', 'eng', 'por', 'fra', 'ita', 'deu', 'cat', 'zho'];
const ARTICULOS = /^(el|la|los|las|un|una|unos|unas|lo|the|a|an|le|les|il|o|os|as)\s+/i;

const estiloEntrada =
  'squircle h-8 w-full rounded-[9px] bg-superficie-2 px-2.5 text-[0.82rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none focus:shadow-[inset_0_0_0_1px_var(--acento)] disabled:opacity-50';

function Campo({ etiqueta, children, className = '', accion }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <span className="text-[0.68rem] font-semibold tracking-wide text-tinta-tenue">{etiqueta}</span>
        {accion}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Boton({ primario, children, className = '', ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96, transition: resortePresion }}
      className={`squircle inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] px-3 py-1.5 text-[0.78rem] font-medium transition-colors disabled:opacity-50 ${
        primario ? 'bg-acento text-sobre-acento hover:brightness-110' : 'bg-superficie-2 shadow-[inset_0_0_0_1px_var(--borde)] hover:text-acento'
      } ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

function Mini({ children, ...props }) {
  return (
    <button type="button" className="text-[0.66rem] font-medium text-acento hover:underline disabled:opacity-50" {...props}>
      {children}
    </button>
  );
}

/** Estrellas para elegir de 0,5 en 0,5 (valor 0-10 como Calibre). */
export function ElegirEstrellas({ valor, onCambiar }) {
  const [encima, setEncima] = useState(null);
  const mostrado = encima ?? valor ?? 0;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setEncima(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="relative inline-block h-6 w-6 text-xl leading-6 select-none">
          <span className={mostrado >= n * 2 ? 'text-estrella' : mostrado >= n * 2 - 1 ? 'text-estrella/60' : 'text-tinta-tenue/35'}>★</span>
          {/* Mitad izquierda = media estrella; mitad derecha = estrella entera */}
          <button type="button" className="absolute inset-y-0 left-0 w-1/2" onMouseEnter={() => setEncima(n * 2 - 1)} onClick={() => onCambiar(valor === n * 2 - 1 ? null : n * 2 - 1)} title={t('editar.estrellas', { n: numero(n - 0.5) })} />
          <button type="button" className="absolute inset-y-0 right-0 w-1/2" onMouseEnter={() => setEncima(n * 2)} onClick={() => onCambiar(valor === n * 2 ? null : n * 2)} title={t('editar.estrellas', { n })} />
        </span>
      ))}
      <span className="ml-2 text-xs text-tinta-tenue">{valor ? t('editar.deCinco', { n: numero(valor / 2) }) : t('editar.sinValorar')}</span>
    </div>
  );
}

// ---------- Ayudas de formato ----------

/** "El nombre de la rosa" -> "nombre de la rosa, El" (como el orden de título de Calibre). */
function ordenDeTitulo(titulo) {
  const m = ARTICULOS.exec(titulo.trim());
  return m ? `${titulo.trim().slice(m[0].length)}, ${m[1]}` : titulo.trim();
}

/** "Gabriel Rolón & Ana Pérez" -> "Rolón, Gabriel & Pérez, Ana". */
function ordenDeAutor(autores) {
  return autores
    .split('&')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      if (a.includes(',')) return a;
      const partes = a.split(/\s+/);
      return partes.length > 1 ? `${partes.at(-1)}, ${partes.slice(0, -1).join(' ')}` : a;
    })
    .join(' & ');
}

const textoIds = (ids) => Object.entries(ids ?? {}).map(([k, v]) => `${k}:${v}`).join(', ');
function idsDeTexto(texto) {
  const ids = {};
  for (const parte of texto.split(',')) {
    const [clave, ...resto] = parte.split(':');
    if (clave?.trim() && resto.join(':').trim()) ids[clave.trim().toLowerCase()] = resto.join(':').trim();
  }
  return ids;
}
const soloFecha = (iso) => (iso ? iso.slice(0, 10) : '');

function valoresIniciales(libro) {
  return {
    title: libro.title,
    sort: libro.sort ?? libro.title,
    authors: libro.authors.join(' & '),
    authorSort: libro.authorSort ?? '',
    series: libro.series ?? '',
    seriesIndex: libro.series ? String(libro.seriesIndex ?? '') : '',
    rating: libro.rating ?? null,
    tags: libro.tags.join(', '),
    ids: textoIds(libro.identifiers),
    added: soloFecha(libro.added),
    pubdate: soloFecha(libro.pubdate),
    publisher: libro.publisher ?? '',
    languages: [...libro.languages],
    comments: libro.comments ?? '',
    custom: { ...libro.custom },
  };
}

/** Diferencias entre el formulario y el libro, en el formato que espera window.edicion.editar. */
function cambiosDe(inicial, actual) {
  const c = {};
  if (actual.title.trim() !== inicial.title) c.title = actual.title;
  if (actual.sort.trim() !== inicial.sort) c.sort = actual.sort;
  if (actual.authors !== inicial.authors) c.authors = actual.authors.split('&');
  if (actual.authorSort !== inicial.authorSort) c.authorSort = actual.authorSort;
  if (actual.series !== inicial.series) c.series = actual.series;
  if (actual.seriesIndex !== inicial.seriesIndex) c.seriesIndex = actual.seriesIndex;
  if (actual.rating !== inicial.rating) c.rating = actual.rating;
  if (actual.tags !== inicial.tags) c.tags = actual.tags.split(',');
  if (actual.ids !== inicial.ids) c.identifiers = idsDeTexto(actual.ids);
  if (actual.added !== inicial.added) c.added = actual.added;
  if (actual.pubdate !== inicial.pubdate) c.pubdate = actual.pubdate;
  if (actual.publisher !== inicial.publisher) c.publisher = actual.publisher;
  if (actual.languages.join() !== inicial.languages.join()) c.languages = actual.languages;
  if (actual.comments !== inicial.comments) c.comments = actual.comments;
  const custom = {};
  for (const [clave, valor] of Object.entries(actual.custom)) if (valor !== inicial.custom[clave]) custom[clave] = valor;
  for (const clave of Object.keys(inicial.custom)) if (!(clave in actual.custom)) custom[clave] = null;
  if (Object.keys(custom).length) c.custom = custom;
  return c;
}

// ---------- Vista previa de lo encontrado ----------

/** Lo encontrado en la web: el usuario elige qué pasar al formulario. */
function DatosEncontrados({ encontrados, formulario, columnaPaginas, onUsar, onCerrar }) {
  const { datos, portada } = encontrados;
  const ref = useRef(null);
  // Aparece al final del formulario: se lleva a la vista para que no quede escondido abajo.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: document.hidden ? 'instant' : 'smooth', block: 'nearest' });
  }, [encontrados]);
  const filas = [
    ['title', t('editar.campos.title'), datos.title],
    ['authors', t('editar.campos.authors'), datos.authors?.join(' & ')],
    ['publisher', t('editar.campos.publisher'), datos.publisher],
    ['pubdate', t('editar.campos.pubdate'), datos.pubdate],
    ['languages', t('editar.campos.languages'), datos.languages?.map(nombreIdioma).join(', ')],
    ['ids', t('editar.campos.ids'), [datos.isbn && `isbn:${datos.isbn}`, datos.asin && `amazon:${datos.asin}`].filter(Boolean).join(', ')],
    ['pages', columnaPaginas ? t('editar.campos.paginas', { columna: columnaPaginas.name }) : null, columnaPaginas && datos.pages ? String(datos.pages) : ''],
    ['tags', t('editar.campos.tags'), datos.tags?.join(', ')],
    ['comments', t('editar.campos.comments'), datos.comments],
  ].filter(([, etiqueta, valor]) => etiqueta && valor);
  const vacio = (campo) => {
    const v = formulario[campo];
    return Array.isArray(v) ? v.length === 0 : !v;
  };
  const [elegidos, setElegidos] = useState(
    () => new Set([...filas.filter(([campo]) => ['ids', 'pages'].includes(campo) || vacio(campo)).map(([campo]) => campo), ...(portada ? ['portada'] : [])]),
  );
  const alternar = (c) =>
    setElegidos((e) => {
      const n = new Set(e);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, transform: 'translateY(12px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={resorte}
      className="squircle mt-3 scroll-mb-4 rounded-[16px] bg-acento-suave/50 p-4 shadow-[inset_0_0_0_1px_var(--borde)]"
    >
      <p className="text-[0.8rem] font-medium">{tx('editar.encontradoEn', { b: (s) => <strong>{s}</strong> }, { fuente: datos.fuente })}</p>
      <div className="mt-3 flex gap-4">
        {portada && (
          <label className="shrink-0 cursor-pointer text-center">
            <img src={portada} alt={t('editar.portadaEncontrada')} className="h-36 rounded-md shadow" />
            <span className="mt-1 flex items-center justify-center gap-1 text-xs">
              <input type="checkbox" checked={elegidos.has('portada')} onChange={() => alternar('portada')} /> {t('editar.portada')}
            </span>
          </label>
        )}
        <ul className="min-w-0 flex-1 space-y-1.5">
          {filas.map(([campo, etiqueta, valor]) => (
            <li key={campo}>
              <label className="flex cursor-pointer items-start gap-2 text-[0.76rem]">
                <input type="checkbox" className="mt-0.5" checked={elegidos.has(campo)} onChange={() => alternar(campo)} />
                <span className="min-w-0">
                  <span className="font-medium">{etiqueta}:</span>{' '}
                  <span className="text-tinta-suave">{valor.length > 160 ? `${valor.slice(0, 160)}…` : valor}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex gap-2">
        <Boton primario onClick={() => onUsar(elegidos)}>{t('editar.usarMarcado')}</Boton>
        <Boton onClick={onCerrar}>{t('editar.descartar')}</Boton>
      </div>
    </motion.div>
  );
}

// ---------- Hoja ----------

export function HojaEditar({ libro, columnas, todosLosIdiomas, onGuardado, onCerrar }) {
  const inicial = useMemo(() => valoresIniciales(libro), [libro.id]);
  const [formulario, setFormulario] = useState(inicial);
  const [estado, setEstado] = useState(null); // { fase, mensaje }
  const [encontrados, setEncontrados] = useState(null);
  const [usarPortadaWeb, setUsarPortadaWeb] = useState(false);
  const [url, setUrl] = useState('');
  // Configuración → Privacidad: si se busca también en Amazon (solo cambia los textos; decide main.cjs).
  const [conAmazon, setConAmazon] = useState(false);
  useEffect(() => {
    window.preferencias.leer().then((p) => setConAmazon(p.amazon)).catch(() => {});
  }, []);
  const cambiar = (campo, valor) => setFormulario((f) => ({ ...f, [campo]: valor }));
  const cambiarCustom = (clave, valor) => setFormulario((f) => ({ ...f, custom: { ...f.custom, [clave]: valor } }));
  const idiomas = useMemo(() => [...new Set([...IDIOMAS_COMUNES, ...todosLosIdiomas])], [todosLosIdiomas]);
  const columnaPaginas = columnas.find((c) => c.datatype === 'int' && /p[aá]g/i.test(`${c.label} ${c.name}`));
  const ocupado = ['guardando', 'buscando', 'portada', 'formato'].includes(estado?.fase);

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && !ocupado && onCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar, ocupado]);

  /** Resultado de una acción que guarda al instante (portada, formatos). */
  const alGuardarYa = (r, mensaje) => {
    if (r.cancelado) return setEstado(null);
    if (!r.ok) return setEstado({ fase: 'error', mensaje: r.mensaje });
    onGuardado(r.biblioteca);
    setEstado({ fase: 'ok', mensaje });
  };
  const elegirPortada = async () => {
    setEstado({ fase: 'portada', mensaje: t('editar.guardandoPortada') });
    alGuardarYa(await window.edicion.portadaDesdeArchivo(libro.id), t('editar.portadaActualizada'));
  };
  const soltarImagen = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const archivo = e.dataTransfer.files?.[0];
    if (!archivo) return;
    setEstado({ fase: 'portada', mensaje: t('editar.guardandoPortada') });
    alGuardarYa(await window.edicion.portadaDesdeImagen(libro.id, archivo), t('editar.portadaActualizada'));
  };
  const agregarFormato = async () => {
    setEstado({ fase: 'formato', mensaje: t('editar.agregandoFormato') });
    alGuardarYa(await window.edicion.agregarFormato(libro.id), t('editar.formatoAgregado'));
  };
  const quitarFormato = async (formato) => {
    if (!window.confirm(t('editar.confirmarQuitar', { formato }))) return;
    setEstado({ fase: 'formato', mensaje: t('editar.quitando', { formato }) });
    alGuardarYa(await window.edicion.quitarFormato(libro.id, formato), t('editar.quitado', { formato }));
  };

  const buscar = async (desdeUrl) => {
    setEstado({ fase: 'buscando', mensaje: desdeUrl ? t('editar.leyendoPagina') : conAmazon ? t('editar.buscandoConAmazon') : t('editar.buscando') });
    const r = desdeUrl ? await window.edicion.buscarEnUrl(libro.id, url) : await window.edicion.buscarDatos(libro.id);
    if (!r.ok) return setEstado({ fase: 'error', mensaje: r.mensaje });
    setEstado({ fase: 'ok', mensaje: t('editar.encontre', { fuente: r.datos.fuente }) });
    setEncontrados(r);
  };
  const usarEncontrados = (elegidos) => {
    const d = encontrados.datos;
    setFormulario((f) => {
      const ids = { ...idsDeTexto(f.ids), ...(d.isbn && { isbn: d.isbn }), ...(d.asin && { amazon: d.asin }) };
      return {
        ...f,
        ...(elegidos.has('title') && { title: d.title, sort: ordenDeTitulo(d.title) }),
        ...(elegidos.has('authors') && { authors: d.authors.join(' & '), authorSort: ordenDeAutor(d.authors.join(' & ')) }),
        ...(elegidos.has('publisher') && { publisher: d.publisher }),
        ...(elegidos.has('pubdate') && { pubdate: d.pubdate.length === 4 ? `${d.pubdate}-06-15` : d.pubdate }),
        ...(elegidos.has('languages') && { languages: d.languages }),
        ...(elegidos.has('ids') && { ids: textoIds(ids) }),
        ...(elegidos.has('tags') && { tags: d.tags.join(', ') }),
        ...(elegidos.has('comments') && { comments: d.comments }),
        ...(elegidos.has('pages') && columnaPaginas && { custom: { ...f.custom, [columnaPaginas.label]: d.pages } }),
      };
    });
    setUsarPortadaWeb(elegidos.has('portada'));
    setEncontrados(null);
    setEstado({ fase: 'info', mensaje: t('editar.copiados') });
  };

  const guardar = async () => {
    const cambios = cambiosDe(inicial, formulario);
    if (!Object.keys(cambios).length && !usarPortadaWeb) return onCerrar();
    setEstado({ fase: 'guardando', mensaje: t('editar.guardando') });
    const r = usarPortadaWeb ? await window.edicion.aplicarDatos(libro.id, cambios, true) : await window.edicion.editar(libro.id, cambios);
    if (!r.ok) return setEstado({ fase: 'error', mensaje: r.mensaje });
    onGuardado(r.biblioteca);
    onCerrar();
  };

  const columnasSimples = columnas.filter((c) => ['int', 'float', 'text'].includes(c.datatype) && !c.isMultiple);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-5">
      <motion.div className="absolute inset-0 bg-[rgb(var(--sombra))]" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} transition={resorte} onClick={() => !ocupado && onCerrar()} />
      <motion.div
        role="dialog"
        aria-label={t('editar.titulo')}
        initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative flex max-h-full w-[min(76rem,100%)] flex-col overflow-hidden rounded-[24px] bg-superficie shadow-flotante"
      >
        <header className="flex items-center gap-3 px-6 pt-4 pb-2">
          <div className="flex-1">
            <h2 className="font-serif text-lg font-semibold">{t('editar.titulo')}</h2>
            <p className="text-xs text-tinta-tenue">{t('editar.subtitulo')}</p>
          </div>
          <button type="button" onClick={onCerrar} disabled={ocupado} title={t('comun.cerrarEsc')} className="grid size-7 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta">
            <IconoCerrar className="size-3.5" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 pb-4">
          {/* Título, autores y serie */}
          <div className="grid grid-cols-12 gap-x-3 gap-y-2.5">
            <Campo etiqueta={t('editar.tituloLibro')} className="col-span-6">
              <input className={estiloEntrada} value={formulario.title} onChange={(e) => cambiar('title', e.target.value)} />
            </Campo>
            <Campo etiqueta={t('editar.ordenTitulo')} className="col-span-6" accion={<Mini onClick={() => cambiar('sort', ordenDeTitulo(formulario.title))}>{t('editar.calcular')}</Mini>}>
              <input className={estiloEntrada} value={formulario.sort} onChange={(e) => cambiar('sort', e.target.value)} />
            </Campo>
            <Campo etiqueta={t('editar.autores')} className="col-span-6">
              <input className={estiloEntrada} value={formulario.authors} onChange={(e) => cambiar('authors', e.target.value)} />
            </Campo>
            <Campo etiqueta={t('editar.ordenAutor')} className="col-span-6" accion={<Mini onClick={() => cambiar('authorSort', ordenDeAutor(formulario.authors))}>{t('editar.calcular')}</Mini>}>
              <input className={estiloEntrada} value={formulario.authorSort} onChange={(e) => cambiar('authorSort', e.target.value)} />
            </Campo>
            <Campo etiqueta={t('editar.serie')} className="col-span-9">
              <input className={estiloEntrada} value={formulario.series} onChange={(e) => cambiar('series', e.target.value)} placeholder={t('editar.ninguna')} />
            </Campo>
            <Campo etiqueta={t('editar.numero')} className="col-span-3">
              <input className={estiloEntrada} value={formulario.seriesIndex} onChange={(e) => cambiar('seriesIndex', e.target.value.replace(/[^0-9.]/g, ''))} disabled={!formulario.series} />
            </Campo>
          </div>

          <div className="mt-4 grid grid-cols-[11rem_1fr_1fr] gap-5">
            {/* Portada */}
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={soltarImagen}
                title={t('editar.arrastra')}
                className="squircle relative aspect-[2/3] w-full overflow-hidden rounded-[10px] shadow-[0_8px_24px_-10px_rgb(var(--sombra)/0.5)]"
              >
                <Portada libro={libro} completa className="size-full" />
                {usarPortadaWeb && (
                  <span className="absolute inset-x-0 bottom-0 bg-acento px-2 py-1 text-center text-[0.66rem] font-medium text-sobre-acento">
                    {t('editar.usaraEncontrada')}
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                <Boton onClick={elegirPortada} disabled={ocupado}>{t('editar.elegirImagen')}</Boton>
                <Mini onClick={() => window.edicion.buscarPortadaWeb(libro.id)}>{t('editar.buscarPortada')}</Mini>
                <p className="text-center text-[0.64rem] text-tinta-tenue">{t('editar.oArrastra')}</p>
              </div>
            </div>

            {/* Datos */}
            <div className="space-y-2.5">
              <Campo etiqueta={t('editar.calificacion')}>
                <ElegirEstrellas valor={formulario.rating} onCambiar={(v) => cambiar('rating', v)} />
              </Campo>
              <Campo etiqueta={t('editar.etiquetas')}>
                <input className={estiloEntrada} value={formulario.tags} onChange={(e) => cambiar('tags', e.target.value)} />
              </Campo>
              <Campo etiqueta={t('editar.identificadores')}>
                <input className={estiloEntrada} value={formulario.ids} onChange={(e) => cambiar('ids', e.target.value)} spellCheck={false} />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta={t('editar.agregado')}>
                  <input type="date" className={estiloEntrada} value={formulario.added} onChange={(e) => cambiar('added', e.target.value)} />
                </Campo>
                <Campo etiqueta={t('editar.publicado')}>
                  <input type="date" className={estiloEntrada} value={formulario.pubdate} onChange={(e) => cambiar('pubdate', e.target.value)} />
                </Campo>
              </div>
              <Campo etiqueta={t('editar.editorial')}>
                <input className={estiloEntrada} value={formulario.publisher} onChange={(e) => cambiar('publisher', e.target.value)} />
              </Campo>
              <Campo etiqueta={t('editar.idiomas')}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {formulario.languages.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-full bg-seleccion px-2.5 py-0.5 text-[0.76rem]">
                      {nombreIdioma(c)}
                      <button type="button" onClick={() => cambiar('languages', formulario.languages.filter((x) => x !== c))} className="text-tinta-tenue hover:text-tinta" title={t('editar.quitarIdioma')}>
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    className="h-7 rounded-lg bg-superficie-2 px-2 text-[0.74rem] shadow-[inset_0_0_0_1px_var(--borde)] outline-none"
                    value=""
                    onChange={(e) => e.target.value && cambiar('languages', [...formulario.languages, e.target.value])}
                  >
                    <option value="">{t('editar.agregarIdioma')}</option>
                    {idiomas.filter((c) => !formulario.languages.includes(c)).map((c) => (
                      <option key={c} value={c}>{nombreIdioma(c)}</option>
                    ))}
                  </select>
                </div>
              </Campo>
            </div>

            {/* Descripción y formatos */}
            <div className="flex flex-col gap-2.5">
              <Campo etiqueta={t('editar.descripcion')} className="flex flex-1 flex-col">
                <textarea className={`${estiloEntrada} h-full min-h-40 py-2 leading-relaxed`} value={formulario.comments} onChange={(e) => cambiar('comments', e.target.value)} />
              </Campo>
              <Campo etiqueta={t('editar.formatos')} accion={<Mini onClick={agregarFormato} disabled={ocupado}>{t('editar.agregarFormato')}</Mini>}>
                <ul className="squircle space-y-1 rounded-[10px] bg-superficie-2/60 p-2 text-[0.78rem]">
                  {libro.formats.length === 0 && <li className="text-tinta-tenue">{t('editar.sinArchivos')}</li>}
                  {libro.formats.map((f) => (
                    <li key={f.format} className="flex items-center gap-2">
                      <span className="font-medium">{f.format}</span>
                      <span className="text-tinta-tenue">{tamaño(f.size)}</span>
                      <button type="button" disabled={ocupado} onClick={() => quitarFormato(f.format)} className="ml-auto text-[0.7rem] text-tinta-tenue hover:text-[#bc4749]">
                        {t('editar.quitar')}
                      </button>
                    </li>
                  ))}
                </ul>
              </Campo>
            </div>
          </div>

          {/* Columnas propias */}
          {columnas.length > 0 && (
            <div className="mt-4 border-t border-borde pt-3">
              <p className="text-[0.68rem] font-semibold tracking-wide text-tinta-tenue">{t('editar.tusColumnas')}</p>
              <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-2.5">
                {columnas.map((c) => {
                  const valor = formulario.custom[c.label];
                  if (c.datatype === 'enumeration') {
                    return (
                      <Campo key={c.label} etiqueta={c.name}>
                        <select className={estiloEntrada} value={valor ?? ''} onChange={(e) => cambiarCustom(c.label, e.target.value || null)}>
                          <option value="">—</option>
                          {c.enumValues.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </Campo>
                    );
                  }
                  if (c.datatype === 'rating') {
                    return (
                      <Campo key={c.label} etiqueta={t('editar.tuya', { columna: c.name })} className="col-span-2">
                        <ElegirEstrellas valor={valor ?? null} onCambiar={(v) => cambiarCustom(c.label, v)} />
                      </Campo>
                    );
                  }
                  if (c.datatype === 'bool') {
                    return (
                      <Campo key={c.label} etiqueta={c.name}>
                        <select className={estiloEntrada} value={valor == null ? '' : valor ? 'si' : 'no'} onChange={(e) => cambiarCustom(c.label, e.target.value === '' ? null : e.target.value === 'si')}>
                          <option value="">—</option>
                          <option value="si">{t('editar.si')}</option>
                          <option value="no">{t('editar.no')}</option>
                        </select>
                      </Campo>
                    );
                  }
                  if (columnasSimples.includes(c)) {
                    return (
                      <Campo key={c.label} etiqueta={c.name}>
                        <input
                          className={estiloEntrada}
                          value={valor ?? ''}
                          onChange={(e) => {
                            const v = c.datatype === 'text' ? e.target.value : e.target.value.replace(/[^0-9.]/g, '');
                            cambiarCustom(c.label, v === '' ? null : c.datatype === 'text' ? v : Number(v));
                          }}
                        />
                      </Campo>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          )}

          {encontrados && (
            <DatosEncontrados encontrados={encontrados} formulario={formulario} columnaPaginas={columnaPaginas} onUsar={usarEncontrados} onCerrar={() => { setEncontrados(null); setEstado(null); }} />
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-borde px-6 py-3">
          <Boton onClick={() => buscar(false)} disabled={ocupado} title={conAmazon ? t('editar.buscaConAmazon') : t('editar.buscaSinAmazon')}>
            {estado?.fase === 'buscando' && !url ? <span className="size-3.5 animate-spin rounded-full border-2 border-tinta-tenue/40 border-t-acento" /> : null}
            {t('editar.buscarDatos')}
          </Boton>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && !ocupado && buscar(true)}
              placeholder={t('editar.buscarEnUrl')}
              className={`${estiloEntrada} min-w-0 flex-1`}
              spellCheck={false}
            />
            <Boton onClick={() => buscar(true)} disabled={ocupado || !url.trim()}>{t('editar.leerPagina')}</Boton>
          </div>
          <div className="flex w-full items-center gap-2">
            {estado?.mensaje && (
              <p className={`min-w-0 flex-1 truncate text-[0.76rem] ${estado.fase === 'error' ? 'text-[#bc4749]' : estado.fase === 'ok' ? 'text-verde' : 'text-tinta-suave'}`}>
                {estado.mensaje}
              </p>
            )}
            <div className="ml-auto flex gap-2">
              <Boton onClick={onCerrar} disabled={ocupado}>{t('comun.cancelar')}</Boton>
              <Boton primario onClick={guardar} disabled={ocupado}>{estado?.fase === 'guardando' ? t('editar.guardando') : t('comun.guardar')}</Boton>
            </div>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
