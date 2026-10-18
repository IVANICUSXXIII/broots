// Pequeñas utilidades para mostrar datos de forma amigable (en el idioma y el formato regional de Broots).
import { idiomaActual, region } from './idioma.js';

const cacheIdiomas = new Map(); // 'es:spa' -> 'Español'

/** 'spa' -> 'Español' (o 'Spanish', 'Espanhol', según el idioma de Broots) */
export function nombreIdioma(codigo) {
  if (!codigo) return '';
  const clave = `${idiomaActual()}:${codigo}`;
  if (!cacheIdiomas.has(clave)) {
    let nombre = codigo;
    try {
      nombre = new Intl.DisplayNames([region()], { type: 'language' }).of(codigo) ?? codigo;
    } catch {}
    cacheIdiomas.set(clave, nombre.charAt(0).toUpperCase() + nombre.slice(1));
  }
  return cacheIdiomas.get(clave);
}

export function año(fechaIso) {
  return fechaIso ? fechaIso.slice(0, 4) : '';
}

export function fechaCorta(fechaIso) {
  if (!fechaIso) return '';
  return new Date(fechaIso).toLocaleDateString(region(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function tamaño(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString(region(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

export function numero(n) {
  return n == null ? '' : Number(n).toLocaleString(region());
}

/** Color estable a partir de un texto (para portadas de libros sin imagen). */
export function colorDesdeTexto(texto) {
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.codePointAt(0)) % 360;
  return `hsl(${h} 35% 42%)`;
}
