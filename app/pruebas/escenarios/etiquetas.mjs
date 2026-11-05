// 1.10: etiquetas en árbol. Le pone etiquetas con punto a libros de la COPIA de prueba (con calibredb) y mira el árbol:
// conteo por rama, plegar, filtrar por rama, el buscador de etiquetas, la búsqueda de Calibre y lo que no debe partirse.
export default {
  descripcion: 'Etiquetas en árbol: conteo por rama, plegar, filtrar, buscar y etiquetas raras',
  necesita: {},
  async prueba({ PRUEBA, hasta, comprobar, esperar, boton, escribir }) {
    await hasta(() => document.querySelector('[data-tarjeta]'));
    const ids = [...document.querySelectorAll('[data-tarjeta]')].slice(0, 3).map((t) => Number(t.dataset.tarjeta));
    const poner = (id, tags) => window.edicion.editar(id, { tags });
    await poner(ids[0], ['Zaga.Harry Potter', 'Zaga.Harry Potter.Libro Uno', 'Zaga Rara.']);
    await poner(ids[1], ['Zaga.Harry Potter']);
    await poner(ids[2], ['Zaga.Otra', 'www.zaga-ejemplo.com', 'Web 2.0']);
    document.querySelector('[title="Volver a leer la biblioteca"]').click();
    await esperar(1500);

    const lateral = document.querySelector('aside');
    const grupo = [...lateral.querySelectorAll('section')].find((s) => s.innerText.toLowerCase().startsWith('etiquetas'));
    comprobar('el grupo de etiquetas está', grupo);
    const entrada = grupo.querySelector('input');
    escribir(entrada, 'zaga');
    await esperar(400);
    const fila = (valor) => document.querySelector(`aside [data-filtro="${CSS.escape(valor)}"]`);
    const cantidad = (valor) => Number(fila(valor)?.innerText.trim().split('\n').at(-1));
    comprobar('la rama cuenta sus libros, sin repetirlos', cantidad('Zaga') === 3, cantidad('Zaga'));
    comprobar('la subrama cuenta los suyos', cantidad('Zaga.Harry Potter') === 2, cantidad('Zaga.Harry Potter'));
    comprobar('el nivel de abajo cuenta el suyo', cantidad('Zaga.Harry Potter.Libro Uno') === 1, cantidad('Zaga.Harry Potter.Libro Uno'));
    comprobar('la subetiqueta muestra solo su nombre', fila('Zaga.Harry Potter')?.innerText.includes('Harry Potter') && !fila('Zaga.Harry Potter')?.innerText.includes('Zaga'), fila('Zaga.Harry Potter')?.innerText);
    comprobar('un punto al final no parte la etiqueta', fila('Zaga Rara.') && !fila('Zaga Rara'));
    comprobar('una dirección web no se parte', fila('www.zaga-ejemplo.com') && !fila('www'));
    const raices = [...grupo.querySelectorAll(':scope [data-rama]')].filter((n) => !n.parentElement.closest('[data-rama]')).map((n) => n.dataset.rama);
    comprobar('las raíces son las esperadas', raices.includes('Zaga') && raices.includes('Zaga Rara.') && !raices.includes('Zaga.Harry Potter'), raices.join(' | '));

    // Sin el filtro escrito, la rama arranca plegada y el triangulito la abre.
    escribir(entrada, '');
    await esperar(400);
    const verTodos = [...grupo.querySelectorAll('button')].find((b) => /Ver todos/.test(b.innerText));
    verTodos?.click();
    await esperar(300);
    comprobar('la rama arranca plegada', fila('Zaga') && !fila('Zaga.Otra'));
    grupo.querySelector('[data-plegar="Zaga"]').click();
    await hasta(() => fila('Zaga.Otra'), 3000);
    comprobar('el triangulito despliega la rama', fila('Zaga.Otra'));
    await esperar(400);

    // Filtrar por la rama incluye sus subetiquetas.
    fila('Zaga').click();
    await esperar(800);
    const visibles = () => [...document.querySelectorAll('[data-tarjeta]')].filter((t) => t.style.display !== 'none').length;
    comprobar('filtrar por la rama incluye sus subetiquetas', visibles() === 3, visibles());
    fila('Zaga').click();
    await esperar(400);
    fila('Zaga.Otra').click();
    await esperar(800);
    comprobar('filtrar por una subetiqueta muestra solo esa', visibles() === 1, visibles());
    comprobar('el filtro activo se lee con su rama', document.body.innerText.includes('Zaga › Otra'));
    [...lateral.querySelectorAll('button')].find((b) => /limpiar/i.test(b.innerText)).click();
    await esperar(600);

    // La búsqueda de Calibre.
    const buscador = document.querySelector('header input');
    for (const [busqueda, esperado] of [['tags:"=.Zaga"', 3], ['tags:"=.Harry Potter"', 0], ['tags:"=..Harry Potter"', 2], ['tags:"=Zaga.Otra"', 1]]) {
      escribir(buscador, busqueda);
      await esperar(700);
      comprobar(`${busqueda} encuentra ${esperado}`, visibles() === esperado, visibles());
    }
    escribir(buscador, '');
    await esperar(500);

    // Un grupo donde todos caen en la misma opción no se muestra (en la copia nadie tiene subrayados).
    comprobar('no aparece el filtro «Subrayados» si no filtra nada', ![...lateral.querySelectorAll('section')].some((s) => s.innerText.toLowerCase().startsWith('subrayados')));

    // Desde el panel de un libro: la etiqueta se lee con su rama y, al tocarla, la rama se abre sola.
    document.querySelector(`[data-tarjeta="${ids[0]}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    const chip = [...panel.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Zaga › Harry Potter › Libro Uno');
    comprobar('el panel muestra la etiqueta con su rama', chip);
    chip?.click();
    await hasta(() => fila('Zaga.Harry Potter.Libro Uno'), 3000);
    comprobar('al elegir una subetiqueta se abren sus ramas', fila('Zaga.Harry Potter.Libro Uno'));
  },
};
