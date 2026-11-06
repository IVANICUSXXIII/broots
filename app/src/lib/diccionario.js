// 1.12: qué se puede definir y en qué diccionario se busca. Va sin dependencias: lo prueba también pruebas/escenarios
// desde Node. La búsqueda en sí está en electron/diccionario.cjs.

const MAX_PALABRAS = 5; // locuciones como «hacer la vista gorda»; más que eso ya es una frase para «Explicar»
const MAX_LARGO = 60;

/** ¿Se ofrece «Definir» para este texto? (una palabra o una expresión corta) */
export const definible = (texto) => {
  const limpio = String(texto ?? '').trim();
  return limpio.length > 0 && limpio.length <= MAX_LARGO && limpio.split(/\s+/).length <= MAX_PALABRAS && /\p{L}/u.test(limpio);
};

// Palabras muy comunes de cada idioma. Incluye francés, italiano y alemán para reconocer esos libros, que no tienen
// diccionario, y no buscarles las palabras en otro idioma.
const COMUNES = {
  es: 'de la a el los las del que y en un una por con para no se su es al lo como más pero sus le ya este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante fue ella había era aunque cada muchos todos hoy mi mis otros otras ese esa',
  pt: 'de a o os as do da dos das que e em um uma para com não por mais na no nas nos se como mas ao ele ela seu sua ou quando muito já também só pelo pela até isso entre depois sem mesmo aos você eu tem são foi era',
  en: 'the of and to in a is that it was for on with as he she his her at by i you not be this have had from or but they we were are an which there their would what when who',
  fr: 'le la les de des du et un une est que qui dans pour pas sur au avec ce il elle ne se mais nous vous ils cette son sa était',
  it: 'il lo la le di che e un una per con non sono del della gli si in al ma come più anche questo era',
  de: 'der die das und ist nicht ein eine zu mit von den dem auf für sich des im auch als aber wie ich sie er war',
};
const TERMINACIONES = [
  ['es', /ción$|ciones$|ñ|dad$|dades$/],
  ['pt', /ção$|ções$|ã|õ|nh[ao]s?$|lh[ao]s?$/],
  ['en', /tion$|tions$|ing$|ough|ight$/],
];
const PESOS = new Map();
for (const [idioma, lista] of Object.entries(COMUNES)) {
  for (const palabra of lista.split(' ')) PESOS.set(palabra, [...(PESOS.get(palabra) ?? []), idioma]);
}

/**
 * El idioma de un párrafo por sus palabras más comunes: 'es', 'en', 'pt', 'fr', 'it', 'de', o null si es muy corto o
 * no se distingue. Una palabra que comparten varios idiomas («que», «la») vale menos.
 */
export function detectarIdioma(texto) {
  const puntos = {};
  for (const palabra of String(texto ?? '').toLowerCase().match(/\p{L}+/gu) ?? []) {
    const idiomas = PESOS.get(palabra);
    if (idiomas) for (const idioma of idiomas) puntos[idioma] = (puntos[idioma] ?? 0) + 1 / idiomas.length;
    // Las terminaciones también delatan: «atención» y «atenção», «ñ», «station».
    for (const [idioma, regla] of TERMINACIONES) if (regla.test(palabra)) puntos[idioma] = (puntos[idioma] ?? 0) + 1;
  }
  const [primero, segundo] = Object.entries(puntos).sort((a, b) => b[1] - a[1]);
  if (!primero || primero[1] < 2 || primero[1] < (segundo?.[1] ?? 0) * 1.3) return null;
  return primero[0];
}

/** De lo que guarda Calibre o el EPUB («spa», «pt-BR», «eng»…) al idioma del diccionario. null: el libro no lo dice. */
export function idiomaDeCodigo(codigo) {
  const c = String(codigo ?? '').trim().toLowerCase();
  if (!c || c === 'und') return null;
  if (/^(es|spa)\b/.test(c)) return 'es';
  if (/^(en|eng)\b/.test(c)) return 'en';
  if (/^(pt|por)\b/.test(c)) return 'pt';
  return c.slice(0, 3);
}

/**
 * En qué diccionario buscar. Primero, lo que se ve en pantalla: un párrafo traducido por Broots está en el idioma de
 * Broots, y por el texto se reconocen las citas en otro idioma y los libros mal etiquetados en Calibre. Si el párrafo
 * no alcanza («—Sí.»), los de alrededor; después, lo que dice el libro; si no dice nada, el idioma de Broots.
 */
export function elegirDiccionario({ parrafo, vecinos, traducido, idiomaLibro, idiomaBroots }) {
  if (traducido) return idiomaBroots;
  return detectarIdioma(parrafo) ?? detectarIdioma(vecinos) ?? idiomaDeCodigo(idiomaLibro) ?? idiomaBroots;
}
