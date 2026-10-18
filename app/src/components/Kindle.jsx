// Hoja "Kindle": importación de subrayados (y un resumen del envío por mail).
// La configuración del envío (ConfigEnvio) se muestra en Configuración → Kindle y correo.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { fechaCorta, region, resorte, resortePresion, resorteRapido, t, tx } from '../lib/index.js';
import { IconoCerrar, IconoCheck, IconoKindle } from './Iconos.jsx';

function Boton({ primario, children, ...props }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96, transition: resortePresion }}
      transition={resorteRapido}
      className={`squircle inline-flex items-center justify-center gap-2 rounded-[11px] px-3.5 py-2 text-[0.8rem] font-medium transition-colors disabled:opacity-50 ${
        primario ? 'bg-acento text-sobre-acento hover:brightness-110' : 'bg-superficie-2 text-tinta shadow-[inset_0_0_0_1px_var(--borde)] hover:text-acento'
      }`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section className="squircle rounded-[18px] bg-superficie-2/60 p-5">
      <h3 className="text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">{titulo}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fila({ etiqueta, children }) {
  return (
    <div className="flex items-baseline gap-3 py-1 text-[0.84rem]">
      <span className="w-28 shrink-0 text-tinta-suave">{etiqueta}</span>
      <span className="seleccionable min-w-0 flex-1 break-all">{children}</span>
    </div>
  );
}

export function ConfigEnvio({ estado, onGuardado }) {
  const [clave, setClave] = useState('');
  const [editando, setEditando] = useState(false);
  const [destino, setDestino] = useState(estado.destino);
  const [ocupado, setOcupado] = useState(false);
  const [prueba, setPrueba] = useState(null);
  useEffect(() => setDestino(estado.destino), [estado.destino]);

  const guardar = async () => {
    setOcupado(true);
    try {
      const nuevo = await window.kindle.guardarEnvio({ clave: clave || undefined, destino: destino.trim() });
      setClave('');
      setEditando(false);
      onGuardado(nuevo);
      if (clave) setPrueba(await window.kindle.probarEnvio());
    } catch (error) {
      setPrueba({ ok: false, mensaje: error.message });
    } finally {
      setOcupado(false);
    }
  };
  const probar = async () => {
    setOcupado(true);
    setPrueba(await window.kindle.probarEnvio());
    setOcupado(false);
  };
  const pedirClave = !estado.tieneClave || editando;

  return (
    <Seccion titulo={t('kindle.envioTitulo')}>
      <Fila etiqueta={t('kindle.tuKindle')}>
        <input
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          onBlur={() => destino.trim() !== estado.destino && guardar()}
          placeholder={t('kindle.placeholderKindle')}
          className="w-full rounded-md bg-transparent px-1 py-0.5 outline-none focus:bg-superficie focus:ring-2 focus:ring-acento/30"
        />
      </Fila>
      <Fila etiqueta={t('kindle.desde')}>{estado.remitente || estado.usuario || '—'}</Fila>
      <Fila etiqueta={t('kindle.servidor')}>
        {estado.servidor}:{estado.puerto}
        {estado.desdeCalibre && <span className="ml-2 text-xs text-tinta-tenue">{t('kindle.tomadoDeCalibre')}</span>}
      </Fila>

      <div className="mt-4 border-t border-borde pt-4">
        {pedirClave ? (
          <>
            <p className="text-[0.82rem] leading-relaxed text-tinta-suave">
              {tx('kindle.claveExplicacion', { b: (s) => <strong className="text-tinta">{s}</strong> })}
            </p>
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[0.8rem] text-tinta-suave">
              <li>
                {tx(
                  'kindle.paso1',
                  {
                    boton: (s) => (
                      <button type="button" onClick={() => window.kindle.ayudaClave()} className="font-medium text-acento hover:underline">
                        {s}
                      </button>
                    ),
                    b: (s) => <strong>{s}</strong>,
                  },
                  { usuario: estado.usuario || t('kindle.tuGmail') },
                )}
              </li>
              <li>{t('kindle.paso2')}</li>
              <li>{t('kindle.paso3')}</li>
            </ol>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && clave && guardar()}
                placeholder="abcd efgh ijkl mnop"
                autoComplete="off"
                spellCheck={false}
                className="squircle h-9 min-w-0 flex-1 rounded-[10px] bg-superficie px-3 text-sm shadow-[inset_0_0_0_1px_var(--borde)] outline-none focus:shadow-[inset_0_0_0_1px_var(--acento)]"
              />
              <Boton primario disabled={!clave || ocupado} onClick={guardar}>
                {ocupado ? t('kindle.guardando') : t('comun.guardar')}
              </Boton>
              {estado.tieneClave && <Boton onClick={() => setEditando(false)}>{t('comun.cancelar')}</Boton>}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto inline-flex items-center gap-1.5 text-[0.82rem] text-tinta-suave">
              <IconoCheck className="size-4 text-verde" /> {t('kindle.claveGuardada')}
            </span>
            <Boton onClick={probar} disabled={ocupado}>{ocupado ? t('kindle.probando') : t('kindle.probar')}</Boton>
            <Boton onClick={() => setEditando(true)}>{t('kindle.cambiar')}</Boton>
          </div>
        )}
        {prueba && (
          <p className={`mt-3 text-[0.8rem] ${prueba.ok ? 'text-verde' : 'text-[#bc4749]'}`}>
            {prueba.ok ? t('kindle.conexionOk') : prueba.mensaje}
          </p>
        )}
      </div>
    </Seccion>
  );
}

