// 1.8: el .md de cada libro, con sus subrayados y notas (de Broots y del Kindle) ordenados por capítulo, para
// Obsidian, Notion o lo que quieras. Va en la carpeta «data» del libro: la que Calibre reserva para los archivos
// extra de cada libro (los muestra en «Archivos de datos» y se los lleva si cambia el título o el autor).
// Broots lo reescribe solo cada vez que cambia algo. Los datos de verdad están en .broots (anotaciones.cjs y
// subrayados.cjs): si el .md se borra o Drive arma un lío con él, se vuelve a armar igual.
//
// El archivo tiene dos partes. Arriba, lo que arma Broots (se reemplaza entero). Abajo de la línea
// <!-- broots:fin -->, lo tuyo: Broots nunca lo toca. La primera línea (<!-- broots:subrayados <uuid> … -->) es
// como Broots reconoce el archivo aunque cambie de nombre (por ejemplo, si cambiaste el título).
//
// Nunca se escribe en una biblioteca compartida (de solo lectura): ahí no hay .md. Y la copia de Familia no se lleva
// la carpeta «data» (compartir.cjs copia solo los archivos del libro), así tus notas quedan tuyas.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const idiomas = require('./idioma.cjs');
const { t } = idiomas;
const { nombreArchivo } = require('./club.cjs');

const CARPETA_DATA = 'data';
const MARCA_INICIO = '<!-- broots:subrayados ';
const MARCA_FIN = '<!-- broots:fin -->';

function fecha(iso, opciones = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return iso ? new Date(iso).toLocaleDateString(idiomas.region(), opciones) : null;
}

// Un «<!--» dentro de un subrayado confundiría las marcas de Broots: se separa con un espacio.
const sinMarcas = (texto) => String(texto ?? '').replace(/<!--/g, '< !--').replace(/-->/g, '-- >');
const cita = (texto) => sinMarcas(texto).split('\n').map((linea) => `> ${linea}`.trimEnd()).join('\n');

/** Un subrayado (o una nota suelta del Kindle) en Markdown: la cita, de dónde sale y tu nota. */
function bloque(e) {
  const lugar =
    e.origen === 'kindle'
      ? ['Kindle', e.pagina && t('club.pagina', { n: e.pagina[0] }), e.ubicacion && t('club.posicion', { n: e.ubicacion[0] }), fecha(e.fecha)]
      : [t(`cuaderno.colores.${e.color}`), e.version === 'traduccion' && t('cuaderno.enLaTraduccion'), fecha(e.fecha)];
  const meta = lugar.filter(Boolean).join(' · ');
  if (e.tipo === 'nota') return [`**✎ ${t('club.notaSuelta')}:** ${sinMarcas(e.texto)}`, `<sub>${meta}</sub>`].join('\n\n');
  return [cita(e.texto), `<sub>${meta}</sub>`, e.nota && `**✎ ${t('club.miNota')}:** ${sinMarcas(e.nota)}`].filter(Boolean).join('\n\n');
}

