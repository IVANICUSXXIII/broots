// 1.12 «Definir», sin salir a internet: un servidor en esta PC hace de GitHub (BROOTS_DICCIONARIOS) y sirve diccionarios
// de juguete, armados con el mismo código que los de verdad. Lo que importa:
// - Se baja la primera vez que se pide, con su avance; «Cancelar» no deja nada; una descarga adulterada se descarta.
// - Con el diccionario bajado y el servidor APAGADO, la definición sigue saliendo: eso es «sin internet».
// - Se elige el diccionario por lo que se ve: un párrafo traducido, en el idioma de Broots; el original, en el suyo.
// - Formas conjugadas, pronombres pegados, plurales y tildes («año» no es «ano»).
// - La palabra que no está ofrece «Explicar», y la definición lleva su crédito y se puede guardar como nota.
// - Un diccionario de una versión anterior se sigue usando mientras baja el nuevo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Diccionario } from '../../scripts/armar-diccionarios.mjs';
import { definible, detectarIdioma, elegirDiccionario, idiomaDeCodigo } from '../../src/lib/diccionario.js';

const PUERTO = 47395;
const BASE = `http://127.0.0.1:${PUERTO}`;
const CARPETA = path.join(os.tmpdir(), 'broots-dicc-prueba');
const DATOS = path.join(os.tmpdir(), 'broots-prueba-datos');
const huella = (datos) => crypto.createHash('sha256').update(datos).digest('hex');

const entrada = (lang_code, word, pos, glosses, extra = {}) => ({ word, lang_code, pos, pos_title: extra.titulo, senses: [{ glosses: [glosses].flat(), tags: extra.tags, raw_tags: extra.raw_tags }] });
const forma = (lang_code, word, base, pos = 'verb') => ({ word, lang_code, pos, senses: [{ glosses: [`forma de ${base}`], tags: ['form-of'], form_of: [{ word: base }] }] });

const PALABRAS = {
  en: [
    entrada('en', 'the', 'article', 'Definite article, used before a noun.', { tags: ['formal'] }),
    entrada('en', 'and', 'conj', 'As well as.'),
    entrada('en', 'of', 'prep', 'Belonging to.'),
    entrada('en', 'to', 'prep', 'Toward.'),
    entrada('en', 'in', 'prep', 'Inside.'),
    entrada('en', 'that', 'pron', 'The thing there.'),
    entrada('en', 'with', 'prep', 'Together alongside.'),
    entrada('en', 'be', 'verb', 'To exist.'),
    entrada('en', 'have', 'verb', 'To own.'),
    forma('en', 'was', 'be'),
    forma('en', 'were', 'be'),
    forma('en', 'had', 'have'),
    forma('en', 'has', 'have'),
    // Nombres propios y una definición con doble nivel: lo primero queda afuera, lo segundo se resume.
    { word: 'Hamlet', lang_code: 'en', pos: 'name', senses: [{ glosses: ['A prince.'] }] },
  ],
  es: [
    entrada('es', 'año', 'noun', 'Período de doce meses.', { titulo: 'Sustantivo masculino' }),
    entrada('es', 'ano', 'noun', 'Orificio del recto.', { titulo: 'Sustantivo masculino' }),
    entrada('es', 'decir', 'verb', 'Expresar con palabras.', { titulo: 'Verbo transitivo' }),
    forma('es', 'diciendo', 'decir'),
    entrada('es', 'correr', 'verb', 'Desplazarse rápidamente.', { titulo: 'Verbo intransitivo' }),
    entrada('es', 'correrse', 'verb', 'Apartarse.', { titulo: 'Verbo pronominal' }),
    { word: 'corrió', lang_code: 'es', pos: 'verb', pos_title: 'Forma verbal', senses: [{ glosses: ['Tercera persona de correr.'], tags: ['form-of'], form_of: [{ word: 'correr' }, { word: 'correrse' }] }] },
    entrada('es', 'hermoso', 'adj', ['Que tiene hermosura.', 'Ejemplo que no tiene que aparecer.'], { titulo: 'Adjetivo' }),
    entrada('es', 'laburo', 'noun', 'Ocupación que se desempeña por una retribución.^([cita requerida])', { titulo: 'Sustantivo masculino', tags: ['colloquial', 'Río-de-la-Plata', 'transitive'] }),
    entrada('es', 'a pesar de', 'phrase', 'Contra la voluntad de.', { titulo: 'Locución' }),
    entrada('es', 'casa', 'noun', 'Edificación destinada a vivienda.', { titulo: 'Sustantivo femenino' }),
  ],
  pt: [entrada('pt', 'nova', 'adj', 'que tem pouco tempo de existência', { titulo: 'Adjetivo' })],
};
const PT_VIEJO = [entrada('pt', 'velha', 'adj', 'que tem muito tempo de existência', { titulo: 'Adjetivo' })];

