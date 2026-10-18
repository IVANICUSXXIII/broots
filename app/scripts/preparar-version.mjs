// En GitHub Actions (.github/workflows/instalador.yml), después de armar el instalador: lo copia con el nombre que
// lleva en GitHub, calcula su huella SHA-256 y escribe la descripción de la versión. Deja las rutas y la huella como
// salidas del paso, para los pasos que siguen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { novedadesDe, nombreEnGitHub, notas } from './notas.mjs';

const APP = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
const etiqueta = `v${version}`;

function frenar(mensaje) {
  console.log(`::error::${mensaje}`);
  process.exit(1);
}

// Sobre una etiqueta se publica: tiene que ser la de la versión que dice package.json.
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== etiqueta) {
  frenar(`La etiqueta ${process.env.GITHUB_REF_NAME} no coincide con la versión de package.json (${version}).`);
}
let novedades;
try {
  novedades = novedadesDe(APP, version);
} catch (error) {
  frenar(error.message);
}

const armado = path.join(APP, 'instalador', `Instalar Broots ${version}.exe`);
if (!fs.existsSync(armado)) frenar(`No encontré «${path.relative(APP, armado)}».`);
const salida = path.join(APP, 'instalador', 'publicar');
fs.mkdirSync(salida, { recursive: true });
const archivo = path.join(salida, nombreEnGitHub(version));
fs.copyFileSync(armado, archivo);
const contenido = fs.readFileSync(archivo);
const sha256 = crypto.createHash('sha256').update(contenido).digest('hex');
const archivoNotas = path.join(salida, 'notas.md');
fs.writeFileSync(archivoNotas, notas({ version, novedades, sha256, commit: process.env.GITHUB_SHA }));

// Con barras comunes: así las entienden igual bash, gh y las acciones de GitHub.
const barras = (ruta) => ruta.replaceAll('\\', '/');
const salidas = { version, etiqueta, archivo: barras(archivo), nombre: path.basename(archivo), notas: barras(archivoNotas), sha256 };
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(salidas).map(([k, v]) => `${k}=${v}\n`).join(''));
console.log(`Instalador: ${path.basename(archivo)} (${(contenido.length / 1024 ** 2).toFixed(0)} MB, SHA-256 ${sha256})`);
