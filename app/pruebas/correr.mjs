// Corredor de pruebas de Broots.
//
//   node pruebas/correr.mjs                 lista los escenarios
//   node pruebas/correr.mjs lector editar   corre esos escenarios
//   node pruebas/correr.mjs todos           corre todos (menos los lentos)
//   --sin-compilar                          no vuelve a compilar la interfaz
//
// Seguridad: la biblioteca real SOLO se lee (se copia su metadata.db y algunos libros a %TEMP%).
// Broots corre con BROOTS_DATOS (configuración aparte), cada escenario verifica primero que la
// ventana abrió la biblioteca de prueba, y al final se comprueba que la base real no cambió.
// Idioma: se simula un Windows en español (BROOTS_IDIOMA_WINDOWS=es-AR), así las pruebas no dependen
// de la PC; un escenario puede pedir otro con su "entorno".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const APP = path.resolve(import.meta.dirname, '..');
const TEMP = os.tmpdir();
const BIBLIOTECA = path.join(TEMP, 'broots-prueba');
const DATOS = path.join(TEMP, 'broots-prueba-datos');
const CAPTURAS = path.join(TEMP, 'broots-pruebas-capturas');
const COMPARTIDO = path.join(TEMP, 'Broots compartido'); // carpeta sugerida para Familia en las pruebas

// ---------- Escenarios ----------

const carpetaEscenarios = path.join(import.meta.dirname, 'escenarios');
const escenarios = {};
for (const archivo of fs.readdirSync(carpetaEscenarios).filter((n) => n.endsWith('.mjs')).sort()) {
  escenarios[path.basename(archivo, '.mjs')] = (await import(`./escenarios/${archivo}`)).default;
}

const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!pedidos.length) {
  console.log('Escenarios disponibles:\n');
  for (const [nombre, e] of Object.entries(escenarios)) console.log(`  ${nombre.padEnd(16)} ${e.descripcion}${e.lento ? '  (lento)' : ''}`);
  console.log('\nUso: node pruebas/correr.mjs <escenario...> | todos');
  process.exit(0);
}
const elegidos = pedidos.includes('todos') ? Object.keys(escenarios).filter((n) => !escenarios[n].lento) : pedidos;
for (const nombre of elegidos) if (!escenarios[nombre]) throw new Error(`No existe el escenario «${nombre}».`);

// ---------- Biblioteca real (solo lectura) ----------

function bibliotecaReal() {
  const config = path.join(process.env.APPDATA ?? '', 'Broots', 'config.json');
  const ruta = JSON.parse(fs.readFileSync(config, 'utf8')).libraryPath;
  if (!ruta || !fs.existsSync(path.join(ruta, 'metadata.db'))) throw new Error('No encontré la biblioteca de Broots de esta PC (abrí Broots al menos una vez).');
  return ruta;
}
const huella = (archivo) => crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');

/** Elige libros de la copia según lo que pide el escenario. */
function elegirLibros(db, necesita = {}) {
  const consulta = (filtroIdioma, cantidad) =>
    db
      .prepare(
        `SELECT b.id, b.title AS titulo, b.path AS carpeta FROM books b
         JOIN data d ON d.book = b.id AND d.format = 'EPUB'
         ${filtroIdioma ? `JOIN books_languages_link x ON x.book = b.id JOIN languages l ON l.id = x.lang_code AND l.lang_code = '${filtroIdioma}'` : ''}
         WHERE d.uncompressed_size BETWEEN 300000 AND 4000000
         ORDER BY d.uncompressed_size LIMIT ?`,
      )
      .all(cantidad);
  return {
    epub: consulta(null, necesita.epub ?? 0),
    ingles: consulta('eng', necesita.ingles ?? 0),
  };
}

function copiarCarpeta(origen, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    if (e.isFile()) fs.copyFileSync(path.join(origen, e.name), path.join(destino, e.name));
  }
}

// ---------- Código que corre dentro de la ventana ----------

const AYUDAS = `
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasta = async (condicion, ms = 30000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      try { const v = condicion(); if (v) return v; } catch {}
      await esperar(250);
    }
    return null;
  };
  const resultados = [];
  const comprobar = (nombre, ok, detalle = '') => resultados.push({ nombre, ok: Boolean(ok), detalle: String(detalle ?? '').slice(0, 300) });
  const boton = (raiz, texto) => [...raiz.querySelectorAll('button')].find((b) => b.innerText.trim() === texto || b.title === texto);
  const escribir = (el, valor) => {
    const prototipo = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototipo, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  };
  const tecla = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));
`;

