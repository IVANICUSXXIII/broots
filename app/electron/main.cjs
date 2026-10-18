// Proceso principal: abre la ventana y es el único que toca el disco.
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeImage, nativeTheme, net, clipboard, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { detectarBibliotecaDeCalibre, esBibliotecaValida, cargarBiblioteca } = require('./library.cjs');
const envio = require('./envio.cjs');
const subrayados = require('./subrayados.cjs');
const agregado = require('./agregar.cjs');
const club = require('./club.cjs');
const edicion = require('./edicion.cjs');
const calibre = require('./calibre.cjs');
const metadatos = require('./metadatos.cjs');
const duplicados = require('./duplicados.cjs');
const lector = require('./lector.cjs');
const habito = require('./habito.cjs');
const traduccion = require('./traduccion.cjs');
const compartir = require('./compartir.cjs');
const calibrePropio = require('./calibrePropio.cjs');
const actualizaciones = require('./actualizaciones.cjs');
const idioma = require('./idioma.cjs');
const { t } = idioma;

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// Solo para pruebas: BROOTS_DATOS=carpeta usa otra configuración (p. ej. una biblioteca de prueba)
// en vez de la del usuario.
if (process.env.BROOTS_DATOS) app.setPath('userData', process.env.BROOTS_DATOS);
// Tamaños de portada servidos: thumb (grilla), media (panel de detalle) y full (original, para el visor).
const ANCHOS = { thumb: 360, media: 820 };

