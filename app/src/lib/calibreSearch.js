// Búsquedas con la sintaxis de Calibre (subconjunto).
//
// Soporta lo que usan las bibliotecas virtuales y la barra de búsqueda:
//   palabras sueltas            -> busca en título, autores, etiquetas, serie y editorial
//   campo:valor                 -> "contiene"   (tags:ventas)
//   campo:"=valor exacto"       -> igualdad     (tags:"=Ventas")
//   campo:~expresión            -> expresión regular
//   campo:true / false          -> tiene valor / está vacío (en columnas sí/no: es sí / es no)
//   rating:>3, #cant_pag:<200   -> comparaciones numéricas (las valoraciones van en estrellas)
//   and, or, not, paréntesis    -> combinaciones (dos términos seguidos = and)

import { t } from './idioma.js';

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ---------- 1. Partir el texto en piezas ----------

function tokenizar(entrada) {
  const tokens = [];
  let i = 0;
  while (i < entrada.length) {
    const c = entrada[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '(' || c === ')') {
      tokens.push({ tipo: c });
      i++;
    } else {
      let palabra = '';
      let entreComillas = false;
      while (i < entrada.length) {
        const ch = entrada[i];
        if (ch === '"') entreComillas = !entreComillas;
        else if (ch === '\\' && entreComillas && i + 1 < entrada.length) palabra += entrada[++i];
        else if (!entreComillas && (/\s/.test(ch) || ch === '(' || ch === ')')) break;
        else palabra += ch;
        if (ch === '"') palabra += ch;
        i++;
      }
      tokens.push(aToken(palabra));
    }
  }
  return tokens;
}

function sinComillas(texto) {
  return texto.replace(/^"(.*)"$/s, '$1').replaceAll('"', '');
}