/** Lo que arma Broots (la parte de arriba del archivo). Sale igual con los mismos datos, así no se reescribe de más. */
function armar(libro, { entradas, kindle }) {
  const subrayados = entradas.filter((e) => e.tipo !== 'nota').length;
  const notas = entradas.filter((e) => e.nota || e.tipo === 'nota').length;
  const ultimo = entradas.map((e) => e.modificado ?? e.fecha).filter(Boolean).sort().at(-1);
  const resumen = !entradas.length
    ? t('cuaderno.sinSubrayados')
    : [t('club.subrayados', { n: subrayados }), notas && t('club.notas', { n: notas })].filter(Boolean).join(' · ');
  const partes = [
    `${MARCA_INICIO}${libro.uuid} · ${t('cuaderno.comentario')} -->`,
    `# ${sinMarcas(libro.title)}`,
    [`**${sinMarcas(libro.authors.join(', ') || t('club.autorDesconocido'))}**`, resumen, ultimo && t('cuaderno.ultimoCambio', { fecha: fecha(ultimo, { day: 'numeric', month: 'long', year: 'numeric' }) })]
      .filter(Boolean)
      .join(' · '),
  ];
  const conCapitulo = entradas.filter((e) => e.capitulo != null);
  const sinCapitulo = entradas.filter((e) => e.capitulo == null);
  let titulo = null;
  for (const e of conCapitulo) {
    const encabezado = e.titulo || t('cuaderno.seccion', { n: e.capitulo + 1 });
    if (encabezado !== titulo) partes.push(`## ${sinMarcas(encabezado)}`);
    titulo = encabezado;
    partes.push(bloque(e));
  }
  if (sinCapitulo.length) {
    if (conCapitulo.length) partes.push(`## ${t('cuaderno.delKindle')}`);
    const pista = { pendiente: 'cuaderno.pistaPendiente', ubicados: 'cuaderno.pistaNoEncontrados', error: 'cuaderno.pistaNoEncontrados' }[kindle];
    if (pista) partes.push(`_${t(pista)}_`);
    partes.push(...sinCapitulo.map(bloque));
  }
  return `${partes.join('\n\n')}\n`;
}

const zonaNueva = () => `\n\n---\n\n_${t('cuaderno.tuyo')}_\n\n`;

/** Lo que va abajo de <!-- broots:fin --> (lo tuyo), o null si el archivo no tiene esa línea. */
function zonaDe(contenido) {
  const i = contenido.indexOf(MARCA_FIN);
  return i < 0 ? null : contenido.slice(i + MARCA_FIN.length);
}

/** El .md de Broots para este libro en la carpeta data, aunque tenga otro nombre (lo reconoce por la primera línea). */
function buscarPropio(carpetaData, uuid) {
  let nombres = [];
  try {
    nombres = fs.readdirSync(carpetaData).filter((n) => n.toLowerCase().endsWith('.md'));
  } catch {
    return null;
  }
  for (const nombre of nombres) {
    const ruta = path.join(carpetaData, nombre);
    try {
      const fd = fs.openSync(ruta, 'r');
      const inicio = Buffer.alloc(200);
      const leidos = fs.readSync(fd, inicio, 0, 200, 0);
      fs.closeSync(fd);
      if (inicio.toString('utf8', 0, leidos).trimStart().startsWith(`${MARCA_INICIO}${uuid}`)) return ruta;
    } catch {}
  }
  return null;
}

/** Un nombre que no existe todavía: «x (antes).md», «x (antes 2).md»… */
function libre(ruta) {
  if (!fs.existsSync(ruta)) return ruta;
  const { dir, name, ext } = path.parse(ruta);
  for (let n = 2; ; n++) {
    const otra = path.join(dir, `${name} ${n}${ext}`);
    if (!fs.existsSync(otra)) return otra;
  }
}

/** El archivo completo: lo de Broots, la línea de fin y lo tuyo (lo que ya estaba, o el lugar vacío para empezar). */
function contenido(carpetaLibro, libro, lista) {
  const existente = carpetaLibro ? buscarPropio(path.join(carpetaLibro, CARPETA_DATA), libro.uuid) : null;
  const zona = existente ? zonaDe(fs.readFileSync(existente, 'utf8')) : null;
  return `${armar(libro, lista)}\n${MARCA_FIN}${zona ?? zonaNueva()}`;
}

/**
 * Escribe (o pone al día) el .md de un libro en <carpeta del libro>/data. Si el archivo perdió la línea
 * <!-- broots:fin --> no se sabe qué parte es tuya: se guarda aparte, tal cual («… (antes).md»), y se arma uno nuevo.
 * Devuelve { ruta, cambio }.
 */
