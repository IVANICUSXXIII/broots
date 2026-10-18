// Publica la versión actual de Broots en GitHub (IVANICUSXXIII/broots): sube la foto del código de esa versión
// (un commit «Broots X.Y.Z», revisado para que no lleve datos personales), arma el instalador y crea la versión
// con sus novedades. Las actualizaciones automáticas de Broots la encuentran ahí.
//
//   npm run publicar                     arma el instalador y publica el código y la versión
//   npm run publicar -- --sin-armar      lo mismo, con el instalador que ya está en instalador/
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
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const APP = path.resolve(import.meta.dirname, '..');
const REPOSITORIO = 'IVANICUSXXIII/broots';
const IDIOMAS = { es: 'Español', en: 'English', pt: 'Português' };
const ensayo = process.argv.includes('--ensayo');
const sinArmar = process.argv.includes('--sin-armar');
const soloCodigo = process.argv.includes('--solo-codigo');
const REVISION = path.join(process.env.APPDATA ?? os.homedir(), 'Broots', 'publicar', 'revision.txt');

function frenar(mensaje) {
  console.error(`\n✗ ${mensaje}`);
  process.exit(1);
}
const gh = (...argumentos) => spawnSync('gh', argumentos, { cwd: APP, encoding: 'utf8' });
const git = (carpeta, ...argumentos) => spawnSync('git', ['-C', carpeta, ...argumentos], { encoding: 'utf8' });

// 1. Versión y novedades.
const { version } = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
const novedades = JSON.parse(fs.readFileSync(path.join(APP, 'novedades.json'), 'utf8'))[version];
if (!soloCodigo) {
  for (const idioma of Object.keys(IDIOMAS)) {
    if (!Array.isArray(novedades?.[idioma]) || !novedades[idioma].length) frenar(`Faltan las novedades de la ${version} en «${idioma}» (novedades.json).`);
  }
}
const etiqueta = `v${version}`;
console.log(`Broots ${version} → github.com/${REPOSITORIO}`);

// 2. GitHub: la sesión de gh y que esta versión no esté publicada.
if (gh('auth', 'status').status !== 0) frenar('gh no tiene una sesión iniciada en GitHub (gh auth login).');
if (!soloCodigo && gh('release', 'view', etiqueta, '--repo', REPOSITORIO).status === 0) frenar(`La ${version} ya está publicada. Subí la versión en package.json.`);

// 3. El código: lo que se publica es lo que está en main, con commit (el mismo con que se arma el instalador).
// En el ensayo solo avisa, y revisa el último commit.
const avisar = (mensaje) => (ensayo ? console.log(`⚠ ${mensaje}`) : frenar(mensaje));
const raiz = git(APP, 'rev-parse', '--show-toplevel').stdout.trim();
if (git(raiz, 'status', '--porcelain').stdout.trim()) avisar('Hay cambios sin commit: hacé el commit antes de publicar.');
const enMain = git(raiz, 'rev-parse', 'HEAD').stdout.trim() === git(raiz, 'rev-parse', 'main').stdout.trim();
if (!enMain) avisar('Lo que se publica tiene que estar en main: unilo a main primero.');

// La foto: el repositorio público tal como está, con todos sus archivos reemplazados por los de main.
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'broots-publicar-'));
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

// 4. El instalador.
let archivo, notas, sha256;
if (!soloCodigo) {
  if (!sinArmar && !ensayo) {
    console.log('Armando el instalador…');
    const r = spawnSync('npm run instalador', { cwd: APP, shell: true, stdio: 'inherit' });
    if (r.status !== 0) frenar('No se pudo armar el instalador (ver arriba).');
  }
  const instalador = path.join(APP, 'instalador', `Instalar Broots ${version}.exe`);
  if (!fs.existsSync(instalador)) frenar(`No encontré «${path.relative(APP, instalador)}».`);
  const contenido = fs.readFileSync(instalador);
  sha256 = crypto.createHash('sha256').update(contenido).digest('hex');
  // En GitHub el nombre va sin espacios (los cambiaría por puntos).
  archivo = path.join(carpeta, `Instalar-Broots-${version}.exe`);
  fs.copyFileSync(instalador, archivo);

  // 5. La descripción: las novedades a la vista y, escondidas, para que Broots las muestre en su aviso.
  const lista = (idioma) => novedades[idioma].map((n) => `- ${n}`).join('\n');
  notas = [
    '## Novedades',
    '',
    lista('es'),
    '',
    `**Para instalar:** bajá «${path.basename(archivo)}» y abrilo. Si ya tenés Broots 1.6.0 o posterior, se actualiza solo. ` +
      'Si Windows dice «Windows protegió su PC», tocá «Más información» → «Ejecutar de todas formas»: el instalador todavía no tiene firma digital.',
    '',
    ...['en', 'pt'].flatMap((idioma) => [`<details><summary>${IDIOMAS[idioma]}</summary>`, '', lista(idioma), '', '</details>', '']),
    `<!-- novedades ${JSON.stringify(novedades)} -->`,
    '',
  ].join('\n');
  console.log(`Instalador: ${path.basename(archivo)} (${(contenido.length / 1024 ** 2).toFixed(0)} MB, SHA-256 ${sha256.slice(0, 16)}…)`);
}
if (ensayo) {
  if (notas) console.log(`\n--- descripción ---\n${notas}--- fin ---`);
  console.log('\nEnsayo: no se publicó nada.');
  fs.rmSync(carpeta, { recursive: true, force: true });
  process.exit(0);
}

// 6. Publicar: primero el código (con el mail anónimo de GitHub, nunca el personal) y después la versión, que
// apunta a ese commit.
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
if (soloCodigo) {
  fs.rmSync(carpeta, { recursive: true, force: true });
  process.exit(0);
}

console.log('Publicando la versión…');
const archivoNotas = path.join(carpeta, 'notas.md');
fs.writeFileSync(archivoNotas, notas);
const creada = gh('release', 'create', etiqueta, `${archivo}#Instalar Broots ${version} (Windows)`, '--repo', REPOSITORIO, '--target', commitPublico, '--title', `Broots ${version}`, '--notes-file', archivoNotas, '--latest');
if (creada.status !== 0) frenar(`GitHub no aceptó la versión:\n${creada.stderr}`);
const publicada = JSON.parse(gh('api', `repos/${REPOSITORIO}/releases/tags/${etiqueta}`).stdout || '{}');
const subido = publicada.assets?.find((a) => a.name === path.basename(archivo));
fs.rmSync(carpeta, { recursive: true, force: true });
if (subido?.digest !== `sha256:${sha256}`) frenar(`La versión se creó, pero el archivo en GitHub no coincide con el local (${subido?.digest ?? 'sin huella'}). Revisala en ${publicada.html_url}.`);
console.log(`\n✓ Publicada: ${publicada.html_url}`);
