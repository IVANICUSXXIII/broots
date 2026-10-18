// Familia: un config.json de la 1.2.0 (con "hijos") pasa solo a "familia", sin perder a nadie.
// Y desde la 1.5.0 cada integrante guarda su etiqueta: los que ya estaban quedan con "Para <nombre>".
export default {
  descripcion: 'Pasa los integrantes de un config.json viejo («hijos») a «familia»',
  necesita: {},
  // config.json como lo dejaba la 1.2.0 (el corredor lo escribe con JSON.stringify).
  config: ({ COMPARTIDO }) => ({
    amazon: false,
    hijos: [
      { id: 'prueba-uno', nombre: 'Prueba', kindle: 'prueba@kindle.com', carpeta: `${COMPARTIDO}\\Libros de Prueba` },
      { id: 'prueba-dos', nombre: 'Otra', kindle: '', carpeta: `${COMPARTIDO}\\Libros de Otra`, ultimo: { fecha: '2026-10-01T12:00:00.000Z', libros: 3 } },
    ],
  }),
  async prueba({ hasta, esperar, comprobar, boton, escribir }) {
    const { familia } = await window.familia.estado();
    comprobar('están los dos integrantes', familia?.length === 2, JSON.stringify(familia?.map((i) => i.nombre)));
    const prueba = familia?.find((i) => i.id === 'prueba-uno');
    const otra = familia?.find((i) => i.id === 'prueba-dos');
    comprobar('conserva nombre y Kindle', prueba?.nombre === 'Prueba' && prueba?.kindle === 'prueba@kindle.com');
    comprobar('conserva la última copia', otra?.ultimo?.libros === 3);
    comprobar('guarda la etiqueta que ya tenían sus libros', prueba?.etiqueta === 'Para Prueba' && otra?.etiqueta === 'Para Otra', `${prueba?.etiqueta} / ${otra?.etiqueta}`);
    comprobar('no duplica nombres', !(await window.familia.agregar({ nombre: 'prueba' })).ok);

    // En pantalla: Configuración → Familia muestra a los dos y deja sumar a alguien más.
    boton(document.querySelector('header'), 'Configuración').click();
    const dialogo = await hasta(() => document.querySelector('[role="dialog"][aria-label="Configuración"]'), 5000);
    dialogo.querySelector('[data-seccion="familia"]').click();
    const seccion = await hasta(() => document.querySelector('[data-config-seccion="familia"]'), 5000);
    await esperar(300);
    escribir(seccion.querySelector('input[placeholder="Agregar a alguien más (nombre)"]'), 'Tercera');
    await esperar(100);
    boton(seccion, 'Agregar').click();
    await hasta(() => seccion.innerText.includes('Tercera'), 5000);
    const faltan = ['Prueba', 'Otra', 'Tercera'].filter((n) => !seccion?.innerText.includes(n));
    comprobar('Configuración → Familia los muestra', seccion && !faltan.length, faltan.length ? `falta: ${faltan.join(', ')}` : '');
  },
  verificar({ DATOS, BIBLIOTECA, fs, path }) {
    const leer = (nombre) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DATOS, nombre), 'utf8'));
      } catch {
        return null;
      }
    };
    const config = leer('config.json');
    const respaldo = leer('config.antes-de-familia.json');
    const respaldoEtiquetas = leer('config.antes-de-etiquetas.json');
    return [
      { nombre: 'config.json ya no tiene «hijos»', ok: config && !('hijos' in config) },
      { nombre: 'config.json tiene a los tres en «familia»', ok: config?.familia?.length === 3 },
      { nombre: 'el resto de la configuración sigue igual', ok: config?.amazon === false && config?.libraryPath === BIBLIOTECA },
      { nombre: 'quedó una copia del config.json anterior', ok: respaldo?.hijos?.length === 2 },
      { nombre: 'los tres tienen su etiqueta guardada', ok: config?.familia?.every((i) => i.etiqueta === `Para ${i.nombre}`), detalle: config?.familia?.map((i) => i.etiqueta).join(', ') },
      { nombre: 'quedó una copia antes de guardar las etiquetas', ok: Array.isArray(respaldoEtiquetas?.familia) && respaldoEtiquetas.familia.every((i) => !i.etiqueta) },
    ];
  },
};