function armar(idioma, palabras, version, relleno) {
  const d = new Diccionario(idioma);
  for (const o of palabras) d.agregarDefiniciones(o);
  const archivo = path.join(CARPETA, `${idioma}-${version}.db`);
  // El relleno no se comprime: así la descarga dura lo suficiente para ver el avance.
  d.escribir(archivo, { version, relleno: crypto.randomBytes(relleno).toString('base64') });
  const datos = fs.readFileSync(archivo);
  return { archivo, comprimido: zlib.brotliCompressSync(datos), disco: datos.length };
}

const pedidos = [];
let servidor = null;
let apagado = false;

function levantarServidor(archivos) {
  const veces = {};
  const trozos = (respuesta, datos, { hasta = datos.length, ms = 50, tamaño = 32 * 1024 } = {}, alTerminar = () => {}) => {
    let lugar = 0;
    const seguir = () => {
      if (respuesta.destroyed) return;
      if (lugar >= hasta) {
        if (hasta >= datos.length) respuesta.end(alTerminar);
        return; // si no, se queda colgado: para probar «Cancelar»
      }
      respuesta.write(datos.subarray(lugar, lugar + tamaño));
      lugar += tamaño;
      setTimeout(seguir, ms);
    };
    respuesta.setHeader('content-length', datos.length);
    seguir();
  };
  servidor = http.createServer((pedido, respuesta) => {
    const nombre = pedido.url.slice(1);
    pedidos.push(nombre);
    const vez = (veces[nombre] = (veces[nombre] ?? 0) + 1);
    const datos = archivos[nombre];
    if (!datos) {
      respuesta.statusCode = 404;
      return respuesta.end();
    }
    // Inglés: la primera vez, adulterado. La segunda, bien, y después el servidor se apaga: de ahí en más no hay «internet».
    if (nombre === 'en.br') {
      if (vez === 1) return respuesta.end(crypto.randomBytes(datos.length));
      return trozos(respuesta, datos, {}, () => {
        setTimeout(() => {
          apagado = true;
          servidor.closeAllConnections();
          servidor.close();
        }, 300);
      });
    }
    // Español: la primera vez se cuelga a mitad de camino, para tocar «Cancelar».
    if (nombre === 'es.br' && vez === 1) return trozos(respuesta, datos, { hasta: datos.length >> 1 });
    // Portugués: la primera vez, adulterado (se sigue usando el viejo); la segunda, bien.
    if (nombre === 'pt.br' && vez === 1) return respuesta.end(crypto.randomBytes(datos.length));
    return respuesta.end(datos);
  });
  servidor.listen(PUERTO, '127.0.0.1');
}

