// Idiomas: arranca en el de Windows (acá, un Windows en portugués) y al cambiarlo en Configuración → General
// cambian al instante la interfaz, el manual de la Ayuda, los mensajes de Electron y el idioma al que traduce
// el lector. Los libros marcados para Familia no se pierden al cambiar de idioma.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const APP = path.resolve(import.meta.dirname, '..', '..');

/** Claves de un archivo de textos, con las {variables} y <marcas> de cada texto. */
function hojas(objeto, prefijo = '') {
  return Object.entries(objeto).flatMap(([clave, valor]) => {
    const ruta = `${prefijo}${clave}`;
    if (valor && typeof valor === 'object' && !('other' in valor)) return hojas(valor, `${ruta}.`);
    const marcas = [...JSON.stringify(valor).matchAll(/\{(\w+)\}|<\/?(\w+)>/g)].map((m) => m[0]).filter((m) => m !== '{n}');
    return [[ruta, [...new Set(marcas)].sort().join(' ')]];
  });
}

export default {
  descripcion: 'Cambia de idioma: interfaz, Ayuda, mensajes de Electron, lector y Familia',
  necesita: { epub: 1 },
  entorno: { BROOTS_IDIOMA_WINDOWS: 'pt-BR', BROOTS_TRADUCCION_FALSA: '1' },
  async prueba({ PRUEBA, hasta, esperar, comprobar, boton, escribir, tecla }) {
    const cabecera = () => document.querySelector('header');
    const dialogo = () => document.querySelector('[role="dialog"]');
    const contenido = (id) => document.querySelector(`[data-config-seccion="${id}"]`);
    const abrirSeccion = async (id) => {
      dialogo().querySelector(`[data-seccion="${id}"]`).click();
      return hasta(() => contenido(id), 5000);
    };
    const elegirIdioma = async (idioma) => {
      const general = await abrirSeccion('general');
      escribir(general.querySelector('select[data-idioma]'), idioma);
      await hasta(() => document.documentElement.lang === idioma, 5000);
      await esperar(500);
    };
    const pie = () => document.querySelector('main footer')?.innerText ?? '';
    const libro = PRUEBA.libros.epub[0].id;

    // 1. Sin idioma elegido, el de Windows (portugués).
    const prefs = await window.preferencias.leer();
    comprobar('arranca en el idioma de Windows', prefs.idioma === 'pt' && document.documentElement.lang === 'pt', prefs.idioma);
    comprobar('la interfaz está en portugués', boton(cabecera(), 'Configurações') && pie().includes('Lida às'), pie());

    // 2. Inglés desde Configuración → General.
    boton(cabecera(), 'Configurações').click();
    await hasta(() => dialogo() && contenido('general'), 5000);
    await elegirIdioma('en');
    const nav = dialogo().querySelector('nav')?.innerText ?? '';
    comprobar('Configuración cambia al inglés sin reiniciar', nav.includes('Settings') && nav.includes('Reading & translation'), nav.replace(/\n/g, ' · '));
    comprobar('la barra de arriba también', boton(cabecera(), 'Settings') && /\d+ books?/.test(cabecera().innerText), cabecera().innerText.replace(/\n/g, ' · '));
    comprobar('y el pie, con la hora en inglés', pie().includes('Read at'), pie());
    const ayuda = await abrirSeccion('ayuda');
    await esperar(300);
    const faltanEn = ['Getting started', 'Keyboard shortcuts', 'Frequently asked questions'].filter((texto) => !ayuda.innerText.includes(texto));
    comprobar('el manual de la Ayuda está en inglés', !faltanEn.length, faltanEn.length ? `falta: ${faltanEn.join(', ')}` : '');
    const sinNombre = await window.familia.agregar({ nombre: '' });
    comprobar('los mensajes de Electron están en inglés', sinNombre.mensaje === 'Enter a name.', sinNombre.mensaje);
    const traduccion = await window.lector.traducir(libro, ['<p>Hola</p>'], true);
    comprobar('el lector traduce al inglés', traduccion.traducciones?.[0]?.startsWith('EN· '), traduccion.traducciones?.[0]);

    // 3. Alguien de Familia creado en inglés lleva la etiqueta en inglés, y sus libros quedan marcados.
    const nueva = await window.familia.agregar({ nombre: 'Ana' });
    const ana = nueva.familia?.find((i) => i.nombre === 'Ana');
    comprobar('la etiqueta nueva sale en inglés', ana?.etiqueta === 'For Ana', ana?.etiqueta);
    const marcado = await window.familia.marcar(ana.id, [libro], true);
    comprobar('marca un libro para Ana', marcado.ok && marcado.cambiados === 1, marcado.mensaje);

    // 4. Español: cambia todo de nuevo, y Ana sigue teniendo su libro.
    await elegirIdioma('es');
    comprobar('vuelve al español', boton(cabecera(), 'Configuración') && dialogo().querySelector('nav')?.innerText.includes('Lectura y traducción'));
    const ayudaEs = await abrirSeccion('ayuda');
    await esperar(300);
    comprobar('el manual vuelve al español', ayudaEs.innerText.includes('Primeros pasos'));
    comprobar('los mensajes de Electron también', (await window.familia.agregar({ nombre: '' })).mensaje === 'Escribí el nombre.');
    const traduccionEs = await window.lector.traducir(libro, ['<p>Hello</p>'], true);
    comprobar('el lector traduce al español', traduccionEs.traducciones?.[0]?.startsWith('ES· '), traduccionEs.traducciones?.[0]);
    const { familia } = await window.familia.estado();
    comprobar('Ana conserva su etiqueta', familia.find((i) => i.nombre === 'Ana')?.etiqueta === 'For Ana');
    // La biblioteca de Ana, en la barra lateral, ahora con nombre en español y con su libro (a Ana se la sumó
    // por detrás de la pantalla: se vuelve a leer la biblioteca, como con el botón de la barra).
    tecla('Escape');
    await hasta(() => !dialogo(), 3000);
    boton(cabecera(), 'Volver a leer la biblioteca').click();
    const enLateral = await hasta(() => [...document.querySelectorAll('aside nav button')].find((b) => b.innerText.includes('Libros de Ana')), 5000);
    comprobar('la biblioteca de Ana sigue con su libro', enLateral && /\b1$/.test(enLateral.innerText.trim()), enLateral?.innerText.replace(/\n/g, ' '));
  },
  // Corre en Node, después de cerrar Broots.
  async verificar({ DATOS }) {
    const resultados = [];
    const config = JSON.parse(fs.readFileSync(path.join(DATOS, 'config.json'), 'utf8'));
    resultados.push({ nombre: 'config.json guarda el idioma elegido', ok: config.idioma === 'es', detalle: config.idioma });

    // Los tres archivos de textos tienen las mismas claves, con las mismas {variables} y <marcas>.
    const textos = Object.fromEntries(['es', 'en', 'pt'].map((i) => [i, new Map(hojas(JSON.parse(fs.readFileSync(path.join(APP, 'idiomas', `${i}.json`), 'utf8'))))]));
    for (const i of ['en', 'pt']) {
      const faltan = [...textos.es.keys()].filter((clave) => !textos[i].has(clave));
      const sobran = [...textos[i].keys()].filter((clave) => !textos.es.has(clave));
      const distintas = [...textos.es].filter(([clave, marcas]) => textos[i].has(clave) && textos[i].get(clave) !== marcas).map(([clave]) => clave);
      resultados.push({
        nombre: `${i}.json tiene los mismos textos que es.json`,
        ok: !faltan.length && !sobran.length && !distintas.length,
        detalle: [faltan.length && `faltan: ${faltan.slice(0, 5).join(', ')}`, sobran.length && `sobran: ${sobran.slice(0, 5).join(', ')}`, distintas.length && `otras variables: ${distintas.slice(0, 5).join(', ')}`].filter(Boolean).join(' · ') || `${textos.es.size} textos`,
      });
    }

    // El manual y las instrucciones del club, completos en los tres idiomas.
    const temas = {};
    const club = {};
    for (const i of ['es', 'en', 'pt']) {
      temas[i] = (await import(pathToFileURL(path.join(APP, 'src', 'lib', 'manual', `${i}.js`)).href)).MANUAL.map((tema) => `${tema.id}:${tema.bloques.length}`).join(' ');
      club[i] = Object.keys(await import(pathToFileURL(path.join(APP, 'src', 'lib', 'club', `${i}.js`)).href)).sort().join(' ');
    }
    resultados.push({ nombre: 'el manual tiene los mismos temas en los tres idiomas', ok: temas.es === temas.en && temas.es === temas.pt, detalle: temas.es });
    resultados.push({ nombre: 'las instrucciones del club están en los tres idiomas', ok: club.es === club.en && club.es === club.pt && club.es.includes('INSTRUCCIONES_CLAUDE') });

    // Idioma de Windows -> idioma de Broots.
    const { desdeCodigo } = require('../../electron/idioma.cjs');
    const casos = { 'es-AR': 'es', 'es-MX': 'es', 'pt-BR': 'pt', 'pt-PT': 'pt', 'en-US': 'en', 'fr-FR': 'en', 'de-DE': 'en' };
    const mal = Object.entries(casos).filter(([codigo, esperado]) => desdeCodigo(codigo) !== esperado).map(([codigo]) => codigo);
    resultados.push({ nombre: 'es* → español, pt* → portugués, el resto → inglés', ok: !mal.length, detalle: mal.join(', ') });
    return resultados;
  },
};