function actualizar(carpetaLibro, libro, lista) {
  const carpetaData = path.join(carpetaLibro, CARPETA_DATA);
  let existente = buscarPropio(carpetaData, libro.uuid);
  const destino = path.join(carpetaData, nombreArchivo(libro));
  let previo = existente ? fs.readFileSync(existente, 'utf8') : null;
  if (previo != null && zonaDe(previo) == null) {
    fs.renameSync(existente, libre(destino.replace(/\.md$/i, ` (${t('cuaderno.antes')}).md`)));
    existente = null;
    previo = null;
  }
  if (!existente && !lista.entradas.length) return { ruta: null, cambio: false };
  const nuevo = `${armar(libro, lista)}\n${MARCA_FIN}${previo != null ? zonaDe(previo) : zonaNueva()}`;
  const mismoNombre = existente?.toLowerCase() === destino.toLowerCase();
  if (mismoNombre && existente === destino && previo === nuevo) return { ruta: destino, cambio: false };
  fs.mkdirSync(carpetaData, { recursive: true });
  // Primero a un temporal (que no termina en .md, para que Obsidian no lo vea) y después se renombra.
  const temporal = path.join(carpetaData, `~broots-${libro.uuid}.tmp`);
  fs.writeFileSync(temporal, nuevo, 'utf8');
  fs.renameSync(temporal, destino);
  if (existente && !mismoNombre) fs.rmSync(existente, { force: true });
  return { ruta: destino, cambio: true };
}

const huella = (valor) => crypto.createHash('sha1').update(JSON.stringify(valor)).digest('hex');

/**
 * Mantiene al día los .md, de a un libro por vez y sin apurar al resto de Broots. contexto() da lo necesario en ese
 * momento (la biblioteca puede cambiar mientras tanto): { activo, uuids(), libro(uuid) -> { libro, carpeta } | null,
 * lista(libro) -> Promise<{ entradas, kindle }> }.
 */
function crearCola(contexto) {
  const pendientes = new Set();
  let todos = false;
  let corriendo = false;
  let temporizador = null;
  const vistos = new Map(); // uuid -> { huella, ruta } de lo que ya quedó al día en esta sesión

  async function uno(ctx, uuid, forzar = false) {
    const info = ctx.libro(uuid);
    if (!info?.carpeta || !fs.existsSync(info.carpeta)) return null;
    const lista = await ctx.lista(info.libro);
    const firma = huella([info.carpeta, info.libro.title, info.libro.authors, idiomas.actual(), lista]);
    const visto = vistos.get(uuid);
    if (!forzar && visto?.huella === firma && (!visto.ruta || fs.existsSync(visto.ruta))) return visto;
    const r = actualizar(info.carpeta, info.libro, lista);
    vistos.set(uuid, { huella: firma, ruta: r.ruta });
    return r;
  }

  async function correr() {
    if (corriendo) return;
    corriendo = true;
    try {
      while (todos || pendientes.size) {
        const ctx = contexto();
        if (!ctx?.activo) {
          pendientes.clear();
          todos = false;
          break;
        }
        const lista = todos ? ctx.uuids() : [...pendientes];
        todos = false;
        pendientes.clear();
        for (const uuid of lista) {
          let escribio = false;
          try {
            escribio = Boolean((await uno(ctx, uuid))?.cambio);
          } catch (error) {
            console.error('[cuaderno] no pude poner al día el .md:', error.message);
          }
          // Entre libro y libro se deja respirar al resto de Broots (un poco más si hubo que escribir en disco).
          await new Promise((r) => (escribio ? setTimeout(r, 20) : setImmediate(r)));
        }
      }
    } finally {
      corriendo = false;
    }
  }

  return {
    /** Pone al día un libro (o todos, sin uuid) en un ratito: varios cambios seguidos se juntan en una escritura. */
    programar(uuid, demora = 1200) {
      if (uuid) pendientes.add(uuid);
      else todos = true;
      clearTimeout(temporizador);
      temporizador = setTimeout(correr, demora);
    },
    /** Pone al día un libro ya mismo (para «Mostrar el .md»). */
    async ahora(uuid) {
      const ctx = contexto();
      return ctx?.activo ? uno(ctx, uuid, true) : null;
    },
  };
}

module.exports = { armar, actualizar, contenido, crearCola, CARPETA_DATA, MARCA_FIN };
