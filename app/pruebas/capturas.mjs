// Capturas de pantalla para el README (docs/capturas), en tema claro y oscuro.
//
//   node pruebas/capturas.mjs                 arma la biblioteca y saca todas las capturas
//   node pruebas/capturas.mjs lector          solo esa pantalla (estanteria, editar, lector, definir, configuracion)
//   --sin-compilar                            no vuelve a compilar la interfaz
//
// Seguridad: no usa la biblioteca real para nada (ni la lee). Arma en %TEMP% una biblioteca nueva con
// clásicos de dominio público (pruebas/capturas/libros.mjs): portadas dibujadas acá, EPUB armados acá y
// cargados con las herramientas oficiales de Calibre. Broots corre con BROOTS_DATOS, como en las pruebas.
// El lector muestra Pride and Prejudice traducido: la traducción es nuestra y va a la caché de la
// biblioteca de prueba, así no hace falta Gemini (BROOTS_TRADUCCION_FALSA solo da por cargada la clave).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync } from 'fflate';
import { LIBROS, CAPITULO } from './capturas/libros.mjs';

const require = createRequire(import.meta.url);
const electron = require('electron');
const APP = path.resolve(import.meta.dirname, '..');
const SALIDA = path.resolve(APP, '..', 'docs', 'capturas');
const BASE = path.join(os.tmpdir(), 'broots-capturas');
// La biblioteca va en la carpeta Acceso público de Windows: su ruta se ve al pie de la ventana y en %TEMP% mostraría
// el nombre de usuario de la PC. Una marca adentro asegura que solo se borre la que armó este script.
if (!process.env.PUBLIC) throw new Error('No encontré la carpeta Acceso público de Windows (%PUBLIC%).');
const BIBLIOTECA = path.join(process.env.PUBLIC, 'Biblioteca');
const MARCA = path.join(BIBLIOTECA, '.broots-capturas');

function borrarBiblioteca() {
  if (!fs.existsSync(BIBLIOTECA)) return;
  if (!fs.existsSync(MARCA)) throw new Error(`${BIBLIOTECA} ya existe y no la armó este script: no la toco.`);
  fs.rmSync(BIBLIOTECA, { recursive: true, force: true });
}
const DATOS = path.join(BASE, 'datos');
const TRABAJO = path.join(BASE, 'trabajo');
const VENTANA = '1440x900';
const PANTALLAS = ['estanteria', 'editar', 'lector', 'definir', 'configuracion'];

const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const p of pedidas) if (!PANTALLAS.includes(p)) throw new Error(`No existe la pantalla «${p}» (${PANTALLAS.join(', ')}).`);

// ---------- Herramientas ----------

const CALIBREDB = [
  'C:\\Program Files\\Calibre2',
  'C:\\Program Files (x86)\\Calibre2',
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Calibre2'),
]
  .map((c) => path.join(c, 'calibredb.exe'))
  .find((c) => fs.existsSync(c));
if (!CALIBREDB) throw new Error('Hace falta Calibre instalado para armar la biblioteca de las capturas.');

