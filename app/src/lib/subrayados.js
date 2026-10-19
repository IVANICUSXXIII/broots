// 1.8: subrayados dentro del texto del lector. Funciones puras sobre los párrafos del capítulo (ver Lector.jsx):
// pasar una selección del mouse a un ancla, encontrar un texto aunque el EPUB haya cambiado (o venga del Kindle)
// y pintar el subrayado con <mark>, que solo cambia el color de fondo: no mueve una letra de lugar, así las páginas
// quedan iguales.
//
// Un ancla: { parrafo, inicio, parrafoFin, fin } son posiciones en el texto (textContent) de cada párrafo, en la
// versión que se veía al subrayar ('original' o 'traduccion'). Ver electron/anotaciones.cjs.

export const COLORES = ['amarillo', 'verde', 'celeste', 'rosa'];

/** Texto para comparar (igual que en anotaciones.cjs): minúsculas, sin tildes, lo que no es letra ni número es un espacio. */
export function normalizar(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ');
}

const LETRA = /[\p{L}\p{N}]/u;

/**
 * Los textos de los párrafos, normalizados y pegados con un espacio, con un mapa para volver de cada letra
 * normalizada a su párrafo y a su lugar en el texto real.
 */
export function indiceNormalizado(textos) {
  let salida = '';
  const parrafo = [];
  const lugar = [];
  textos.forEach((texto, p) => {
    let espacio = !salida.length || salida.endsWith(' ');
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      const codigo = c.charCodeAt(0);
      // Lo común (letras y números sin tilde) va rápido; el resto pasa por normalize.
      const base =
        codigo < 128 ? (/[a-z0-9]/i.test(c) ? c.toLowerCase() : '') : c.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      if (base && LETRA.test(base)) {
        for (const b of base) {
          salida += b;
          parrafo.push(p);
          lugar.push(i);
        }
        espacio = false;
      } else if (!espacio) {
        salida += ' ';
        parrafo.push(p);
        lugar.push(i);
        espacio = true;
      }
    }
    if (!espacio) {
      salida += ' ';
      parrafo.push(p);
      lugar.push(texto.length);
    }
  });
  return { texto: salida, parrafo, lugar };
}

/**
 * Busca un texto en los párrafos (sin importar tildes, mayúsculas ni signos). Si aparece varias veces, gana la
 * aparición más cerca del párrafo «cerca». Si no está entero, prueba con el principio (el Kindle a veces corta).
 * Devuelve un ancla o null.
 */
export function buscarEnParrafos(indice, aguja, cerca = 0) {
  const buscada = normalizar(aguja).trim();
  if (buscada.length < 4) return null;
  for (const intento of buscada.length > 60 ? [buscada, buscada.slice(0, 60).trim()] : [buscada]) {
    let mejor = -1;
    for (let k = indice.texto.indexOf(intento), vueltas = 0; k >= 0 && vueltas < 200; k = indice.texto.indexOf(intento, k + 1), vueltas++) {
      if (mejor < 0 || Math.abs(indice.parrafo[k] - cerca) < Math.abs(indice.parrafo[mejor] - cerca)) mejor = k;
    }
    if (mejor < 0) continue;
    const ultimo = Math.min(indice.texto.length - 1, mejor + buscada.length - 1);
    return { parrafo: indice.parrafo[mejor], inicio: indice.lugar[mejor], parrafoFin: indice.parrafo[ultimo], fin: indice.lugar[ultimo] + 1 };
  }
  return null;
}

/** El texto que cubre un ancla (los párrafos del medio, enteros; separados por un salto de línea). */
export function textoDeAncla(textos, a) {
  return tramosDeAncla(textos, a).join('\n');
}

/** El pedazo de cada párrafo que cubre un ancla. */
export function tramosDeAncla(textos, a) {
  const partes = [];
  for (let p = a.parrafo; p <= a.parrafoFin && p < textos.length; p++) {
    partes.push(textos[p].slice(p === a.parrafo ? a.inicio : 0, p === a.parrafoFin ? a.fin : undefined).replace(/\n/g, ' '));
  }
  return partes;
}

/** Mismo orden que en anotaciones.cjs: por capítulo y lugar; al final, los del Kindle sin capítulo. */
export function ordenar(entradas) {
  const conCapitulo = entradas.filter((e) => e.capitulo != null).sort((a, b) => a.capitulo - b.capitulo || (a.orden ?? 0) - (b.orden ?? 0) || String(a.fecha).localeCompare(String(b.fecha)));
  return [...conCapitulo, ...entradas.filter((e) => e.capitulo == null)];
}

