// Los diccionarios de verdad: los baja de IVANICUSXXIII/broots-diccionarios (unos 70 MB), verifica su huella y busca
// palabras reales. Sale a internet, por eso es «lento» y no corre con «todos»: correrlo cada vez que se publican
// diccionarios nuevos. Termina con la tarjeta abierta, para ver cómo queda en la captura.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const manifiesto = createRequire(import.meta.url)('../../electron/diccionarios.json');

export default {
  descripcion: 'Definir con los diccionarios de verdad, bajados de GitHub (sale a internet)',
  lento: true,
  necesita: { ingles: 1 },
  entorno: { BROOTS_DICCIONARIOS: 'real', BROOTS_VENTANA: '960x600' },
  async prueba({ PRUEBA, hasta, comprobar, boton, esperar, tecla }) {
    for (const idioma of ['es', 'en', 'pt']) {
      const inicio = performance.now();
      const r = await window.lector.bajarDiccionario(idioma);
      comprobar(`baja y verifica el diccionario de ${idioma}`, r.ok, `${JSON.stringify(r)}, ${Math.round((performance.now() - inicio) / 1000)} s`);
    }
    const casos = [
      ['es', 'laburo', 'laburo', /Ocupación/], ['es', 'tenés', 'tener', null], ['es', 'corrió', 'correr', /Desplazarse/], ['es', 'diciéndole', 'decir', null], ['es', 'hermosas', 'hermoso', null],
      ['es', 'año', 'año', /Tierra/], ['es', 'quilombo', 'quilombo', null], ['es', 'hacer la vista gorda', 'hacer la vista gorda', null],
      ['pt', 'saudade', 'saudade', null], ['pt', 'assumiu', 'assumir', null], ['pt', 'distinguem', 'distinguir', null], ['pt', 'disse-lhe', 'dizer', null], ['pt', 'você', 'você', null],
      ['en', 'serendipity', 'serendipity', /discovery/], ['en', 'ran', 'run', /move swiftly/], ['en', 'googled', 'google', null], ['en', 'sister’s', 'sister', null], ['en', 'smartphone', 'smartphone', null],
    ];
    for (const [idioma, pedido, esperado, contiene] of casos) {
      const inicio = performance.now();
      const r = await window.lector.definir(idioma, pedido);
      const ms = Math.round(performance.now() - inicio);
      const texto = JSON.stringify(r.entradas ?? '');
      comprobar(`${idioma}: «${pedido}» → «${esperado}»`, r.estado === 'listo' && r.entradas.some((e) => e.palabra === esperado) && (!contiene || contiene.test(texto)), `${ms} ms; ${texto.slice(0, 170)}`);
    }

    // En pantalla, con lo que diga el libro.
    document.querySelector(`[data-tarjeta="${PRUEBA.libros.ingles[0].id}"] button`).click();
    const panelLibro = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    boton(panelLibro, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    const lector = texto?.closest('.fixed');
    comprobar('el lector abre el libro', texto);
    if (!texto) return;
    const pie = () => lector.querySelector('footer').innerText;
    await hasta(() => !/de (~|…)/.test(pie()), 60000);
    const recorte = texto.parentElement.getBoundingClientRect();
    const visible = () => [...texto.querySelectorAll('[data-p]')].find((p) => p.textContent.length > 120 && /\p{Ll}{6,}/u.test(p.firstChild?.data ?? '') && [...p.getClientRects()].some((r) => r.right > recorte.left + 5 && r.left < recorte.right - 5 && r.top < recorte.bottom - 40));
    for (let i = 0; i < 20 && !visible(); i++) {
      tecla('ArrowRight'); // la tapa y los títulos no sirven
      await esperar(700);
    }
    const parrafo = visible();
    comprobar('hay un párrafo con texto en pantalla', parrafo);
    if (!parrafo) return;
    const recorrido = document.createTreeWalker(parrafo, NodeFilter.SHOW_TEXT);
    const nodo = recorrido.nextNode();
    const hallado = /\p{Ll}{6,}/u.exec(nodo.data);
    const rango = document.createRange();
    rango.setStart(nodo, hallado.index);
    rango.setEnd(nodo, hallado.index + hallado[0].length);
    const seleccion = window.getSelection();
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    parrafo.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    (await hasta(() => lector.querySelector('[data-barra-subrayado]'), 5000))?.querySelector('[data-accion="definir"]').click();
    const tarjeta = await hasta(() => lector.querySelector('[data-tarjeta-definir="listo"], [data-tarjeta-definir="noEsta"]'), 8000);
    comprobar('en pantalla, la tarjeta responde', tarjeta, `«${hallado[0]}» (${tarjeta?.dataset.idioma}): ${tarjeta?.innerText}`);
    await esperar(2500);
    comprobar('el lector y la tarjeta siguen abiertos', document.body.contains(lector) && tarjeta.isConnected, `${document.body.contains(lector)} ${tarjeta.isConnected}`);
    console.log(location.href);
  },
  verificar({ DATOS }) {
    return Object.values(manifiesto).map((info) => {
      const archivo = path.join(DATOS, 'diccionarios', info.archivo);
      const tamaño = fs.existsSync(archivo) ? fs.statSync(archivo).size : 0;
      return { nombre: `${info.archivo} quedó entero en esta PC`, ok: tamaño === info.disco, detalle: `${tamaño} de ${info.disco}` };
    });
  },
};
