// Sin Calibre instalado: Broots descarga, verifica y usa su propia copia (baja ~240 MB).
export default {
  descripcion: 'Descarga las herramientas de Calibre propias y edita con ellas',
  lento: true,
  necesita: { epub: 1 },
  entorno: ({ TEMP }) => ({ BROOTS_SIN_CALIBRE: '1', BROOTS_CALIBRE_PROPIO: `${TEMP}\\broots-calibre-prueba` }),
  limpiar: ({ TEMP }) => [`${TEMP}\\broots-calibre-prueba`],
  async prueba({ PRUEBA, hasta, comprobar }) {
    const id = PRUEBA.libros.epub[0].id;
    const antes = await window.edicion.editar(id, { publisher: 'Antes' });
    comprobar('sin herramientas, avisa en vez de fallar', !antes.ok && /descargan solas/.test(antes.mensaje), antes.mensaje);
    const pie = () => document.querySelector('footer').innerText;
    const listo = await hasta(() => /listas|No pude/.test(pie()) && pie(), 5 * 60 * 1000);
    comprobar('descarga y prepara las herramientas', /listas/.test(listo ?? ''), /listas|No pude[^\n]*/.exec(listo ?? 'tiempo agotado')?.[0] ?? 'tiempo agotado');
    const despues = await window.edicion.editar(id, { publisher: 'Después' });
    comprobar('edita con la copia propia', despues.ok, despues.mensaje);
  },
};
