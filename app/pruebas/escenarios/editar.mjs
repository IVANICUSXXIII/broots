// Cambios en la biblioteca con las herramientas de Calibre (sobre la copia de prueba).
export default {
  descripcion: 'Edita editorial, fecha y etiquetas de un libro',
  necesita: { epub: 1 },
  async prueba({ PRUEBA, comprobar }) {
    const id = PRUEBA.libros.epub[0].id;
    const r = await window.edicion.editar(id, { publisher: 'Editorial de Prueba', pubdate: '2024-07-01', tags: ['Prueba A', 'Prueba B'] });
    comprobar('calibredb guardó los cambios', r.ok, r.mensaje);
    const libro = r.biblioteca?.data?.books.find((b) => b.id === id);
    comprobar('editorial', libro?.publisher === 'Editorial de Prueba', libro?.publisher);
    comprobar('fecha sin correrse un día', String(libro?.pubdate).startsWith('2024-07-01'), libro?.pubdate);
    comprobar('etiquetas', libro?.tags.join('|') === 'Prueba A|Prueba B', libro?.tags.join('|'));
  },
};
