// 1.8 «Subrayados y notas» en el lector: seleccionar → subrayar → nota; sigue ahí con otra letra, con la traducción
// (en el otro idioma, una línea bajo el párrafo) y al volver a abrir el libro; borrar con «Deshacer»; la lista del
// lector; el panel del libro; y la barra de arriba entra en una ventana de 960 px. Al final se revisa en disco el
// archivo de esta PC (.broots/subrayados-lector) y el .md en la carpeta «data» del libro.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const NOTA = 'Nota de prueba: esto lo anoté yo';

export default {
  descripcion: 'Subrayar y anotar en el lector (con la traducción y otra letra), la lista y el .md',
  necesita: { ingles: 1 },
  entorno: { BROOTS_TRADUCCION_FALSA: '1', BROOTS_VENTANA: '960x600' },
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    if (!PRUEBA.libros.ingles.length) return comprobar('hay un EPUB en inglés en la biblioteca', false, 'no encontré ninguno');
    const id = PRUEBA.libros.ingles[0].id;
    const NOTA = 'Nota de prueba: esto lo anoté yo'; // (la prueba corre en la ventana: no ve lo de afuera)

    // Elige [desde, hasta) del texto de un elemento y suelta el mouse, como al seleccionar con el mouse.
    const seleccionar = (el, desde, hastaLugar) => {
      const rango = document.createRange();
      const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let lugar = 0;
      let puesto = false;
      for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
        const largo = n.data.length;
        if (!puesto && desde < lugar + largo) {
          rango.setStart(n, desde - lugar);
          puesto = true;
        }
        if (puesto && hastaLugar <= lugar + largo) {
          rango.setEnd(n, hastaLugar - lugar);
          break;
        }
        lugar += largo;
      }
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(rango);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };
    const tocar = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const escribirEn = (area, valor) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, valor);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };

    // Con el panel del libro ya abierto, tocar la tarjeta lo cerraría: se usa el que está.
    const abrirLibro = async () => {
      let panel = document.querySelector('.fixed.top-11');
      if (!panel) {
        document.querySelector(`[data-tarjeta="${id}"] button`).click();
        panel = await hasta(() => document.querySelector('.fixed.top-11'));
        await esperar(800);
      }
      boton(panel, 'Leer').click();
      const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
      return { texto, lector: texto?.closest('.fixed') };
    };

    let { texto, lector } = await abrirLibro();
    comprobar('el lector abre el libro', texto);
    await hasta(() => !/de (~|…)/.test(lector.querySelector('footer').innerText), 60000);
    const visibles = () => {
      const recorte = texto.parentElement.getBoundingClientRect();
      return [...texto.querySelectorAll('[data-p]')].filter((el) => [...el.getClientRects()].some((r) => r.right > recorte.left + 5 && r.left < recorte.right - 5 && r.top < recorte.bottom - 20));
    };
    for (let i = 0; i < 15 && visibles().filter((p) => p.textContent.length > 80).length < 2; i++) {
      tecla('ArrowRight');
      await esperar(700);
    }
    // La barra de arriba del lector entra en 960 px (sin meterse debajo de los botones de Windows).
    const libre = navigator.windowControlsOverlay?.getTitlebarAreaRect?.();
    const borde = libre?.width ? libre.x + libre.width : window.innerWidth - 138;
    for (const selector of ['[data-boton-subrayados]', '[data-boton-enfoque]']) {
      const caja = lector.querySelector(selector)?.getBoundingClientRect();
      comprobar(`la barra del lector muestra ${selector}`, caja && caja.width > 0 && caja.right <= borde, caja ? `termina en ${Math.round(caja.right)}, libre hasta ${Math.round(borde)}` : 'no está');
    }

    // 0) Doble clic (para elegir una palabra): no pasa de página. Un clic suelto en la mitad derecha, sí.
    const pagina = () => lector.querySelector('footer input')?.value;
    const recorte = texto.parentElement.getBoundingClientRect();
    const clic = (detail) => texto.dispatchEvent(new MouseEvent('click', { bubbles: true, detail, clientX: recorte.right - 30, clientY: recorte.top + 100 }));
    const antesDoble = pagina();
    clic(1);
    await esperar(60);
    clic(2);
    await esperar(800);
    comprobar('el doble clic no pasa de página', pagina() === antesDoble, `${antesDoble} → ${pagina()}`);
    clic(1);
    const paso = await hasta(() => pagina() !== antesDoble, 3000);
    comprobar('un clic suelto en la mitad derecha sí', paso, `${antesDoble} → ${pagina()}`);
    tecla('ArrowLeft');
    await esperar(900);

    // 1) Subrayar sobre la traducción (simulada: «ES· …»).
    const traducido = await hasta(() => visibles().find((p) => p.textContent.startsWith('ES·') && p.textContent.length > 80), 20000);
    comprobar('hay un párrafo traducido a la vista', traducido);
    if (!traducido) return;
    const paginaAntes = pagina();
    const esperado1 = traducido.textContent.slice(4, 40).trim();
    seleccionar(traducido, 4, 40);
    const barra = await hasta(() => lector.querySelector('[data-barra-subrayado="nuevo"]'), 5000);
    comprobar('al seleccionar aparece la barrita con los colores', barra?.querySelectorAll('[data-color]').length === 4);
    barra?.querySelector('[data-color="verde"]').click();
    const marca1 = await hasta(() => texto.querySelector('mark[data-subrayado].verde'), 5000);
    const id1 = marca1?.dataset.subrayado;
    const textoDe = (idSub) => [...texto.querySelectorAll(`mark[data-subrayado="${idSub}"]`)].map((m) => m.textContent).join('');
    comprobar('queda subrayado en verde, justo lo elegido', marca1 && textoDe(id1) === esperado1, `«${marca1 ? textoDe(id1) : ''}» / «${esperado1}»`);
    comprobar('subrayar no pasó de página', pagina() === paginaAntes, `${paginaAntes} → ${pagina()}`);

    // 2) Tocar el subrayado → Nota.
    tocar(marca1);
    const barraEditar = await hasta(() => lector.querySelector('[data-barra-subrayado="editar"]'), 5000);
    comprobar('tocar el subrayado abre su barrita', barraEditar);
    barraEditar?.querySelector('[data-accion="nota"]').click();
    const nota = await hasta(() => lector.querySelector('[data-nota-subrayado] textarea'), 5000);
    comprobar('se abre la nota', nota);
    if (nota) {
      escribirEn(nota, NOTA);
      await esperar(100);
      lector.querySelector('[data-guardar-nota]').click();
    }
    await hasta(() => texto.querySelector(`mark[data-subrayado="${id1}"].con-nota`), 5000);
    comprobar('con nota, el subrayado lleva la línea punteada', texto.querySelector(`mark[data-subrayado="${id1}"].con-nota`));

    // 3) Cerrar la barrita con un clic afuera no pasa de página.
    tocar(texto.querySelector(`mark[data-subrayado="${id1}"]`));
    await hasta(() => lector.querySelector('[data-barra-subrayado="editar"]'), 5000);
    const antesVelo = pagina();
    lector.querySelector('[data-velo-subrayado]')?.click();
    await esperar(500);
    comprobar('el clic afuera cierra la barrita sin pasar de página', !lector.querySelector('[data-barra-subrayado]') && pagina() === antesVelo, `${antesVelo} → ${pagina()}`);

    // 4) Sin traducción: el párrafo muestra el original y el subrayado pasa a ser una línea bajo el párrafo.
    boton(lector, 'Ver el libro en su idioma original').click();
    await esperar(1200);
    const parrafo1 = texto.querySelector(`[data-p="${traducido.dataset.p}"]`);
    comprobar('en el original, el subrayado de la traducción es una línea bajo el párrafo', parrafo1?.classList.contains('subrayado-otro') && !textoDe(id1), parrafo1?.className);

    // 5) Subrayar en el original; al volver a traducir, ese pasa a ser la línea.
    // (en una ventana chica puede entrar un solo párrafo por página: se usa el que sigue, aunque esté en la próxima)
    const original = [...texto.querySelectorAll('[data-p]')].find((p) => Number(p.dataset.p) > Number(parrafo1?.dataset.p) && p.textContent.length > 60);
    comprobar('hay otro párrafo en el original', original);
    if (!original) return;
    const esperado2 = original.textContent.slice(0, 30).trim();
    seleccionar(original, 0, 30);
    (await hasta(() => lector.querySelector('[data-barra-subrayado="nuevo"]'), 5000))?.querySelector('[data-color="amarillo"]').click();
    const marca2 = await hasta(() => texto.querySelector('mark[data-subrayado].amarillo'), 5000);
    const id2 = marca2?.dataset.subrayado;
    comprobar('subraya en el original', marca2 && textoDe(id2) === esperado2, marca2 ? textoDe(id2) : '');
    boton(lector, 'Traducir al español con Gemini').click();
    const otroParrafo = texto.querySelector(`[data-p="${original.dataset.p}"]`);
    await hasta(() => otroParrafo.textContent.startsWith('ES·'), 20000);
    await esperar(300);
    comprobar('con la traducción, el del original es una línea bajo el párrafo', otroParrafo.classList.contains('subrayado-otro'));
    await hasta(() => textoDe(id1) === esperado1, 15000);
    comprobar('y el de la traducción vuelve a verse exacto', textoDe(id1) === esperado1, textoDe(id1));

    // 6) Otra letra (desde el panel «Aa» de la 1.9): los subrayados siguen en su lugar.
    lector.querySelector('[data-boton-medida]').click();
    const medida = await hasta(() => lector.querySelector('[data-panel-medida]'), 5000);
    boton(medida, 'Letra más grande').click();
    await esperar(150);
    boton(medida, 'Letra más grande').click();
    await esperar(300);
    tecla('Escape');
    await hasta(() => !lector.querySelector('[data-panel-medida]'), 3000);
    await esperar(1500);
    comprobar('con otra letra los subrayados siguen igual', textoDe(id1) === esperado1 && otroParrafo.classList.contains('subrayado-otro'), textoDe(id1));

    // 7) La lista del lector: los dos, y Esc la cierra sin cerrar el libro.
    lector.querySelector('[data-boton-subrayados]').click();
    const lista = await hasta(() => lector.querySelector('[data-panel-subrayados]'), 5000);
    comprobar('la lista del lector muestra los dos', lista?.querySelectorAll('[data-item-subrayado]').length === 2, lista?.innerText.slice(0, 200));
    tecla('Escape');
    const cerrada = await hasta(() => !lector.querySelector('[data-panel-subrayados]'), 3000);
    comprobar('Esc cierra la lista y deja el libro abierto', cerrada && document.body.contains(lector), `lista: ${!cerrada ? 'abierta' : 'cerrada'}, libro: ${document.body.contains(lector) ? 'abierto' : 'cerrado'}`);

    // 8) Borrar y deshacer.
    tocar(texto.querySelector(`mark[data-subrayado="${id1}"]`));
    (await hasta(() => lector.querySelector('[data-barra-subrayado="editar"]'), 5000))?.querySelector('[data-accion="borrar"]').click();
    await esperar(400);
    comprobar('borrar lo saca del texto', !textoDe(id1));
    const deshacer = await hasta(() => lector.querySelector('[data-accion-aviso]'), 3000);
    comprobar('el aviso ofrece «Deshacer»', deshacer);
    deshacer?.click();
    await hasta(() => textoDe(id1), 5000);
    comprobar('«Deshacer» lo devuelve, con su nota', textoDe(id1) === esperado1 && texto.querySelector(`mark[data-subrayado="${id1}"].con-nota`));
    await esperar(1500);

    // 9) Cerrar y volver a abrir: los dos siguen ahí.
    tecla('Escape');
    await hasta(() => !document.body.contains(lector), 5000);
    await esperar(1200);
    const panel = document.querySelector('.fixed.top-11');
    const enPanel = await hasta(() => panel?.querySelectorAll('[data-subrayado-panel][data-origen="broots"]').length === 2 && panel, 8000);
    comprobar('el panel del libro lista los dos subrayados', enPanel, panel?.querySelector('[data-subrayados-panel]')?.innerText.slice(0, 200));
    comprobar('y muestra la nota', panel?.querySelector('[data-subrayados-panel]')?.innerText.includes(NOTA));
    ({ texto, lector } = await abrirLibro());
    await hasta(() => texto.querySelector(`[data-p] mark[data-subrayado]`), 20000);
    const vuelven = await hasta(() => textoDe(id1) === esperado1 && texto.querySelector(`[data-p="${original.dataset.p}"]`)?.classList.contains('subrayado-otro'), 20000);
    comprobar('al volver a abrir el libro, los subrayados siguen ahí', vuelven, `verde: «${textoDe(id1)}»`);
    tecla('Escape');
    await esperar(1500);
  },
  // En disco (Node, con Broots ya cerrado).
  verificar({ BIBLIOTECA }) {
    const resultados = [];
    const carpeta = path.join(BIBLIOTECA, '.broots', 'subrayados-lector');
    const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((n) => /^[0-9a-f]{8}\.json$/.test(n)) : [];
    resultados.push({ nombre: 'guardó un archivo de esta PC en .broots/subrayados-lector', ok: archivos.length === 1, detalle: archivos.join(', ') });
    const contenido = archivos[0] ? JSON.parse(fs.readFileSync(path.join(carpeta, archivos[0]), 'utf8')) : { libros: {} };
    const [uuid, registros = []] = Object.entries(contenido.libros)[0] ?? [];
    const vigentes = registros.filter((r) => !r.borrado);
    resultados.push({ nombre: 'quedaron los dos subrayados (el borrado volvió con «Deshacer»)', ok: vigentes.length === 2, detalle: JSON.stringify(registros.map((r) => [r.color, r.version, r.borrado])) });
    const verde = vigentes.find((r) => r.color === 'verde');
    resultados.push({ nombre: 'el verde es de la traducción y tiene la nota', ok: verde?.version === 'traduccion' && verde?.nota === NOTA && verde?.idioma === 'es' });

    // El .md en la carpeta «data» del libro.
    const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
    const libro = db.prepare('SELECT path FROM books WHERE uuid = ?').get(uuid ?? '');
    db.close();
    const data = libro ? path.join(BIBLIOTECA, libro.path, 'data') : null;
    const mds = data && fs.existsSync(data) ? fs.readdirSync(data).filter((n) => n.endsWith('.md')) : [];
    const md = mds[0] ? fs.readFileSync(path.join(data, mds[0]), 'utf8') : '';
    resultados.push({ nombre: 'armó el .md en la carpeta «data» del libro', ok: mds.length === 1, detalle: mds.join(', ') });
    resultados.push({ nombre: 'el .md tiene los dos subrayados y la nota', ok: vigentes.every((r) => md.includes(r.texto.split('\n')[0])) && md.includes(NOTA), detalle: md.slice(0, 300) });
    resultados.push({ nombre: 'el .md tiene la línea de «lo tuyo»', ok: md.startsWith(`<!-- broots:subrayados ${uuid}`) && md.includes('<!-- broots:fin -->') && md.includes('De acá para abajo es tuyo') });
    return resultados;
  },
};