function scriptDeVentana(escenario, datos) {
  // "async prueba(…) {…}" (método abreviado) -> "async function prueba(…) {…}" para poder llamarla.
  const prueba = escenario.prueba.toString().replace(/^(async\s+)?prueba\s*\(/, (_, a) => `${a ?? ''}function prueba(`);
  return `(async () => {
    ${AYUDAS}
    if (!document.body.innerText.includes(${JSON.stringify(path.basename(BIBLIOTECA))})) {
      return JSON.stringify([{ nombre: 'abrió la biblioteca de prueba', ok: false, detalle: 'La ventana no muestra la biblioteca de prueba: no se probó nada.' }]);
    }
    window.confirm = () => true;
    try {
      await (${prueba})({ PRUEBA: ${JSON.stringify(datos)}, esperar, hasta, comprobar, boton, escribir, tecla });
    } catch (error) {
      comprobar('sin errores', false, error.message);
    }
    return JSON.stringify(resultados);
  })()`;
}

function correrBroots(script, entorno, captura) {
  return new Promise((resolver) => {
    const electron = require('electron');
    const proceso = spawn(electron, ['.', `--capture=${captura}`], {
      cwd: APP,
      env: { ...process.env, BROOTS_DATOS: DATOS, BROOTS_IDIOMA_WINDOWS: 'es-AR', CAPTURE_JS: script, ...entorno },
    });
    let salida = '';
    proceso.stdout.on('data', (d) => (salida += d));
    proceso.stderr.on('data', (d) => (salida += d));
    const limite = setTimeout(() => proceso.kill(), 10 * 60 * 1000);
    proceso.on('exit', () => {
      clearTimeout(limite);
      const linea = salida.split('\n').find((l) => l.startsWith('[captura] '));
      try {
        resolver(JSON.parse(JSON.parse(linea.slice('[captura] '.length))));
      } catch {
        resolver([{ nombre: 'Broots respondió', ok: false, detalle: salida.split('\n').filter((l) => /error/i.test(l)).slice(-3).join(' | ') || 'sin respuesta' }]);
      }
    });
  });
}

// ---------- Correr ----------

if (!process.argv.includes('--sin-compilar')) {
  console.log('Compilando la interfaz…');
  const r = spawnSync('npx vite build', { cwd: APP, shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`No compiló:\n${r.stdout}\n${r.stderr}`);
}

const real = bibliotecaReal();
const huellaReal = huella(path.join(real, 'metadata.db'));
fs.mkdirSync(CAPTURAS, { recursive: true });
let fallas = 0;

for (const nombre of elegidos) {
  const escenario = escenarios[nombre];
  console.log(`\n▶ ${nombre}: ${escenario.descripcion}`);

  // Biblioteca y configuración de prueba, nuevas para cada escenario.
  for (const carpeta of [BIBLIOTECA, DATOS, COMPARTIDO]) fs.rmSync(carpeta, { recursive: true, force: true });
  fs.mkdirSync(BIBLIOTECA, { recursive: true });
  fs.copyFileSync(path.join(real, 'metadata.db'), path.join(BIBLIOTECA, 'metadata.db'));
  const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
  const libros = elegirLibros(db, escenario.necesita);
  const total = db.prepare('SELECT count(*) AS n FROM books').get().n;
  db.close();
  for (const libro of [...libros.epub, ...libros.ingles]) copiarCarpeta(path.join(real, libro.carpeta), path.join(BIBLIOTECA, libro.carpeta));
  fs.mkdirSync(DATOS, { recursive: true });
  // El escenario puede sumar claves a config.json (p. ej. una configuración vieja), pero la biblioteca
  // siempre es la de prueba: libraryPath va al final para que nada la reemplace.
  const extra = typeof escenario.config === 'function' ? escenario.config({ BIBLIOTECA, COMPARTIDO }) : {};
  fs.writeFileSync(path.join(DATOS, 'config.json'), JSON.stringify({ ...extra, libraryPath: BIBLIOTECA, tema: 'light' }, null, 2));

  const entorno = typeof escenario.entorno === 'function' ? escenario.entorno({ TEMP }) : escenario.entorno ?? {};
  const captura = path.join(CAPTURAS, `${nombre}.png`);
  const resultados = await correrBroots(scriptDeVentana(escenario, { libros, total }), entorno, captura);
  if (escenario.verificar) resultados.push(...(await escenario.verificar({ BIBLIOTECA, COMPARTIDO, DATOS, fs, path })));

  for (const r of resultados) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ''}`);
    if (!r.ok) fallas++;
  }
  console.log(`  captura: ${captura}`);
  for (const limpiar of escenario.limpiar?.({ TEMP }) ?? []) fs.rmSync(limpiar, { recursive: true, force: true });
}

for (const carpeta of [BIBLIOTECA, DATOS, COMPARTIDO]) fs.rmSync(carpeta, { recursive: true, force: true });

// La comprobación más importante: la biblioteca real no se tocó.
if (huella(path.join(real, 'metadata.db')) !== huellaReal) {
  console.log('\n⚠️  LA BASE DE LA BIBLIOTECA REAL CAMBIÓ DURANTE LAS PRUEBAS. Si no usaste Broots o Calibre mientras tanto, revisalo ya (hay respaldos en .broots/respaldos).');
  process.exit(2);
}
console.log(`\n${fallas ? `✗ ${fallas} comprobaciones fallaron` : '✓ Todo bien'} · la biblioteca real no cambió.`);
process.exit(fallas ? 1 : 0);
