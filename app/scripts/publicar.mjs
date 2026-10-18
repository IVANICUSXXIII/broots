// Publica la versión actual de Broots en GitHub (IVANICUSXXIII/broots): sube la foto del código de esa versión
// (un commit «Broots X.Y.Z», revisado para que no lleve datos personales), le pone la etiqueta vX.Y.Z y le pide a
// GitHub Actions (.github/workflows/instalador.yml) que arme el instalador a partir de ese código y cree la versión
// con sus novedades. Mientras Actions trabaja, se queda mirando; al final verifica que la versión quedó publicada
// con su instalador y su huella. Las actualizaciones automáticas de Broots la encuentran ahí.
//
//   npm run publicar                     publica el código y la versión
//   npm run publicar -- --prueba-ci      sube el código y pide a Actions un armado de prueba, sin crear versión
//   npm run publicar -- --solo-codigo    sube solo la foto del código, sin crear una versión
//   npm run publicar -- --ensayo         revisa todo y muestra qué publicaría, sin publicar nada
//
// Antes: subir la versión en package.json y escribir sus novedades en novedades.json (es, en y pt), y tener todo
// en main con commit. Hace falta gh (GitHub CLI) con la sesión iniciada por alguien con permiso en la organización.
// La revisión de datos personales suma las palabras de %APPDATA%\Broots\publicar\revision.txt (una expresión
// regular por línea; vive fuera del repositorio porque esas palabras son, justamente, los datos personales).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPOSITORIO, novedadesDe, nombreEnGitHub, notas } from './notas.mjs';

const APP = path.resolve(import.meta.dirname, '..');
const WORKFLOW = 'instalador.yml';
const ensayo = process.argv.includes('--ensayo');
const soloCodigo = process.argv.includes('--solo-codigo');
const pruebaCi = process.argv.includes('--prueba-ci');
const REVISION = path.join(process.env.APPDATA ?? os.homedir(), 'Broots', 'publicar', 'revision.txt');

function frenar(mensaje) {
  console.error(`\n✗ ${mensaje}`);
  process.exit(1);
}
const gh = (...argumentos) => spawnSync('gh', argumentos, { cwd: APP, encoding: 'utf8' });
const git = (carpeta, ...argumentos) => spawnSync('git', ['-C', carpeta, ...argumentos], { encoding: 'utf8' });
const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// 1. Versión y novedades.
const { version } = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
let novedades;
if (!soloCodigo) {
  try {
    novedades = novedadesDe(APP, version);
  } catch (error) {
    frenar(error.message);
  }
}
const etiqueta = `v${version}`;
console.log(`Broots ${version} → github.com/${REPOSITORIO}`);

// 2. GitHub: la sesión de gh (con permiso para subir el workflow) y que esta versión no esté publicada.
const sesion = gh('auth', 'status');
if (sesion.status !== 0) frenar('gh no tiene una sesión iniciada en GitHub (gh auth login).');
if (!/\bworkflow\b/.test(sesion.stdout + sesion.stderr)) frenar('A la sesión de gh le falta el permiso «workflow» (gh auth refresh -s workflow).');
const publicarVersion = !soloCodigo && !pruebaCi;
if (publicarVersion && gh('release', 'view', etiqueta, '--repo', REPOSITORIO).status === 0) frenar(`La ${version} ya está publicada. Subí la versión en package.json.`);

// 3. El código: lo que se publica es lo que está en main, con commit (el mismo con que Actions arma el instalador).
// En el ensayo solo avisa, y revisa el último commit.
const avisar = (mensaje) => (ensayo ? console.log(`⚠ ${mensaje}`) : frenar(mensaje));
const raiz = git(APP, 'rev-parse', '--show-toplevel').stdout.trim();
if (git(raiz, 'status', '--porcelain').stdout.trim()) avisar('Hay cambios sin commit: hacé el commit antes de publicar.');
const enMain = git(raiz, 'rev-parse', 'HEAD').stdout.trim() === git(raiz, 'rev-parse', 'main').stdout.trim();
if (!enMain) avisar('Lo que se publica tiene que estar en main: unilo a main primero.');