function calibredb(...argumentos) {
  const r = spawnSync(CALIBREDB, [argumentos[0], '--library-path', BIBLIOTECA, ...argumentos.slice(1)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`calibredb ${argumentos[0]} falló:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const IDIOMAS = { spa: 'es', eng: 'en', por: 'pt' };

/** EPUB 3 mínimo: un capítulo (el comienzo del libro) y la portada. */
function armarEpub(libro, portada) {
  const lang = IDIOMAS[libro.idioma];
  const capitulo = libro.lector ? CAPITULO : null;
  const titulo = capitulo ? capitulo.titulo[0] : libro.titulo;
  const parrafos = capitulo ? capitulo.parrafos.map(([original]) => original) : libro.inicio;
  const xhtml = (cuerpo) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">\n<head><meta charset="utf-8"/><title>${escapar(libro.titulo)}</title></head>\n<body>\n${cuerpo}\n</body>\n</html>`;
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${escapar(libro.titulo)}</dc:title>
    ${libro.autores.map((a) => `<dc:creator>${escapar(a)}</dc:creator>`).join('')}
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    <meta name="cover" content="portada"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cap1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="portada" href="portada.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="cap1"/></spine>
</package>`;
  return zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(xhtml(`<nav epub:type="toc"><ol><li><a href="cap1.xhtml">${escapar(titulo)}</a></li></ol></nav>`)),
    'OEBPS/cap1.xhtml': strToU8(xhtml(`<h2>${escapar(titulo)}</h2>\n${parrafos.map((p) => `<p>${p}</p>`).join('\n')}`)),
    'OEBPS/portada.jpg': [fs.readFileSync(portada), { level: 0 }],
  });
}

// ---------- Biblioteca ----------

function armarBiblioteca() {
  borrarBiblioteca();
  fs.rmSync(BASE, { recursive: true, force: true });
  for (const carpeta of [BIBLIOTECA, DATOS, TRABAJO]) fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(MARCA, 'Biblioteca de las capturas de Broots (pruebas/capturas.mjs): se puede borrar.');

  console.log('Dibujando las portadas…');
  fs.writeFileSync(path.join(TRABAJO, 'libros.json'), JSON.stringify(LIBROS));
  const r = spawnSync(electron, [path.join(import.meta.dirname, 'capturas', 'portadas.cjs'), path.join(TRABAJO, 'libros.json'), TRABAJO], { encoding: 'utf8' });
  if (!fs.existsSync(path.join(TRABAJO, `${LIBROS.length - 1}.jpg`))) throw new Error(`No se dibujaron las portadas:\n${r.stderr}`);

  console.log('Cargando los libros con calibredb…');
  // Columnas propias como las de una biblioteca de verdad: Broots muestra el estado de lectura y «Mi valoración».
  calibredb('add_custom_column', '--display', JSON.stringify({ enum_values: ['Por leer', 'Leyendo', 'Leído', 'Abandonado'] }), 'read_progress', 'Estado', 'enumeration');
  calibredb('add_custom_column', 'mi_valoracion', 'Mi valoración', 'rating');
  // Al revés, así el primero de la lista queda como el último agregado (arriba de todo en la estantería).
  for (const [i, libro] of [...LIBROS.entries()].reverse()) {
    const portada = path.join(TRABAJO, `${i}.jpg`);
    const archivo = path.join(TRABAJO, `${i}.epub`);
    fs.writeFileSync(archivo, armarEpub(libro, portada));
    const serie = libro.serie ? ['--series', libro.serie, '--series-index', String(libro.indice)] : [];
    const salida = calibredb('add', '--title', libro.titulo, '--authors', libro.autores.join(' & '), '--tags', libro.etiquetas.join(','),
      '--languages', libro.idioma, '--cover', portada, ...serie, archivo);
    const id = Number(/(\d+)\s*$/.exec(salida.trim())?.[1]);
    if (!id) throw new Error(`calibredb no dijo qué id le dio a «${libro.titulo}»:\n${salida}`);
    calibredb('set_metadata', String(id), '--field', `pubdate:${libro.fecha}T12:00:00+00:00`, 
      '--field', `publisher:${libro.editorial}`, '--field', `comments:<p>${libro.descripcion}</p>`,
      ...(libro.estado ? ['--field', `#read_progress:${libro.estado}`] : []),
      // Solo tienen valoración los que ya se leyeron.
      ...(['Por leer', 'Leyendo'].includes(libro.estado) ? [] : ['--field', `#mi_valoracion:${libro.estrellas}`]));
  }
}

function idsDeLaBiblioteca() {
  const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
  const filas = db.prepare('SELECT id, title, uuid FROM books').all();
  db.close();
  const buscar = (titulo) => filas.find((f) => f.title === titulo);
  return { total: filas.length, quijote: buscar('Don Quijote de la Mancha'), lector: buscar(LIBROS.find((l) => l.lector).titulo) };
}

