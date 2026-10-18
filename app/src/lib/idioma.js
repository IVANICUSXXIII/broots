// Idioma de la interfaz: textos de idiomas/<idioma>.json (sección "interfaz") y formato de fechas y números.
//
//   t('barra.buscar')                        -> texto en el idioma elegido
//   t('barra.libros', { n: 3 })              -> plurales: { "one": "…", "other": "{n} …" } (y "0" opcional)
//   tx('configuracion.privacidad', { b: (s) => <strong>{s}</strong> })  -> texto con <b>marcas</b> convertidas en elementos
//   lista('actualizacion.frases.lista')     -> una lista de textos (en el JSON, un arreglo)
//
// El idioma lo decide el proceso principal (config.json o, si no se eligió, el de Windows) y llega al abrir
// la ventana. Al cambiarlo en Configuración, useIdioma() vuelve a dibujar la interfaz sin reiniciar.
import { createElement, Fragment, useSyncExternalStore } from 'react';
import es from '../../idiomas/es.json';
import en from '../../idiomas/en.json';
import pt from '../../idiomas/pt.json';

const TEXTOS = { es: es.interfaz, en: en.interfaz, pt: pt.interfaz };
// Formato regional de cada idioma: el español sigue siendo el de Argentina.
const REGIONES = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' };
export const IDIOMAS = [
  { id: 'es', nombre: 'Español' },
  { id: 'en', nombre: 'English' },
  { id: 'pt', nombre: 'Português' },
];

let actual = TEXTOS[window.preferencias?.idioma] ? window.preferencias.idioma : 'es';
const oyentes = new Set();
const reglasPlural = new Map();
document.documentElement.lang = actual;

export const idiomaActual = () => actual;
/** Formato regional para Intl (fechas, números, orden alfabético). */
export const region = () => REGIONES[actual];

export function ponerIdioma(id) {
  if (!TEXTOS[id] || id === actual) return;
  actual = id;
  document.documentElement.lang = id;
  for (const oyente of oyentes) oyente();
}

/** Para los componentes: los vuelve a dibujar cuando cambia el idioma. */
export function useIdioma() {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    idiomaActual,
  );
}

function buscar(textos, clave) {
  let nodo = textos;
  for (const parte of clave.split('.')) nodo = nodo?.[parte];
  return nodo;
}

function plural(n) {
  if (!reglasPlural.has(actual)) reglasPlural.set(actual, new Intl.PluralRules(REGIONES[actual]));
  return reglasPlural.get(actual).select(n);
}

export function t(clave, variables) {
  let texto = buscar(TEXTOS[actual], clave) ?? buscar(TEXTOS.es, clave);
  if (texto == null) {
    console.warn(`Falta el texto «${clave}»`);
    return clave;
  }
  if (typeof texto === 'object') {
    const n = Number(variables?.n);
    texto = (n === 0 && texto['0']) || texto[plural(n)] || texto.other;
  }
  return variables ? texto.replace(/\{(\w+)\}/g, (marca, nombre) => (variables[nombre] ?? marca)) : texto;
}

/** Una lista de textos (p. ej. las frases del aviso de actualización): [] si la clave no es una lista. */
export function lista(clave) {
  const textos = buscar(TEXTOS[actual], clave);
  return Array.isArray(textos) ? textos : Array.isArray(buscar(TEXTOS.es, clave)) ? buscar(TEXTOS.es, clave) : [];
}

/** Como t(), pero cada <marca>…</marca> del texto se reemplaza con marcas.marca(contenido). */
export function tx(clave, marcas = {}, variables) {
  const texto = t(clave, variables);
  const partes = [];
  let desde = 0;
  for (const m of texto.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) {
    if (m.index > desde) partes.push(texto.slice(desde, m.index));
    partes.push(createElement(Fragment, { key: partes.length }, marcas[m[1]] ? marcas[m[1]](m[2]) : m[2]));
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) partes.push(texto.slice(desde));
  return partes;
}
