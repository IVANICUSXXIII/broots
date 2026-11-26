// 1.14: el texto de una página de PDF. Un PDF no sabe de párrafos: es una lista de «poné estas letras en tal lugar».
// pdf.js nos da esos pedazos (getTextContent) y con ellos arma la capa de texto invisible que se selecciona con el mouse.
// Acá, con cuentas puras sobre esos mismos pedazos:
// - el texto de la página tal como lo cuenta la capa (sus pedazos pegados, sin nada entre línea y línea): ahí se anclan
//   los subrayados, con «desde qué letra hasta qué letra»;
// - las líneas y los párrafos (deducidos por la distancia entre líneas, la sangría y las líneas cortas), para traducir
//   y para darle contexto a «Explicar» y «Definir»;
// - si la página no tiene texto (escaneada) o lo tiene «roto» (símbolos que pdf.js no sabe leer).
import { normalizar } from './subrayados.js';

const LETRA = /[\p{L}\p{N}]/gu;
const RARO = /[-�\u0000-\u0008\u000E-\u001F]/gu; // uso privado, «carácter desconocido» y controles
const FIN_DE_FRASE = /[.!?:;»"”)…]\s*$/u;
const GUION_FINAL = /[-­‐]$/u;

const mediana = (valores) => {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[orden.length >> 1];
};

/** Junta dos pedazos de texto de líneas seguidas: une «pala-» + «bra» y, si no, deja un espacio. */
export function juntarLineas(antes, despues) {
  if (!antes) return despues;
  if (!despues) return antes;
  if (GUION_FINAL.test(antes) && /^\p{Ll}/u.test(despues)) return antes.replace(GUION_FINAL, '') + despues;
  return /\s$/.test(antes) || /^\s/.test(despues) ? antes + despues : `${antes} ${despues}`;
}

/**
 * Arma el modelo de una página a partir de los pedazos de pdf.js ({ str, hasEOL, transform, width, height }).
 * Devuelve { texto, lineas, parrafos, letras, raros, sinTexto, roto }:
 * - texto: los pedazos pegados, igual que el textContent de la capa de texto (las anclas cuentan sobre esto);
 * - lineas: [{ desde, hasta, texto, x, y, alto, derecha, parrafo }];
 * - parrafos: [{ desde, hasta, texto }] con las líneas ya unidas (sin guiones de corte).
 */
export function modeloDePagina(items) {
  let texto = '';
  const lineas = [];
  let linea = null;
  const cerrarLinea = () => {
    if (linea && linea.hasta > linea.desde) lineas.push(linea);
    linea = null;
  };
  for (const item of items ?? []) {
    if (typeof item?.str !== 'string') continue;
    const [, , , d = 0, x = 0, y = 0] = item.transform ?? [];
    const alto = Math.abs(item.height || d || 0);
    // Una línea nueva también si el renglón cambió aunque pdf.js no lo haya marcado.
    if (linea && item.str && Math.abs(y - linea.y) > Math.max(2, Math.min(alto, linea.alto) * 0.6)) cerrarLinea();
    const desde = texto.length;
    texto += item.str;
    if (item.str.trim()) {
      if (!linea) linea = { desde, hasta: desde, texto: '', x, y, alto, derecha: x };
      linea.hasta = texto.length;
      linea.texto += item.str;
      linea.x = Math.min(linea.x, x);
      linea.alto = Math.max(linea.alto, alto);
      linea.derecha = Math.max(linea.derecha, x + (item.width || 0));
    } else if (linea) {
      linea.hasta = texto.length;
      linea.texto += item.str;
    }
    if (item.hasEOL) cerrarLinea();
  }
  cerrarLinea();
  for (const l of lineas) l.texto = l.texto.replace(/\s+/g, ' ').trim();

  const parrafos = agruparParrafos(lineas);
  const letras = (texto.match(LETRA) ?? []).length;
  const raros = (texto.match(RARO) ?? []).length;
  return { texto, lineas, parrafos, letras, raros, sinTexto: letras < 3, roto: raros > 20 && raros > letras * 0.3 };
}

/** Las líneas en párrafos: corta donde hay más aire que de costumbre, otra letra, sangría o una línea corta que cierra una frase. */
export function agruparParrafos(lineas) {
  const utiles = lineas.filter((l) => l.texto);
  if (!utiles.length) return [];
  const altoTipico = mediana(utiles.map((l) => l.alto)) || 10;
  const saltos = [];
  for (let i = 1; i < utiles.length; i++) {
    const salto = utiles[i - 1].y - utiles[i].y;
    if (salto > 0 && salto < altoTipico * 3) saltos.push(salto);
  }
  // Con pocas líneas no hay cómo medir el interlineado (lo que se mide puede ser justo el aire entre dos párrafos):
  // se usa el de costumbre para esa letra.
  const interlineado = saltos.length >= 4 ? mediana(saltos) : altoTipico * 1.3;
  const margen = Math.min(...utiles.map((l) => l.x));
  const anchoTipico = mediana(utiles.map((l) => l.derecha - l.x)) || 1;

  const parrafos = [];
  let actual = null;
  utiles.forEach((l, i) => {
    const previa = utiles[i - 1];
    let nuevo = !previa;
    if (previa) {
      const salto = previa.y - l.y;
      const otraLetra = Math.abs(l.alto - previa.alto) > Math.max(previa.alto, l.alto) * 0.2;
      const sangria = l.x - margen > altoTipico * 0.8 && previa.x - margen <= altoTipico * 0.8;
      const cortaYCierra = previa.derecha - previa.x < anchoTipico * 0.72 && FIN_DE_FRASE.test(previa.texto);
      // salto < 0: la línea está más arriba que la anterior (otra columna o una nota al margen).
      nuevo = salto < -altoTipico * 0.5 || salto > interlineado * 1.45 || otraLetra || sangria || cortaYCierra;
    }
    if (nuevo) {
      actual = { desde: l.desde, hasta: l.hasta, texto: l.texto };
      parrafos.push(actual);
    } else {
      actual.hasta = l.hasta;
      actual.texto = juntarLineas(actual.texto, l.texto);
    }
    l.parrafo = parrafos.length - 1; // textoEntre lo usa para saber dónde va un salto de línea
  });
  return parrafos;
}

/** El párrafo de la página donde cae una letra (o el más cercano antes). */
export function parrafoEn(modelo, lugar) {
  let elegido = modelo?.parrafos?.[0] ?? null;
  for (const p of modelo?.parrafos ?? []) if (p.desde <= lugar) elegido = p;
  return elegido;
}

/**
 * El texto legible entre dos letras de una página: las líneas unidas con un espacio (o sin el guion de corte) y los
 * párrafos separados por un salto de línea. Es lo que se muestra y se guarda de un subrayado.
 */
export function textoEntre(modelo, desde, hasta) {
  const partes = []; // [{ parrafo, texto }]
  for (const l of modelo.lineas) {
    if (l.hasta <= desde || l.desde >= hasta) continue;
    const pedazo = modelo.texto.slice(Math.max(desde, l.desde), Math.min(hasta, l.hasta)).replace(/\s+/g, ' ').trim();
    if (!pedazo) continue;
    const previa = partes.at(-1);
    if (previa && previa.parrafo === l.parrafo) previa.texto = juntarLineas(previa.texto, pedazo);
    else partes.push({ parrafo: l.parrafo, texto: pedazo });
  }
  return partes.map((p) => p.texto).join('\n');
}

/** Para comparar textos de un PDF: normalizados y sin ningún espacio (en la capa, las líneas van pegadas). */
export const compacto = (texto) => normalizar(texto).replace(/ /g, '');

/**
 * Busca un texto en el de una página sin importar espacios, tildes ni signos. Devuelve { inicio, fin } en el texto de
 * la página (como lo cuenta la capa) o null. Si aparece varias veces, gana la más cercana a «cerca».
 */
export function buscarEnPagina(textoPagina, aguja, cerca = 0) {
  const buscada = compacto(aguja);
  if (buscada.length < 4) return null;
  let plano = '';
  const lugar = [];
  for (let i = 0; i < textoPagina.length; i++) {
    const base = compacto(textoPagina[i]);
    for (const c of base) {
      plano += c;
      lugar.push(i);
    }
  }
  let mejor = -1;
  for (let k = plano.indexOf(buscada), vueltas = 0; k >= 0 && vueltas < 200; k = plano.indexOf(buscada, k + 1), vueltas++) {
    if (mejor < 0 || Math.abs(lugar[k] - cerca) < Math.abs(lugar[mejor] - cerca)) mejor = k;
  }
  if (mejor < 0) return null;
  return { inicio: lugar[mejor], fin: lugar[mejor + buscada.length - 1] + 1 };
}

/** Lugar en el texto de una capa de un punto del DOM (nodo + desplazamiento), como lo cuenta textContent. */
function lugarEn(capa, nodo, desplazamiento) {
  const rango = document.createRange();
  rango.setStart(capa, 0);
  rango.setEnd(nodo, desplazamiento);
  return rango.toString().length;
}

/**
 * Selección del mouse -> ancla en las páginas a la vista. capas: [[pagina, { el, modelo }]] en orden de página.
 * Devuelve { parrafo (página donde empieza), inicio, parrafoFin (página donde termina), fin, texto } o null.
 * «parrafo» se llama así a propósito: es el mismo campo que usa el EPUB, y en un PDF lo ocupa la página.
 */
export function anclaDeSeleccionPdf(seleccion, capas) {
  if (!seleccion?.rangeCount || seleccion.isCollapsed) return null;
  const rango = seleccion.getRangeAt(0);
  const tocadas = capas.filter(([, c]) => rango.intersectsNode(c.el));
  if (!tocadas.length) return null;
  let [parrafo, primera] = tocadas[0];
  let [parrafoFin, ultima] = tocadas.at(-1);
  let inicio = primera.el.contains(rango.startContainer) ? lugarEn(primera.el, rango.startContainer, rango.startOffset) : 0;
  let fin = ultima.el.contains(rango.endContainer) ? lugarEn(ultima.el, rango.endContainer, rango.endOffset) : ultima.modelo.texto.length;
  // Sin espacios en las puntas (y si una punta quedó en el borde de una página, pasa a la otra).
  if (parrafo !== parrafoFin && !primera.modelo.texto.slice(inicio).trim()) [parrafo, primera, inicio] = [parrafoFin, ultima, 0];
  if (parrafo !== parrafoFin && !ultima.modelo.texto.slice(0, fin).trim()) [parrafoFin, ultima, fin] = [parrafo, primera, primera.modelo.texto.length];
  while (inicio < primera.modelo.texto.length && /\s/.test(primera.modelo.texto[inicio])) inicio++;
  while (fin > 0 && /\s/.test(ultima.modelo.texto[fin - 1])) fin--;
  if (parrafo === parrafoFin && fin <= inicio) return null;
  let texto = textoEntre(primera.modelo, inicio, parrafo === parrafoFin ? fin : primera.modelo.texto.length);
  if (parrafo !== parrafoFin) {
    // De una página a la otra: si la frase sigue, va con un espacio (o sin el guion de corte); si no, es otro párrafo.
    const sigue = textoEntre(ultima.modelo, 0, fin);
    texto = FIN_DE_FRASE.test(texto) && /^\p{Lu}/u.test(sigue) ? `${texto}\n${sigue}` : juntarLineas(texto, sigue);
  }
  return texto.trim() ? { parrafo, inicio, parrafoFin, fin, texto } : null;
}

/** El texto de la capa que cubre un ancla (para comprobar que sigue ahí). modelos: Map(página -> modelo). */
export function textoCrudoDeAncla(modelos, a) {
  if (a.parrafo === a.parrafoFin) return modelos.get(a.parrafo)?.texto.slice(a.inicio, a.fin) ?? null;
  const uno = modelos.get(a.parrafo);
  const otro = modelos.get(a.parrafoFin);
  return uno && otro ? uno.texto.slice(a.inicio) + otro.texto.slice(0, a.fin) : null;
}

/**
 * ¿El PDF tiene texto para seleccionar? Mira los modelos de las primeras páginas: 'escaneado' si en casi todas no hay
 * ni una palabra (una tapa o un mapa sueltos no cuentan), 'roto' si la mayoría son símbolos ilegibles, o null si se
 * puede usar.
 */
export function sinTextoUtil(modelos) {
  if (!modelos.length) return null;
  const vacias = modelos.filter((m) => m.sinTexto).length;
  if (vacias >= Math.ceil(modelos.length * 0.75)) return 'escaneado';
  const letras = modelos.reduce((s, m) => s + m.letras, 0);
  const raros = modelos.reduce((s, m) => s + m.raros, 0);
  if (raros > 20 && raros > letras * 0.3) return 'roto';
  return null;
}