export default {
  descripcion: 'Definir: el diccionario sin internet (baja, verifica, busca, sin conexión, crédito)',
  necesita: { ingles: 1 },
  entorno: () => {
    fs.rmSync(CARPETA, { recursive: true, force: true });
    fs.mkdirSync(CARPETA, { recursive: true });
    const hechos = { en: armar('en', PALABRAS.en, '1.0', 400 * 1024), es: armar('es', PALABRAS.es, '1.0', 400 * 1024), pt: armar('pt', PALABRAS.pt, '1.0', 1024) };
    const manifiesto = {};
    const archivos = {};
    for (const [idioma, h] of Object.entries(hechos)) {
      archivos[`${idioma}.br`] = h.comprimido;
      manifiesto[idioma] = { version: '1.0', archivo: `${idioma}-1.0.db`, url: `${BASE}/${idioma}.br`, sha256: huella(h.comprimido), bajar: h.comprimido.length, disco: h.disco };
    }
    // Italiano: figura en la lista, pero el servidor no lo tiene y, para cuando se pide, ya está apagado.
    manifiesto.it = { version: '1.0', archivo: 'it-1.0.db', url: `${BASE}/it.br`, sha256: 'x', bajar: 1000, disco: 1000 };
    const ruta = path.join(CARPETA, 'manifiesto.json');
    fs.writeFileSync(ruta, JSON.stringify(manifiesto));
    // Un portugués de una versión anterior de Broots, ya bajado.
    const viejo = armar('pt', PT_VIEJO, '0.9', 1024);
    const raiz = path.join(DATOS, 'diccionarios');
    fs.mkdirSync(raiz, { recursive: true });
    fs.copyFileSync(viejo.archivo, path.join(raiz, 'pt-0.9.db'));
    levantarServidor(archivos);
    return { BROOTS_DICCIONARIOS: ruta, BROOTS_TRADUCCION_FALSA: '1', BROOTS_VENTANA: '960x600' };
  },
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    if (!PRUEBA.libros.ingles.length) return comprobar('hay un EPUB en inglés en la biblioteca', false, 'no encontré ninguno');
    const id = PRUEBA.libros.ingles[0].id;

    // ---------- Sin ventana: un diccionario viejo sigue andando mientras baja el nuevo ----------
    const velha = await window.lector.definir('pt', 'velha');
    comprobar('un diccionario de una versión anterior se sigue usando', velha.estado === 'listo' && velha.entradas[0].palabra === 'velha', JSON.stringify(velha).slice(0, 160));
    await esperar(800); // la descarga de atrás llega adulterada y se descarta
    const velhaOtraVez = await window.lector.definir('pt', 'velha');
    comprobar('si el nuevo llega adulterado, el viejo queda', velhaOtraVez.estado === 'listo', velhaOtraVez.estado);
    // (hasta no espera promesas: acá se pregunta de a una.)
    let nova = null;
    for (let i = 0; i < 30 && nova?.estado !== 'listo'; i++) {
      nova = await window.lector.definir('pt', 'nova');
      if (nova.estado !== 'listo') await esperar(300);
    }
    comprobar('el nuevo baja en silencio y reemplaza al viejo', nova?.estado === 'listo' && nova.entradas[0].palabra === 'nova', JSON.stringify(nova).slice(0, 120));

    const sinDiccionario = await window.lector.definir('fr', 'maison');
    comprobar('un idioma sin diccionario lo dice', sinDiccionario.estado === 'sinDiccionario', sinDiccionario.estado);

    // ---------- El libro ----------
    const seleccionar = (el, palabra) => {
      const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const m = new RegExp(`(^|[^\\p{L}])(${palabra})(?![\\p{L}])`, 'u');
      for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
        const hallado = m.exec(n.data);
        if (!hallado) continue;
        const inicio = hallado.index + hallado[1].length;
        const rango = document.createRange();
        rango.setStart(n, inicio);
        rango.setEnd(n, inicio + hallado[2].length);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(rango);
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return hallado[2];
      }
      return null;
    };
    document.querySelector(`[data-tarjeta="${id}"] button`).click();
    const panelLibro = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    boton(panelLibro, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    const lector = texto?.closest('.fixed');
    comprobar('el lector abre el libro', texto);
    if (!texto) return;
    const pie = () => lector.querySelector('footer').innerText;
    await hasta(() => !/de (~|…)/.test(pie()), 60000);
    const visibles = () => {
      const recorte = texto.parentElement.getBoundingClientRect();
      return [...texto.querySelectorAll('[data-p]')].filter((el) => [...el.getClientRects()].some((r) => r.right > recorte.left + 5 && r.left < recorte.right - 5 && r.top < recorte.bottom - 20));
    };
    for (let i = 0; i < 15 && visibles().filter((p) => p.textContent.length > 80).length < 1; i++) {
      tecla('ArrowRight');
      await esperar(700);
    }
    const tarjeta = () => lector.querySelector('[data-tarjeta-definir]');
    const barra = () => lector.querySelector('[data-barra-subrayado]');
    let ingles = null; // el párrafo en inglés (ver abajo)
    /** Selecciona esa palabra del párrafo en inglés y toca «Definir». */
    const definirPalabra = async (palabras) => {
      const elegida = seleccionar(ingles, palabras);
      (await hasta(barra, 5000))?.querySelector('[data-accion="definir"]')?.click();
      await hasta(tarjeta, 5000);
      return elegida;
    };

    // ---------- Párrafo traducido: el diccionario de Broots. Se baja la primera vez, y «Cancelar» corta ----------
    await hasta(() => visibles().some((p) => p.textContent.startsWith('ES·') && p.textContent.length > 80), 20000);
    const traducido = visibles().find((p) => p.textContent.startsWith('ES·') && p.textContent.length > 80);
    comprobar('hay un párrafo traducido para probar', traducido);
    const primera = seleccionar(traducido, 'ES');
    const laBarra = await hasta(barra, 5000);
    comprobar('la barrita ofrece «Definir»', laBarra?.querySelector('[data-accion="definir"]'));
    const cajaBarra = laBarra?.getBoundingClientRect();
    comprobar('la barrita entra en la ventana a 960 px, con «Definir» y todo', cajaBarra && cajaBarra.left >= 0 && cajaBarra.right <= window.innerWidth, cajaBarra ? `${Math.round(cajaBarra.left)} a ${Math.round(cajaBarra.right)}, ancho ${Math.round(cajaBarra.width)}` : '');
    laBarra.querySelector('[data-accion="definir"]').click();
    const bajando = await hasta(() => lector.querySelector('[data-tarjeta-definir="bajando"]'), 5000);
    comprobar('en un párrafo traducido usa el diccionario de Broots, y lo baja', bajando?.dataset.idioma === 'es', `${primera}: ${bajando?.dataset.idioma}`);
    comprobar('dice qué baja y cuánto pesa', /diccionario de español \(\d/.test(bajando?.querySelector('[data-bajando-mensaje]')?.innerText ?? ''), bajando?.querySelector('[data-bajando-mensaje]')?.innerText);
    const avance = () => Number(/scaleX\(([\d.]+)\)/.exec(bajando?.querySelector('[data-bajando-avance]')?.style.transform ?? '')?.[1] ?? 0);
    comprobar('muestra el avance', await hasta(() => avance() > 0 && avance() < 1, 8000), String(avance()));
    bajando?.querySelector('[data-bajando-cancelar]').click();
    comprobar('«Cancelar» cierra la tarjeta', await hasta(() => !tarjeta(), 3000));
    window.getSelection().removeAllRanges();

    // Después, sin apuro: el español entero (lo pide directo, sin pasar por la tarjeta).
    const bajada = await window.lector.bajarDiccionario('es');
    comprobar('el diccionario de español baja completo la segunda vez', bajada.ok, JSON.stringify(bajada));
    const palabraDe = (r) => r.entradas?.[0]?.palabra;
    const casos = [
      ['año', 'año', false], ['ano', 'ano', false], ['Año', 'año', false], ['AÑO', 'año', false],
      ['«casa,»', 'casa', false], ['a pesar de', 'a pesar de', false],
      ['corrió', 'correr', true], ['Corrió', 'correr', true], ['diciéndole', 'decir', true], ['hermosas', 'hermoso', true],
    ];
    for (const [pedido, esperado, esForma] of casos) {
      const r = await window.lector.definir('es', pedido);
      comprobar(`«${pedido}» → «${esperado}»${esForma ? ' (como forma)' : ''}`, r.estado === 'listo' && palabraDe(r) === esperado && r.entradas[0].forma === esForma, JSON.stringify(r).slice(0, 160));
    }
    const corrio = await window.lector.definir('es', 'corrió');
    comprobar('si está «correr», no repite «correrse»', corrio.entradas?.length === 1, JSON.stringify(corrio.entradas?.map((e) => e.palabra)));
    const laburo = await window.lector.definir('es', 'laburo');
    const sentido = laburo.entradas?.[0]?.categorias[0];
    comprobar('la definición viene limpia, con categoría y marcas en español', sentido?.nombre === 'Sustantivo masculino' && sentido.sentidos[0].texto === 'Ocupación que se desempeña por una retribución.' && sentido.sentidos[0].marcas === 'coloquial, Río de la Plata', JSON.stringify(sentido));
    const hermoso = await window.lector.definir('es', 'hermoso');
    comprobar('de una definición con varios párrafos queda el primero', hermoso.entradas?.[0]?.categorias[0].sentidos.length === 1 && hermoso.entradas[0].categorias[0].sentidos[0].texto === 'Que tiene hermosura.', JSON.stringify(hermoso.entradas?.[0]));
    comprobar('una palabra que no está lo dice', (await window.lector.definir('es', 'xyzzy')).estado === 'noEsta');

    // ---------- El original: el diccionario de su idioma. Primero llega adulterado ----------
    lector.querySelector('[data-tour="traducir"]')?.click();
    comprobar('sin traducción, el párrafo vuelve al original', await hasta(() => !visibles().some((p) => p.textContent.startsWith('ES·')), 8000));
    // El libro sale de la biblioteca y no siempre está en el idioma que dice Calibre (hay uno marcado inglés y escrito en
    // español, y Broots acierta con el español): para que la prueba no dependa de eso, el párrafo se escribe acá.
    ingles = visibles().find((p) => p.textContent.length > 80);
    ingles.textContent = 'The dog was running through the park and she had a strange conversation with the neighbours that morning, but nobody knew what they were saying.';
    await definirPalabra('the|The');
    const conError = await hasta(() => lector.querySelector('[data-tarjeta-definir="error"]'), 10000);
    comprobar('una descarga adulterada se descarta y lo dice', /no coincide/.test(conError?.querySelector('[data-error-definir]')?.innerText ?? ''), conError?.innerText);
    conError?.querySelector('[data-definir-reintentar]').click();
    comprobar('«Reintentar» la baja de nuevo', await hasta(() => lector.querySelector('[data-tarjeta-definir="bajando"]'), 5000));
    const lista = await hasta(() => lector.querySelector('[data-tarjeta-definir="listo"]'), 15000);
    comprobar('al terminar, aparece la definición sola', /Definite article/.test(lista?.querySelector('[data-definicion]')?.innerText ?? ''), lista?.innerText);
    comprobar('del diccionario de inglés', lista?.dataset.idioma === 'en', lista?.dataset.idioma);
    comprobar('con la categoría y la marca en inglés', /Article/.test(lista?.innerText ?? '') && /formal/.test(lista?.innerText ?? ''), lista?.innerText);
    comprobar('y el crédito: Wiktionary, resumido, CC BY-SA 4.0', /Wiktionary \(resumido\) · CC BY-SA 4\.0/.test(lista?.querySelector('[data-credito]')?.innerText ?? ''), lista?.querySelector('[data-credito]')?.innerText);
    const cajaTarjeta = lista?.getBoundingClientRect();
    comprobar('la tarjeta entra en la ventana', cajaTarjeta && cajaTarjeta.top >= 0 && cajaTarjeta.bottom <= window.innerHeight && cajaTarjeta.right <= window.innerWidth, cajaTarjeta ? `${Math.round(cajaTarjeta.top)} a ${Math.round(cajaTarjeta.bottom)} de ${window.innerHeight}` : '');
    lista?.querySelector('[data-credito-entrada]').click();
    lista?.querySelector('[data-credito-licencia]').click();
    await esperar(300);
    const paginaAntes = lector.querySelector('footer input')?.value;
    tecla('Escape');
    comprobar('Esc cierra la tarjeta', await hasta(() => !tarjeta(), 3000));
    comprobar('sin pasar de página', lector.querySelector('footer input')?.value === paginaAntes);
    window.getSelection().removeAllRanges();

    // ---------- De acá en más, el servidor está apagado: esto ya es «sin internet» ----------
    await esperar(600);
    const apagadoDeVerdad = await window.lector.bajarDiccionario('it');
    comprobar('con el servidor apagado, un diccionario que falta no baja', !apagadoDeVerdad.ok && /internet/.test(apagadoDeVerdad.mensaje ?? ''), JSON.stringify(apagadoDeVerdad));
    const inicio = performance.now();
    const rapida = await window.lector.definir('en', 'the');
    const ms = performance.now() - inicio;
    comprobar('sin internet, la definición sale igual', rapida.estado === 'listo', rapida.estado);
    comprobar('y al instante', ms < 200, `${Math.round(ms)} ms`);

    await definirPalabra('was|were|had|has');
    const deForma = await hasta(() => lector.querySelector('[data-tarjeta-definir="listo"]'), 5000);
    comprobar('sin internet también en pantalla: una forma lleva a su palabra', /Forma de/.test(deForma?.innerText ?? '') && /To (exist|own)/.test(deForma?.innerText ?? ''), deForma?.innerText);
    deForma?.querySelector('[data-definir-guardar]').click();
    comprobar('«Guardar como nota» subraya', await hasta(() => texto.querySelector('mark[data-subrayado]'), 5000));
    await hasta(() => !tarjeta(), 3000);

    // Una palabra que no está: la tarjeta lo dice y lleva a «Explicar».
    await definirPalabra('[A-Za-z]{9,}');
    const noEsta = await hasta(() => lector.querySelector('[data-tarjeta-definir="noEsta"]'), 5000);
    comprobar('la palabra que no está lo dice', /no está en el diccionario de inglés/.test(noEsta?.innerText ?? ''), noEsta?.innerText);
    comprobar('y no llama sola a Gemini', !lector.querySelector('[data-tarjeta-explicar]'));
    noEsta?.querySelector('[data-definir-explicar]').click();
    comprobar('«Explicar con Gemini» pasa a la explicación', await hasta(() => lector.querySelector('[data-tarjeta-explicar="listo"]'), 8000));
    comprobar('y se cierra la del diccionario', !tarjeta());
    tecla('Escape');
    await hasta(() => !lector.querySelector('[data-tarjeta-explicar]'), 3000);
    window.getSelection().removeAllRanges();

    // Una frase larga no se define (es para «Explicar»).
    const rango = document.createRange();
    rango.selectNodeContents(ingles);
    const seleccion = window.getSelection();
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    ingles.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const conFrase = await hasta(barra, 5000);
    comprobar('una frase larga no ofrece «Definir»', conFrase && !conFrase.querySelector('[data-accion="definir"]') && conFrase.querySelector('[data-accion="explicar"]'));
    tecla('Escape');
    await esperar(300);
    tecla('Escape');
    await hasta(() => !document.body.contains(lector), 5000);
    await esperar(800);
  },

  // En Node, con Broots ya cerrado.
  async verificar({ DATOS: datos, BIBLIOTECA }) {
    if (!apagado) servidor.close();
    const resultados = [];
    const carpeta = path.join(datos, 'diccionarios');
    const hay = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).sort() : [];
    resultados.push({ nombre: 'quedan solo los diccionarios enteros y verificados', ok: hay.join() === 'en-1.0.db,es-1.0.db,pt-1.0.db', detalle: hay.join(', ') });
    resultados.push({ nombre: 'el viejo se borró al llegar el nuevo', ok: !hay.includes('pt-0.9.db') });

    const veces = (n) => pedidos.filter((x) => x === n).length;
    resultados.push({ nombre: 'el inglés se bajó dos veces (adulterado y bien), ni una más', ok: veces('en.br') === 2, detalle: String(veces('en.br')) });
    resultados.push({ nombre: 'el servidor quedó apagado antes de las búsquedas sin internet', ok: apagado });

    const log = fs.existsSync(path.join(datos, 'busquedas.log')) ? fs.readFileSync(path.join(datos, 'busquedas.log'), 'utf8') : '';
    resultados.push({ nombre: 'el crédito lleva a la página de Wiktionary', ok: /https:\/\/en\.wiktionary\.org\/wiki\/the/.test(log), detalle: log.trim() });
    resultados.push({ nombre: 'y al texto de la licencia', ok: log.includes('https://creativecommons.org/licenses/by-sa/4.0/deed.es') });

    const subrayados = path.join(BIBLIOTECA, '.broots', 'subrayados-lector');
    const propios = fs.existsSync(subrayados) ? fs.readdirSync(subrayados).flatMap((n) => Object.values(JSON.parse(fs.readFileSync(path.join(subrayados, n), 'utf8')).libros).flat()) : [];
    resultados.push({
      nombre: 'la nota lleva la definición y su crédito',
      ok: propios.some((x) => !x.borrado && /^Definición de «(be|have)» \(Wiktionary, CC BY-SA 4\.0\): 1\. To (exist|own)\./.test(x.nota ?? '')),
      detalle: propios.map((x) => x.nota).join(' | ').slice(0, 200),
    });

    // El nombre propio quedó afuera del diccionario.
    const d = new Diccionario('en');
    for (const o of PALABRAS.en) d.agregarDefiniciones(o);
    resultados.push({ nombre: 'los nombres propios no entran en el diccionario', ok: !d.definiciones.has('Hamlet') });

    // Elegir el diccionario.
    const idiomas = [
      ['El perro corría por el parque mientras ella lo miraba desde la ventana, y nadie sabía por qué.', 'es'],
      ['The dog was running through the park while she watched him from the window, and nobody knew why.', 'en'],
      ['O cachorro corria pelo parque enquanto ela olhava da janela, e ninguém sabia por quê.', 'pt'],
      ['Le chien courait dans le parc et elle le regardait depuis la fenêtre, mais personne ne savait pourquoi.', 'fr'],
      ['Der Hund lief durch den Park und sie sah ihm aus dem Fenster zu, aber niemand wusste warum.', 'de'],
      ['—Sí.', null],
      // Párrafos con pocas palabras comunes: las terminaciones ayudan.
      ['Nos gustaría prestar atención a la pobreza en Estados Unidos, aunque resulte incómodo reconocer sus causas.', 'es'],
      ['Hoy, millones de personas viven sin agua corriente, y muchos niños pasan hambre cada día de la semana.', 'es'],
      ['Precisamos prestar atenção à pobreza no Brasil, mesmo que seja incômodo reconhecer suas causas.', 'pt'],
    ];
    const mal = idiomas.filter(([t, esperado]) => detectarIdioma(t) !== esperado).map(([t, e]) => `${t.slice(0, 20)}: ${detectarIdioma(t)} (esperaba ${e})`);
    resultados.push({ nombre: 'reconoce el idioma de un párrafo', ok: !mal.length, detalle: mal.join('; ') });
    const codigos = [['spa', 'es'], ['es-AR', 'es'], ['eng', 'en'], ['en', 'en'], ['por', 'pt'], ['pt-BR', 'pt'], ['fra', 'fra'], ['und', null], ['', null], [null, null]];
    const malos = codigos.filter(([c, e]) => idiomaDeCodigo(c) !== e).map(([c]) => String(c));
    resultados.push({ nombre: 'entiende los códigos de idioma de Calibre y del EPUB', ok: !malos.length, detalle: malos.join(', ') });
    const eleccion = [
      [{ parrafo: 'cualquier cosa', traducido: true, idiomaLibro: 'eng', idiomaBroots: 'es' }, 'es'],
      [{ parrafo: idiomas[1][0], traducido: false, idiomaLibro: 'spa', idiomaBroots: 'es' }, 'en'],
      [{ parrafo: '—Sí.', traducido: false, idiomaLibro: 'por', idiomaBroots: 'es' }, 'pt'],
      [{ parrafo: '—Sí.', vecinos: idiomas[0][0], traducido: false, idiomaLibro: 'eng', idiomaBroots: 'en' }, 'es'],
      [{ parrafo: '—Sí.', traducido: false, idiomaLibro: '', idiomaBroots: 'en' }, 'en'],
      [{ parrafo: '—Oui.', traducido: false, idiomaLibro: 'fra', idiomaBroots: 'es' }, 'fra'],
    ];
    const malElegidos = eleccion.filter(([e, esperado]) => elegirDiccionario(e) !== esperado);
    resultados.push({ nombre: 'elige bien el diccionario', ok: !malElegidos.length, detalle: JSON.stringify(malElegidos).slice(0, 200) });
    const definibles = [['casa', true], ['a pesar de', true], ['hacer la vista gorda', true], ['una frase de muchas palabras que ya no es una expresión', false], ['1984', false], ['', false]];
    const malDefinibles = definibles.filter(([t, e]) => definible(t) !== e).map(([t]) => t);
    resultados.push({ nombre: 'ofrece «Definir» solo para palabras y expresiones cortas', ok: !malDefinibles.length, detalle: malDefinibles.join(' | ') });

    fs.rmSync(CARPETA, { recursive: true, force: true });
    return resultados;
  },
};
