// Limpieza del HTML de un capítulo de EPUB antes de mostrarlo en el lector.
// Se arma un árbol nuevo solo con etiquetas y atributos conocidos: nada de scripts, estilos,
// formularios ni enlaces que salgan de la app. Las tipografías y colores son los de Broots.

const PERMITIDAS = new Set([
  'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'i', 'strong', 'b', 'u', 's', 'sub', 'sup',
  'small', 'br', 'hr', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'td', 'th', 'caption', 'figure', 'figcaption', 'img', 'a', 'pre', 'code', 'cite', 'q', 'abbr', 'mark',
]);
// Se reemplazan por un div (son bloques de estructura).
const COMO_DIV = new Set(['section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'body', 'center']);
// Se descartan con todo su contenido.
const DESCARTAR = new Set(['script', 'style', 'head', 'title', 'link', 'meta', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'audio', 'video', 'math', 'template', 'noscript']);
// Bloques que pueden ser "párrafos" para traducir (si no tienen otros bloques adentro).
export const BLOQUES = 'p,h1,h2,h3,h4,h5,h6,li,dt,dd,figcaption,td,th,pre,blockquote,div,caption';

/** Ruta dentro del EPUB: une la carpeta del capítulo con una ruta relativa y resuelve "..". */
export function resolverRuta(base, relativa) {
  const partes = base.split('/').slice(0, -1);
  for (const parte of decodeURIComponent(relativa.split('#')[0]).split('/')) {
    if (parte === '..') partes.pop();
    else if (parte && parte !== '.') partes.push(parte);
  }
  return partes.join('/');
}

const urlDeImagen = (idLibro, ruta) => `libro://epub/${idLibro}/${ruta.split('/').map(encodeURIComponent).join('/')}`;

function copiar(nodo, destino, contexto) {
  for (const hijo of nodo.childNodes) {
    if (hijo.nodeType === 3) {
      destino.append(hijo.data);
      continue;
    }
    if (hijo.nodeType !== 1) continue;
    const etiqueta = hijo.localName.toLowerCase();
    if (DESCARTAR.has(etiqueta)) continue;

    // Portadas en SVG: <svg><image xlink:href="..."/></svg> -> <img>
    if (etiqueta === 'svg') {
      const imagen = hijo.querySelector('image');
      const href = imagen?.getAttribute('href') ?? imagen?.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (href) {
        const img = document.createElement('img');
        img.src = urlDeImagen(contexto.idLibro, resolverRuta(contexto.href, href));
        destino.append(img);
      }
      continue;
    }

    if (!PERMITIDAS.has(etiqueta) && !COMO_DIV.has(etiqueta)) {
      copiar(hijo, destino, contexto); // etiqueta desconocida: se conserva solo su contenido
      continue;
    }
    const nuevo = document.createElement(COMO_DIV.has(etiqueta) ? 'div' : etiqueta);
    const id = hijo.getAttribute('id');
    if (id) nuevo.dataset.ancla = id;
    if (etiqueta === 'img') {
      const src = hijo.getAttribute('src') ?? '';
      if (src.startsWith('libro://epub/')) nuevo.src = src; // ya resuelta (al volver de la traducción)
      else if (src && !/^[a-z]+:/i.test(src)) nuevo.src = urlDeImagen(contexto.idLibro, resolverRuta(contexto.href, src));
      else continue; // imágenes externas: no se cargan
      nuevo.alt = hijo.getAttribute('alt') ?? '';
    }
    if (etiqueta === 'a') {
      const href = hijo.getAttribute('href') ?? hijo.dataset?.destino ?? '';
      if (hijo.dataset?.destino) nuevo.dataset.destino = hijo.dataset.destino;
      else if (href && !/^[a-z]+:/i.test(href)) {
        nuevo.dataset.destino = href.startsWith('#') ? `${contexto.href}${href}` : `${resolverRuta(contexto.href, href)}${href.includes('#') ? `#${href.split('#')[1]}` : ''}`;
      }
    }
    for (const atributo of ['colspan', 'rowspan']) if (hijo.hasAttribute(atributo)) nuevo.setAttribute(atributo, hijo.getAttribute(atributo));
    copiar(hijo, nuevo, contexto);
    destino.append(nuevo);
  }
}

/** HTML de un capítulo -> fragmento limpio listo para insertar. */
export function limpiarCapitulo(html, href, idLibro) {
  let doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(html, 'text/html');
  const cuerpo = doc.querySelector('body') ?? doc.documentElement;
  const fragmento = document.createDocumentFragment();
  copiar(cuerpo, fragmento, { href, idLibro });
  // Bloques vacíos (títulos ocultos, párrafos con solo un espacio): ocupan lugar y pueden empujar
  // una imagen, como la portada, a la página siguiente.
  for (const el of [...fragmento.querySelectorAll(BLOQUES)].reverse()) {
    if (!el.textContent.trim() && !el.querySelector('img, hr, table')) el.remove();
  }
  return fragmento;
}

/** HTML de un párrafo (p. ej. la traducción que devuelve Gemini) -> fragmento limpio. */
export function limpiarFragmento(html, href, idLibro) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const fragmento = document.createDocumentFragment();
  copiar(doc.body, fragmento, { href, idLibro });
  return fragmento;
}

/** Bloques con texto que no contienen otros bloques: las unidades que se traducen y se marcan. */
export function parrafosDe(contenedor) {
  return [...contenedor.querySelectorAll(BLOQUES)].filter((el) => !el.querySelector(BLOQUES) && el.textContent.trim());
}