// ---------- Broots ----------

const AYUDAS = `
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasta = async (condicion, ms = 30000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      try { const v = condicion(); if (v) return v; } catch {}
      await esperar(250);
    }
    throw new Error('se cansó de esperar: ' + condicion.toString().slice(0, 80));
  };
  const boton = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.innerText.trim() === texto || b.title === texto);
  const portadasListas = () => [...document.querySelectorAll('[data-tarjeta] img')].every((img) => img.complete && img.naturalWidth);
  const abrirLibro = async (id) => {
    document.querySelector('[data-tarjeta="' + id + '"] button').click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(900);
    return panel;
  };
  const abrirLector = async (id) => {
    boton(await abrirLibro(id), 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    const lector = texto.closest('.fixed');
    await hasta(() => !/de (~|…)/.test(lector.querySelector('footer').innerText), 60000); // terminó de contar las páginas
    await hasta(() => !texto.querySelector('.pendiente'), 20000);
    return texto;
  };
`;

// Lo que hace cada pantalla antes de la captura (corre dentro de la ventana).
const PASOS = {
  estanteria: `await hasta(portadasListas);`,
  editar: `
    boton(await abrirLibro(IDS.quijote.id), 'Editar').click();
    await hasta(() => document.querySelector('[role="dialog"][aria-label^="Editar"]'));
    await esperar(1200);`,
  lector: `await abrirLector(IDS.lector.id); await esperar(1500);`,
  // «Definir» sobre «hidalgo», en el comienzo del Quijote. El diccionario de español es el de verdad: se baja una vez
  // (unos 18 MB) a la carpeta de datos de las capturas y la captura oscura lo reusa.
  definir: `
    const bajado = await window.lector.bajarDiccionario('es');
    if (!bajado.ok) throw new Error('no pude bajar el diccionario: ' + JSON.stringify(bajado));
    const texto = await abrirLector(IDS.quijote.id);
    const lector = texto.closest('.fixed');
    const recorte = texto.parentElement.getBoundingClientRect();
    const parrafo = () => [...texto.querySelectorAll('[data-p]')].find((p) => p.textContent.includes('hidalgo') &&
      [...p.getClientRects()].some((r) => r.right > recorte.left + 5 && r.left < recorte.right - 5));
    for (let i = 0; i < 10 && !parrafo(); i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); // la tapa no tiene texto
      await esperar(700);
    }
    const p = await hasta(parrafo, 5000);
    const recorrido = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let nodo = recorrido.nextNode();
    while (nodo && !nodo.data.includes('hidalgo')) nodo = recorrido.nextNode();
    const rango = document.createRange();
    rango.setStart(nodo, nodo.data.indexOf('hidalgo'));
    rango.setEnd(nodo, nodo.data.indexOf('hidalgo') + 'hidalgo'.length);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(rango);
    p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    (await hasta(() => lector.querySelector('[data-barra-subrayado]'), 5000)).querySelector('[data-accion="definir"]').click();
    await hasta(() => lector.querySelector('[data-tarjeta-definir="listo"]'), 15000);
    await esperar(1500);`,
  configuracion: `
    boton(document.querySelector('header'), 'Configuración').click();
    const dialogo = await hasta(() => document.querySelector('[role="dialog"][aria-label="Configuración"]'));
    dialogo.querySelector('[data-seccion="lectura"]').click();
    await hasta(() => document.querySelector('[data-config-seccion="lectura"]'));
    await esperar(1200);`,
};

function scriptDeVentana(cuerpo, ids) {
  return `(async () => {
    ${AYUDAS}
    const IDS = ${JSON.stringify(ids)};
    let resultado = null;
    try {
      // Antes que nada: que sea la biblioteca de las capturas (nombre y cantidad de libros).
      await hasta(() => document.querySelectorAll('[data-tarjeta]').length === IDS.total);
      if (!document.body.innerText.includes(${JSON.stringify(BIBLIOTECA)})) throw new Error('no es la biblioteca de las capturas');
      ${cuerpo}
      document.body.style.pointerEvents = 'none'; // sin el «hover» de donde haya quedado el mouse
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
    return JSON.stringify({ resultado });
  })()`;
}