// Portadas: cover://thumb/<id>, cover://media/<id> y cover://full/<id> (tamaño original).
protocol.registerSchemesAsPrivileged([
  { scheme: 'cover', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // Imágenes de un EPUB abierto en el lector: libro://epub/<id>/<ruta dentro del EPUB>.
  { scheme: 'libro', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let ventana = null;
let archivos = new Map(); // id de libro -> rutas en disco (de la última carga)
let ultimaCarga = null; // { libraryPath, books } de la última carga

const rutas = {
  config: () => path.join(app.getPath('userData'), 'config.json'),
  cache: () => path.join(app.getPath('userData'), 'cache'),
  miniaturas: () => path.join(app.getPath('userData'), 'miniaturas'),
};

function leerConfig() {
  try {
    return JSON.parse(fs.readFileSync(rutas.config(), 'utf8'));
  } catch {
    return {};
  }
}

function guardarConfig(config) {
  fs.mkdirSync(path.dirname(rutas.config()), { recursive: true });
  // Primero a un archivo aparte y después se reemplaza: si algo falla a mitad, el config.json anterior queda entero.
  fs.writeFileSync(`${rutas.config()}.tmp`, JSON.stringify(config, null, 2));
  fs.renameSync(`${rutas.config()}.tmp`, rutas.config());
}

/** Antes de un cambio de formato de config.json se deja una copia del anterior (una sola vez). */
function respaldarConfig(nombre) {
  const respaldo = path.join(path.dirname(rutas.config()), nombre);
  if (!fs.existsSync(respaldo)) fs.copyFileSync(rutas.config(), respaldo);
}

// Cambios de formato de config.json, al abrir y sin perder nada:
// - hasta la 1.2.0, los integrantes de Familia se guardaban como "hijos": se pasan a "familia";
// - hasta la 1.4.0, la etiqueta de cada integrante ("Para Ana") se calculaba con el nombre: desde la 1.5.0
//   se guarda en el integrante (los que ya estaban conservan "Para <nombre>", la que tienen sus libros).
function migrarConfig() {
  let config = leerConfig();
  if (Array.isArray(config.hijos)) {
    respaldarConfig('config.antes-de-familia.json');
    const { hijos, ...resto } = config;
    const familia = Array.isArray(config.familia) ? config.familia : [];
    const nuevos = hijos.filter((h) => !familia.some((i) => i.id === h.id));
    config = { ...resto, familia: [...familia, ...nuevos] };
    guardarConfig(config);
  }
  if (Array.isArray(config.familia) && config.familia.some((i) => !i.etiqueta)) {
    respaldarConfig('config.antes-de-etiquetas.json');
    const familia = config.familia.map((i) => (i.etiqueta ? i : { ...i, etiqueta: compartir.etiquetaOriginal(i.nombre) }));
    guardarConfig({ ...config, familia });
  }
}

function cargar(libraryPath) {
  try {
    const resultado = cargarBiblioteca(libraryPath, rutas.cache());
    // Copia compartida por Broots (la biblioteca de alguien de la familia): se abre en modo solo lectura.
    resultado.datos.soloLectura = compartir.esCompartida(libraryPath);
    resultado.datos.compartidaPara = resultado.datos.soloLectura ? compartir.leerMarca(libraryPath)?.nombre ?? null : null;
    archivos = resultado.archivos;
    ultimaCarga = resultado.datos;
    return { status: 'ok', data: resultado.datos };
  } catch (error) {
    return { status: 'error', message: error.message, libraryPath };
  }
}

ipcMain.handle('library:load', () => {
  const config = leerConfig();
  let libraryPath = config.libraryPath;
  if (!libraryPath || !esBibliotecaValida(libraryPath)) {
    // En pruebas (BROOTS_DATOS) nunca se busca la biblioteca real: si la de prueba falta, no se abre nada.
    if (process.env.BROOTS_DATOS) return { status: 'no-library' };
    libraryPath = detectarBibliotecaDeCalibre();
    if (!libraryPath) return { status: 'no-library' };
    guardarConfig({ ...config, libraryPath });
  }
  return cargar(libraryPath);
});

ipcMain.handle('library:choose', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: t('main.dialogoBiblioteca'),
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths[0]) return { status: 'cancelled' };
  const libraryPath = filePaths[0];
  if (!esBibliotecaValida(libraryPath)) {
    return { status: 'invalid', message: t('main.sinMetadata') };
  }
  guardarConfig({ ...leerConfig(), libraryPath });
  return cargar(libraryPath);
});

ipcMain.handle('book:show-in-folder', (_e, bookId) => {
  const libro = archivos.get(bookId);
  if (!libro) return;
  const primerArchivo = Object.values(libro.formatos)[0];
  if (primerArchivo && fs.existsSync(primerArchivo)) shell.showItemInFolder(primerArchivo);
  else shell.openPath(libro.carpeta);
});

// Foto reducida de la ventana (1/4 del tamaño), para armar el fondo desenfocado del visor
// sin usar filtros en vivo, que en placas de video integradas causan tirones.
ipcMain.handle('ventana:instantanea', async () => {
  if (!ventana || ventana.isDestroyed()) return null;
  const imagen = await ventana.webContents.capturePage();
  const { width } = imagen.getSize();
  return imagen.resize({ width: Math.max(1, Math.round(width / 4)), quality: 'good' }).toDataURL();
});

// Tema: 'system' (como Windows), 'light' o 'dark'. Se recuerda en config.json.
const TEMAS = new Set(['system', 'light', 'dark']);
ipcMain.handle('tema:obtener', () => nativeTheme.themeSource);
ipcMain.handle('tema:cambiar', (_e, tema) => {
  if (!TEMAS.has(tema)) return;
  nativeTheme.themeSource = tema;
  guardarConfig({ ...leerConfig(), tema });
});

// ---------- Etapa 2: Kindle ----------

function bibliotecaCargada() {
  if (!ultimaCarga) throw new Error(t('main.sinCargar'));
  return ultimaCarga;
}

ipcMain.handle('envio:estado', () => envio.estado(leerConfig()));
ipcMain.handle('envio:guardar', (_e, cambios) => {
  guardarConfig(envio.actualizar(leerConfig(), cambios ?? {}));
  return envio.estado(leerConfig());
});
ipcMain.handle('envio:probar', () => envio.probar(leerConfig()));
ipcMain.handle('envio:historial', () => envio.leerHistorial(bibliotecaCargada().libraryPath));
ipcMain.handle('envio:enviar', (_e, bookId, integranteId) => {
  const { libraryPath, books } = bibliotecaCargada();
  const libro = books.find((b) => b.id === bookId);
  if (!libro) return { ok: false, mensaje: t('main.sinLibro') };
  const config = leerConfig();
  let otroDestino = null;
  if (integranteId) {
    otroDestino = (config.familia ?? []).find((i) => i.id === integranteId)?.kindle;
    if (!otroDestino) return { ok: false, mensaje: t('main.sinKindleIntegrante') };
  }
  return envio.enviar(config, libraryPath, libro, archivos.get(bookId)?.formatos ?? {}, otroDestino);
});
// Abre en el navegador la página de Google para crear contraseñas de aplicación (dirección fija).
ipcMain.handle('envio:ayuda', () => shell.openExternal('https://myaccount.google.com/apppasswords'));

ipcMain.handle('subrayados:leer', () => {
  const { libraryPath, books } = bibliotecaCargada();
  return subrayados.leerYReconocer(libraryPath, books);
});
ipcMain.handle('subrayados:ignorar', (_e, clave) => subrayados.ignorar(bibliotecaCargada().libraryPath, clave));
ipcMain.handle('subrayados:restaurar', (_e, clave) => subrayados.restaurar(bibliotecaCargada().libraryPath, clave));

function importarClippings(ruta, origen) {
  const { libraryPath, books } = bibliotecaCargada();
  if (!ruta || path.extname(ruta).toLowerCase() !== '.txt' || !fs.existsSync(ruta)) {
    return { ok: false, mensaje: t('main.elegiClippings') };
  }
  try {
    return { ok: true, ...subrayados.importar(libraryPath, ruta, books, origen) };
  } catch (error) {
    return { ok: false, mensaje: t('main.noPudeLeerArchivo', { error: error.message }) };
  }
}

ipcMain.handle('subrayados:desdeKindle', async () => {
  const hallado = await subrayados.buscarKindle(path.join(app.getPath('userData'), 'kindle'));
  if (!hallado.ruta) {
    const conocidos = ['SIN_KINDLE', 'SIN_DOCUMENTOS', 'SIN_CLIPPINGS', 'SIN_COPIA'];
    const mensaje = conocidos.includes(hallado.estado) ? t(`main.kindle.${hallado.estado}`) : t('main.kindle.otro', { detalle: hallado.mensaje ?? hallado.estado });
    return { ok: false, mensaje };
  }
  return { ...importarClippings(hallado.ruta, `kindle-${hallado.via}`), via: hallado.via };
});
ipcMain.handle('subrayados:desdeArchivo', (_e, ruta) => importarClippings(ruta, 'archivo'));
ipcMain.handle('subrayados:elegirArchivo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: t('main.dialogoClippings'),
    filters: [{ name: t('main.filtroSubrayados'), extensions: ['txt'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return { ok: false, cancelado: true };
  return importarClippings(filePaths[0], 'archivo');
});
// Agrega a Calibre un libro del Kindle que no estaba en la biblioteca y le asigna sus subrayados.
ipcMain.handle('kindle:agregarLibro', async (_e, clave) => {
  const { libraryPath } = bibliotecaCargada();
  const guardados = subrayados.leerGuardados(libraryPath);
  const pendiente = guardados.sinAsignar[clave] ?? guardados.ignorados[clave];
  if (!pendiente) return { ok: false, mensaje: t('main.yaNoPendiente') };
  const resultado = await agregado.agregarLibro(libraryPath, pendiente, path.join(app.getPath('userData'), 'kindle'));
  if (!resultado.ok) return resultado;
  // Se vuelve a leer la biblioteca (ahora con el libro nuevo) y se le asignan los subrayados.
  const carga = cargar(libraryPath);
  if (carga.status !== 'ok') return { ...resultado, mensaje: t('main.agregadoSinRecarga') };
  const nuevo = carga.data.books.find((b) => b.id === resultado.id);
  const datos = nuevo ? subrayados.asignarManual(libraryPath, clave, nuevo.uuid, carga.data.books) : subrayados.leerGuardados(libraryPath);
  return { ...resultado, biblioteca: carga, subrayados: datos };
});

ipcMain.handle('subrayados:asignar', (_e, clave, uuid) => {
  const { libraryPath, books } = bibliotecaCargada();
  return subrayados.asignarManual(libraryPath, clave, uuid, books);
});

// ---------- Etapa 3: club de lectura ----------

let ultimoExportado = null;
ipcMain.handle('club:exportar', (_e, bookId) => {
  const { libraryPath, books } = bibliotecaCargada();
  const libro = books.find((b) => b.id === bookId);
  if (!libro) return { ok: false, mensaje: t('main.sinLibro') };
  try {
    const propios = subrayados.leerGuardados(libraryPath).libros[libro.uuid]?.subrayados ?? [];
    ultimoExportado = club.exportar(libraryPath, libro, propios);
    if (!process.env.BROOTS_DATOS) shell.showItemInFolder(ultimoExportado); // en pruebas no abre ventanas
    return { ok: true, nombre: path.basename(ultimoExportado), subrayados: propios.length };
  } catch (error) {
    return { ok: false, mensaje: t('main.noPudeCrearArchivo', { error: error.message }) };
  }
});
ipcMain.handle('club:mostrarArchivo', () => ultimoExportado && shell.showItemInFolder(ultimoExportado));
// Direcciones fijas: la interfaz solo elige cuál abrir.
const SITIOS_CLUB = {
  claude: 'https://claude.ai/projects',
  notebooklm: 'https://notebooklm.google.com/',
  gemini: 'https://gemini.google.com/app',
};
ipcMain.handle('club:abrir', (_e, sitio) => SITIOS_CLUB[sitio] && shell.openExternal(SITIOS_CLUB[sitio]));
ipcMain.handle('portapapeles:copiar', (_e, texto) => clipboard.writeText(String(texto)));

// ---------- Etapa 4: editar, portadas, datos de internet, agregar, convertir, duplicados ----------
// Todas las escrituras pasan por las herramientas de Calibre (calibre.cjs) y, al terminar, se vuelve
// a leer la biblioteca: la respuesta trae { biblioteca } para que la pantalla se actualice.

const temporal = () => path.join(app.getPath('userData'), 'temporal');

function libroPorId(id) {
  return bibliotecaCargada().books.find((b) => b.id === id) ?? null;
}

/** Ejecuta una escritura y, si salió bien, devuelve también la biblioteca recargada. */
async function conRecarga(escritura) {
  const resultado = await escritura();
  if (!resultado?.ok) return resultado;
  return { ...resultado, biblioteca: cargar(bibliotecaCargada().libraryPath) };
}

/** Si llega un ISBN nuevo, se combina con los identificadores que el libro ya tenía (p. ej. el de Amazon). */
function conIdentificadores(id, cambios) {
  if (!cambios?.isbn) return cambios;
  const { isbn, ...resto } = cambios;
  return { ...resto, identifiers: { ...(libroPorId(id)?.identifiers ?? {}), isbn } };
}

ipcMain.handle('libro:editar', (_e, id, cambios) =>
  conRecarga(() => edicion.editar(bibliotecaCargada().libraryPath, id, conIdentificadores(id, cambios), bibliotecaCargada().customColumns)),
);

ipcMain.handle('libro:portadaArchivo', async (_e, id) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: t('main.dialogoPortada'),
    filters: [{ name: t('main.filtroImagenes'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return { ok: false, cancelado: true };
  return conRecarga(() => edicion.cambiarPortada(bibliotecaCargada().libraryPath, id, filePaths[0]));
});
ipcMain.handle('libro:portadaRuta', (_e, id, ruta) => {
  if (!/\.(jpe?g|png|webp|gif|bmp)$/i.test(String(ruta))) return { ok: false, mensaje: t('main.noEsImagen') };
  return conRecarga(() => edicion.cambiarPortada(bibliotecaCargada().libraryPath, id, ruta));
});
ipcMain.handle('libro:buscarPortadaWeb', (_e, id) => {
  const libro = libroPorId(id);
  if (libro) shell.openExternal(metadatos.busquedaDePortada(libro));
});

// Datos de internet: primero se busca (vista previa) y después se aplica lo que el usuario elige.
const portadasEncontradas = new Map(); // id -> ruta de la portada descargada
/** Prepara el resultado de una búsqueda para la vista previa (la portada va como imagen embebida). */
function vistaPrevia(id, r) {
  if (!r.ok) return r;
  if (r.portada) portadasEncontradas.set(id, r.portada);
  else portadasEncontradas.delete(id);
  const portada = r.portada ? `data:image/jpeg;base64,${fs.readFileSync(r.portada).toString('base64')}` : null;
  return { ok: true, datos: r.datos, portada };
}

ipcMain.handle('libro:buscarDatos', async (_e, id) => {
  const libro = libroPorId(id);
  if (!libro) return { ok: false, mensaje: t('main.sinLibro') };
  return vistaPrevia(id, await metadatos.buscar(libro, temporal(), { amazon: preferencias().amazon }));
});
ipcMain.handle('libro:buscarEnUrl', async (_e, id, url) => {
  const libro = libroPorId(id);
  if (!libro) return { ok: false, mensaje: t('main.sinLibro') };
  return vistaPrevia(id, await metadatos.buscarEnUrl(libro, url, temporal()));
});

// Formatos del libro: agregar un archivo como formato nuevo, o quitar uno.
ipcMain.handle('libro:agregarFormato', async (_e, id) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: t('main.dialogoFormato'),
    filters: [{ name: t('main.filtroLibros'), extensions: edicion.EXTENSIONES_AGREGABLES.map((e) => e.slice(1)) }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return { ok: false, cancelado: true };
  return conRecarga(() => calibre.calibredb(bibliotecaCargada().libraryPath, ['add_format', String(id), filePaths[0]]));
});
ipcMain.handle('libro:quitarFormato', (_e, id, formato) => {
  if (!/^[A-Z0-9_-]+$/.test(String(formato))) return { ok: false, mensaje: t('main.formatoInvalido') };
  return conRecarga(() => calibre.calibredb(bibliotecaCargada().libraryPath, ['remove_format', String(id), formato]));
});
ipcMain.handle('libro:aplicarDatos', (_e, id, cambios, conPortada) =>
  conRecarga(async () => {
    const { libraryPath, customColumns } = bibliotecaCargada();
    const r = await edicion.editar(libraryPath, id, conIdentificadores(id, cambios), customColumns);
    if (!r.ok || !conPortada || !portadasEncontradas.has(id)) return r;
    return edicion.cambiarPortada(libraryPath, id, portadasEncontradas.get(id));
  }),
);

ipcMain.handle('biblioteca:agregarArchivos', async (_e, rutas) => {
  const resultados = await edicion.agregarArchivos(bibliotecaCargada().libraryPath, rutas ?? []);
  const algunoOk = resultados.some((r) => r.ok);
  return { ok: true, resultados, biblioteca: algunoOk ? cargar(bibliotecaCargada().libraryPath) : undefined };
});
ipcMain.handle('biblioteca:elegirArchivos', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: t('main.dialogoAgregar'),
    filters: [{ name: t('main.filtroLibros'), extensions: edicion.EXTENSIONES_AGREGABLES.map((e) => e.slice(1)) }],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths.length) return { ok: false, cancelado: true };
  const resultados = await edicion.agregarArchivos(bibliotecaCargada().libraryPath, filePaths);
  return { ok: true, resultados, biblioteca: resultados.some((r) => r.ok) ? cargar(bibliotecaCargada().libraryPath) : undefined };
});

ipcMain.handle('libro:convertir', (_e, id, destino) => {
  if (!['EPUB', 'PDF'].includes(destino)) return { ok: false, mensaje: t('main.soloEpubPdf') };
  return conRecarga(() => edicion.convertir(bibliotecaCargada().libraryPath, id, archivos.get(id)?.formatos ?? {}, destino, temporal()));
});

// Duplicados. Los grupos que el usuario marcó como "no son duplicados" se recuerdan en .broots.
function rutaDuplicadosIgnorados() {
  return path.join(bibliotecaCargada().libraryPath, '.broots', 'duplicados-ignorados.json');
}
function leerDuplicadosIgnorados() {
  try {
    return JSON.parse(fs.readFileSync(rutaDuplicadosIgnorados(), 'utf8'));
  } catch {
    return [];
  }
}
const claveGrupo = (uuids) => [...uuids].sort().join('|');

ipcMain.handle('duplicados:buscar', () => {
  const { libraryPath, books } = bibliotecaCargada();
  const guardados = subrayados.leerGuardados(libraryPath).libros;
  const porId = new Map(books.map((b) => [b.id, b]));
  const ignorados = new Set(leerDuplicadosIgnorados());
  return duplicados
    .buscar(books, (l) => guardados[l.uuid]?.subrayados.length ?? 0)
    .filter((g) => !ignorados.has(claveGrupo(g.libros.map((id) => porId.get(id).uuid))));
});
ipcMain.handle('duplicados:ignorar', (_e, ids) => {
  const porId = new Map(bibliotecaCargada().books.map((b) => [b.id, b]));
  const lista = leerDuplicadosIgnorados();
  lista.push(claveGrupo(ids.map((id) => porId.get(id)?.uuid).filter(Boolean)));
  fs.mkdirSync(path.dirname(rutaDuplicadosIgnorados()), { recursive: true });
  fs.writeFileSync(rutaDuplicadosIgnorados(), JSON.stringify(lista, null, 1));
  return { ok: true };
});
ipcMain.handle('duplicados:resolver', (_e, conservar, descartar) =>
  conRecarga(async () => {
    const { libraryPath, books } = bibliotecaCargada();
    const porId = new Map(books.map((b) => [b.id, b]));
    const destino = porId.get(conservar);
    if (!destino || !descartar.every((id) => porId.has(id))) return { ok: false, mensaje: t('main.yaNoEstan') };
    // duplicados.resolver espera id -> { FORMATO: ruta } (no la ficha completa de archivos).
    const formatos = new Map([...archivos].map(([id, a]) => [id, a.formatos]));
    const r = await duplicados.resolver(libraryPath, conservar, descartar, formatos);
    if (r.ok) for (const id of descartar) subrayados.moverLibro(libraryPath, porId.get(id).uuid, destino.uuid, destino.title);
    return r;
  }),
);

ipcMain.handle('book:open-format', (_e, bookId, format) => {
  const archivo = archivos.get(bookId)?.formatos[format];
  if (archivo) return shell.openPath(archivo);
});

// Nota: acá se usa lectura sincrónica a propósito. En Electron 44 las lecturas con
// fs.promises dentro de protocol.handle quedaban colgadas y las portadas no cargaban.
// Son archivos chicos y las miniaturas quedan en caché, así que el costo es mínimo.
function servirPortada(request) {
  const url = new URL(request.url);
  const id = Number(url.pathname.slice(1));
  const portada = archivos.get(id)?.portada;
  if (!portada) return new Response(null, { status: 404 });

  if (url.host === 'full') return net.fetch(pathToFileURL(portada).toString());

  // Miniatura guardada en caché; la versión (?v=) cambia cuando Calibre modifica el libro.
  const version = crypto.createHash('sha1').update(String(url.searchParams.get('v'))).digest('hex').slice(0, 10);
  const ancho = ANCHOS[url.host] ?? ANCHOS.thumb;
  const destino = path.join(rutas.miniaturas(), `${id}-${version}-${ancho}.jpg`);
  const jpeg = (cuerpo) => new Response(cuerpo, { headers: { 'content-type': 'image/jpeg' } });

  if (fs.existsSync(destino)) return jpeg(fs.readFileSync(destino));

  try {
    const imagen = nativeImage.createFromBuffer(fs.readFileSync(portada));
    if (imagen.isEmpty()) return new Response(null, { status: 404 });
    const { width } = imagen.getSize();
    const miniatura = (width > ancho ? imagen.resize({ width: ancho, quality: 'good' }) : imagen).toJPEG(84);
    fs.mkdirSync(rutas.miniaturas(), { recursive: true });
    fs.writeFileSync(destino, miniatura);
    return jpeg(miniatura);
  } catch {
    return new Response(null, { status: 404 });
  }
}

// Colores de la barra de título (deben coincidir con --ventana y --tinta de index.css).
const ALTO_BARRA_TITULO = 44;
function coloresVentana() {
  return nativeTheme.shouldUseDarkColors
    ? { fondo: '#1f1f1d', simbolos: '#efece4' }
    : { fondo: '#eeecd6', simbolos: '#2b361c' };
}

// Broots recuerda dónde y de qué tamaño quedó la ventana (ventana.json); la primera vez abre maximizada.
// Solo en pruebas, BROOTS_VENTANA=ANCHOxALTO fija el tamaño (para revisar la barra de arriba en una ventana chica).
const archivoVentana = () => path.join(app.getPath('userData'), 'ventana.json');

function tamañoGuardado() {
  const prueba = process.env.BROOTS_DATOS && /^(\d+)x(\d+)$/.exec(process.env.BROOTS_VENTANA ?? '');
  if (prueba) return { width: Number(prueba[1]), height: Number(prueba[2]), maximizada: false };
  try {
    const g = JSON.parse(fs.readFileSync(archivoVentana(), 'utf8'));
    if (![g.x, g.y, g.width, g.height].every(Number.isFinite)) throw new Error('ventana.json incompleto');
    // Si quedó fuera de las pantallas de ahora (por ejemplo, se desconectó un monitor), se olvida la posición.
    const { workArea: a } = screen.getDisplayMatching(g);
    const seVe = g.x < a.x + a.width && g.x + g.width > a.x && g.y < a.y + a.height && g.y + g.height > a.y;
    return seVe ? g : { width: g.width, height: g.height, maximizada: g.maximizada };
  } catch {
    return { width: 1440, height: 920, maximizada: true };
  }
}

function recordarTamaño(win) {
  try {
    fs.writeFileSync(archivoVentana(), JSON.stringify({ ...win.getNormalBounds(), maximizada: win.isMaximized() }));
  } catch (error) {
    console.error('No pude guardar el tamaño de la ventana:', error.message);
  }
}

function crearVentana() {
  const colores = coloresVentana();
  const tamaño = tamañoGuardado();
  ventana = new BrowserWindow({
    x: tamaño.x,
    y: tamaño.y,
    width: Math.max(960, tamaño.width),
    height: Math.max(600, tamaño.height),
    minWidth: 960,
    minHeight: 600,
    title: 'Broots',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: colores.fondo,
    // Barra de título integrada al contenido, como en macOS; Windows dibuja sus botones encima.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: colores.fondo, symbolColor: colores.simbolos, height: ALTO_BARRA_TITULO },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // El festejo de una versión nueva suena al abrir, sin esperar un clic (se apaga en Configuración).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  ventana.once('ready-to-show', () => {
    if (tamaño.maximizada) ventana.maximize();
    ventana.show();
  });
  ventana.on('close', () => recordarTamaño(ventana));
  nativeTheme.on('updated', () => {
    if (ventana.isDestroyed()) return;
    const { fondo, simbolos } = coloresVentana();
    ventana.setBackgroundColor(fondo);
    ventana.setTitleBarOverlay({ color: fondo, symbolColor: simbolos, height: ALTO_BARRA_TITULO });
  });
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) evento.preventDefault();
  });

  if (DEV_URL) ventana.loadURL(DEV_URL);
  else ventana.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  configurarCaptura(ventana);
}

// ---------- Etapa 5: lector de EPUB con traducción ----------

function rutaEpub(id) {
  const ruta = archivos.get(id)?.formatos?.EPUB;
  return ruta && fs.existsSync(ruta) ? ruta : null;
}

function servirRecursoDeLibro(request) {
  // libro://epub/<id>/<ruta>: el id va en la ruta porque un número como "host" se tomaría como IP.
  const [, id, ...partes] = new URL(request.url).pathname.split('/');
  const ruta = rutaEpub(Number(id));
  if (!ruta) return new Response(null, { status: 404 });
  try {
    return lector.recurso(ruta, partes.map(decodeURIComponent).join('/'));
  } catch {
    return new Response(null, { status: 404 });
  }
}

// Datos propios de Broots: en <biblioteca>/.broots para que viajen con la biblioteca; si es una copia
// compartida (solo lectura), en esta PC, separados por biblioteca.
function carpetaDatos() {
  const { libraryPath, soloLectura } = bibliotecaCargada();
  if (!soloLectura) return path.join(libraryPath, '.broots');
  const clave = crypto.createHash('sha1').update(path.resolve(libraryPath).toLowerCase()).digest('hex').slice(0, 12);
  return path.join(app.getPath('userData'), 'bibliotecas-compartidas', clave);
}

// Por dónde va cada libro (capítulo y párrafo).
const rutaLectura = () => path.join(carpetaDatos(), 'lectura.json');
function leerLectura() {
  try {
    return JSON.parse(fs.readFileSync(rutaLectura(), 'utf8'));
  } catch {
    return {};
  }
}

ipcMain.handle('lector:abrir', (_e, id) => {
  const libro = libroPorId(id);
  const ruta = rutaEpub(id);
  if (!libro) return { ok: false, mensaje: t('main.sinLibro') };
  if (!ruta) {
    const otros = libro.formats.map((f) => f.format);
    return { ok: false, sinEpub: true, mensaje: otros.length ? t('main.lectorOtroFormato', { formatos: otros.join(', ') }) : t('main.lectorSinArchivo') };
  }
  try {
    const { estructura } = lector.abrir(ruta);
    return { ok: true, ...estructura, posicion: leerLectura()[libro.uuid] ?? null };
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
});

ipcMain.handle('lector:capitulo', (_e, id, href) => {
  const ruta = rutaEpub(id);
  if (!ruta) throw new Error(t('main.yaSinEpub'));
  return lector.capitulo(ruta, href);
});

let guardadoLectura = null;
ipcMain.handle('lector:posicion', (_e, id, posicion) => {
  const libro = libroPorId(id);
  if (!libro) return;
  // Se escribe un momento después del último cambio de página (Drive no necesita una escritura por página).
  clearTimeout(guardadoLectura);
  guardadoLectura = setTimeout(() => {
    try {
      const lectura = leerLectura();
      lectura[libro.uuid] = { ...posicion, fecha: new Date().toISOString() };
      fs.mkdirSync(path.dirname(rutaLectura()), { recursive: true });
      fs.writeFileSync(rutaLectura(), JSON.stringify(lectura, null, 1));
    } catch (error) {
      console.error('[lector] no pude guardar por dónde vas:', error.message);
    }
  }, 1500);
});

// ---------- 1.7: hábito de lectura ----------
// Sesiones y relecturas en <datos>/habito (ver habito.cjs); el estado del libro, en Calibre (calibredb).

// Cuánto dura un «minuto» del reloj de la sesión. Solo en pruebas (BROOTS_DATOS) se puede acortar con
// BROOTS_MINUTO_PRUEBA=<ms>, para probar la meta y el descanso sin esperar media hora.
ipcMain.on('habito:minuto', (evento) => {
  const prueba = process.env.BROOTS_DATOS && Number(process.env.BROOTS_MINUTO_PRUEBA);
  evento.returnValue = prueba > 0 ? prueba : 60000;
});
ipcMain.handle('habito:abrir',(_e, uuid) => habito.alAbrir(carpetaDatos(), String(uuid)));
ipcMain.handle('habito:sesion', (_e, sesion) => {
  if (!preferencias().anotarSesiones) return { ok: false, apagado: true };
  try {
    return habito.guardarSesion(carpetaDatos(), sesion);
  } catch (error) {
    console.error('[habito] no pude guardar la sesión:', error.message);
    return { ok: false };
  }
});
// Para «Mi lectura» y el panel del libro: sesiones, vueltas y por dónde va cada libro.
ipcMain.handle('habito:todo', () => ({ ...habito.todo(carpetaDatos()), posiciones: leerLectura() }));
ipcMain.handle('habito:terminar', (_e, uuid, resultado) => habito.terminar(carpetaDatos(), String(uuid), resultado));
ipcMain.handle('habito:retomar', (_e, uuid) => habito.retomar(carpetaDatos(), String(uuid)));
ipcMain.handle('habito:releer', (_e, uuid, leidoAntes) => {
  const lecturas = habito.releer(carpetaDatos(), String(uuid), Boolean(leidoAntes));
  // La vuelta nueva arranca desde el principio del libro.
  clearTimeout(guardadoLectura);
  const posiciones = leerLectura();
  delete posiciones[uuid];
  fs.mkdirSync(path.dirname(rutaLectura()), { recursive: true });
  fs.writeFileSync(rutaLectura(), JSON.stringify(posiciones, null, 1));
  return lecturas;
});
ipcMain.handle('habito:archivar', () => habito.archivar(carpetaDatos()));
// Crea la columna «Estado» en Calibre: solo con el botón (y la confirmación) del usuario.
ipcMain.handle('habito:crearColumna', () => conRecarga(() => habito.crearColumna(bibliotecaCargada().libraryPath)));
// Modo enfoque del lector: pantalla completa mientras dura.
ipcMain.handle('ventana:pantallaCompleta', (_e, activa) => {
  if (ventana && !ventana.isDestroyed()) ventana.setFullScreen(Boolean(activa));
});

ipcMain.handle('traduccion:estado',() => traduccion.estado(leerConfig()));
ipcMain.handle('traduccion:guardarClave', (_e, clave) => {
  try {
    if (!String(clave ?? '').trim()) return { ok: false, mensaje: t('main.pegaClave') };
    guardarConfig(traduccion.conClave(leerConfig(), clave, false));
    return traduccion.probar(leerConfig(), idioma.actual());
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
});
ipcMain.handle('traduccion:borrarClave', () => guardarConfig(traduccion.conClave(leerConfig(), null, true)));
ipcMain.handle('traduccion:ayuda', () => shell.openExternal('https://aistudio.google.com/apikey'));
ipcMain.handle('traduccion:traducir', (_e, id, textos, urgente) => {
  const libro = libroPorId(id);
  if (!libro) return { ok: false, mensaje: t('main.sinLibro') };
  // Siempre al idioma de Broots (cada idioma tiene su propia caché).
  return traduccion.traducir(leerConfig(), carpetaDatos(), libro.uuid, (textos ?? []).map(String), Boolean(urgente), idioma.actual());
});

// ---------- Familia: compartir libros con cada integrante ----------
// Cada integrante: { id, nombre, etiqueta, kindle, carpeta, ultimo } en config.json de esta PC. Sus libros son
// los que tienen su etiqueta ("Para <nombre>"); "Actualizar" arma la copia en su carpeta de Drive.

const familiaDe = (config) => config.familia ?? [];
const integrante = (id) => familiaDe(leerConfig()).find((i) => i.id === id);
function guardarFamilia(familia) {
  guardarConfig({ ...leerConfig(), familia });
  return { ok: true, familia };
}

ipcMain.handle('familia:estado', () => ({ familia: familiaDe(leerConfig()) }));

ipcMain.handle('familia:agregar', (_e, datos) => {
  try {
    const familia = familiaDe(leerConfig());
    return guardarFamilia([...familia, compartir.nuevoIntegrante(familia, datos, bibliotecaCargada().libraryPath)]);
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
});

ipcMain.handle('familia:cambiarKindle', (_e, id, direccion) => {
  try {
    const kindle = compartir.validarKindle(direccion);
    return guardarFamilia(familiaDe(leerConfig()).map((i) => (i.id === id ? { ...i, kindle } : i)));
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
});

// Se olvida a la persona en Broots; su carpeta en Drive y las etiquetas de los libros quedan como están.
ipcMain.handle('familia:quitar', (_e, id) => guardarFamilia(familiaDe(leerConfig()).filter((i) => i.id !== id)));

ipcMain.handle('familia:elegirCarpeta', async (_e, id) => {
  const persona = integrante(id);
  if (!persona) return { ok: false, mensaje: t('familia.sinPersona') };
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
    title: t('familia.dialogoCarpeta', { nombre: persona.nombre }),
    defaultPath: fs.existsSync(path.dirname(persona.carpeta)) ? path.dirname(persona.carpeta) : undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths[0]) return { ok: false, cancelado: true };
  const problema = compartir.validarDestino(bibliotecaCargada().libraryPath, filePaths[0]);
  if (problema) return { ok: false, mensaje: problema };
  return guardarFamilia(familiaDe(leerConfig()).map((i) => (i.id === id ? { ...i, carpeta: filePaths[0] } : i)));
});

ipcMain.handle('familia:actualizar', async (_e, id) => {
  const persona = integrante(id);
  if (!persona) return { ok: false, mensaje: t('familia.sinPersona') };
  const { libraryPath, books } = bibliotecaCargada();
  const etiqueta = compartir.etiquetaDe(persona);
  // Carpeta de cada libro relativa a la biblioteca ("Autor/Título (id)"), como la guarda Calibre.
  const libros = books
    .filter((b) => b.tags.includes(etiqueta) && archivos.get(b.id)?.carpeta)
    .map((b) => ({ id: b.id, title: b.title, path: path.relative(libraryPath, archivos.get(b.id).carpeta) }));
  if (!libros.length) return { ok: false, mensaje: t('familia.sinMarcados', { nombre: persona.nombre }) };
  const r = await compartir.sincronizar(libraryPath, persona, libros, (progreso) => {
    if (ventana && !ventana.isDestroyed()) ventana.webContents.send('familia:progreso', { id, ...progreso });
  });
  if (r.ok) guardarFamilia(familiaDe(leerConfig()).map((i) => (i.id === id ? { ...i, ultimo: { fecha: r.fecha, libros: r.libros } } : i)));
  return { ...r, familia: familiaDe(leerConfig()) };
});

/** Marca o desmarca varios libros para alguien (agrega o quita su etiqueta, "Para <nombre>"). */
ipcMain.handle('familia:marcar', (_e, id, bookIds, marcar) =>
  conRecarga(async () => {
    const persona = integrante(id);
    if (!persona) return { ok: false, mensaje: t('familia.sinPersona') };
    const etiqueta = compartir.etiquetaDe(persona);
    const { libraryPath, customColumns } = bibliotecaCargada();
    let cambiados = 0;
    for (const bookId of bookIds ?? []) {
      const libro = libroPorId(bookId);
      if (!libro || libro.tags.includes(etiqueta) === Boolean(marcar)) continue;
      const tags = marcar ? [...libro.tags, etiqueta] : libro.tags.filter((e) => e !== etiqueta);
      const r = await edicion.editar(libraryPath, bookId, { tags }, customColumns);
      if (!r.ok) return r;
      cambiados++;
    }
    return { ok: true, cambiados };
  }),
);

ipcMain.handle('familia:abrirCarpeta', (_e, id) => {
  const persona = integrante(id);
  if (persona && fs.existsSync(persona.carpeta)) shell.openPath(persona.carpeta);
});
// Google Drive en el navegador, para compartir la carpeta (dirección fija).
ipcMain.handle('familia:abrirDrive', () => shell.openExternal('https://drive.google.com/drive/my-drive'));

// ---------- Herramientas de Calibre propias (si Calibre no está instalado) ----------
// Si Calibre está instalado se usa ese; si no, Broots descarga y mantiene al día su propia copia.

let estadoCalibre = null;
function prepararCalibre(forzar = false) {
  return calibrePropio.asegurar({ instalado: Boolean(calibre.carpetaInstalada()), forzar }, (estado) => {
    estadoCalibre = estado;
    if (ventana && !ventana.isDestroyed()) ventana.webContents.send('calibre:estado', estado);
  });
}
ipcMain.handle('calibre:estado', () => estadoCalibre);
ipcMain.handle('calibre:reintentar', () => prepararCalibre(true));

// ---------- Configuración ----------
// Preferencias de Broots en config.json de esta PC. Solo se aceptan las claves conocidas.

const PREFERENCIAS = {
  // Buscar datos y portadas también en Amazon. Apagado de fábrica (desde la 1.4.0): sin él, Google Books y Open Library.
  amazon: { defecto: false, valida: (v) => typeof v === 'boolean' },
  // Idioma de Broots ('es', 'en' o 'pt'). Si nunca se eligió, el de Windows.
  idioma: { defecto: () => idioma.deWindows(), valida: idioma.valido },
  // Buscar, bajar e instalar solas las versiones nuevas (desde la 1.6.0). Apagado, solo con «Buscar ahora».
  actualizarSola: { defecto: true, valida: (v) => typeof v === 'boolean' },
  // El festejo de una versión nueva, con sonido de matasuegras (el confeti va siempre).
  festejarConSonido: { defecto: true, valida: (v) => typeof v === 'boolean' },
  // 1.7: anotar las sesiones de lectura (en .broots/habito) y el aviso de descanso para la vista (regla 20-20-20).
  anotarSesiones: { defecto: true, valida: (v) => typeof v === 'boolean' },
  descansoVista: { defecto: true, valida: (v) => typeof v === 'boolean' },
};
function preferencias() {
  const config = leerConfig();
  const defecto = (p) => (typeof p.defecto === 'function' ? p.defecto() : p.defecto);
  return Object.fromEntries(Object.entries(PREFERENCIAS).map(([clave, p]) => [clave, p.valida(config[clave]) ? config[clave] : defecto(p)]));
}

// Direcciones fijas: la interfaz solo elige cuál abrir.
const GPL3 = 'https://www.gnu.org/licenses/gpl-3.0.html';
const SITIOS = {
  calibre: 'https://calibre-ebook.com/',
  donarCalibre: 'https://calibre-ebook.com/donate',
  licenciaCalibre: GPL3,
  licenciaBroots: GPL3, // Broots también es GPL versión 3 o posterior (LICENSE en la raíz del repositorio)
  // Donaciones al autor (si se deja vacía, el botón no aparece):
  cafecito: 'https://cafecito.app/IVANICUSXXIII', // desde Argentina, en pesos
  sponsors: '', // desde otros países: la página de GitHub Sponsors del autor, cuando esté activa
  novedades: actualizaciones.PAGINA, // las versiones de Broots, con lo que cambió en cada una
};
const DONACIONES = ['cafecito', 'sponsors'];

ipcMain.handle('config:leer', () => ({
  ...preferencias(),
  version: app.getVersion(),
  donaciones: DONACIONES.filter((sitio) => SITIOS[sitio]), // qué botones de donación al autor mostrar
}));
ipcMain.handle('config:guardar', (_e, cambios) => {
  const validos = Object.entries(cambios ?? {}).filter(([clave, valor]) => PREFERENCIAS[clave]?.valida(valor));
  guardarConfig({ ...leerConfig(), ...Object.fromEntries(validos) });
  idioma.poner(leerConfig().idioma);
  return preferencias();
});
// La interfaz pregunta el idioma una sola vez, al abrir la ventana (antes de dibujar nada).
ipcMain.on('idioma:actual', (evento) => {
  evento.returnValue = idioma.actual();
});
ipcMain.handle('config:abrir', (_e, sitio) => SITIOS[sitio] && shell.openExternal(SITIOS[sitio]));

// Qué herramientas de Calibre usa Broots: las del Calibre instalado o su copia propia (y su versión).
let versionInstalada = null; // { carpeta, version }: preguntarle la versión a Calibre tarda un segundo
ipcMain.handle('config:calibre', async () => {
  const instalada = calibre.carpetaInstalada();
  if (instalada) {
    if (versionInstalada?.carpeta !== instalada) {
      const r = await calibre.ejecutar(path.join(instalada, 'calibredb.exe'), ['--version'], 30000);
      versionInstalada = { carpeta: instalada, version: /calibre ([\d.]+)/.exec(r.salida)?.[1] ?? null };
    }
    return { fuente: 'instalado', carpeta: instalada, version: versionInstalada.version };
  }
  const propia = calibrePropio.carpetaPropia();
  if (propia) return { fuente: 'propia', carpeta: propia, version: calibrePropio.versionPropia() };
  return { fuente: 'ninguna' };
});

// ---------- Actualizaciones de Broots ----------
// Una vez por día (si está prendido) pregunta en GitHub si hay versión nueva, la baja y la instala al cerrar.
// En pruebas (BROOTS_DATOS) no se consulta internet salvo que se pida con BROOTS_ACTUALIZACIONES.

const actualizacionesActivas = !process.env.BROOTS_DATOS || Boolean(actualizaciones.PRUEBA);
const NOVEDADES = require('../novedades.json'); // lo que cambió en cada versión, en los tres idiomas
let festejo = null; // { version, novedades, cafe } si esta versión se abre por primera vez después de actualizar
// (cafe: el sitio de donaciones al que invitar, o null)

function avisarActualizacion(estado) {
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('actualizacion:estado', estado);
}

/**
 * ¿Es la primera vez que se abre esta versión después de actualizar? config.json recuerda la última versión
 * abierta (versionVista, desde la 1.6.0). Si no la tiene pero ya había una biblioteca, es alguien que venía
 * de una versión anterior; si no había nada, es una instalación nueva y no hay nada que festejar.
 */
function prepararFestejo() {
  const config = leerConfig();
  const version = app.getVersion();
  const actualizo = config.versionVista ? actualizaciones.esMasNueva(version, config.versionVista) : Boolean(config.libraryPath);
  if (actualizacionesActivas && actualizo) {
    // El rincón del café: más o menos una vez cada cuatro, y solo si hay adónde invitarlo.
    const cafe = Math.random() < 0.25 ? (DONACIONES.find((s) => SITIOS[s]) ?? null) : null;
    festejo = { version, novedades: NOVEDADES[version] ?? null, cafe };
  } else if (config.versionVista !== version) {
    guardarConfig({ ...config, versionVista: version });
  }
}

ipcMain.handle('actualizacion:estado', () => actualizaciones.estadoPublico());
ipcMain.handle('actualizacion:buscar', () => {
  if (!actualizacionesActivas) return { ok: false, mensaje: t('actualizaciones.enPruebas') };
  return actualizaciones.buscar();
});
ipcMain.handle('actualizacion:avisada', (_e, version) => actualizaciones.marcarAvisada(version));
ipcMain.handle('actualizacion:frase', (_e, tipo, cantidad) => actualizaciones.siguienteFrase(tipo, cantidad));
ipcMain.handle('actualizacion:reiniciar', () => {
  if (!actualizaciones.instalar({ reabrir: true })) return { ok: false, mensaje: t('actualizaciones.nadaQueInstalar') };
  setTimeout(() => app.quit(), 300); // el instalador espera a que Broots se cierre
  return { ok: true };
});
ipcMain.handle('actualizacion:festejo', () => festejo);
ipcMain.handle('actualizacion:festejoVisto', () => {
  festejo = null;
  guardarConfig({ ...leerConfig(), versionVista: app.getVersion() });
});

function programarActualizaciones() {
  actualizaciones.configurar({
    carpeta: path.join(app.getPath('userData'), 'actualizaciones'),
    versionActual: app.getVersion(),
    empaquetado: app.isPackaged,
    alEstado: avisarActualizacion,
  });
  prepararFestejo();
  if (!actualizacionesActivas) return;
  const sola = () => preferencias().actualizarSola;
  // Cada vez que se abre Broots, unos segundos después (para no demorar el inicio). Si queda abierto, cada hora
  // se fija si ya pasaron seis horas desde la última revisión.
  setTimeout(() => sola() && actualizaciones.buscar(), actualizaciones.PRUEBA ? 1500 : 8000);
  setInterval(() => sola() && actualizaciones.tocaRevisar() && actualizaciones.buscar(), 60 * 60 * 1000);
}

// Al cerrar Broots, si hay una versión nueva bajada, se instala (el instalador sigue solo, sin ventanas).
app.on('will-quit', () => actualizaciones.instalar());

// Solo para desarrollo: `--capture=archivo.png` guarda una captura de la ventana y cierra.
// - CAPTURE_PREP: JS que se ejecuta antes (p. ej. volver a la vista grilla) y se espera.
// - CAPTURE_JS: JS de la acción a probar; su resultado se imprime como [captura].
// - CAPTURE_FRAMES="0,100,250": en vez de una captura, saca varias durante la animación
//   (archivo-0.png, archivo-100.png...), contando los milisegundos desde la acción.
function configurarCaptura(win) {
  const arg = process.argv.find((a) => a.startsWith('--capture='));
  if (!arg) return;
  const destino = arg.slice('--capture='.length);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  win.webContents.once('did-finish-load', async () => {
    // Espera a que la biblioteca esté cargada (Google Drive puede tardar), con un máximo de 30 s.
    for (let i = 0; i < 60; i++) {
      const lista = await win.webContents.executeJavaScript('!!document.querySelector("[data-tarjeta], h1")');
      if (lista) break;
      await esperar(500);
    }
    await esperar(2000);
    if (process.env.CAPTURE_PREP) {
      await win.webContents.executeJavaScript(process.env.CAPTURE_PREP);
      await esperar(1200);
    }
    const cuadros = process.env.CAPTURE_FRAMES?.split(',').map(Number);
    if (process.env.CAPTURE_JS) {
      const inicio = Date.now();
      const resultado = await win.webContents.executeJavaScript(process.env.CAPTURE_JS);
      if (resultado !== undefined) console.log('[captura]', JSON.stringify(resultado));
      if (cuadros) {
        for (const ms of cuadros) {
          await esperar(Math.max(0, inicio + ms - Date.now()));
          const imagen = await win.webContents.capturePage();
          fs.writeFileSync(destino.replace(/\.png$/, `-${ms}.png`), imagen.toPNG());
        }
        app.quit();
        return;
      }
      await esperar(1500);
    }
    const imagen = await win.webContents.capturePage();
    fs.writeFileSync(destino, imagen.toPNG());
    app.quit();
  });
}

app.whenReady().then(() => {
  try {
    migrarConfig();
  } catch (error) {
    console.error('No pude pasar config.json al formato nuevo:', error.message);
  }
  idioma.poner(leerConfig().idioma);
  // Solo para desarrollo: CAPTURE_THEME=light|dark fuerza un tema (para revisar ambos).
  const temaGuardado = leerConfig().tema;
  nativeTheme.themeSource = process.env.CAPTURE_THEME || (TEMAS.has(temaGuardado) ? temaGuardado : 'system');
  protocol.handle('cover', servirPortada);
  protocol.handle('libro', servirRecursoDeLibro);
  programarActualizaciones();
  crearVentana();
  // Unos segundos después de abrir (para no demorar el inicio), y una vez por día si Broots queda abierto.
  // En pruebas (BROOTS_DATOS) no se descarga nada salvo que se pida con BROOTS_CALIBRE_PROPIO.
  if (!process.env.BROOTS_DATOS || process.env.BROOTS_CALIBRE_PROPIO) {
    setTimeout(() => prepararCalibre(), 4000);
    setInterval(() => prepararCalibre(), 24 * 60 * 60 * 1000);
  }
});

app.on('window-all-closed', () => app.quit());
