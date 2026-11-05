// Lógica de la biblioteca en pantalla: filtros laterales, orden y columnas especiales.
import { nombreIdioma } from './formato.js';
import { t, region } from './idioma.js';

const SIN_VALOR = '__sin_valor__';
// Orden alfabético según el idioma de Broots (uno por idioma, creado la primera vez que se usa).
const comparadores = new Map();
const comparador = {
  compare: (a, b) => {
    if (!comparadores.has(region())) comparadores.set(region(), new Intl.Collator(region(), { sensitivity: 'base', numeric: true }));
    return comparadores.get(region()).compare(a, b);
  },
};

/** Detecta las columnas propias "especiales" (estado de lectura y valoración). */
export function columnasEspeciales(customColumns) {
  const estado =
    customColumns.find((c) => c.datatype === 'enumeration' && c.label === 'read_progress') ??
    customColumns.find((c) => c.datatype === 'enumeration') ??
    null;
  const valoracion = customColumns.find((c) => c.datatype === 'rating') ?? null;
  return { estado, valoracion };
}

/** Formatos que Amazon acepta por mail, en orden de preferencia (igual que electron/envio.cjs). */
export const FORMATOS_KINDLE = ['EPUB', 'PDF', 'DOCX', 'DOC', 'RTF', 'TXT', 'HTML', 'HTM'];

export function formatoParaKindle(libro) {
  const disponibles = new Set(libro.formats.map((f) => f.format));
  return FORMATOS_KINDLE.find((f) => disponibles.has(f)) ?? null;
}

/**
 * Etiquetas dañadas: restos de metadatos mal descargados (texto con HTML, o solo signos como "&").
 * No se borran de la biblioteca (Broots no edita todavía): solo no se muestran.
 */
export function etiquetaDañada(etiqueta) {
  return /<\/?[a-z][^>]*>/i.test(etiqueta) || !/[\p{L}\p{N}]/u.test(etiqueta);
}

/**
 * 1.10: etiquetas en árbol. Calibre usa el punto para las jerarquías: «Sagas.Harry Potter» cuelga de «Sagas».
 * Devuelve la etiqueta y todas sus ramas: ['Sagas', 'Sagas.Harry Potter']. Así, contar y filtrar por una rama
 * incluye sus subetiquetas sin hacer nada más. Lo que no es una jerarquía de verdad no se parte: un punto al final
 * («Borra del Café.»), iniciales («J.K. Rowling», «U.S.A»), números («Web 2.0») y direcciones web.
 */
const DIRECCION_WEB = /^(https?:\/\/|www\.)|\.(com|net|org|edu|gov|io)(\.[a-z]{2})?$/i;
export function ramasDeEtiqueta(etiqueta) {
  const partes = etiqueta.split('.');
  const noEsJerarquia = partes.length < 2 || DIRECCION_WEB.test(etiqueta) || partes.some((p) => p.trim().length < 2 || p !== p.trim() || /^\d+$/.test(p));
  if (noEsJerarquia) return [etiqueta];
  return partes.map((_, i) => partes.slice(0, i + 1).join('.'));
}

/** Cómo se muestra una etiqueta entera, fuera del árbol: «Sagas › Harry Potter». */
export function nombreEtiqueta(etiqueta) {
  const ramas = ramasDeEtiqueta(etiqueta);
  return ramas.length > 1 ? etiqueta.split('.').join(' › ') : etiqueta;
}

/**
 * Arma el árbol de la barra lateral a partir de los conteos (que ya traen las ramas).
 * Cada nodo: { valor, nombre, cantidad, nivel, hijos }. Conserva el orden de los conteos.
 */
export function arbolDeEtiquetas(conteos) {
  const nodos = new Map(conteos.map(({ valor, cantidad }) => [valor, { valor, cantidad, nombre: valor, nivel: 0, hijos: [] }]));
  const raices = [];
  for (const { valor } of conteos) {
    const nodo = nodos.get(valor);
    const ramas = ramasDeEtiqueta(valor);
    const padre = ramas.length > 1 ? nodos.get(ramas.at(-2)) : null;
    if (!padre) {
      raices.push(nodo);
      continue;
    }
    nodo.nombre = valor.slice(padre.valor.length + 1);
    padre.hijos.push(nodo);
  }
  const nivelar = (lista, nivel) => lista.forEach((n) => {
    n.nivel = nivel;
    nivelar(n.hijos, nivel + 1);
  });
  nivelar(raices, 0);
  return raices;
}

export function etiquetasValidas(libro) {
  return libro.tags.filter((t) => !etiquetaDañada(t));
}

/**
 * Las dos valoraciones de un libro (de 0 a 10, como Calibre):
 *  - propia: la de tu columna "Valoración"
 *  - importada: la estándar de Calibre, que suele venir de Amazon al descargar metadatos
 */
export function valoraciones(libro, columnaValoracion) {
  const propia = columnaValoracion ? libro.custom[columnaValoracion.label] : null;
  return {
    propia: propia > 0 ? propia : null,
    importada: libro.rating > 0 ? libro.rating : null,
  };
}

/** La valoración que se muestra y se usa para ordenar: la tuya primero; si no hay, la importada. */
export function valoracionDe(libro, columnaValoracion) {
  const { propia, importada } = valoraciones(libro, columnaValoracion);
  return propia ?? importada;
}