function aToken(palabra) {
  const clave = palabra.toLowerCase();
  if (clave === 'and' || clave === 'or' || clave === 'not') return { tipo: clave };
  const campo = /^(#?[a-z_][a-z0-9_]*):(.*)$/is.exec(palabra);
  if (campo && !palabra.startsWith('"')) {
    return { tipo: 'termino', campo: campo[1].toLowerCase(), valor: sinComillas(campo[2]) };
  }
  return { tipo: 'termino', campo: null, valor: sinComillas(palabra) };
}

// ---------- 2. Armar el árbol (or < and < not) ----------

function analizar(tokens) {
  let pos = 0;
  const ver = () => tokens[pos];
  const tomar = () => tokens[pos++];

  function expresion() {
    let izq = conjuncion();
    while (ver()?.tipo === 'or') {
      tomar();
      izq = { op: 'or', izq, der: conjuncion() };
    }
    return izq;
  }
  function conjuncion() {
    let izq = negacion();
    for (;;) {
      const t = ver();
      if (t?.tipo === 'and') {
        tomar();
        izq = { op: 'and', izq, der: negacion() };
      } else if (t && (t.tipo === 'termino' || t.tipo === '(' || t.tipo === 'not')) {
        izq = { op: 'and', izq, der: negacion() };
      } else {
        return izq;
      }
    }
  }
  function negacion() {
    if (ver()?.tipo === 'not') {
      tomar();
      return { op: 'not', arg: negacion() };
    }
    return primario();
  }
  function primario() {
    const pieza = tomar();
    if (!pieza) throw new Error(t('busqueda.incompleta'));
    if (pieza.tipo === '(') {
      const dentro = expresion();
      if (tomar()?.tipo !== ')') throw new Error(t('busqueda.falta'));
      return dentro;
    }
    if (pieza.tipo === 'termino') return { op: 'termino', campo: pieza.campo, valor: pieza.valor };
    throw new Error(t('busqueda.noEsperaba', { pieza: pieza.tipo }));
  }

  const arbol = expresion();
  if (pos < tokens.length) throw new Error(t('busqueda.sobra'));
  return arbol;
}

// ---------- 3. Evaluar contra un libro ----------

const ALIAS = {
  author: 'authors', tag: 'tags', language: 'languages', format: 'formats',
  isbn: 'isbn', identifier: 'identifiers', comment: 'comments',
};

function valoresDelCampo(libro, campo, columnas, nombreIdioma) {
  const c = ALIAS[campo] ?? campo;
  switch (c) {
    case 'title': return { tipo: 'texto', v: [libro.title] };
    case 'authors': return { tipo: 'texto', v: libro.authors };
    case 'tags': return { tipo: 'texto', v: libro.tags };
    case 'series': return { tipo: 'texto', v: libro.series ? [libro.series] : [] };
    case 'publisher': return { tipo: 'texto', v: libro.publisher ? [libro.publisher] : [] };
    case 'languages': return { tipo: 'texto', v: libro.languages.flatMap((l) => [l, nombreIdioma(l)]) };
    case 'formats': return { tipo: 'texto', v: libro.formats.map((f) => f.format) };
    case 'comments': return { tipo: 'texto', v: libro.comments ? [libro.comments] : [] };
    case 'isbn': return { tipo: 'texto', v: libro.identifiers.isbn ? [libro.identifiers.isbn] : [] };
    case 'identifiers': return { tipo: 'texto', v: Object.entries(libro.identifiers).map(([k, v]) => `${k}:${v}`) };
    case 'rating': return { tipo: 'numero', v: libro.rating != null ? libro.rating / 2 : null };
  }
  if (c.startsWith('#')) {
    const col = columnas.get(c.slice(1));
    if (!col) return null;
    const valor = libro.custom[col.label];
    if (col.datatype === 'bool') return { tipo: 'bool', v: valor ?? null };
    if (col.datatype === 'rating') return { tipo: 'numero', v: valor != null ? valor / 2 : null };
    if (col.datatype === 'int' || col.datatype === 'float') return { tipo: 'numero', v: valor ?? null };
    if (valor == null) return { tipo: 'texto', v: [] };
    return { tipo: 'texto', v: (Array.isArray(valor) ? valor : [valor]).map(String) };
  }
  return null;
}

const SI = new Set(['true', 'yes', 'si', 'sí']);
const NO = new Set(['false', 'no']);

function coincideTexto(textos, valor) {
  const v = valor.trim();
  if (SI.has(v.toLowerCase())) return textos.length > 0;
  if (NO.has(v.toLowerCase())) return textos.length === 0;
  if (v.startsWith('=')) {
    const buscado = normalizar(v.slice(1));
    return textos.some((t) => normalizar(t) === buscado);
  }
  if (v.startsWith('~')) {
    let re;
    try {
      re = new RegExp(v.slice(1), 'i');
    } catch {
      return false;
    }
    return textos.some((t) => re.test(t));
  }
  const buscado = normalizar(v);
  return textos.some((t) => normalizar(t).includes(buscado));
}

function coincideNumero(numero, valor) {
  const v = valor.trim().toLowerCase();
  if (SI.has(v)) return numero != null;
  if (NO.has(v)) return numero == null;
  const m = /^(>=|<=|!=|>|<|=)?\s*(-?\d+(?:[.,]\d+)?)$/.exec(v);
  if (!m || numero == null) return false;
  const n = Number(m[2].replace(',', '.'));
  switch (m[1] ?? '=') {
    case '>': return numero > n;
    case '<': return numero < n;
    case '>=': return numero >= n;
    case '<=': return numero <= n;
    case '!=': return numero !== n;
    default: return numero === n;
  }
}

function coincideBool(valor, buscado) {
  const v = buscado.trim().toLowerCase();
  if (SI.has(v)) return valor === true;
  if (NO.has(v)) return valor === false;
  if (v === 'empty' || v === '_empty') return valor == null;
  return false;
}

function evaluar(nodo, libro, contexto) {
  switch (nodo.op) {
    case 'and': return evaluar(nodo.izq, libro, contexto) && evaluar(nodo.der, libro, contexto);
    case 'or': return evaluar(nodo.izq, libro, contexto) || evaluar(nodo.der, libro, contexto);
    case 'not': return !evaluar(nodo.arg, libro, contexto);
  }
  if (!nodo.campo) {
    const textos = [libro.title, ...libro.authors, ...libro.tags, libro.series, libro.publisher].filter(Boolean);
    return coincideTexto(textos, nodo.valor);
  }
  const campo = valoresDelCampo(libro, nodo.campo, contexto.columnas, contexto.nombreIdioma);
  if (!campo) return false;
  if (campo.tipo === 'numero') return coincideNumero(campo.v, nodo.valor);
  if (campo.tipo === 'bool') return coincideBool(campo.v, nodo.valor);
  return coincideTexto(campo.v, nodo.valor);
}

/**
 * Convierte una búsqueda en una función filtro.
 * Devuelve { filtro, error }. Si la búsqueda está vacía, filtro es null.
 */
export function compilarBusqueda(texto, { customColumns = [], nombreIdioma = (c) => c } = {}) {
  if (!texto || !texto.trim()) return { filtro: null, error: null };
  const contexto = { columnas: new Map(customColumns.map((c) => [c.label, c])), nombreIdioma };
  try {
    const arbol = analizar(tokenizar(texto));
    return { filtro: (libro) => evaluar(arbol, libro, contexto), error: null };
  } catch (error) {
    return { filtro: null, error: error.message };
  }
}
