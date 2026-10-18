// Manual de la Ayuda, un archivo por idioma (es.js es el original; los tres tienen los mismos temas e id).
import { MANUAL as es } from './es.js';
import { MANUAL as en } from './en.js';
import { MANUAL as pt } from './pt.js';

const POR_IDIOMA = { es, en, pt };

export const manualEn = (idioma) => POR_IDIOMA[idioma] ?? es;