function correrBroots({ cuerpo, ids, tema, captura }) {
  fs.writeFileSync(path.join(DATOS, 'config.json'), JSON.stringify({ libraryPath: BIBLIOTECA, tema }, null, 2));
  // El mouse a la esquina de la pantalla, fuera de la ventana: si quedaba arriba de una tarjeta, salía levantada (el
  // «hover» de CSS no se va con eventos falsos, solo moviendo el mouse de verdad).
  spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(0, 0)']);
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(electron, ['.', `--capture=${captura}`], {
      cwd: APP,
      env: {
        ...process.env, BROOTS_DATOS: DATOS, BROOTS_IDIOMA_WINDOWS: 'es-AR', BROOTS_VENTANA: VENTANA,
        BROOTS_TRADUCCION_FALSA: '1', BROOTS_DICCIONARIOS: 'real', CAPTURE_THEME: tema, CAPTURE_JS: scriptDeVentana(cuerpo, ids),
      },
    });
    let salida = '';
    proceso.stdout.on('data', (d) => (salida += d));
    proceso.stderr.on('data', (d) => (salida += d));
    const limite = setTimeout(() => proceso.kill(), 3 * 60 * 1000);
    proceso.on('exit', () => {
      clearTimeout(limite);
      const linea = salida.split('\n').find((l) => l.startsWith('[captura] '));
      try {
        const r = JSON.parse(JSON.parse(linea.slice('[captura] '.length)));
        if (r.error) throw new Error(r.error);
        resolver(r.resultado);
      } catch (error) {
        rechazar(new Error(`${path.basename(captura)}: ${error.message}\n${salida.split('\n').slice(-8).join('\n')}`));
      }
    });
  });
}

/** Lee los párrafos tal como los manda el lector a traducir y guarda nuestra traducción en la caché. */
async function prepararTraduccion(ids) {
  const originales = await correrBroots({
    ids, tema: 'light', captura: path.join(TRABAJO, 'previa.png'),
    cuerpo: `const texto = await abrirLector(IDS.lector.id);
      resultado = [...texto.querySelectorAll('[data-p]')].map((p) => p.innerHTML.replace(/^ES· /, ''));`,
  });
  const plano = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const pares = [CAPITULO.titulo, ...CAPITULO.parrafos];
  const cache = {};
  for (const original of originales) {
    const par = pares.find(([en]) => plano(en) === plano(original));
    if (!par) throw new Error(`No tengo traducción para: ${original.slice(0, 80)}`);
    cache[crypto.createHash('sha1').update(original).digest('base64url').slice(0, 20)] = par[1];
  }
  const carpeta = path.join(BIBLIOTECA, '.broots', 'traducciones');
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, `${ids.lector.uuid}.json`), JSON.stringify(cache));
  console.log(`Traducción lista: ${originales.length} párrafos.`);
}

// ---------- Correr ----------

if (!process.argv.includes('--sin-compilar')) {
  console.log('Compilando la interfaz…');
  const r = spawnSync('npx vite build', { cwd: APP, shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`No compiló:\n${r.stdout}\n${r.stderr}`);
}

armarBiblioteca();
const ids = idsDeLaBiblioteca();
await prepararTraduccion(ids);
fs.mkdirSync(SALIDA, { recursive: true });
for (const pantalla of pedidas.length ? pedidas : PANTALLAS) {
  for (const tema of ['light', 'dark']) {
    const captura = path.join(SALIDA, `${pantalla}-${tema === 'light' ? 'claro' : 'oscuro'}.png`);
    await correrBroots({ cuerpo: PASOS[pantalla], ids, tema, captura });
    console.log(`✓ ${path.relative(path.resolve(APP, '..'), captura)}`);
  }
}
borrarBiblioteca();
fs.rmSync(BASE, { recursive: true, force: true });