// La foto: el repositorio público tal como está, con todos sus archivos reemplazados por los de main.
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'broots-publicar-'));
process.on('exit', () => fs.rmSync(carpeta, { recursive: true, force: true }));
const codigo = path.join(carpeta, 'codigo');
const clon = gh('repo', 'clone', REPOSITORIO, codigo, '--', '--quiet', '--depth', '1', '-c', 'core.autocrlf=false');
if (clon.status !== 0) frenar(`No pude bajar ${REPOSITORIO}:\n${clon.stderr}`);
git(codigo, 'rm', '-rq', '--ignore-unmatch', '.');
const tar = path.join(carpeta, 'codigo.tar');
if (git(raiz, 'archive', '--format=tar', '-o', tar, 'HEAD').status !== 0) frenar('No pude sacar la foto del código (git archive).');
// El tar de Windows: el de Git for Windows confunde «C:» con el nombre de otra computadora.
const extraer = spawnSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', tar, '-C', codigo], { encoding: 'utf8' });
if (extraer.status !== 0) frenar(`No pude abrir la foto del código:\n${extraer.stderr}`);
fs.rmSync(tar);
if (!fs.existsSync(path.join(codigo, '.github', 'workflows', WORKFLOW))) avisar(`Falta .github/workflows/${WORKFLOW}: sin él, GitHub no puede armar el instalador.`);

// Revisión de datos personales: lo general acá; lo personal (nombres, mails, cuentas), en revision.txt.
if (!fs.existsSync(REVISION)) frenar(`Falta la lista de datos personales a revisar: creá «${REVISION}» con una palabra o expresión por línea (tu nombre, tu mail, tu cuenta…).`);
const EJEMPLOS_KINDLE = new Set(['nombre', 'tu-nombre', 'name', 'your-name', 'nome', 'seu-nome', 'prueba']);
const buscadas = [
  /[a-z0-9._%+-]+@gmail\.com/gi,
  /[a-z0-9._-]+@(free\.)?kindle\.com/gi,
  /[a-z]:\\{1,2}users\\/gi, // rutas de la PC, también escritas dentro de un texto de JavaScript
  /\bg:\\/gi,
  /AIza[0-9A-Za-z_-]{20,}/g, // claves de Google (Gemini)
  /gh[pousr]_[0-9A-Za-z]{20,}/g, // claves de GitHub
  ...fs.readFileSync(REVISION, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => new RegExp(l, 'gi')),
];
const hallazgos = [];
const archivos = git(codigo, 'ls-files', '--others', '--cached', '--exclude-standard').stdout.split('\n').filter(Boolean);
for (const relativo of archivos) {
  const contenido = fs.readFileSync(path.join(codigo, relativo));
  if (contenido.includes(0)) continue; // binario (ícono, sonido)
  contenido.toString('utf8').split('\n').forEach((linea, i) => {
    for (const expresion of buscadas) {
      for (const [encontrado] of linea.matchAll(expresion)) {
        if (/@(free\.)?kindle\.com$/i.test(encontrado) && EJEMPLOS_KINDLE.has(encontrado.split('@')[0].toLowerCase())) continue;
        hallazgos.push(`  ${relativo}:${i + 1}  «${encontrado}»`);
      }
    }
  });
}
if (hallazgos.length) frenar(`El código tiene datos que no pueden ser públicos (no se publicó nada):\n${hallazgos.join('\n')}`);
console.log(`Código revisado: ${archivos.length} archivos, sin datos personales.`);

git(codigo, 'add', '-A');
const cambios = git(codigo, 'diff', '--cached', '--stat').stdout.trim();
console.log(cambios ? `Cambios en el código público:\n${cambios}` : 'El código público ya está al día.');

if (ensayo) {
  if (publicarVersion) console.log(`\nActions armaría «${nombreEnGitHub(version)}» y publicaría la versión con esta descripción:\n\n--- descripción ---\n${notas({ version, novedades })}--- fin ---`);
  if (pruebaCi) console.log('\nActions armaría el instalador de prueba, sin crear ninguna versión.');
  console.log('\nEnsayo: no se publicó nada.');
  process.exit(0);
}

// 4. El código: commit con el mail anónimo de GitHub (nunca el personal) y push a main.
if (cambios) {
  const cuenta = JSON.parse(gh('api', 'user').stdout || '{}');
  if (!cuenta.id) frenar('No pude leer la cuenta de GitHub (gh api user).');
  const mail = `${cuenta.id}+${cuenta.login}@users.noreply.github.com`;
  const commit = git(codigo, '-c', 'user.name=IVANICUSXXIII', '-c', `user.email=${mail}`, 'commit', '-q', '-m', `Broots ${version}`);
  if (commit.status !== 0) frenar(`No pude hacer el commit del código:\n${commit.stderr}`);
  const subida = git(codigo, 'push', '-q', 'origin', 'HEAD:main');
  if (subida.status !== 0) frenar(`GitHub no aceptó el código:\n${subida.stderr}`);
  console.log(`✓ Código publicado: https://github.com/${REPOSITORIO}`);
}
const commitPublico = git(codigo, 'rev-parse', 'HEAD').stdout.trim();
if (soloCodigo) process.exit(0);

