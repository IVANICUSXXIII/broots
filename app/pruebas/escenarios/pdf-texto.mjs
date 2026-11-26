// 1.14: el texto de los PDF. Seleccionar con el mouse sobre la capa de texto, subrayar, nota, «Definir», «Explicar»,
// un subrayado que cruza de una página a la otra, el zoom (el subrayado sigue en su lugar), arrastrar sobre el texto no
// mueve la página, la traducción en el panel, borrar con «Deshacer», la lista, volver a abrir, y el PDF escaneado (un
// cartel claro, una sola vez). Al final, en disco: el archivo de subrayados y el .md con «PDF · p. N».
// Los PDF se arman en libros-de-prueba.mjs (con párrafos, números de página impresos desde el 10 y un índice).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { pdf } from '../libros-de-prueba.mjs';

const CALIBREDB = ['C:\\Program Files\\Calibre2', 'C:\\Program Files (x86)\\Calibre2', path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Calibre2')]
  .map((c) => path.join(c, 'calibredb.exe'))
  .find((r) => fs.existsSync(r));

const NOTA = 'Nota de prueba en el PDF';
const PAGINAS = [
  [
    ['El viejo faro de la costa se encendía cada noche a la misma hora,', 'aunque hacía años que ningún barco pasaba por esas aguas tranqui-', 'las del sur.'],
    ['La guardiana subía la escalera de caracol con una lámpara en la', 'mano y contaba los escalones en voz baja.'],
    ['Nadie sabía por qué seguía haciéndolo.'],
  ],
  [['Una tarde llegó una carta sin remitente. Decía solamente que el', 'faro debía seguir encendido hasta el invierno, pase lo que pase, y']],
  [['que la respuesta llegaría con la primera tormenta del año.'], ['La guardiana guardó la carta en el bolsillo del delantal.']],
  [['Fin de la prueba.']],
];
const ids = {};

export default {
  descripcion: 'Texto en PDF: seleccionar, subrayar, nota, Definir, Explicar, traducción al costado, zoom y escaneados',
  entorno: { BROOTS_TRADUCCION_FALSA: '1', BROOTS_VENTANA: '1440x900' },
  config: ({ BIBLIOTECA }) => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'broots-pdf-texto-'));
    const agregar = (clave, datos, titulo) => {
      const r = spawnSync(CALIBREDB, ['add', '--with-library', BIBLIOTECA, '--empty', '--title', titulo, '--languages', 'spa'], { encoding: 'utf8' });
      const id = Number(/(\d+)\s*$/.exec(r.stdout.trim())?.[1]);
      if (!id) throw new Error(`calibredb no agregó «${titulo}»: ${r.stdout} ${r.stderr}`);
      const archivo = path.join(carpeta, `${clave}.pdf`);
      fs.writeFileSync(archivo, datos);
      const f = spawnSync(CALIBREDB, ['add_format', '--with-library', BIBLIOTECA, String(id), archivo], { encoding: 'utf8' });
      if (f.status !== 0) throw new Error(`calibredb no agregó el archivo de «${titulo}»: ${f.stderr}`);
      ids[clave] = id;
    };
    const indice = [{ titulo: 'Capítulo uno', pagina: 0 }, { titulo: 'Capítulo dos', pagina: 2 }];
    agregar('texto', pdf({ paginas: PAGINAS.length, texto: (n) => PAGINAS[n], indice, primeraEtiqueta: 10, giradas: [3] }), 'Prueba Zzz El faro');
    agregar('escaneado', pdf({ paginas: 3, escaneado: true }), 'Prueba Zzz Escaneado');
    fs.rmSync(carpeta, { recursive: true, force: true });
    return {};
  },
  datos: () => ({ ids, NOTA }),
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    const { ids, NOTA } = PRUEBA;
    const raiz = () => document.querySelector('[data-lector-paginas]');
    const pliego = () => [...document.querySelectorAll('[data-pliego]')].at(-1)?.dataset.pliego;
    const capa = (n) => document.querySelector(`[data-ranura-texto="${n}"] [data-capa-texto="${n}"]`);
    const hoja = (n) => document.querySelector(`[data-ranura-texto="${n}"]`)?.parentElement;
    const barra = () => document.querySelector('[data-barra-subrayado]');
    const marcas = (n, id) => [...(capa(n)?.querySelectorAll(id ? `mark[data-subrayado="${id}"]` : 'mark[data-subrayado]') ?? [])];
    const raton = (tipo, el, extra = {}) => {
      const caja = el.getBoundingClientRect?.() ?? { left: 700, top: 400, width: 0, height: 0 };
      el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, clientX: caja.left + caja.width / 2, clientY: caja.top + caja.height / 2, ...extra }));
    };
    const transformado = () => raiz().querySelector('[data-lienzo]').style.transform;
    const pellizco = (deltaY) => raiz().querySelector('[data-marco-paginas]').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY, clientX: 700, clientY: 400 }));
    const escribirEn = (area, valor) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, valor);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };
    /** Un punto del texto de una capa (como lo cuenta textContent) -> [nodo, desplazamiento]. */
    const punto = (el, lugar) => {
      const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let cuenta = 0;
      for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
        if (lugar <= cuenta + n.data.length) return [n, lugar - cuenta];
        cuenta += n.data.length;
      }
      return null;
    };
    /** Selecciona con el «mouse» desde un texto hasta otro (pueden estar en dos capas), como al arrastrar. */
    const seleccionar = (elInicio, desdeTexto, elFin = elInicio, hastaTexto = desdeTexto) => {
      const desde = elInicio.textContent.indexOf(desdeTexto);
      const hastaLugar = elFin.textContent.indexOf(hastaTexto) + hastaTexto.length;
      const [nodoA, a] = punto(elInicio, desde);
      const [nodoB, b] = punto(elFin, hastaLugar);
      raton('mousedown', nodoA.parentElement.closest('.capa-texto > span'));
      const rango = document.createRange();
      rango.setStart(nodoA, a);
      rango.setEnd(nodoB, b);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(rango);
      raton('mouseup', nodoB.parentElement);
    };
    const tocarMarca = (marca) => {
      raton('mousedown', marca);
      raton('mouseup', marca);
    };
    let enElPanel = null;
    const abrir = async (id) => {
      if (!document.querySelector('.fixed.top-11') || enElPanel !== id) {
        document.querySelector(`[data-tarjeta="${id}"] button`).click();
        await esperar(700);
      }
      enElPanel = id;
      const panel = await hasta(() => document.querySelector('.fixed.top-11'));
      boton(panel, 'Leer').click();
      return hasta(() => raiz(), 15000);
    };
    const cerrar = async () => {
      for (let i = 0; i < 6 && raiz(); i++) {
        tecla('Escape');
        await esperar(300);
      }
      await hasta(() => !raiz(), 5000);
      await esperar(600);
    };
    const fraccion = (marca, n) => {
      const a = marca.getBoundingClientRect();
      const b = hoja(n).getBoundingClientRect();
      return [(a.left - b.left) / b.width, (a.top - b.top) / b.height, a.width / b.width];
    };

    // ---------- Abrir: la capa de texto ----------
    await abrir(ids.texto);
    const capa0 = await hasta(() => capa(0)?.querySelector('span') && capa(0), 30000);
    comprobar('el PDF trae su capa de texto', capa0);
    if (!capa0) return;
    comprobar('la primera vez, la pista cuenta que se puede seleccionar texto', raiz().querySelector('[data-pista="pdf"]'));
    comprobar('la capa tiene el texto de la página', capa0.textContent.includes('El viejo faro de la costa'), capa0.textContent.slice(0, 80));
    comprobar('sin cartel de escaneado en un PDF con texto', !raiz().querySelector('[data-aviso-sin-texto]') && !raiz().dataset.sinTexto);
    // La primera línea está a 82 puntos del borde de arriba (de 842): la capa tiene que quedar encima del dibujo.
    const primera = [...capa0.querySelectorAll('span')].find((s) => s.textContent.startsWith('El viejo'));
    const arriba = primera ? (primera.getBoundingClientRect().top - hoja(0).getBoundingClientRect().top) / hoja(0).getBoundingClientRect().height : -1;
    comprobar('las letras invisibles quedan encima de las dibujadas', arriba > 0.07 && arriba < 0.1, arriba.toFixed(3));

    // ---------- Seleccionar y subrayar (dos líneas, con una palabra cortada con guion) ----------
    seleccionar(capa0, 'aunque hacía', capa0, 'del sur.');
    const nueva = await hasta(() => barra()?.dataset.barraSubrayado === 'nuevo' && barra(), 3000);
    comprobar('al seleccionar aparece la barrita con los colores', nueva?.querySelectorAll('[data-color]').length === 4);
    nueva?.querySelector('[data-color="verde"]').click();
    const verde = await hasta(() => marcas(0).find((m) => m.classList.contains('verde')), 3000);
    comprobar('el subrayado se pinta en la página', verde);
    const idVerde = verde?.dataset.subrayado;
    comprobar('la selección se limpió', window.getSelection().isCollapsed);

    raiz().querySelector('[data-boton-subrayados]').click();
    const item = await hasta(() => document.querySelector(`[data-item-subrayado="${idVerde}"]`), 3000);
    comprobar('la lista lo muestra con las líneas unidas (sin el guion de corte)', item?.innerText.includes('aunque hacía años que ningún barco pasaba por esas aguas tranquilas del sur.'), item?.innerText);
    comprobar('y con su página impresa', item?.innerText.includes('PDF · p. 10'), item?.innerText);
    comprobar('agrupado en su capítulo del índice', document.querySelector('[data-panel-subrayados]')?.innerText.includes('Capítulo uno'));
    raiz().querySelector('[data-boton-subrayados]').click();
    await esperar(400);

    // ---------- Zoom: el subrayado sigue en su lugar; arrastrar sobre el texto no mueve la página ----------
    const antes = fraccion(verde, 0);
    pellizco(-30);
    pellizco(-30);
    pellizco(-30);
    await esperar(800);
    const despues = marcas(0, idVerde)[0] ? fraccion(marcas(0, idVerde)[0], 0) : null;
    comprobar('con zoom, el subrayado queda en el mismo lugar de la página', despues && antes.every((v, k) => Math.abs(v - despues[k]) < 0.01), `${antes.map((v) => v.toFixed(3))} -> ${despues?.map((v) => v.toFixed(3))}`);
    const quieto = transformado();
    const span = [...capa0.querySelectorAll('span')].find((s) => s.textContent.startsWith('Nadie'));
    raton('mousedown', span);
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 200 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 200 }));
    await esperar(200);
    comprobar('acercada, arrastrar sobre el texto no mueve la página', transformado() === quieto, transformado());
    const ranura = document.querySelector('[data-ranura-texto="0"]');
    ranura.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 700, clientY: 450 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 640, clientY: 380 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 640, clientY: 380 }));
    await esperar(200);
    comprobar('fuera del texto, arrastrar sí la mueve', transformado() !== quieto, transformado());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }));
    await esperar(600);

    // ---------- Nota ----------
    tocarMarca(marcas(0, idVerde)[0]);
    const editar = await hasta(() => barra()?.dataset.barraSubrayado === 'editar' && barra(), 3000);
    comprobar('tocar un subrayado abre su barrita (sin pasar de página)', editar && pliego() === '0', pliego());
    editar?.querySelector('[data-accion="nota"]').click();
    const area = await hasta(() => document.querySelector('[data-nota-subrayado] textarea'), 3000);
    if (area) {
      escribirEn(area, NOTA);
      document.querySelector('[data-guardar-nota]').click();
    }
    comprobar('la nota queda marcada en el subrayado', await hasta(() => marcas(0, idVerde)[0]?.classList.contains('con-nota'), 3000));

    // ---------- Definir y Explicar ----------
    seleccionar(capa0, 'faro');
    const conDefinir = await hasta(() => barra()?.querySelector('[data-accion="definir"]'), 3000);
    comprobar('con una palabra, la barrita ofrece «Definir»', conDefinir);
    conDefinir?.click();
    const definicion = await hasta(() => document.querySelector('[data-tarjeta-definir]'), 3000);
    comprobar('«Definir» abre su tarjeta con el diccionario del libro (español)', definicion?.dataset.idioma === 'es', definicion?.dataset.idioma);
    tecla('Escape');
    await esperar(400);

    seleccionar(capa0, 'guardiana');
    const conExplicar = await hasta(() => barra()?.querySelector('[data-accion="explicar"]'), 3000);
    conExplicar?.click();
    const explicacion = await hasta(() => document.querySelector('[data-tarjeta-explicar="listo"]'), 8000);
    comprobar('«Explicar» responde con lo seleccionado', explicacion?.innerText.includes('«guardiana»'), explicacion?.innerText.slice(0, 120));
    explicacion?.querySelector('[data-guardar-explicacion]')?.click();
    const conExplicacion = await hasta(() => marcas(0).find((m) => m.dataset.subrayado !== idVerde && m.classList.contains('con-nota')), 3000);
    comprobar('guardar la explicación subraya la palabra con la nota', conExplicacion);

    // ---------- Un subrayado que cruza de página (de a dos) ----------
    tecla('ArrowRight');
    await hasta(() => pliego() === '1-2', 3000);
    const capa1 = await hasta(() => capa(1)?.querySelector('span') && capa(1), 8000);
    const capa2 = await hasta(() => capa(2)?.querySelector('span') && capa(2), 8000);
    comprobar('de a dos, las dos páginas traen su capa', capa1 && capa2, pliego());
    if (capa1 && capa2) {
      seleccionar(capa1, 'pase lo que pase', capa2, 'primera tormenta');
      (await hasta(() => barra()?.querySelector('[data-color="celeste"]'), 3000))?.click();
      const celeste = await hasta(() => marcas(1).find((m) => m.classList.contains('celeste')), 3000);
      const idCeleste = celeste?.dataset.subrayado;
      comprobar('un subrayado puede seguir en la página de al lado', celeste && marcas(2, idCeleste).length > 0);

      // ---------- Traducción al costado ----------
      raiz().querySelector('[data-boton-traducir]').click();
      const panel = await hasta(() => document.querySelector('[data-panel-traduccion]'), 3000);
      comprobar('«Traducir» abre el panel al costado', panel);
      const listos = await hasta(() => panel?.querySelectorAll('[data-parrafo-traducido="si"]').length === 3 && [...panel.querySelectorAll('[data-parrafo-traducido="si"]')], 8000);
      comprobar('traduce las dos páginas a la vista, párrafo por párrafo', listos?.every((p) => p.textContent.startsWith('ES· ')), listos?.map((p) => p.textContent.slice(0, 30)).join(' | ') ?? panel?.innerText.slice(0, 200));
      comprobar('el PDF queda a la vista (el panel no lo tapa)', hoja(1).getBoundingClientRect().right <= panel.getBoundingClientRect().left + 1);
      if (listos) {
        const rango = document.createRange();
        rango.selectNodeContents(listos[0].firstChild);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(rango);
        panel.querySelector('.seleccionable').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        const lectura = await hasta(() => barra()?.dataset.barraSubrayado === 'lectura' && barra(), 3000);
        comprobar('en la traducción, la barrita ofrece copiar pero no subrayar', lectura && !lectura.querySelector('[data-color]') && lectura.querySelector('[data-accion="copiar"]'));
        tecla('Escape');
        await esperar(300);
      }
      raiz().querySelector('[data-boton-traducir]').click();
      await hasta(() => !document.querySelector('[data-panel-traduccion]'), 3000);

      // ---------- La lista lleva a su página ----------
      tecla('ArrowLeft');
      await hasta(() => pliego() === '0', 3000);
      raiz().querySelector('[data-boton-subrayados]').click();
      (await hasta(() => document.querySelector(`[data-item-subrayado="${idCeleste}"]`), 3000))?.click();
      const llego = await hasta(() => pliego() === '1-2' && marcas(1, idCeleste)[0]?.classList.contains('destacado'), 4000);
      comprobar('tocar un subrayado de la lista lleva a su página y lo destaca', llego, pliego());
      tecla('ArrowLeft');
      await hasta(() => pliego() === '0', 3000);
    }

    // ---------- Una página guardada «de costado» (/Rotate 90): la capa gira con el dibujo ----------
    tecla('ArrowRight');
    await hasta(() => pliego() === '1-2', 3000);
    tecla('ArrowRight');
    await hasta(() => pliego() === '3', 3000);
    const capa3 = await hasta(() => capa(3)?.querySelector('span') && capa(3), 8000);
    const fin = capa3 && [...capa3.querySelectorAll('span')].find((s) => s.textContent.startsWith('Fin'));
    if (fin) {
      const a = fin.getBoundingClientRect();
      const b = hoja(3).getBoundingClientRect();
      const x = (a.left + a.width / 2 - b.left) / b.width;
      const y = (a.top + a.height / 2 - b.top) / b.height;
      // Girada 90° a la derecha, la línea de arriba a la izquierda queda vertical, arriba a la derecha.
      comprobar('en una página girada, el texto invisible gira con el dibujo', a.height > a.width && x > 0.8 && y < 0.5, `x ${x.toFixed(2)} y ${y.toFixed(2)} · ${Math.round(a.width)}×${Math.round(a.height)}`);
    } else comprobar('en una página girada, el texto invisible gira con el dibujo', false, 'no encontré la capa de la página 4');
    tecla('ArrowLeft');
    await hasta(() => pliego() === '1-2', 3000);
    tecla('ArrowLeft');
    await hasta(() => pliego() === '0', 3000);

    // ---------- Borrar y «Deshacer» ----------
    tocarMarca(marcas(0, idVerde)[0]);
    (await hasta(() => barra()?.querySelector('[data-accion="borrar"]'), 3000))?.click();
    comprobar('borrar lo saca de la página', await hasta(() => !marcas(0, idVerde).length, 3000));
    const deshacer = await hasta(() => raiz().querySelector('[data-accion-aviso]'), 3000);
    deshacer?.click();
    comprobar('«Deshacer» lo devuelve, con su nota', await hasta(() => marcas(0, idVerde)[0]?.classList.contains('con-nota'), 4000));
    await esperar(1200);

    // ---------- Volver a abrir ----------
    await cerrar();
    await abrir(ids.texto);
    const vuelve = await hasta(() => marcas(0, idVerde).length && marcas(0).length >= 3, 20000);
    comprobar('al volver a abrir, los subrayados siguen ahí', vuelve, marcas(0).length);
    comprobar('la pista no se repite', !raiz().querySelector('[data-pista="pdf"]'));
    await cerrar();

    // ---------- Un PDF escaneado ----------
    await abrir(ids.escaneado);
    const cartel = await hasta(() => raiz()?.querySelector('[data-aviso-sin-texto="escaneado"]'), 15000);
    comprobar('un PDF escaneado avisa con claridad', cartel?.innerText.includes('escaneado'), cartel?.innerText);
    comprobar('y no ofrece traducir', raiz()?.querySelector('[data-boton-traducir]')?.disabled);
    comprobar('ni arma capa de texto', !raiz()?.querySelector('.capa-texto'));
    cartel?.querySelector('[data-cerrar-sin-texto]')?.click();
    await cerrar();
    await abrir(ids.escaneado);
    await hasta(() => raiz()?.dataset.sinTexto, 15000);
    await esperar(600);
    comprobar('el cartel sale una sola vez por libro', raiz()?.dataset.sinTexto === 'escaneado' && !raiz().querySelector('[data-aviso-sin-texto]'));
    await cerrar();
  },
  // En disco (Node, con Broots ya cerrado).
  verificar({ BIBLIOTECA }) {
    const resultados = [];
    const carpeta = path.join(BIBLIOTECA, '.broots', 'subrayados-lector');
    const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((n) => n.endsWith('.json')) : [];
    const registros = archivos.flatMap((n) => Object.values(JSON.parse(fs.readFileSync(path.join(carpeta, n), 'utf8')).libros ?? {}).flat());
    const vigentes = registros.filter((r) => !r.borrado);
    resultados.push({ nombre: 'quedaron los tres subrayados del PDF', ok: vigentes.length === 3 && vigentes.every((r) => r.formato === 'PDF' && r.href === 'PDF'), detalle: JSON.stringify(vigentes.map((r) => [r.color, r.formato, r.parrafo])) });
    const verde = vigentes.find((r) => r.texto.startsWith('aunque'));
    resultados.push({ nombre: 'el verde guarda su página impresa y la nota', ok: verde?.color === 'verde' && verde?.etiquetaPagina === '10' && verde?.nota === NOTA && verde?.parrafo === 0, detalle: JSON.stringify(verde) });
    const celeste = vigentes.find((r) => r.parrafoFin === 2);
    resultados.push({
      nombre: 'el celeste va de la página 11 a la 12, con la frase unida',
      ok: celeste?.parrafo === 1 && celeste?.parrafoFin === 2 && celeste?.texto === 'pase lo que pase, y que la respuesta llegaría con la primera tormenta',
      detalle: JSON.stringify(celeste),
    });

    const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
    const libro = db.prepare("SELECT path FROM books WHERE title = 'Prueba Zzz El faro'").get();
    db.close();
    const data = libro ? path.join(BIBLIOTECA, libro.path, 'data') : null;
    const mds = data && fs.existsSync(data) ? fs.readdirSync(data).filter((n) => n.endsWith('.md')) : [];
    const md = mds[0] ? fs.readFileSync(path.join(data, mds[0]), 'utf8') : '';
    resultados.push({ nombre: 'el .md del libro tiene los subrayados del PDF con su página', ok: md.includes('## Capítulo uno') && md.includes('PDF · p. 10') && md.includes('PDF · p. 11') && md.includes(NOTA), detalle: md.slice(0, 400) });
    return resultados;
  },
};