const NINGUNO = '__ninguno__';

/** Botón para agregar a la biblioteca un libro que está en el Kindle. */
function BotonAgregar({ clave, estado, onAgregar, chico }) {
  const ocupado = estado?.fase === 'agregando';
  return (
    <motion.button
      type="button"
      disabled={ocupado}
      onClick={() => onAgregar(clave)}
      whileTap={{ scale: 0.96, transition: resortePresion }}
      title={t('kindle.agregarExplicacion')}
      className={`squircle inline-flex shrink-0 items-center gap-1.5 rounded-[9px] font-medium text-sobre-acento transition-[filter] hover:brightness-110 disabled:opacity-60 ${
        chico ? 'bg-acento/90 px-2 py-1 text-[0.7rem]' : 'bg-acento px-2.5 py-1.5 text-[0.74rem]'
      }`}
    >
      {ocupado && <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {ocupado ? t('kindle.agregando') : t('kindle.agregar')}
    </motion.button>
  );
}

function MensajeAgregado({ estado }) {
  return <p className={`mt-1 text-[0.74rem] ${estado.ok ? 'text-verde' : 'text-[#bc4749]'}`}>{estado.mensaje}</p>;
}

function describirAgregado(r, titulo) {
  if (!r.ok) return r.mensaje;
  if (r.modo === 'ficha') {
    const motivo = t(r.hayKindle ? 'kindle.noEnKindle' : 'kindle.sinKindle');
    return t('kindle.agregadoFicha', { titulo, motivo });
  }
  const proteccion = r.protegido ? t('kindle.protegido') : '';
  return t('kindle.agregadoArchivo', { titulo, formato: r.formato, proteccion });
}

function ImportarSubrayados({ subrayados, ultimoResultado, libros, onImportar, onAsignar, onIgnorar, onRestaurar, onAgregar }) {
  const [ocupado, setOcupado] = useState(false);
  const [agregando, setAgregando] = useState({});
  const [verIgnorados, setVerIgnorados] = useState(false);
  const pendientes = Object.entries(subrayados?.sinAsignar ?? {});
  const ignorados = Object.entries(subrayados?.ignorados ?? {});
  // Resultados de libros ya agregados (ya no figuran como pendientes): se muestran aparte.
  const resultados = Object.entries(agregando).filter(([clave, r]) => r.ok && !subrayados?.sinAsignar?.[clave] && !subrayados?.ignorados?.[clave]);

  const agregar = async (clave) => {
    const titulo = (subrayados.sinAsignar[clave] ?? subrayados.ignorados[clave])?.titulo ?? '';
    setAgregando((a) => ({ ...a, [clave]: { fase: 'agregando' } }));
    const r = await onAgregar(clave);
    setAgregando((a) => ({ ...a, [clave]: { fase: 'listo', ok: r.ok, mensaje: describirAgregado(r, titulo) } }));
  };
  const opciones = useMemo(() => [...libros].sort((a, b) => a.title.localeCompare(b.title, region())), [libros]);
  const ultima = subrayados?.importaciones?.at(-1);
  const total = Object.values(subrayados?.libros ?? {}).reduce((n, l) => n + l.subrayados.length, 0);

  const importar = async (accion) => {
    setOcupado(true);
    await onImportar(accion);
    setOcupado(false);
  };

  return (
    <Seccion titulo={t('kindle.subrayadosTitulo')}>
      <p className="text-[0.82rem] leading-relaxed text-tinta-suave">
        {tx('kindle.importarExplicacion', { code: (s) => <code className="text-tinta">{s}</code> })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Boton primario disabled={ocupado} onClick={() => importar('kindle')}>
          <IconoKindle className="size-4" /> {ocupado ? t('kindle.buscandoKindle') : t('kindle.importar')}
        </Boton>
        <Boton disabled={ocupado} onClick={() => importar('archivo')}>
          {t('kindle.elegirArchivo')}
        </Boton>
      </div>

      {ultimoResultado && (
        <p className={`mt-3 text-[0.8rem] ${ultimoResultado.ok ? 'text-verde' : 'text-[#bc4749]'}`}>
          {ultimoResultado.ok
            ? `✓ ${ultimoResultado.nuevos === 0 ? t('kindle.sinNuevos') : t('kindle.nuevos', { n: ultimoResultado.nuevos })} ${t('kindle.enArchivo', { n: ultimoResultado.librosEnArchivo })}.${ultimoResultado.reasignados ? ` ${t('kindle.reasignados', { n: ultimoResultado.reasignados })}` : ''}`
            : ultimoResultado.mensaje}
        </p>
      )}
      <p className="mt-2 text-[0.75rem] text-tinta-tenue">
        {t('kindle.totalGuardados', { n: total })}
        {ultima ? ` · ${t('kindle.ultimaImportacion', { fecha: fechaCorta(ultima.fecha) })}` : ''} · {t('kindle.dondeSeGuardan')}
      </p>

      {pendientes.length > 0 && (
        <div className="mt-4 border-t border-borde pt-4">
          <p className="text-[0.8rem] font-medium">{t('kindle.noReconoci', { n: pendientes.length })}</p>
          <p className="text-[0.75rem] text-tinta-tenue">{t('kindle.pendientesExplicacion')}</p>
          <ul className="mt-3 space-y-3">
            {pendientes.map(([clave, p]) => (
              <li key={clave} className="text-[0.82rem]">
                <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.titulo}</span>
                  <span className="text-xs text-tinta-tenue">
                    {p.autor || t('kindle.autorDesconocido')} · {t('kindle.subrayados', { n: p.subrayados.length })}
                  </span>
                </span>
                <BotonAgregar clave={clave} estado={agregando[clave]} onAgregar={agregar} />
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const valor = e.target.value;
                    if (valor === NINGUNO) onIgnorar(clave);
                    else if (valor) onAsignar(clave, valor);
                  }}
                  className="h-8 w-40 rounded-lg bg-superficie px-2 text-xs shadow-[inset_0_0_0_1px_var(--borde)] outline-none"
                >
                  <option value="">{t('kindle.asignarA')}</option>
                  <option value={NINGUNO}>{t('kindle.noEsta')}</option>
                  <option disabled>──────────</option>
                  {opciones.map((l) => (
                    <option key={l.uuid} value={l.uuid}>
                      {l.title.slice(0, 70)} — {l.authors[0] ?? ''}
                    </option>
                  ))}
                </select>
                </div>
                {agregando[clave]?.mensaje && <MensajeAgregado estado={agregando[clave]} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultados.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-borde pt-3">
          {resultados.map(([clave, r]) => (
            <li key={clave}>
              <MensajeAgregado estado={r} />
            </li>
          ))}
        </ul>
      )}

      {ignorados.length > 0 && (
        <div className="mt-4 border-t border-borde pt-3">
          <button type="button" onClick={() => setVerIgnorados(!verIgnorados)} className="text-left text-[0.78rem] text-tinta-suave hover:text-tinta">
            {verIgnorados ? '▾' : '▸'} {t('kindle.ignorados', { n: ignorados.length })}
            <span className="text-tinta-tenue">{t('kindle.ignoradosNota')}</span>
          </button>
          {verIgnorados && (
            <ul className="mt-2 space-y-1.5">
              {ignorados.map(([clave, p]) => (
                <li key={clave} className="flex items-center gap-3 text-[0.8rem]">
                  <span className="min-w-0 flex-1 truncate text-tinta-suave">
                    {p.titulo} <span className="text-xs text-tinta-tenue">· {t('kindle.subrayados', { n: p.subrayados.length })}</span>
                  </span>
                  <BotonAgregar clave={clave} estado={agregando[clave]} onAgregar={agregar} chico />
                  <button type="button" onClick={() => onRestaurar(clave)} className="shrink-0 text-xs font-medium text-acento hover:underline">
                    {t('kindle.reasignar')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Seccion>
  );
}

/** Resumen del envío por mail, con un acceso a Configuración (donde se cambia). */
function ResumenEnvio({ estado, onConfigurar }) {
  const listo = Boolean(estado?.tieneClave && estado?.destino);
  return (
    <section className="squircle flex items-center gap-3 rounded-[18px] bg-superficie-2/60 px-5 py-3.5">
      <span className="min-w-0 flex-1 text-[0.82rem]">
        <span className="block text-[0.72rem] font-semibold tracking-wide text-tinta-tenue">{t('kindle.envioTitulo')}</span>
        <span className={`mt-0.5 block truncate ${listo ? 'text-tinta-suave' : 'text-tinta-tenue'}`}>
          {listo ? tx('kindle.listoVanA', { b: (s) => <strong className="seleccionable font-medium text-tinta">{s}</strong> }, { destino: estado.destino }) : t('kindle.sinConfigurar')}
        </span>
      </span>
      <Boton primario={!listo} onClick={onConfigurar}>{listo ? t('kindle.cambiarPuntos') : t('kindle.configurar')}</Boton>
    </section>
  );
}

export function HojaKindle({
  estadoEnvio, onConfigurarEnvio, subrayados, ultimoResultado, libros, onImportar, onAsignar, onIgnorar, onRestaurar, onAgregar, onCerrar,
}) {
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
        aria-label="Kindle"
        initial={{ opacity: 0, transform: 'translateY(16px) scale(0.97)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.15 } }}
        transition={resorte}
        className="squircle relative flex max-h-full w-[min(40rem,100%)] flex-col overflow-hidden rounded-[26px] bg-superficie shadow-flotante"
      >
        <header className="flex items-center gap-3 px-6 pt-5 pb-3">
          <span className="grid size-9 place-items-center rounded-xl bg-verde text-[#fefae3]">
            <IconoKindle className="size-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-lg font-semibold">{t('kindle.titulo')}</h2>
            <p className="text-xs text-tinta-tenue">{t('kindle.subtitulo')}</p>
          </div>
          <button type="button" onClick={onCerrar} title={t('comun.cerrarEsc')} className="grid size-7 place-items-center rounded-full bg-superficie-2 text-tinta-suave hover:text-tinta">
            <IconoCerrar className="size-3.5" />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto px-6 pb-6">
          <ResumenEnvio estado={estadoEnvio} onConfigurar={onConfigurarEnvio} />
          <ImportarSubrayados
            subrayados={subrayados}
            ultimoResultado={ultimoResultado}
            libros={libros}
            onImportar={onImportar}
            onAsignar={onAsignar}
            onIgnorar={onIgnorar}
            onRestaurar={onRestaurar}
            onAgregar={onAgregar}
          />
        </div>
      </motion.div>
    </div>
  );
}
