// Instrucciones del club de lectura, un archivo por idioma (es.js es el original).
import * as es from './es.js';
import * as en from './en.js';
import * as pt from './pt.js';

const POR_IDIOMA = { es, en, pt };

/** { INSTRUCCIONES_CLAUDE, INSTRUCCIONES_GEMINI, PASOS_CLAUDE, PASOS_GEMINI } en ese idioma. */
export const instruccionesClub = (idioma) => POR_IDIOMA[idioma] ?? es;