/**
 * Define los grupos de filtros de la barra lateral.
 * Cada grupo sabe qué valores tiene cada libro y cómo mostrarlos. Los títulos fijos se leen al dibujar
 * (con "get"), así siguen al idioma de Broots sin volver a armar los grupos.
 */
export function construirGrupos(customColumns, cantidadSubrayados = () => 0) {
  const grupos = [];

  for (const c of customColumns.filter((c) => c.datatype === 'enumeration')) {
    grupos.push({
      id: `#${c.label}`,
      titulo: c.name,
      valores: (l) => [l.custom[c.label] ?? SIN_VALOR],
      fijos: [...(c.enumValues ?? []), SIN_VALOR],
      etiqueta: (v) => (v === SIN_VALOR ? t('filtros.sinEstado') : v),
    });
  }

  for (const c of customColumns.filter((c) => c.datatype === 'bool')) {
    grupos.push({
      id: `#${c.label}`,
      titulo: c.name,
      valores: (l) => [l.custom[c.label] === true ? 'si' : 'no'],
      fijos: ['si', 'no'],
      etiqueta: (v) => t(v === 'si' ? 'filtros.si' : 'filtros.no'),
    });
  }

  grupos.push(
    {
      id: 'subrayados',
      get titulo() { return t('filtros.subrayados'); },
      valores: (l) => [cantidadSubrayados(l) > 0 ? 'con' : 'sin'],
      fijos: ['con', 'sin'],
      etiqueta: (v) => t(v === 'con' ? 'filtros.conSubrayados' : 'filtros.sinSubrayados'),
    },
    { id: 'idioma', get titulo() { return t('filtros.idioma'); }, valores: (l) => (l.languages.length ? l.languages : [SIN_VALOR]), etiqueta: (v) => (v === SIN_VALOR ? t('filtros.sinIdioma') : nombreIdioma(v)) },
    { id: 'formato', get titulo() { return t('filtros.formato'); }, valores: (l) => l.formats.map((f) => f.format), etiqueta: (v) => v },
    { id: 'etiqueta', get titulo() { return t('filtros.etiquetas'); }, valores: (l) => etiquetasValidas(l).flatMap(ramasDeEtiqueta), etiqueta: nombreEtiqueta, buscable: true, plegado: false, arbol: true },
    { id: 'serie', get titulo() { return t('filtros.series'); }, valores: (l) => (l.series ? [l.series] : []), etiqueta: (v) => v, buscable: true },
    { id: 'autor', get titulo() { return t('filtros.autores'); }, valores: (l) => l.authors, etiqueta: (v) => v, buscable: true, plegado: true },
  );

  return grupos;
}

/** Cuenta cuántos libros hay para cada valor de cada grupo. */
export function contarValores(grupos, libros) {
  const conteos = {};
  for (const g of grupos) {
    const mapa = new Map();
    for (const v of g.fijos ?? []) mapa.set(v, 0);
    for (const libro of libros) {
      for (const v of new Set(g.valores(libro))) mapa.set(v, (mapa.get(v) ?? 0) + 1);
    }
    let lista = [...mapa.entries()].map(([valor, cantidad]) => ({ valor, cantidad }));
    if (!g.fijos) lista.sort((a, b) => b.cantidad - a.cantidad || comparador.compare(g.etiqueta(a.valor), g.etiqueta(b.valor)));
    conteos[g.id] = lista;
  }
  return conteos;
}

/** Aplica los filtros elegidos: dentro de un grupo es "o", entre grupos es "y". */
export function aplicarFiltros(libros, grupos, filtros, { minEstrellas = 0, soloPropias = false }, columnaValoracion) {
  const activos = grupos.filter((g) => filtros[g.id]?.size);
  return libros.filter((libro) => {
    if (soloPropias || minEstrellas > 0) {
      const { propia, importada } = valoraciones(libro, columnaValoracion);
      const valor = soloPropias ? propia : (propia ?? importada);
      if (valor == null || valor < minEstrellas * 2) return false;
    }
    return activos.every((g) => g.valores(libro).some((v) => filtros[g.id].has(v)));
  });
}

// El nombre de cada orden se lee al dibujar, en el idioma de Broots.
export const ORDENES = ['titulo', 'autor', 'agregado', 'publicado', 'valoracion', 'serie'].map((id) => ({
  id,
  get nombre() {
    return t(`orden.${id}`);
  },
}));

export function ordenar(libros, orden, columnaValoracion) {
  const copia = [...libros];
  const porTitulo = (a, b) => comparador.compare(a.sort || a.title, b.sort || b.title);
  const criterios = {
    titulo: porTitulo,
    autor: (a, b) => comparador.compare(a.authorSort ?? '', b.authorSort ?? '') || porTitulo(a, b),
    agregado: (a, b) => (b.added ?? '').localeCompare(a.added ?? ''),
    publicado: (a, b) => (b.pubdate ?? '').localeCompare(a.pubdate ?? ''),
    valoracion: (a, b) => (valoracionDe(b, columnaValoracion) ?? -1) - (valoracionDe(a, columnaValoracion) ?? -1) || porTitulo(a, b),
    serie: (a, b) => {
      if (!a.series !== !b.series) return a.series ? -1 : 1;
      return comparador.compare(a.series ?? '', b.series ?? '') || (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) || porTitulo(a, b);
    },
  };
  return copia.sort(criterios[orden] ?? porTitulo);
}
