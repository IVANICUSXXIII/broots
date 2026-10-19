// 1.9 «Lectura a medida»: tema, letra, fuente, interlineado, márgenes y justificado del lector.
//
// Se guardan en esta PC (localStorage), para todos los libros. El tamaño de letra sigue en su clave de siempre
// ('broots-lector-letra', desde la etapa 5); lo demás va junto en 'broots-lector-medida'. El lector y Configuración
// se enteran de los cambios del otro con un evento de la ventana, así los dos muestran siempre lo mismo.
//
// Los colores de cada tema están en index.css ([data-tema-lector=…]); acá solo los dos que necesita la barra de
// título de Windows (que dibuja sus botones encima del lector y no lee las variables de CSS).
import { useEffect, useState } from 'react';

export const TEMAS = ['auto', 'claro', 'sepia', 'oscuro', 'negro'];
// Fondo de la barra y color de los símbolos de la ventana con cada tema (iguales a --superficie y --tinta).
export const COLORES_BARRA = {
  claro: { fondo: '#fdfaea', simbolos: '#2b361c' },
  sepia: { fondo: '#f4e8d0', simbolos: '#4b3a2a' },
  oscuro: { fondo: '#282826', simbolos: '#efece4' },
  negro: { fondo: '#000000', simbolos: '#c9c6bc' },
};

// Todas vienen con Broots (sin internet), salvo Georgia, que trae Windows.
export const FUENTES = [
  { id: 'literata', familia: "'Literata Variable', Georgia, serif", nombre: 'Literata' },
  { id: 'georgia', familia: "Georgia, 'Times New Roman', serif", nombre: 'Georgia' },
  { id: 'atkinson', familia: "'Atkinson Hyperlegible Next Variable', 'Segoe UI', sans-serif", nombre: 'Atkinson' },
  { id: 'inter', familia: "'Inter Variable', 'Segoe UI', sans-serif", nombre: 'Inter' },
  { id: 'dislexia', familia: "'OpenDyslexic', 'Segoe UI', sans-serif", nombre: 'OpenDyslexic' },
];
export const INTERLINEADOS = { junto: 1.4, normal: 1.62, aireado: 1.9 };
// Márgenes: el ancho máximo de cada página y el margen mínimo a los costados (en px).
export const MARGENES = {
  chicos: { ancho: 720, lateral: 48 },
  normales: { ancho: 620, lateral: 72 },
  grandes: { ancho: 520, lateral: 112 },
};
export const LETRA = { defecto: 19, min: 14, max: 30 };

const DEFECTO = { tema: 'auto', fuente: 'literata', interlineado: 'normal', margenes: 'normales', justificar: false };
const CLAVE = 'broots-lector-medida';
const CLAVE_LETRA = 'broots-lector-letra';
const EVENTO = 'broots-lectura-medida';

const valida = (lista, v, defecto) => (lista.includes(v) ? v : defecto);

/** Lo elegido en esta PC, siempre completo y con valores conocidos (si algo se rompió, vuelve al de fábrica). */
export function leerAjustes() {
  let guardado = {};
  let letra = LETRA.defecto;
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE)) ?? {};
  } catch {}
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LETRA));
    if (typeof v === 'number') letra = Math.min(LETRA.max, Math.max(LETRA.min, Math.round(v)));
  } catch {}
  return {
    tema: valida(TEMAS, guardado.tema, DEFECTO.tema),
    fuente: valida(FUENTES.map((f) => f.id), guardado.fuente, DEFECTO.fuente),
    interlineado: valida(Object.keys(INTERLINEADOS), guardado.interlineado, DEFECTO.interlineado),
    margenes: valida(Object.keys(MARGENES), guardado.margenes, DEFECTO.margenes),
    justificar: guardado.justificar === true,
    letra,
  };
}

/** Guarda un cambio (por ejemplo { tema: 'sepia' }) y les avisa a los demás. */
export function cambiarAjustes(cambio) {
  const nuevos = { ...leerAjustes(), ...cambio };
  nuevos.letra = Math.min(LETRA.max, Math.max(LETRA.min, nuevos.letra));
  const { letra, ...resto } = nuevos;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(resto));
    localStorage.setItem(CLAVE_LETRA, JSON.stringify(letra));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENTO));
  return nuevos;
}

/** Los ajustes de lectura, al día con lo que se cambie desde el lector o desde Configuración. */
export function useAjustesLectura() {
  const [ajustes, setAjustes] = useState(leerAjustes);
  useEffect(() => {
    const alCambiar = () => setAjustes(leerAjustes());
    window.addEventListener(EVENTO, alCambiar);
    return () => window.removeEventListener(EVENTO, alCambiar);
  }, []);
  return [ajustes, cambiarAjustes];
}

/** Variables de CSS que usan la página y el medidor (los dos tienen que medir exactamente igual). */
export function variablesTexto(ajustes) {
  return {
    '--fuente-libro': (FUENTES.find((f) => f.id === ajustes.fuente) ?? FUENTES[0]).familia,
    '--interlineado-libro': INTERLINEADOS[ajustes.interlineado] ?? INTERLINEADOS.normal,
    '--alineado-libro': ajustes.justificar ? 'justify' : 'start',
    '--guiones-libro': ajustes.justificar ? 'auto' : 'manual', // justificado sin guiones deja huecos
  };
}

/** Espera a que la fuente elegida esté cargada (si no, las páginas se cuentan con otra letra y después no dan). */
export function cargarFuente(ajustes) {
  const familia = (FUENTES.find((f) => f.id === ajustes.fuente) ?? FUENTES[0]).familia;
  const espera = new Promise((r) => setTimeout(r, 1500));
  return Promise.race([Promise.all([document.fonts.load(`16px ${familia}`), document.fonts.load(`700 16px ${familia}`)]).catch(() => {}), espera]);
}
