// Compartir con la familia: marcar libros, armar la copia y que la copia sea de solo lectura.
export default {
  descripcion: 'Marca libros para alguien y arma su copia',
  necesita: { epub: 2 },
  async prueba({ PRUEBA, comprobar }) {
    const agregado = await window.familia.agregar({ nombre: 'Prueba' });
    comprobar('agrega a una persona', agregado.ok, agregado.mensaje);
    const persona = agregado.familia?.find((i) => i.nombre === 'Prueba');
    const ids = PRUEBA.libros.epub.map((l) => l.id);
    const marcado = await window.familia.marcar(persona.id, ids, true);
    comprobar('marca sus libros', marcado.ok && marcado.cambiados === ids.length, marcado.mensaje ?? `${marcado.cambiados} marcados`);
    const copia = await window.familia.actualizar(persona.id);
    comprobar('arma la copia', copia.ok && copia.libros === ids.length, copia.mensaje ?? `${copia.libros} libros`);
  },
  verificar({ COMPARTIDO, fs, path }) {
    const carpeta = path.join(COMPARTIDO, 'Libros de Prueba');
    return [
      {
        nombre: 'la copia tiene base y marca de solo lectura',
        ok: fs.existsSync(path.join(carpeta, 'metadata.db')) && fs.existsSync(path.join(carpeta, 'broots-compartida.json')),
      },
      { nombre: 'la copia no tiene datos internos de Broots', ok: !fs.existsSync(path.join(carpeta, '.broots')) },
    ];
  },
};
