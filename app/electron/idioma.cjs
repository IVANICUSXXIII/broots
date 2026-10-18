// Idioma de Broots en el proceso principal: mensajes, títulos de los diálogos y el .md del club.
// Los textos están en idiomas/<idioma>.json (sección "electron"); la interfaz usa la sección "interfaz".
//
// El idioma se guarda en config.json ("idioma"). Si nunca se eligió, se toma el de Windows:
// es* -> español, pt* -> portugués y cualquier otro, inglés.
// Solo para pruebas: BROOTS_IDIOMA_WINDOWS=pt-BR simula un Windows en ese idioma.
const { app } = require('electron');

const TEXTOS = {
  es: require('../idiomas/es.json').electron,
  en: require('../idiomas/en.json').electron,
  pt: require('../idiomas/pt.json').electron,
};
const IDIOMAS = Object.keys(TEXTOS);
// Formato regional de cada idioma: el español sigue siendo el de Argentina.
const REGIONES = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' };

let elegido = null; // el de config.json; null = el de Windows
const reglasPlural = new Map();

/** 'es-AR' -> 'es', 'pt-BR' -> 'pt', cualquier otro -> 'en'. */
function desdeCodigo(codigo) {
  const base = String(codigo ?? '').toLowerCase().slice(0, 2);
  return base === 'es' || base === 'pt' ? base : 'en';
}

function deWindows() {
  if (process.env.BROOTS_IDIOMA_WINDOWS) return desdeCodigo(process.env.BROOTS_IDIOMA_WINDOWS);
  try {
    return desdeCodigo(app.getPreferredSystemLanguages()[0] ?? app.getLocale());
  } catch {
    return 'en';
  }
}

const valido = (id) => IDIOMAS.includes(id);
const actual = () => elegido ?? deWindows();
const region = () => REGIONES[actual()];

/** Lo llama main.cjs al arrancar y cada vez que se guarda la preferencia. */
function poner(id) {
  elegido = valido(id) ? id : null;
}

function buscar(textos, clave) {
  let nodo = textos;
  for (const parte of clave.split('.')) nodo = nodo?.[parte];
  return nodo;
}

function t(clave, variables) {
  const idioma = actual();
  let texto = buscar(TEXTOS[idioma], clave) ?? buscar(TEXTOS.es, clave);
  if (texto == null) return clave;
  if (typeof texto === 'object') {
    const n = Number(variables?.n);
    if (!reglasPlural.has(idioma)) reglasPlural.set(idioma, new Intl.PluralRules(REGIONES[idioma]));
    texto = (n === 0 && texto['0']) || texto[reglasPlural.get(idioma).select(n)] || texto.other;
  }
  return variables ? texto.replace(/\{(\w+)\}/g, (marca, nombre) => (variables[nombre] ?? marca)) : texto;
}

module.exports = { t, actual, region, poner, valido, deWindows, desdeCodigo, IDIOMAS };
