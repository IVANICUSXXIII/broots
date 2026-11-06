// Corredor de pruebas de Broots.
//
//   node pruebas/correr.mjs                 lista los escenarios
//   node pruebas/correr.mjs lector editar   corre esos escenarios
//   node pruebas/correr.mjs todos           corre todos (menos los lentos)
//   --sin-compilar                          no vuelve a compilar la interfaz
//
// Turnos: una sola corrida a la vez en toda la PC; la que llega después espera (ver tomarTurno).
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
const LIMITE_ESCENARIO = 4 * 60 * 1000; // el más largo tarda unos 2 minutos y medio: más que esto es un cuelgue
const LIMITE_LENTO = 10 * 60 * 1000; // los marcados «lento» bajan cosas de verdad

const duracion = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
};

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

function correrBroots(script, entorno, captura, limiteMs) {
  return new Promise((resolver) => {
    // BROOTS_EJECUTABLE=instalador/win-unpacked/Broots.exe prueba el programa ya empaquetado (con --sin-compilar).
    const empaquetado = process.env.BROOTS_EJECUTABLE;
    const proceso = spawn(empaquetado ?? require('electron'), [...(empaquetado ? [] : ['.']), `--capture=${captura}`], {
      cwd: APP,
      env: { ...process.env, BROOTS_DATOS: DATOS, BROOTS_IDIOMA_WINDOWS: 'es-AR', CAPTURE_JS: script, ...entorno },
    });
    let salida = '';
    proceso.stdout.on('data', (d) => (salida += d));
    proceso.stderr.on('data', (d) => (salida += d));
    let vencido = false;
    const limite = setTimeout(() => {
      vencido = true;
      proceso.kill();
    }, limiteMs);
    proceso.on('exit', () => {
      clearTimeout(limite);
      if (vencido) return resolver([{ nombre: 'terminó dentro del límite', ok: false, detalle: `lo corté a los ${duracion(limiteMs)}: la ventana se colgó o quedó frenada` }]);
      const linea = salida.split('\n').find((l) => l.startsWith('[captura] '));
      try {
        resolver(JSON.parse(JSON.parse(linea.slice('[captura] '.length))));
      } catch {
        resolver([{ nombre: 'Broots respondió', ok: false, detalle: salida.split('\n').filter((l) => /error/i.test(l)).slice(-3).join(' | ') || salida.trim().split('\n').slice(-3).join(' | ') || 'sin respuesta' }]);
      }
    });
  });
}

// ---------- Turno: una sola corrida a la vez en toda la PC ----------

// Dos corridas juntas se pisan la pantalla y los puertos, y dan fallas falsas. El aviso vive fuera de %TEMP%
// porque hay sesiones que corren con otro TEMP, y si la corrida murió sin borrarlo, el siguiente lo descarta.
const TURNO = path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'Broots-pruebas', 'turno.json');
const ESPERA_MAXIMA = 20 * 60 * 1000;
const VIEJO = 2 * 60 * 60 * 1000; // más que la corrida más larga posible: Windows puede reusar el número de un proceso muerto

function sigueVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Devuelve null si consiguió el turno, o los datos de la corrida que lo tiene. */
function tomarTurno() {
  fs.mkdirSync(path.dirname(TURNO), { recursive: true });
  try {
    fs.writeFileSync(TURNO, JSON.stringify({ pid: process.pid, inicio: Date.now(), carpeta: APP, escenarios: elegidos }), { flag: 'wx' });
    return null;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  let otra = null;
  let modificado = Date.now();
  try {
    modificado = fs.statSync(TURNO).mtimeMs;
    otra = JSON.parse(fs.readFileSync(TURNO, 'utf8'));
  } catch {
    // Otra corrida lo está escribiendo o borrando justo ahora: se vuelve a mirar en la próxima vuelta.
  }
  const abandonado = otra ? !sigueVivo(otra.pid) || Date.now() - otra.inicio > VIEJO : Date.now() - modificado > 10000;
  if (abandonado) {
    fs.rmSync(TURNO, { force: true });
    return tomarTurno();
  }
  return otra ?? { carpeta: 'otra corrida', escenarios: [] };
}

async function esperarTurno() {
  const fin = Date.now() + ESPERA_MAXIMA;
  let avisado = false;
  for (let otra = tomarTurno(); otra; otra = tomarTurno()) {
    if (!avisado) console.log(`⏳ Ya hay pruebas corriendo (${path.basename(path.dirname(otra.carpeta))}: ${otra.escenarios.join(' ') || 'sin detalle'}). Espero mi turno, hasta ${duracion(ESPERA_MAXIMA)}.`);
    avisado = true;
    if (Date.now() > fin) {
      console.log(`✗ No se liberó el turno en ${duracion(ESPERA_MAXIMA)}: no corrí nada. Si no hay pruebas abiertas, borrá ${TURNO}.`);
      process.exit(3);
    }
    await new Promise((listo) => setTimeout(listo, 5000));
  }
  // Se borra solo si es nuestro. Si matan la corrida a la fuerza esto no llega a correr, y por eso se revisa el proceso.
  process.on('exit', () => {
    try {
      if (JSON.parse(fs.readFileSync(TURNO, 'utf8')).pid === process.pid) fs.rmSync(TURNO, { force: true });
    } catch {}
  });
}

// ---------- Correr ----------

await esperarTurno();

if (!process.argv.includes('--sin-compilar')) {
  console.log('Compilando la interfaz…');
  const r = spawnSync('npx vite build', { cwd: APP, shell: true, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`No compiló:\n${r.stdout}\n${r.stderr}`);
}

const real = bibliotecaReal();
const huellaReal = huella(path.join(real, 'metadata.db'));
fs.mkdirSync(CAPTURAS, { recursive: true });
let fallas = 0;
const inicioCorrida = Date.now();
const tiempos = []; // { nombre, ms, fallo }: para el resumen del final

for (const nombre of elegidos) {
  const escenario = escenarios[nombre];
  const inicioEscenario = Date.now();
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
  const extra = typeof escenario.config === 'function' ? escenario.config({ BIBLIOTECA, COMPARTIDO, libros }) : {};
  fs.writeFileSync(path.join(DATOS, 'config.json'), JSON.stringify({ ...extra, libraryPath: BIBLIOTECA, tema: 'light' }, null, 2));

  const entorno = typeof escenario.entorno === 'function' ? escenario.entorno({ TEMP }) : escenario.entorno ?? {};
  const captura = path.join(CAPTURAS, `${nombre}.png`);
  // Un escenario puede mandarle datos a su prueba con datos() (por ejemplo, los libros que sumó en config).
  const limiteMs = escenario.lento ? LIMITE_LENTO : LIMITE_ESCENARIO;
  const resultados = await correrBroots(scriptDeVentana(escenario, { libros, total, ...escenario.datos?.() }), entorno, captura, limiteMs);
  if (escenario.verificar) resultados.push(...(await escenario.verificar({ BIBLIOTECA, COMPARTIDO, DATOS, fs, path })));

  for (const r of resultados) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ''}`);
    if (!r.ok) fallas++;
  }
  console.log(`  captura: ${captura}`);
  for (const limpiar of escenario.limpiar?.({ TEMP }) ?? []) fs.rmSync(limpiar, { recursive: true, force: true });
  const ms = Date.now() - inicioEscenario;
  tiempos.push({ nombre, ms, fallo: resultados.some((r) => !r.ok) });
  console.log(`  tiempo: ${duracion(ms)}`);
}

for (const carpeta of [BIBLIOTECA, DATOS, COMPARTIDO]) fs.rmSync(carpeta, { recursive: true, force: true });

// La comprobación más importante: la biblioteca real no se tocó.
if (huella(path.join(real, 'metadata.db')) !== huellaReal) {
  console.log('\n⚠️  LA BASE DE LA BIBLIOTECA REAL CAMBIÓ DURANTE LAS PRUEBAS. Si no usaste Broots o Calibre mientras tanto, revisalo ya (hay respaldos en .broots/respaldos).');
  process.exit(2);
}
console.log(`\nTiempos, de más a menos lento: ${[...tiempos].sort((a, b) => b.ms - a.ms).map((t) => `${t.nombre} ${duracion(t.ms)}`).join(' · ')}`);
console.log(`Total: ${duracion(Date.now() - inicioCorrida)}.`);
const conFallas = tiempos.filter((t) => t.fallo).map((t) => t.nombre);
if (conFallas.length) console.log(`Para repetir solo lo que falló: node pruebas/correr.mjs ${conFallas.join(' ')} --sin-compilar`);
console.log(`\n${fallas ? `✗ ${fallas} comprobaciones fallaron` : '✓ Todo bien'} · la biblioteca real no cambió.`);
process.exit(fallas ? 1 : 0);
