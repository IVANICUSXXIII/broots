// Configuración: abre la pantalla desde la barra, recorre las secciones y prueba las preferencias.
export default {
  descripcion: 'Abre Configuración, recorre las secciones y cambia preferencias',
  necesita: {},
  async prueba({ hasta, esperar, comprobar, boton, tecla }) {
    const dialogo = () => document.querySelector('[role="dialog"][aria-label="Configuración"]');
    const contenido = (id) => document.querySelector(`[data-config-seccion="${id}"]`);
    const abrirSeccion = async (id) => {
      dialogo().querySelector(`[data-seccion="${id}"]`).click();
      return hasta(() => contenido(id), 5000);
    };

    // La barra ya no tiene el botón de carpeta: la carpeta se cambia desde Configuración.
    comprobar('la barra no tiene el botón de carpeta', !boton(document.querySelector('header'), 'Cambiar la carpeta de la biblioteca'));
    boton(document.querySelector('header'), 'Configuración').click();
    comprobar('se abre Configuración', await hasta(dialogo, 5000));
    comprobar('arranca en General', await hasta(() => contenido('general'), 5000));

    // Cada sección muestra lo suyo.
    const esperado = {
      general: ['Carpeta de la biblioteca', 'broots-prueba', 'Tema', 'Idioma de Broots', 'el de Windows'],
      lectura: ['Interlineado', 'Márgenes', 'Clave de Gemini', 'Google AI Studio'],
      kindle: ['ENVIAR AL KINDLE POR MAIL', 'Documentos personales'],
      familia: ['Agregar'],
      calibre: ['Qué usa Broots'],
      actualizaciones: ['Versión instalada', 'Buscar ahora', 'Que Broots se actualice solo', 'Con sonido de matasuegras', 'Ver novedades'],
      privacidad: ['Gemini', 'Gmail', 'Google Drive', 'Buscar datos y portadas en Amazon', 'Google Books y Open Library', 'Actualizaciones de Broots'],
      ayuda: ['Primeros pasos', 'Atajos de teclado', 'Preguntas frecuentes'],
      acerca: ['Broots', 'Calibre', 'Donar a Calibre', 'Broots es software libre', 'GPL versión 3'],
    };
    for (const [id, textos] of Object.entries(esperado)) {
      const el = await abrirSeccion(id);
      await esperar(300);
      const faltan = textos.filter((t) => !el?.innerText.includes(t));
      comprobar(`sección ${id}`, el && !faltan.length, faltan.length ? `falta: ${faltan.join(', ')}` : '');
    }

    // Sin BROOTS_ACTUALIZACIONES, las pruebas no salen a internet a buscar versiones nuevas ni festejan.
    const busqueda = await window.actualizaciones.buscar();
    comprobar('en pruebas no busca versiones nuevas en internet', !busqueda.ok && busqueda.mensaje.includes('En las pruebas'), busqueda.mensaje);
    comprobar('ni festeja', (await window.actualizaciones.festejo()) === null && !document.querySelector('[data-actualizacion]'));

    // Versión de Broots y Calibre.
    const prefs = await window.preferencias.leer();
    comprobar('lee la versión de Broots', /^\d+\.\d+\.\d+$/.test(prefs.version), prefs.version);
    // Los botones de donación al autor aparecen solo si main.cjs tiene su dirección.
    const acerca = contenido('acerca');
    comprobar(
      'los botones de donación siguen a las direcciones',
      Array.isArray(prefs.donaciones) &&
        prefs.donaciones.includes('cafecito') === Boolean(boton(acerca, 'Invitar un cafecito al autor')) &&
        prefs.donaciones.includes('sponsors') === Boolean(boton(acerca, 'Apoyar al autor en GitHub Sponsors')),
      `donaciones: ${JSON.stringify(prefs.donaciones)}`,
    );
    comprobar('Acerca de tiene el botón de la licencia de Broots', boton(acerca.querySelectorAll('section')[0], 'Licencia'));
    const calibre = await window.preferencias.calibre();
    comprobar('sabe qué Calibre usa', ['instalado', 'propia', 'ninguna'].includes(calibre.fuente), `${calibre.fuente} ${calibre.version ?? ''}`);
    const seccionCalibre = await abrirSeccion('calibre');
    await hasta(() => !seccionCalibre.innerText.includes('Revisando'), 30000);
    comprobar(
      'con Calibre instalado no ofrece descargar',
      calibre.fuente !== 'instalado' || !boton(seccionCalibre, 'Buscar actualización'),
      calibre.fuente,
    );

    // Privacidad: Amazon viene apagado (config.json de prueba sin la clave) y el interruptor se guarda.
    comprobar('Amazon apagado por defecto', prefs.amazon === false, `amazon: ${prefs.amazon}`);
    // El idioma sale del de Windows (en las pruebas, español) mientras no se elija otro.
    comprobar('idioma por defecto: el de Windows', prefs.idioma === 'es' && document.documentElement.lang === 'es', prefs.idioma);
    const rarezas = await window.preferencias.guardar({ idioma: 'fr' });
    comprobar('rechaza idiomas que no existen', rarezas.idioma === 'es');
    const privacidad = await abrirSeccion('privacidad');
    comprobar('el interruptor arranca apagado', privacidad.querySelector('[data-amazon="no"]'));
    // (El envío al Kindle sí dice «Gmail (Google) → Amazon»: se mira solo la fila de buscar datos.)
    comprobar(
      'la búsqueda de datos no nombra Amazon',
      privacidad.innerText.includes('→ Google Books y Open Library') && !privacidad.innerText.includes('Amazon, Google Books'),
    );
    privacidad.querySelector('[role="switch"]').click();
    await esperar(600);
    const conAmazon = await window.preferencias.leer();
    comprobar('prende Amazon', conAmazon.amazon === true && privacidad.querySelector('[data-amazon="si"]'));
    comprobar('la lista de salidas suma Amazon', privacidad.innerText.includes('→ Amazon, Google Books y Open Library'));
    const invalido = await window.preferencias.guardar({ amazon: 'quizás', otraCosa: 1 });
    comprobar('rechaza valores raros', invalido.amazon === true && !('otraCosa' in invalido));
    privacidad.querySelector('[role="switch"]').click();
    await esperar(600);
    comprobar('vuelve a apagar Amazon', (await window.preferencias.leer()).amazon === false);

    // Lectura: el tamaño de letra es el que usa el lector.
    const lectura = await abrirSeccion('lectura');
    const antes = JSON.parse(localStorage.getItem('broots-lector-letra') ?? '19');
    boton(lectura, 'Letra más grande').click();
    await esperar(200);
    comprobar('cambia el tamaño de letra del lector', JSON.parse(localStorage.getItem('broots-lector-letra')) === antes + 1);
    // 1.9: el tema y la fuente del lector también, con la muestra al lado.
    lectura.querySelector('[data-tema="sepia"]').click();
    lectura.querySelector('[data-fuente="atkinson"]').click();
    await esperar(300);
    const muestra = lectura.querySelector('[data-muestra-lectura]');
    const medida = JSON.parse(localStorage.getItem('broots-lector-medida') ?? '{}');
    comprobar('cambia el tema y la fuente del lector', medida.tema === 'sepia' && medida.fuente === 'atkinson', JSON.stringify(medida));
    comprobar('la muestra se ve en sepia y con Atkinson', muestra?.dataset.temaLector === 'sepia' && getComputedStyle(muestra.querySelector('.texto-libro')).fontFamily.includes('Atkinson'));
    lectura.querySelector('[data-tema="auto"]').click();
    lectura.querySelector('[data-fuente="literata"]').click();
    const estado = await window.lector.estadoTraduccion();
    comprobar('la clave de Gemini nunca vuelve a la interfaz', !Object.keys(estado).some((k) => /^clave$|cifrada/i.test(k)), Object.keys(estado).join(','));

    // General: el tema se cambia desde acá.
    const general = await abrirSeccion('general');
    boton(general, 'Oscuro').click();
    await esperar(400);
    comprobar('cambia el tema', (await window.biblioteca.obtenerTema()) === 'dark');
    boton(general, 'Claro').click();
    await esperar(400);

    // Con Configuración abierta, "/" y Ctrl+F no saltan al buscador de la biblioteca (que queda detrás).
    const buscadorBiblioteca = () => document.querySelector('header input[placeholder^="Buscar título"]');
    const ctrlF = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    document.activeElement?.blur();
    tecla('/');
    ctrlF();
    await esperar(200);
    comprobar('con una hoja abierta, / y Ctrl+F no van al buscador de la biblioteca', buscadorBiblioteca() && document.activeElement !== buscadorBiblioteca());

    // Esc cierra.
    tecla('Escape');
    comprobar('Esc cierra Configuración', await hasta(() => !dialogo(), 3000));
    ctrlF();
    await esperar(200);
    comprobar('sin hojas abiertas, Ctrl+F va al buscador de la biblioteca', document.activeElement === buscadorBiblioteca());
    document.activeElement?.blur();

    // La hoja Kindle lleva a Configuración → Kindle y correo.
    boton(document.querySelector('header'), 'Kindle: enviar libros e importar subrayados').click();
    const hojaKindle = await hasta(() => document.querySelector('[role="dialog"][aria-label="Kindle"]'), 5000);
    boton(hojaKindle, 'Configurar…').click();
    comprobar('desde Kindle abre la sección de correo', await hasta(() => dialogo() && contenido('kindle'), 5000));
    tecla('Escape');
    await hasta(() => !dialogo(), 3000);
  },
};