// 5. La etiqueta de la versión, en ese commit. Si quedó de un intento anterior (Actions falló), se reusa.
if (publicarVersion) {
  const remota = git(codigo, 'ls-remote', '--tags', 'origin', `refs/tags/${etiqueta}`).stdout.trim().split(/\s/)[0];
  if (remota && remota !== commitPublico) frenar(`La etiqueta ${etiqueta} ya existe en GitHub y apunta a otro commit (${remota.slice(0, 7)}). Subí la versión en package.json.`);
  if (!remota) {
    git(codigo, 'tag', etiqueta, commitPublico);
    const subida = git(codigo, 'push', '-q', 'origin', `refs/tags/${etiqueta}`);
    if (subida.status !== 0) frenar(`GitHub no aceptó la etiqueta ${etiqueta}:\n${subida.stderr}`);
  }
}

// 6. Actions: sobre la etiqueta arma y publica; sobre main (--prueba-ci), arma una prueba. Recién subido, GitHub
// puede tardar unos segundos en conocer el workflow: se reintenta un minuto.
const ref = publicarVersion ? etiqueta : 'main';
const inicio = Date.now();
let pedido;
for (let intento = 0; intento < 12; intento++) {
  pedido = gh('workflow', 'run', WORKFLOW, '--repo', REPOSITORIO, '--ref', ref);
  if (pedido.status === 0) break;
  esperar(5000);
}
if (pedido.status !== 0) frenar(`No pude pedirle a GitHub Actions que arme el instalador:\n${pedido.stderr}`);
let corrida = /\/actions\/runs\/(\d+)/.exec(pedido.stdout)?.[1];
for (let intento = 0; !corrida && intento < 20; intento++) {
  esperar(3000);
  const lista = JSON.parse(gh('run', 'list', '--repo', REPOSITORIO, '--workflow', WORKFLOW, '--event', 'workflow_dispatch', '--json', 'databaseId,headBranch,createdAt', '--limit', '10').stdout || '[]');
  corrida = lista.find((c) => c.headBranch === ref && Date.parse(c.createdAt) >= inicio - 60000)?.databaseId;
}
if (!corrida) frenar(`Le pedí a Actions que arme el instalador, pero no encuentro la corrida. Mirala en https://github.com/${REPOSITORIO}/actions.`);
const enlace = `https://github.com/${REPOSITORIO}/actions/runs/${corrida}`;
console.log(`\nGitHub Actions está armando el instalador (tarda unos minutos): ${enlace}`);
if (spawnSync('gh', ['run', 'watch', String(corrida), '--repo', REPOSITORIO, '--exit-status', '--interval', '15'], { stdio: 'inherit' }).status !== 0) {
  frenar(`Actions no pudo terminar (ver ${enlace}). Ninguna copia instalada ve una versión a medias. ` +
    (publicarVersion ? 'Si fue un problema de GitHub, volvé a correr npm run publicar; si hay que cambiar el código, subí la versión.' : ''));
}

// 7. Verificar el resultado.
if (pruebaCi) {
  console.log(`\n✓ Prueba armada: el instalador y la descripción quedaron en ${enlace} (Artifacts), por 5 días. No se publicó ninguna versión.`);
  process.exit(0);
}
const ultima = JSON.parse(gh('api', `repos/${REPOSITORIO}/releases/latest`).stdout || '{}');
const subido = ultima.assets?.find((a) => a.name === nombreEnGitHub(version));
if (ultima.tag_name !== etiqueta) frenar(`Actions terminó, pero la última versión en GitHub es ${ultima.tag_name ?? 'ninguna'}, no ${etiqueta}. Revisá ${enlace}.`);
if (!subido?.digest?.startsWith('sha256:')) frenar(`La versión está publicada, pero su instalador no tiene huella. Revisala en ${ultima.html_url}.`);
console.log(`\n✓ Publicada: ${ultima.html_url}\n  Huella del instalador: ${subido.digest}`);
