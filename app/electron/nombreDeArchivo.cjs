// Cuando un archivo no trae datos adentro, Calibre copia su nombre como título y deja «Desconocido» de autor. Acá se saca de
// ese nombre lo que dice de verdad: título, autores, serie y editorial. Son solo reglas sobre un texto: no se abre el archivo
// ni se toca la biblioteca. Quién decide si se aplican (únicamente si el archivo no trae datos) es agregarArchivos, en edicion.cjs.
const path = require('node:path');

const COMICS = ['.cbz', '.cbr'];

// ---------- Firmas de los sitios de descarga ----------

const NOMBRES_DE_SITIOS = /^(z[ -]?lib(rary)?|1lib|b-?ok|libgen.*|library genesis|anna['’]?s[ -]?archive|pdf ?drive|ocean ?of ?pdf)(\.[a-z]{2,})*$/;
const DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|info|sk|se|is|li|rs|lc|gs|pub|to|ru|cc|me|io|co|club|site|xyz|online)$/;

function esSitio(texto) {
  const sitio = texto.trim().toLowerCase().replace(/^https?:\/\//, '');
  return sitio.startsWith('www.') || NOMBRES_DE_SITIOS.test(sitio) || DOMINIO.test(sitio);
}

/** ¿Este texto es solo la firma de sitios de descarga? («z-library.sk, 1lib.sk, z-lib.sk») */
function esMarcaDeSitio(texto) {
  const partes = String(texto).split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  return partes.length > 0 && partes.every(esSitio);
}

// ---------- Autores y serie ----------

// Lo que aparece en esos paréntesis y no es el nombre de nadie: ediciones y datos técnicos del archivo.
const NO_ES_NOMBRE = /\b(edition|edici[oó]n|edi[cç][aã]o|ed\.|reprint|revised|revisada|digital|web-?rip|scan|retail|kindle|ebook|epub|pdf|mobi)/i;
// Autores que en realidad son «varios» o «no se sabe» («Marvel Various»).
const NO_ES_PERSONA = /\b(various|varios|varias|v[aá]rios|v[aá]rias|vv\.?\s*aa\.?|aa\.?\s*vv\.?|unknown|desconocido|desconhecido)\b/i;

const puedeSerSerie = (texto) => /\p{L}/u.test(texto) && !NO_ES_NOMBRE.test(texto);
const puedeSerAutor = (texto) => puedeSerSerie(texto) && !/\d/.test(texto);

/** «David Hine, Marvel Various» -> David Hine. «Hine, David» es una sola persona, al revés. */
function autoresDe(texto) {
  const autores = texto.split(/\s*[;&]\s*/).flatMap((parte) => {
    const comas = parte.split(/\s*,\s*/).filter(Boolean);
    return comas.length === 2 && !comas[0].includes(' ') ? [`${comas[1]} ${comas[0]}`] : comas;
  });
  return autores.map((a) => a.trim()).filter((a) => a && !NO_ES_PERSONA.test(a));
}

/** «Harry Potter Book 3» -> serie y número. */
function serieDe(texto) {
  const m = /^(.*?\S)[\s,:-]+(?:(?:book|libro|livro|vol(?:ume)?\.?|tomo|#)\s*)?(\d+(?:\.\d+)?)$/i.exec(texto);
  return m ? { serie: m[1], numero: Number(m[2]) } : { serie: texto, numero: null };
}

// ---------- Que se pueda leer ----------

const MENORES = new Set('a an and as at but by for from in into nor of on or over the to with de del la las el los lo y e o u en con por para sin un una unos unas al da das do dos em no na nos nas com um uma umas uns ao aos à às'.split(' '));
const ROMANO = /^(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XVI{0,3}|XIX|XX)$/;

/** Si todo viene en mayúsculas, lo pasa a normal. Con alguna minúscula, o si es una palabra corta (NASA), queda como está. */
function sinMayusculasDeMas(texto) {
  const letras = texto.replace(/\P{L}/gu, '');
  if (letras === letras.toLowerCase() || letras !== letras.toUpperCase()) return texto;
  if (!texto.includes(' ') && letras.length <= 5) return texto;
  const palabras = texto.split(' ');
  return palabras
    .map((palabra, i) => {
      if (ROMANO.test(palabra)) return palabra;
      const baja = palabra.toLowerCase();
      if (i > 0 && i < palabras.length - 1 && MENORES.has(baja)) return baja;
      return baja.replace(/(^|-)(\P{L}*)(\p{L})/gu, (_, guion, antes, letra) => guion + antes + letra.toUpperCase());
    })
    .join(' ');
}

/** «TimTylerCowboy017» -> «Tim Tyler Cowboy 017». McDonald, iPhone y X2 quedan juntos. */
function separarPegadas(texto) {
  return texto
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/(\p{L}{2})(\d)/gu, '$1 $2')
    .replace(/(\d)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/\b(Mc|Mac) (\p{Lu})/gu, '$1$2')
    .replace(/^([ie]) (\p{Lu})/u, '$1$2');
}

// ---------- El nombre del archivo ----------

const prolijo = (texto) => String(texto).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const nombreSinExtension = (archivo) => prolijo(path.basename(archivo, path.extname(archivo)));

/** Lo mismo que hace Calibre con un nombre: lo que sigue al último « - » es el autor. */
function comoLoParteCalibre(nombre) {
  const m = /^(.+) - (.+)$/.exec(nombre);
  return m ? { titulo: m[1], autor: m[2] } : { titulo: nombre, autor: null };
}

/** El último paréntesis de un texto (siempre que antes quede algo). */
function parentesisFinal(texto) {
  const m = /^(.*?)\s*[([]([^()[\]]*)[)\]]$/.exec(texto);
  return m && m[1] ? { antes: m[1], dentro: m[2].trim() } : null;
}

/**
 * Saca la firma del sitio. Solo si la tiene se sabe qué es cada parte del nombre: sin firma, un paréntesis podría ser
 * cualquier cosa («(2016)», «(edición crítica)») y se deja donde está. Devuelve null si no hay firma.
 */
function sinFirmaDeSitio(nombre) {
  // Anna's Archive: «Título -- Autores -- Edición -- Editorial -- ISBN -- huella -- Anna's Archive»
  const porGuiones = nombre.split(/\s+--\s+/);
  if (porGuiones.length > 1 && esMarcaDeSitio(porGuiones.at(-1))) {
    return { resto: porGuiones[0], autores: porGuiones.length > 2 && puedeSerAutor(porGuiones[1]) ? autoresDe(porGuiones[1]) : [] };
  }

  // Library Genesis: «[Autores] Título (Año, Editorial) - libgen.li»
  const alFinal = /^(.+\S)\s+-\s+(\S+)$/.exec(nombre);
  if (alFinal && esMarcaDeSitio(alFinal[2])) {
    const conAutor = /^\[([^\]]+)\]\s*(.+)$/.exec(alFinal[1]);
    const resto = conAutor ? conAutor[2] : alFinal[1];
    const conEditorial = /^(.*\S)\s*\(\d{4},\s*([^()]+)\)$/.exec(resto);
    return { resto: conEditorial ? conEditorial[1] : resto, autores: conAutor ? autoresDe(conAutor[1]) : [], editorial: conEditorial?.[2] };
  }

  // Z-Library: «Título (Serie) (Autores) (sitios)». La serie y los autores son opcionales.
  const sitios = parentesisFinal(nombre);
  if (sitios && esMarcaDeSitio(sitios.dentro)) {
    const autores = parentesisFinal(sitios.antes);
    if (!autores || !puedeSerAutor(autores.dentro)) return { resto: sitios.antes, autores: [] };
    const serie = parentesisFinal(autores.antes);
    const conSerie = serie && puedeSerSerie(serie.dentro);
    return { resto: conSerie ? serie.antes : autores.antes, autores: autoresDe(autores.dentro), ...(conSerie ? serieDe(serie.dentro) : {}) };
  }

  // OceanofPDF: «OceanofPDF.com Título - Autor»
  const alPrincipio = /^(\S+\.\S+)\s+(.+)$/.exec(nombre);
  if (alPrincipio && esMarcaDeSitio(alPrincipio[1])) return { resto: alPrincipio[2], autores: [] };
  return null;
}

/**
 * Lo que dice el nombre de un archivo: { titulo, autores[], serie, numero, editorial }.
 * Devuelve null si no hay nada que mejorar respecto de lo que Calibre haría solo.
 */
function datosDelNombre(archivo) {
  const nombre = nombreSinExtension(archivo);
  const firma = sinFirmaDeSitio(nombre);
  let { resto = nombre, autores = [], serie = null, numero = null, editorial = null } = firma ?? {};

  // «TimTyler017-StandardComics»: lo que sigue al guion, si termina en Comics, es la editorial.
  const conComics = /^(.*\S)\s*-\s*([^-]*[^-\s]\s*comics)$/i.exec(resto);
  if (conComics) {
    resto = conComics[1];
    editorial = separarPegadas(conComics[2]);
  } else if (!autores.length) {
    const partido = comoLoParteCalibre(resto);
    resto = partido.titulo;
    if (partido.autor && (!firma || puedeSerAutor(partido.autor))) autores = [partido.autor];
  }

  // Las palabras pegadas se separan solo si no hay ningún espacio: con espacios, «McCoy» o «iPad» están bien como están.
  const titulo = sinMayusculasDeMas(resto.includes(' ') ? resto : separarPegadas(resto));

  // Solo en cómics y solo con ceros adelante (017): «Fahrenheit 451» no es el número 451 de nada.
  if (COMICS.includes(path.extname(archivo).toLowerCase())) {
    const conNumero = /^(.*\S)\s+#?0(\d+)$/.exec(titulo);
    if (conNumero) {
      serie ??= conNumero[1];
      numero ??= Number(conNumero[2]);
    }
  }

  const deCalibre = comoLoParteCalibre(nombre);
  const finales = autores.map(sinMayusculasDeMas);
  if (titulo === deCalibre.titulo && finales.join(' & ') === (deCalibre.autor ?? '') && !serie && !editorial) return null;
  return { titulo, autores: finales, serie: serie && sinMayusculasDeMas(serie), numero, editorial: editorial && sinMayusculasDeMas(editorial) };
}

const paraComparar = (texto) => prolijo(texto).normalize('NFC').toLowerCase();

/** ¿El título que leyó Calibre es el nombre del archivo? Es la señal de que el archivo no trae datos adentro. */
function tituloEsElNombre(titulo, archivo) {
  const nombre = paraComparar(nombreSinExtension(archivo));
  const leido = paraComparar(titulo);
  return nombre === leido || nombre.startsWith(`${leido} - `);
}

/** ¿El autor que leyó Calibre salió del nombre del archivo? («Título - Autor») */
function autorEsDelNombre(autor, archivo) {
  return paraComparar(nombreSinExtension(archivo)).endsWith(` - ${paraComparar(autor)}`);
}

module.exports = { datosDelNombre, tituloEsElNombre, autorEsDelNombre, esMarcaDeSitio };
