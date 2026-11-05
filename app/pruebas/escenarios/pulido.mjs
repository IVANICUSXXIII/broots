// 1.10 «Pulido»: doble clic para leer, la cruz cierra el libro, pellizco, imagen en grande, «Buscar», carteles que
// se van solos, pausa sugerida, avance con señalador, y que la barra de arriba y la lista entren en una notebook.
// Con BROOTS_MINUTO_PRUEBA un minuto dura 150 ms: los 30 minutos de la pausa llegan en 4,5 s.
export default {
  descripcion: 'Doble clic, cruz, pellizco, imagen, Buscar, pausa sugerida, avance, barra y lista a 1440 px',
  necesita: { epub: 1 },
  entorno: { BROOTS_MINUTO_PRUEBA: '150', BROOTS_VENTANA: '1440x900' },
  config: () => ({ musica: 'deezer' }),
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    // ---------- Barra de arriba y lista a 1440 px ----------
    const titulo = await hasta(() => document.querySelector('header .truncate'));
    await esperar(500);
    comprobar('la barra de arriba muestra el título entero a 1440 px', titulo.scrollWidth <= titulo.clientWidth, `${titulo.scrollWidth} de ${titulo.clientWidth}: ${titulo.innerText}`);
    const buscador = document.querySelector('header input');
    comprobar('el buscador tiene lugar a 1440 px', buscador.getBoundingClientRect().width >= 200, Math.round(buscador.getBoundingClientRect().width));
    document.querySelector('[title="Vista de lista"]').click();
    const tabla = await hasta(() => document.querySelector('table'));
    await esperar(400);
    const marcoLista = tabla.parentElement.parentElement;
    comprobar('la lista entra sin correrla de costado', tabla.getBoundingClientRect().right <= marcoLista.getBoundingClientRect().right + 1 && marcoLista.scrollWidth <= marcoLista.clientWidth + 1, `${marcoLista.scrollWidth} de ${marcoLista.clientWidth}`);
    document.querySelector('[title="Vista de portadas"]').click();
    await esperar(400);

    // ---------- Doble clic: directo a leer, sin panel ----------
    const id = PRUEBA.libros.epub[0].id;
    const tarjeta = document.querySelector(`[data-tarjeta="${id}"] button`);
    tarjeta.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    tarjeta.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    tarjeta.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    comprobar('el doble clic abre el lector', texto);
    const lector = texto.closest('.fixed');
    await hasta(() => !/de (~|…)/.test(lector.querySelector('footer').innerText), 60000);
    await esperar(600);
    comprobar('el libro abre en modo libre', lector.querySelector('[data-sesion]').dataset.sesion === 'libre');
    comprobar('no quedan botones para cerrar el libro: se usa la cruz', ![...lector.querySelectorAll('header button')].some((b) => /Biblioteca|Cerrar libro/.test(b.innerText)), lector.querySelector('header').innerText);

    // ---------- La portada va al centro y se abre en grande ----------
    const imagen = texto.querySelector('img');
    if (imagen) {
      const caja = imagen.getBoundingClientRect();
      const centro = caja.left + caja.width / 2;
      const marco = lector.querySelector('.texto-libro').parentElement.getBoundingClientRect();
      comprobar('la portada queda centrada entre las dos columnas', Math.abs(centro - (marco.left + marco.width / 2)) < 12, `${Math.round(centro)} / ${Math.round(marco.left + marco.width / 2)}`);
      comprobar('la portada queda en la primera página', /^Página|1/.test(lector.querySelector('footer input').value) && caja.left < window.innerWidth);
      imagen.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      const grande = await hasta(() => lector.querySelector('[data-imagen-marco] img'), 3000);
      comprobar('clic en la imagen: se ve en grande', grande);
      imagen.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      comprobar('la imagen grande muestra la lupa', imagen.style.cursor === 'zoom-in', imagen.style.cursor);
      await esperar(400);
      const marcoGrande = lector.querySelector('[data-imagen-marco]');
      comprobar('abre entera, sin nada afuera de la pantalla', marcoGrande.scrollWidth <= marcoGrande.clientWidth + 1 && marcoGrande.scrollHeight <= marcoGrande.clientHeight + 1, `${marcoGrande.scrollWidth}x${marcoGrande.scrollHeight} en ${marcoGrande.clientWidth}x${marcoGrande.clientHeight}`);
      // Un clic en la imagen la acerca; arrastrando se recorre.
      const raton = (tipo, el, x, y) => el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, button: 0, clientX: x, clientY: y }));
      const c = grande.getBoundingClientRect();
      raton('mousedown', grande, c.left + c.width / 2, c.top + c.height / 2);
      raton('mouseup', grande, c.left + c.width / 2, c.top + c.height / 2);
      await esperar(300);
      comprobar('un clic la acerca y hay más imagen para recorrer', marcoGrande.scrollHeight > marcoGrande.clientHeight + 50, `${marcoGrande.scrollHeight} en ${marcoGrande.clientHeight}`);
      const arribaAntes = marcoGrande.scrollTop;
      raton('mousedown', grande, 600, 500);
      raton('mousemove', window, 600, 380);
      raton('mouseup', window, 600, 380);
      await esperar(200);
      comprobar('arrastrando se desplaza', Math.abs(marcoGrande.scrollTop - arribaAntes - 120) < 3, `${arribaAntes} -> ${marcoGrande.scrollTop}`);
      comprobar('arrastrar no la cierra ni la aleja', lector.querySelector('[data-imagen-marco]') && marcoGrande.scrollHeight > marcoGrande.clientHeight + 50);
      const altoAntes = grande.getBoundingClientRect().height;
      marcoGrande.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -20, clientX: 700, clientY: 400 }));
      await esperar(200);
      comprobar('pellizcar también la acerca', grande.getBoundingClientRect().height > altoAntes, `${Math.round(altoAntes)} -> ${Math.round(grande.getBoundingClientRect().height)}`);
      // La cruz de la ventana cierra la imagen, no el libro; y la siguiente, el libro (no Broots).
      await window.lector.pruebaCruz();
      await hasta(() => !lector.querySelector('[data-imagen-grande]'), 3000);
      comprobar('la cruz cierra la imagen y no el libro', !lector.querySelector('[data-imagen-grande]') && document.querySelector('.texto-libro'));
      // Con Esc también.
      imagen.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      await hasta(() => lector.querySelector('[data-imagen-grande]'), 3000);
      await esperar(300);
      tecla('Escape');
      await hasta(() => !lector.querySelector('[data-imagen-grande]'), 3000);
      comprobar('Esc cierra la imagen y no el libro', !lector.querySelector('[data-imagen-grande]') && document.querySelector('.texto-libro'));
      // Una imagen chica no se amplía ni muestra la lupa.
      const chica = document.createElement('img');
      chica.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
      texto.prepend(chica);
      await chica.decode().catch(() => {});
      chica.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      comprobar('una imagen chica no muestra la lupa', chica.style.cursor !== 'zoom-in' && getComputedStyle(chica).cursor !== 'zoom-in', getComputedStyle(chica).cursor);
      chica.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      await esperar(400);
      comprobar('una imagen chica no se abre en grande', !lector.querySelector('[data-imagen-grande]'));
      chica.remove();
    } else {
      comprobar('el libro de prueba tiene una imagen', false, 'sin imagen en la primera página');
    }

    // ---------- Pellizco (llega como rueda con Ctrl) ----------
    const letra = () => parseFloat(getComputedStyle(texto).fontSize);
    const antes = letra();
    const paginaAntes = lector.querySelector('footer input').value;
    const pellizco = (deltaY) => lector.querySelector('.texto-libro').parentElement.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY }));
    pellizco(-6);
    comprobar('un pellizco mínimo todavía no cambia la letra', letra() === antes, letra());
    pellizco(-8);
    await hasta(() => letra() > antes, 3000);
    comprobar('pellizcar agranda la letra', letra() === antes + 1, `${antes} -> ${letra()}`);
    comprobar('se ve el tamaño mientras se pellizca', lector.querySelector('[data-letra-al-pellizcar]')?.innerText.includes(String(antes + 1)));
    await esperar(200);
    pellizco(30);
    await hasta(() => letra() === antes, 3000);
    comprobar('juntar los dedos la achica', letra() === antes, letra());
    comprobar('el pellizco no pasa de página', lector.querySelector('footer input').value === paginaAntes, `${paginaAntes} -> ${lector.querySelector('footer input').value}`);

    // ---------- Pausa sugerida en modo libre ----------
    // Se va pasando de página (cada tanto cambia de capítulo) hasta que aparece.
    const siguiente = () => tecla('ArrowRight');
    const hastaPausa = async () => {
      for (let i = 0; i < 400; i++) {
        if (lector.querySelector('[data-aviso-sesion="pausa"]')) return true;
        siguiente();
        await esperar(120);
      }
      return false;
    };
    const vistos = new Set();
    const observador = new MutationObserver(() => {
      const a = lector.querySelector('[data-aviso-sesion]');
      if (a) vistos.add(a.dataset.avisoSesion);
    });
    observador.observe(lector, { childList: true, subtree: true });
    comprobar('en modo libre, sugiere una pausa al terminar un capítulo', await hastaPausa());
    const pausa = lector.querySelector('[data-aviso-sesion="pausa"]');
    comprobar('la sugerencia es amable y ofrece seguir', /Sin apuro/.test(pausa?.innerText) && /Sigo leyendo/.test(pausa?.innerText), pausa?.innerText);
    await esperar(10600);
    comprobar('si no hacés nada, se va sola', !lector.querySelector('[data-aviso-sesion="pausa"]'));
    comprobar('el lector sigue abierto y en libre', lector.querySelector('[data-sesion]').dataset.sesion === 'libre');
    comprobar('otra pausa aparece más adelante', await hastaPausa());
    siguiente();
    await hasta(() => !lector.querySelector('[data-aviso-sesion="pausa"]'), 3000);
    comprobar('al pasar de página, se va', !lector.querySelector('[data-aviso-sesion="pausa"]'));
    comprobar('el descanso para la vista viene apagado', !vistos.has('descanso'), [...vistos].join(', '));
    observador.disconnect();

    // ---------- «Buscar» ----------
    const parrafo = await hasta(() => [...texto.querySelectorAll('[data-p]')].find((p) => {
      const c = p.getBoundingClientRect();
      return p.textContent.trim().length > 30 && c.left >= 0 && c.right <= window.innerWidth && c.width > 0;
    }), 5000);
    const nodo = document.createTreeWalker(parrafo, NodeFilter.SHOW_TEXT).nextNode();
    const rango = document.createRange();
    rango.setStart(nodo, 0);
    rango.setEnd(nodo, Math.min(12, nodo.data.length));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(rango);
    parrafo.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const barra = await hasta(() => lector.querySelector('[data-barra-subrayado]'), 3000);
    const elBoton = barra?.querySelector('[data-accion="buscar"]');
    comprobar('la barrita ofrece «Buscar» (sin clave de Gemini)', elBoton);
    elBoton?.click();
    await hasta(() => lector.querySelector('[data-buscar="google"]'), 3000);
    comprobar('ofrece Google, YouTube y el servicio de música elegido', lector.querySelector('[data-buscar="youtube"]') && lector.querySelector('[data-buscar="deezer"]')?.innerText === 'Deezer', [...lector.querySelectorAll('[data-buscar]')].map((b) => b.innerText).join(', '));
    lector.querySelector('[data-buscar="deezer"]').click();
    await esperar(300);

    // ---------- La cruz de la ventana cierra el libro, no Broots ----------
    await esperar(1800); // que se guarde por dónde va (se escribe un momento después)
    await window.lector.pruebaCruz();
    await hasta(() => !document.querySelector('.texto-libro'), 5000);
    comprobar('la cruz vuelve a la biblioteca', !document.querySelector('.texto-libro') && document.querySelector('[data-tarjeta]'));

    // ---------- Avance en el panel del libro ----------
    await esperar(800);
    document.querySelector(`[data-tarjeta="${id}"] button`).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    const avance = await hasta(() => panel.querySelector('[data-avance-libro]'), 5000);
    comprobar('el panel muestra por dónde vas', Number(avance?.dataset.avanceLibro) > 0, avance?.dataset.avanceLibro);
    comprobar('el señalador lleva el porcentaje', avance?.innerText.includes(`${avance.dataset.avanceLibro} %`), avance?.innerText);
    comprobar('dice la página', /Vas por la página \d+ de \d+/.test(avance?.innerText), avance?.innerText);
    await esperar(600);
    const descripcion = [...panel.querySelectorAll('p')].find((p) => p.classList.contains('whitespace-pre-line'));
    if (descripcion) comprobar('la descripción va justificada', getComputedStyle(descripcion).textAlign === 'justify');

    // ---------- Volver a abrir: el temporizador no quedó prendido ----------
    boton(panel, 'Leer').click();
    const texto2 = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    const lector2 = texto2.closest('.fixed');
    lector2.querySelector('[data-sesion]').click();
    await esperar(400);
    boton(lector2, 'Minutos').click();
    await esperar(300);
    comprobar('se puede elegir un temporizador', lector2.querySelector('[data-sesion]').dataset.sesion === 'minutos');
    tecla('Escape'); // cierra el panel de la sesión
    await esperar(300);
    await window.lector.pruebaCruz();
    await hasta(() => !document.querySelector('.texto-libro'), 5000);
    await esperar(800);
    if (!document.querySelector('.fixed.top-11')) document.querySelector(`[data-tarjeta="${id}"] button`).click();
    boton(await hasta(() => document.querySelector('.fixed.top-11'), 4000), 'Leer').click();
    const texto3 = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    comprobar('el libro siguiente vuelve a abrir en libre', texto3.closest('.fixed').querySelector('[data-sesion]').dataset.sesion === 'libre');
  },
  async verificar({ DATOS, fs, path }) {
    let anotado = '';
    try {
      anotado = fs.readFileSync(path.join(DATOS, 'busquedas.log'), 'utf8');
    } catch {}
    return [{ nombre: '«Buscar» arma la dirección del servicio con lo seleccionado', ok: /^https:\/\/www\.deezer\.com\/search\/.+/.test(anotado.trim()), detalle: anotado.trim().slice(0, 100) }];
  },
};