/** Lugar en el texto del párrafo de un punto del DOM (nodo + desplazamiento), como lo cuenta textContent. */
function lugarEn(parrafo, nodo, desplazamiento) {
  const rango = document.createRange();
  rango.setStart(parrafo, 0);
  rango.setEnd(nodo, desplazamiento);
  return rango.toString().length;
}

/**
 * Selección del mouse -> ancla en los párrafos del capítulo: { parrafo, inicio, parrafoFin, fin, texto }, sin
 * los espacios de las puntas. null si la selección no toca ningún párrafo.
 */
export function anclaDeSeleccion(seleccion, parrafos) {
  if (!seleccion?.rangeCount || seleccion.isCollapsed) return null;
  const rango = seleccion.getRangeAt(0);
  const tocados = parrafos.map((p, i) => (rango.intersectsNode(p) ? i : -1)).filter((i) => i >= 0);
  if (!tocados.length) return null;
  let parrafo = tocados[0];
  let parrafoFin = tocados.at(-1);
  const textos = parrafos.map((p) => p.textContent);
  let inicio = parrafos[parrafo].contains(rango.startContainer) ? lugarEn(parrafos[parrafo], rango.startContainer, rango.startOffset) : 0;
  let fin = parrafos[parrafoFin].contains(rango.endContainer) ? lugarEn(parrafos[parrafoFin], rango.endContainer, rango.endOffset) : textos[parrafoFin].length;
  // Sin espacios en las puntas (y si una punta quedó al final o al principio de un párrafo, se pasa al siguiente).
  while (parrafo < parrafoFin && !textos[parrafo].slice(inicio).trim()) [parrafo, inicio] = [parrafo + 1, 0];
  while (parrafoFin > parrafo && !textos[parrafoFin].slice(0, fin).trim()) [parrafoFin, fin] = [parrafoFin - 1, textos[parrafoFin - 1].length];
  while (inicio < textos[parrafo].length && /\s/.test(textos[parrafo][inicio])) inicio++;
  while (fin > 0 && /\s/.test(textos[parrafoFin][fin - 1])) fin--;
  if (parrafo === parrafoFin && fin <= inicio) return null;
  const ancla = { parrafo, inicio, parrafoFin, fin };
  // Para mostrar: cada párrafo en una línea, con los espacios del HTML juntados (así cada línea es un párrafo).
  const texto = textoDeAncla(textos, ancla)
    .split('\n')
    .map((linea) => linea.replace(/\s+/g, ' ').trim())
    .join('\n');
  return texto.trim() ? { ...ancla, texto } : null;
}

/** Saca los <mark> de Broots de un párrafo (deja el texto como estaba) y la marca de «subrayado en el otro idioma». */
export function despintar(parrafo) {
  for (const marca of parrafo.querySelectorAll('mark[data-subrayado]')) marca.replaceWith(...marca.childNodes);
  parrafo.normalize();
  parrafo.classList.remove('subrayado-otro');
  delete parrafo.dataset.colorOtro;
}

/**
 * Pinta [desde, hasta) del texto de un párrafo con <mark>: corta los nodos de texto en las puntas y envuelve cada
 * pedazo (un subrayado puede pasar por un enlace o una cursiva). Devuelve las marcas creadas.
 */
export function envolver(parrafo, desde, hasta, { id, clases }) {
  const marcas = [];
  const recorrido = document.createTreeWalker(parrafo, NodeFilter.SHOW_TEXT);
  const nodos = [];
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) nodos.push(n);
  let lugar = 0;
  for (let nodo of nodos) {
    const largo = nodo.data.length;
    const a = Math.max(desde, lugar);
    const b = Math.min(hasta, lugar + largo);
    if (b > a) {
      if (a > lugar) nodo = nodo.splitText(a - lugar);
      if (b < lugar + largo) nodo.splitText(b - a);
      const marca = document.createElement('mark');
      marca.dataset.subrayado = id;
      marca.className = clases;
      nodo.replaceWith(marca);
      marca.append(nodo);
      marcas.push(marca);
    }
    lugar += largo;
    if (lugar >= hasta) break;
  }
  return marcas;
}
