// La descripción de cada versión en GitHub: las novedades a la vista y, escondidas en un comentario, para que
// Broots las muestre en su aviso de actualización (electron/actualizaciones.cjs las lee de ahí). La usan
// scripts/preparar-version.mjs (en GitHub Actions) y scripts/publicar.mjs (en el ensayo).
import fs from 'node:fs';
import path from 'node:path';

export const REPOSITORIO = 'IVANICUSXXIII/broots';
const IDIOMAS = { es: 'Español', en: 'English', pt: 'Português' };

/** Las novedades de una versión ({ es, en, pt }), o un error si falta algún idioma. */
export function novedadesDe(app, version) {
  const novedades = JSON.parse(fs.readFileSync(path.join(app, 'novedades.json'), 'utf8'))[version];
  for (const idioma of Object.keys(IDIOMAS)) {
    if (!Array.isArray(novedades?.[idioma]) || !novedades[idioma].length) throw new Error(`Faltan las novedades de la ${version} en «${idioma}» (novedades.json).`);
  }
  return novedades;
}

/** El nombre del instalador en GitHub: sin espacios (GitHub los cambiaría por puntos). */
export const nombreEnGitHub = (version) => `Instalar-Broots-${version}.exe`;

/** La descripción en Markdown. Sin sha256 o sin commit (en el ensayo), deja dicho quién los pone. */
export function notas({ version, novedades, sha256, commit }) {
  const lista = (idioma) => novedades[idioma].map((n) => `- ${n}`).join('\n');
  const huella = sha256 ? `\`${sha256}\`` : '(la calcula GitHub Actions)';
  const origen = commit ? `[${commit.slice(0, 7)}](https://github.com/${REPOSITORIO}/commit/${commit})` : '(el commit publicado)';
  return [
    '## Novedades',
    '',
    lista('es'),
    '',
    `**Para instalar:** bajá «${nombreEnGitHub(version)}» y abrilo. Si ya tenés Broots 1.6.0 o posterior, se actualiza solo. ` +
      'Si Windows dice «Windows protegió su PC», tocá «Más información» → «Ejecutar de todas formas»: el instalador todavía no tiene firma digital.',
    '',
    `**Huella SHA-256:** ${huella}. Lo armó GitHub Actions a partir del código de ${origen}, ` +
      `con [constancia de origen](https://github.com/${REPOSITORIO}/attestations).`,
    '',
    ...['en', 'pt'].flatMap((idioma) => [`<details><summary>${IDIOMAS[idioma]}</summary>`, '', lista(idioma), '', '</details>', '']),
    `<!-- novedades ${JSON.stringify(novedades)} -->`,
    '',
  ].join('\n');
}
