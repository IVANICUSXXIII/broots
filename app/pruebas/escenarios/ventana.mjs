// Ventana chica (el mínimo, 960×600): la barra de arriba entra sin que los botones de Windows tapen
// Ayuda ni Configuración. Al cerrar, Broots recuerda el tamaño en ventana.json.
export default {
  descripcion: 'Ventana angosta: la barra de arriba entra entera y se recuerda el tamaño',
  necesita: {},
  entorno: { BROOTS_VENTANA: '960x600' },
  async prueba({ hasta, esperar, comprobar }) {
    const cabecera = await hasta(() => document.querySelector('header'));
    await esperar(800);
    comprobar('la ventana abre angosta', window.innerWidth <= 980, `${window.innerWidth} px`);
    // Lo que queda libre a la izquierda de los botones de Windows (minimizar, maximizar y cerrar).
    const libre = navigator.windowControlsOverlay?.getTitlebarAreaRect?.();
    const borde = libre?.width ? libre.x + libre.width : window.innerWidth - 138;
    const boton = (titulo) => cabecera.querySelector(`button[title="${titulo}"]`);
    for (const titulo of ['Configuración', 'Ayuda (F1)', 'Volver a leer la biblioteca']) {
      const caja = boton(titulo)?.getBoundingClientRect();
      comprobar(`se ve «${titulo}»`, caja && caja.width > 0 && caja.right <= borde, caja ? `termina en ${Math.round(caja.right)}, libre hasta ${Math.round(borde)}` : 'no está');
    }
    const buscador = cabecera.querySelector('input')?.getBoundingClientRect();
    comprobar('el buscador sigue usable', buscador?.width >= 90, `${Math.round(buscador?.width ?? 0)} px`);
  },
  // Corre en Node, después de cerrar Broots.
  async verificar({ DATOS, fs, path }) {
    let guardado = null;
    try {
      guardado = JSON.parse(fs.readFileSync(path.join(DATOS, 'ventana.json'), 'utf8'));
    } catch {}
    return [{ nombre: 'recuerda el tamaño de la ventana', ok: guardado?.width === 960 && guardado?.maximizada === false, detalle: JSON.stringify(guardado) }];
  },
};
