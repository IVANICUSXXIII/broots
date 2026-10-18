// La biblioteca carga entera y el panel de un libro se abre.
export default {
  descripcion: 'Carga la biblioteca y abre el panel de un libro',
  necesita: { epub: 1 },
  async prueba({ PRUEBA, hasta, comprobar, esperar }) {
    const tarjetas = await hasta(() => document.querySelectorAll('[data-tarjeta]').length);
    comprobar('se ven todos los libros', tarjetas === PRUEBA.total, `${tarjetas} de ${PRUEBA.total}`);
    const libro = PRUEBA.libros.epub[0];
    document.querySelector(`[data-tarjeta="${libro.id}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    comprobar('se abre el panel', panel?.innerText.includes(libro.titulo.slice(0, 15)), libro.titulo);
    comprobar('el panel ofrece Leer', [...(panel?.querySelectorAll('button') ?? [])].some((b) => b.innerText.trim() === 'Leer'));
  },
};
