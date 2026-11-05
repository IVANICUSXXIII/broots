// 1.10: el tour de bienvenida: se muestra si no está visto, recorre los pasos, no deja que el teclado llegue a lo de
// abajo, no vuelve a aparecer, sigue con el del lector y se puede repetir desde la Ayuda.
export default {
  descripcion: 'Tour de bienvenida: biblioteca, lector, saltear y repetir desde la Ayuda',
  necesita: { epub: 1 },
  entorno: { BROOTS_VENTANA: '1440x900' },
  config: () => ({ tourVisto: false, tourLectorVisto: false }),
  async prueba({ PRUEBA, hasta, comprobar, esperar, boton }) {
    // Como una tecla de verdad: nace en la página y sube hasta la ventana (así el tour la agarra antes que el lector).
    const tecla = (key) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const pasoActual = () => document.querySelector('[data-tour-paso]')?.dataset.tourPaso;
    const siguiente = () => document.querySelector('[data-tour-siguiente]').click();
    const tour = await hasta(() => document.querySelector('[data-tour-abierto="biblioteca"]'), 8000);
    comprobar('la primera vez aparece el tour', tour);
    comprobar('empieza con la bienvenida', pasoActual() === 'inicio', pasoActual());
    comprobar('se puede saltear', document.querySelector('[data-tour-saltear]'));

    const vistos = [pasoActual()];
    for (let i = 0; i < 15 && document.querySelector('[data-tour-abierto]'); i++) {
      const antes = pasoActual();
      siguiente();
      await hasta(() => pasoActual() !== antes, 2000);
      await esperar(120);
      if (!pasoActual()) break;
      const burbuja = document.querySelector('[data-tour-paso]').getBoundingClientRect();
      if (burbuja.left < 0 || burbuja.top < 0 || burbuja.right > window.innerWidth || burbuja.bottom > window.innerHeight) comprobar(`la burbuja de «${pasoActual()}» entra en la ventana`, false, JSON.stringify(burbuja));
      vistos.push(pasoActual());
    }
    comprobar('recorre todos los pasos', ['inicio', 'lateral', 'buscador', 'libro', 'agregar', 'kindle', 'familia', 'miLectura', 'ayuda'].every((p) => vistos.includes(p)), vistos.join(', '));
    await hasta(() => !document.querySelector('[data-tour-abierto]'), 3000);
    comprobar('al terminar se va', !document.querySelector('[data-tour-abierto]'));

    // El del lector: la primera vez que se abre un libro. Esc lo saltea sin cerrar el libro.
    const id = PRUEBA.libros.epub[0].id;
    document.querySelector(`[data-tarjeta="${id}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(600);
    boton(panel, 'Leer').click();
    const delLector = await hasta(() => document.querySelector('[data-tour-abierto="lector"]'), 8000);
    comprobar('al abrir el primer libro aparece el tour del lector', delLector);
    comprobar('explica cómo pasar de página', pasoActual() === 'pasar', pasoActual());
    await hasta(() => !/de (~|…)/.test(document.querySelector('.texto-libro').closest('.fixed').querySelector('footer').innerText), 60000);
    const pagina = document.querySelector('.texto-libro').closest('.fixed').querySelector('footer input')?.value;
    tecla('ArrowRight');
    await hasta(() => pasoActual() === 'medida', 2000);
    comprobar('las flechas avanzan el tour', pasoActual() === 'medida', pasoActual());
    await esperar(500);
    const paginaDespues = document.querySelector('.texto-libro').closest('.fixed').querySelector('footer input')?.value;
    comprobar('y no pasan de página', paginaDespues === pagina, `${pagina} -> ${paginaDespues}`);
    comprobar('el paso de «Aa» habla de personalizar la lectura', /tamaño de letra/i.test(document.querySelector('[data-tour-paso]').innerText));
    tecla('Escape');
    await hasta(() => !document.querySelector('[data-tour-abierto]'), 2000);
    comprobar('Esc cierra el tour y no el libro', !document.querySelector('[data-tour-abierto]') && document.querySelector('.texto-libro'));
    await esperar(500);
    await window.lector.pruebaCruz();
    await hasta(() => !document.querySelector('.texto-libro'), 5000);

    // No vuelve solo; se repite desde la Ayuda.
    const preferencias = await window.preferencias.leer();
    comprobar('queda anotado que ya se vieron', preferencias.tourVisto === true && preferencias.tourLectorVisto === true, JSON.stringify([preferencias.tourVisto, preferencias.tourLectorVisto]));
    tecla('Escape'); // cierra el panel del libro
    await esperar(500);
    tecla('F1');
    const repetir = await hasta(() => document.querySelector('[data-ver-tour]'), 5000);
    comprobar('la Ayuda ofrece ver el tour otra vez', repetir);
    repetir?.click();
    await hasta(() => document.querySelector('[data-tour-abierto="biblioteca"]'), 5000);
    comprobar('el tour vuelve a empezar', pasoActual() === 'inicio', pasoActual());
    document.querySelector('[data-tour-saltear]').click();
    await hasta(() => !document.querySelector('[data-tour-abierto]'), 2000);
    const despues = await window.preferencias.leer();
    comprobar('saltearlo también lo da por visto; el del lector queda para el próximo libro', despues.tourVisto === true && despues.tourLectorVisto === false, JSON.stringify([despues.tourVisto, despues.tourLectorVisto]));
  },
};
