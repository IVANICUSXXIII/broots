// 1.9 «Lectura a medida»: el botón «Aa» entra en la barra a 960 px; tema (pinta todo el lector y sus subrayados),
// fuente, interlineado, márgenes y justificado, iguales en la página y en el medidor que cuenta las páginas; cerrar el
// panel no pasa de página; los subrayados siguen en su lugar. «Explicar» (con BROOTS_TRADUCCION_FALSA) desde la
// barrita: la tarjeta, Esc, la explicación guardada y «Guardar como nota». Al final, en disco: el archivo de
// .broots/explicaciones y que lo de más de 30 días se borra solo.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export default {
  descripcion: 'Lectura a medida (tema, fuente, interlineado, márgenes, justificado) y «Explicar» con Gemini',
  necesita: { ingles: 1 },
  entorno: { BROOTS_TRADUCCION_FALSA: '1', BROOTS_VENTANA: '960x600' },
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    if (!PRUEBA.libros.ingles.length) return comprobar('hay un EPUB en inglés en la biblioteca', false, 'no encontré ninguno');
    const id = PRUEBA.libros.ingles[0].id;

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

    document.querySelector(`[data-tarjeta="${id}"] button`).click();
    const panelLibro = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    boton(panelLibro, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    const lector = texto?.closest('.fixed');
    comprobar('el lector abre el libro', texto);
    if (!texto) return;
    const pie = () => lector.querySelector('footer').innerText;
    const contado = () => hasta(() => !/de (~|…)/.test(pie()), 60000);
    await contado();
    const visibles = () => {
      const recorte = texto.parentElement.getBoundingClientRect();
      return [...texto.querySelectorAll('[data-p]')].filter((el) => [...el.getClientRects()].some((r) => r.right > recorte.left + 5 && r.left < recorte.right - 5 && r.top < recorte.bottom - 20));
    };
    for (let i = 0; i < 15 && visibles().filter((p) => p.textContent.length > 80).length < 1; i++) {
      tecla('ArrowRight');
      await esperar(700);
    }
    await hasta(() => visibles().some((p) => p.textContent.startsWith('ES·') && p.textContent.length > 80), 20000);

    // 1) El botón «Aa» entra en la barra de arriba a 960 px (sin meterse debajo de los botones de Windows).
    const libre = navigator.windowControlsOverlay?.getTitlebarAreaRect?.();
    const borde = libre?.width ? libre.x + libre.width : window.innerWidth - 138;
    for (const selector of ['[data-boton-medida]', '[data-boton-enfoque]']) {
      const caja = lector.querySelector(selector)?.getBoundingClientRect();
      comprobar(`la barra del lector muestra ${selector}`, caja && caja.width > 0 && caja.right <= borde, caja ? `termina en ${Math.round(caja.right)}, libre hasta ${Math.round(borde)}` : 'no está');
    }

    // 2) Un subrayado antes de tocar nada: tiene que seguir igual con cualquier fuente y márgenes.
    const pagina = () => lector.querySelector('footer input')?.value;
    const parrafo = visibles().find((p) => p.textContent.startsWith('ES·') && p.textContent.length > 80);
    const esperado = parrafo.textContent.slice(4, 36);
    seleccionar(parrafo, 4, 36);
    (await hasta(() => lector.querySelector('[data-barra-subrayado="nuevo"]'), 5000))?.querySelector('[data-color="celeste"]').click();
    const marca = await hasta(() => texto.querySelector('mark[data-subrayado].celeste'), 5000);
    const idSub = marca?.dataset.subrayado;
    const textoDe = (x) => [...texto.querySelectorAll(`mark[data-subrayado="${x}"]`)].map((m) => m.textContent).join('');
    comprobar('subraya antes de cambiar la lectura', marca && textoDe(idSub) === esperado);

    // 3) El panel: se abre, entra en la ventana y cerrarlo con un clic afuera no pasa de página.
    const abrirPanel = async () => {
      if (!lector.querySelector('[data-panel-medida]')) lector.querySelector('[data-boton-medida]').click();
      return hasta(() => lector.querySelector('[data-panel-medida]'), 5000);
    };
    let panel = await abrirPanel();
    comprobar('el botón «Aa» abre el panel de lectura a medida', panel && panel.querySelectorAll('[data-tema]').length === 5 && panel.querySelectorAll('[data-fuente]').length === 5);
    await esperar(500);
    const cajaPanel = panel?.getBoundingClientRect();
    comprobar('el panel entra en la ventana', cajaPanel && cajaPanel.bottom <= window.innerHeight && cajaPanel.right <= window.innerWidth, cajaPanel ? `${Math.round(cajaPanel.bottom)} / ${window.innerHeight}` : '');
    const antesVelo = pagina();
    lector.querySelector('[data-velo-medida]').click();
    await hasta(() => !lector.querySelector('[data-panel-medida]'), 3000);
    await esperar(400);
    comprobar('el clic afuera cierra el panel sin pasar de página', !lector.querySelector('[data-panel-medida]') && pagina() === antesVelo, `${antesVelo} → ${pagina()}`);

    // 4) Tema sepia: pinta todo el lector (barra incluida) y los subrayados usan sus colores.
    panel = await abrirPanel();
    panel.querySelector('[data-tema="sepia"]').click();
    await esperar(400);
    const estilo = getComputedStyle(lector);
    comprobar('el tema sepia pinta el lector', lector.dataset.temaLector === 'sepia' && estilo.backgroundColor === 'rgb(244, 232, 208)', estilo.backgroundColor);
    comprobar('y la barra de arriba', getComputedStyle(lector.querySelector('header')).color === 'rgb(75, 58, 42)');
    comprobar('los subrayados toman los colores del sepia', getComputedStyle(texto.querySelector(`mark[data-subrayado="${idSub}"]`)).backgroundColor === 'rgb(196, 214, 214)');
    panel.querySelector('[data-tema="negro"]').click();
    await esperar(400);
    comprobar('el tema negro es negro de verdad', getComputedStyle(lector).backgroundColor === 'rgb(0, 0, 0)');

    // 5) Fuente, interlineado y justificado: la página y el medidor (que cuenta las páginas) miden igual.
    const medidor = lector.querySelector('[aria-hidden="true"] .texto-libro');
    const iguales = (prop) => getComputedStyle(texto)[prop] === getComputedStyle(medidor)[prop];
    panel.querySelector('[data-fuente="dislexia"]').click();
    await esperar(1200);
    comprobar('la fuente OpenDyslexic se aplica y está cargada', getComputedStyle(texto).fontFamily.includes('OpenDyslexic') && document.fonts.check('16px OpenDyslexic'), getComputedStyle(texto).fontFamily);
    comprobar('el medidor usa la misma fuente', iguales('fontFamily'));
    panel.querySelector('[data-grupo^="interlineado"] [data-opcion="aireado"]').click();
    await esperar(800);
    const letra = parseFloat(getComputedStyle(texto).fontSize);
    comprobar('el interlineado aireado se aplica', Math.abs(parseFloat(getComputedStyle(texto).lineHeight) - letra * 1.9) < 1, getComputedStyle(texto).lineHeight);
    comprobar('el medidor usa el mismo interlineado', iguales('lineHeight'));
    panel.querySelector('[data-justificar] [role="switch"]').click();
    await esperar(800);
    comprobar('justificar se aplica en la página y en el medidor', getComputedStyle(texto).textAlign === 'justify' && iguales('textAlign'));

    // 6) Márgenes: chicos ensancha la página, grandes la angosta; las páginas se vuelven a contar.
    const ancho = () => Math.round(texto.parentElement.getBoundingClientRect().width);
    const total = () => Number(/de (\d+)/.exec(pie())?.[1] ?? 0);
    panel.querySelector('[data-grupo^="margenes"] [data-opcion="chicos"]').click();
    await esperar(800);
    const anchoChicos = ancho();
    await contado();
    const totalChicos = total();
    panel.querySelector('[data-grupo^="margenes"] [data-opcion="grandes"]').click();
    await esperar(800);
    const anchoGrandes = ancho();
    await contado();
    const totalGrandes = total();
    comprobar('los márgenes cambian el ancho de la página', anchoChicos === 720 && anchoGrandes === 520, `chicos ${anchoChicos}, grandes ${anchoGrandes}`);
    comprobar('con márgenes grandes el libro tiene más páginas', totalGrandes > totalChicos, `${totalChicos} → ${totalGrandes}`);
    comprobar('el subrayado sigue en su lugar con otra fuente y otros márgenes', textoDe(idSub) === esperado, `«${textoDe(idSub)}»`);
    const guardado = JSON.parse(localStorage.getItem('broots-lector-medida') ?? '{}');
    comprobar('lo elegido queda guardado', guardado.tema === 'negro' && guardado.fuente === 'dislexia' && guardado.interlineado === 'aireado' && guardado.margenes === 'grandes' && guardado.justificar === true, JSON.stringify(guardado));
    tecla('Escape');
    await hasta(() => !lector.querySelector('[data-panel-medida]'), 3000);
    comprobar('Esc cierra el panel y deja el libro abierto', !lector.querySelector('[data-panel-medida]') && document.body.contains(lector));

    // 7) «Explicar»: seleccionar una palabra → la barrita lo ofrece → la tarjeta con la explicación.
    const conPalabra = visibles().find((p) => /[A-Za-z]{6,}/.test(p.textContent.slice(4)));
    const coincidencia = /[A-Za-z]{6,}/.exec(conPalabra.textContent.slice(4));
    const desde = 4 + coincidencia.index;
    const palabra = coincidencia[0];
    const explicarPalabra = async () => {
      seleccionar(conPalabra, desde, desde + palabra.length);
      const barra = await hasta(() => lector.querySelector('[data-barra-subrayado="nuevo"]'), 5000);
      const boton = barra?.querySelector('[data-accion="explicar"]');
      boton?.click();
      return boton;
    };
    comprobar('la barrita ofrece «Explicar»', await explicarPalabra());
    const pensando = await hasta(() => lector.querySelector('[data-tarjeta-explicar]'), 3000);
    comprobar('aparece la tarjeta de «Explicar»', pensando);
    const lista = await hasta(() => lector.querySelector('[data-tarjeta-explicar="listo"]'), 10000);
    const explicacion = lista?.querySelector('[data-explicacion]')?.textContent ?? '';
    comprobar('la tarjeta muestra la explicación de Gemini', explicacion.startsWith(`ES· «${palabra}»`), explicacion);
    const marco = texto.parentElement.parentElement.getBoundingClientRect();
    const cajaTarjeta = lista?.getBoundingClientRect();
    comprobar('la tarjeta entra en el lector y no tapa los avisos de arriba', cajaTarjeta && cajaTarjeta.top >= marco.top + 40 && cajaTarjeta.bottom <= marco.bottom && cajaTarjeta.left >= marco.left && cajaTarjeta.right <= marco.right, cajaTarjeta ? JSON.stringify([cajaTarjeta.top, cajaTarjeta.bottom, marco.top, marco.bottom].map(Math.round)) : '');
    const antesEsc = pagina();
    tecla('Escape');
    await hasta(() => !lector.querySelector('[data-tarjeta-explicar]'), 3000);
    comprobar('Esc cierra la tarjeta, sin pasar de página ni cerrar el libro', !lector.querySelector('[data-tarjeta-explicar]') && pagina() === antesEsc && document.body.contains(lector));

    // 8) Lo mismo otra vez: viene guardado (al toque) y se guarda como nota (subraya la palabra).
    await explicarPalabra();
    const otraVez = await hasta(() => lector.querySelector('[data-tarjeta-explicar="listo"]'), 3000);
    comprobar('la segunda vez la explicación ya estaba guardada', otraVez?.querySelector('[data-explicacion]')?.textContent === explicacion);
    otraVez?.querySelector('[data-guardar-explicacion]')?.click();
    const conNota = await hasta(() => [...texto.querySelectorAll('mark[data-subrayado].con-nota')].find((m) => m.textContent === palabra), 5000);
    comprobar('«Guardar como nota» subraya la palabra con la explicación como nota', conNota);
    comprobar('y avisa que quedó guardada', await hasta(() => lector.querySelector('[data-aviso-lector]')?.innerText.includes('Guardada como nota'), 3000));

    // 9) Para un pedazo muy largo, la barrita no ofrece «Explicar».
    const largo = [...texto.querySelectorAll('[data-p]')].find((p) => p.textContent.length > 460 && visibles().includes(p)) ?? null;
    if (largo) {
      seleccionar(largo, 0, 450);
      const barra = await hasta(() => lector.querySelector('[data-barra-subrayado="nuevo"]'), 5000);
      comprobar('con mucho texto no se ofrece «Explicar»', barra && !barra.querySelector('[data-accion="explicar"]'));
      tecla('Escape');
      await esperar(300);
    }

    // 10) Volver al tema automático al cerrar el libro deja la barra de título como la de Broots (no se rompe nada).
    panel = await abrirPanel();
    panel.querySelector('[data-tema="auto"]').click();
    await esperar(300);
    comprobar('el tema automático saca el tema propio', !lector.dataset.temaLector);
    tecla('Escape');
    await esperar(300);
    tecla('Escape');
    await hasta(() => !document.body.contains(lector), 5000);
    await esperar(1500);
  },
  // En disco (Node, con Broots ya cerrado).
  async verificar({ BIBLIOTECA }) {
    const resultados = [];
    const carpeta = path.join(BIBLIOTECA, '.broots', 'explicaciones');
    const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((n) => n.endsWith('.es.json')) : [];
    resultados.push({ nombre: 'guardó la explicación en .broots/explicaciones', ok: archivos.length === 1, detalle: archivos.join(', ') });
    if (!archivos.length) return resultados;
    const archivo = path.join(carpeta, archivos[0]);
    const uuid = archivos[0].replace(/\.es\.json$/, '');
    const guardadas = Object.values(JSON.parse(fs.readFileSync(archivo, 'utf8')));
    resultados.push({ nombre: 'una sola explicación, con su fecha', ok: guardadas.length === 1 && Date.parse(guardadas[0].fecha) > Date.now() - 3600000, detalle: JSON.stringify(guardadas).slice(0, 200) });

    // Una explicación de hace 31 días se borra sola la próxima vez que se usa el archivo.
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    datos.vieja = { texto: 'vieja', explicacion: 'de hace un mes', fecha: new Date(Date.now() - 31 * 86400000).toISOString() };
    fs.writeFileSync(archivo, JSON.stringify(datos));
    process.env.BROOTS_TRADUCCION_FALSA = '1';
    const traduccion = createRequire(import.meta.url)('../../electron/traduccion.cjs');
    const r = await traduccion.explicar({}, path.join(BIBLIOTECA, '.broots'), uuid, { texto: 'otra palabra', parrafo: 'un párrafo' }, 'es');
    const despues = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    resultados.push({ nombre: 'lo de más de 30 días se borra solo', ok: r.ok && !despues.vieja && Object.keys(despues).length === 2, detalle: Object.keys(despues).join(', ') });

    // La nota guardada desde «Explicar», en el archivo de subrayados de esta PC.
    const subrayados = path.join(BIBLIOTECA, '.broots', 'subrayados-lector');
    const propios = fs.existsSync(subrayados) ? fs.readdirSync(subrayados).flatMap((n) => Object.values(JSON.parse(fs.readFileSync(path.join(subrayados, n), 'utf8')).libros).flat()) : [];
    resultados.push({ nombre: 'la explicación quedó como nota del subrayado', ok: propios.some((x) => !x.borrado && x.nota?.startsWith('Gemini: ES· «')), detalle: propios.map((x) => x.nota).join(' | ').slice(0, 200) });
    return resultados;
  },
};
