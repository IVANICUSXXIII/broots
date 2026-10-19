// Puente seguro entre la interfaz y el proceso principal.
// La interfaz solo puede usar estas funciones; no tiene acceso directo al disco ni a la red.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('biblioteca', {
  cargar: () => ipcRenderer.invoke('library:load'),
  elegirCarpeta: () => ipcRenderer.invoke('library:choose'),
  mostrarEnCarpeta: (bookId) => ipcRenderer.invoke('book:show-in-folder', bookId),
  abrirFormato: (bookId, format) => ipcRenderer.invoke('book:open-format', bookId, format),
  instantanea: () => ipcRenderer.invoke('ventana:instantanea'),
  obtenerTema: () => ipcRenderer.invoke('tema:obtener'),
  cambiarTema: (tema) => ipcRenderer.invoke('tema:cambiar', tema),
});

// Etapa 2: envío al Kindle y subrayados.
contextBridge.exposeInMainWorld('kindle', {
  estadoEnvio: () => ipcRenderer.invoke('envio:estado'),
  // La contraseña viaja una sola vez hacia el proceso principal, que la cifra; nunca vuelve.
  guardarEnvio: (cambios) => ipcRenderer.invoke('envio:guardar', cambios),
  probarEnvio: () => ipcRenderer.invoke('envio:probar'),
  enviar: (bookId, integranteId) => ipcRenderer.invoke('envio:enviar', bookId, integranteId),
  historialEnvios: () => ipcRenderer.invoke('envio:historial'),
  ayudaClave: () => ipcRenderer.invoke('envio:ayuda'),
  leerSubrayados: () => ipcRenderer.invoke('subrayados:leer'),
  importarDesdeKindle: () => ipcRenderer.invoke('subrayados:desdeKindle'),
  importarArchivo: (archivo) => ipcRenderer.invoke('subrayados:desdeArchivo', webUtils.getPathForFile(archivo)),
  elegirArchivo: () => ipcRenderer.invoke('subrayados:elegirArchivo'),
  asignar: (clave, uuid) => ipcRenderer.invoke('subrayados:asignar', clave, uuid),
  ignorar: (clave) => ipcRenderer.invoke('subrayados:ignorar', clave),
  restaurar: (clave) => ipcRenderer.invoke('subrayados:restaurar', clave),
  // Agrega a la biblioteca de Calibre un libro del Kindle (con la herramienta oficial de Calibre).
  agregarLibro: (clave) => ipcRenderer.invoke('kindle:agregarLibro', clave),
});

// Etapa 4: editar la biblioteca (siempre con las herramientas de Calibre y respaldo previo).
contextBridge.exposeInMainWorld('edicion', {
  editar: (id, cambios) => ipcRenderer.invoke('libro:editar', id, cambios),
  portadaDesdeArchivo: (id) => ipcRenderer.invoke('libro:portadaArchivo', id),
  portadaDesdeImagen: (id, archivo) => ipcRenderer.invoke('libro:portadaRuta', id, webUtils.getPathForFile(archivo)),
  buscarPortadaWeb: (id) => ipcRenderer.invoke('libro:buscarPortadaWeb', id),
  buscarDatos: (id) => ipcRenderer.invoke('libro:buscarDatos', id),
  buscarEnUrl: (id, url) => ipcRenderer.invoke('libro:buscarEnUrl', id, url),
  agregarFormato: (id) => ipcRenderer.invoke('libro:agregarFormato', id),
  quitarFormato: (id, formato) => ipcRenderer.invoke('libro:quitarFormato', id, formato),
  aplicarDatos: (id, cambios, conPortada) => ipcRenderer.invoke('libro:aplicarDatos', id, cambios, conPortada),
  convertir: (id, destino) => ipcRenderer.invoke('libro:convertir', id, destino),
  agregarArchivos: (archivos) => ipcRenderer.invoke('biblioteca:agregarArchivos', archivos.map((a) => webUtils.getPathForFile(a))),
  elegirArchivos: () => ipcRenderer.invoke('biblioteca:elegirArchivos'),
  buscarDuplicados: () => ipcRenderer.invoke('duplicados:buscar'),
  ignorarDuplicado: (ids) => ipcRenderer.invoke('duplicados:ignorar', ids),
  resolverDuplicado: (conservar, descartar) => ipcRenderer.invoke('duplicados:resolver', conservar, descartar),
});

// Etapa 5: lector de EPUB con traducción (Gemini).
contextBridge.exposeInMainWorld('lector', {
  abrir: (id) => ipcRenderer.invoke('lector:abrir', id),
  capitulo: (id, href) => ipcRenderer.invoke('lector:capitulo', id, href),
  guardarPosicion: (id, posicion) => ipcRenderer.invoke('lector:posicion', id, posicion),
  estadoTraduccion: () => ipcRenderer.invoke('traduccion:estado'),
  // La clave viaja una sola vez hacia el proceso principal, que la cifra; nunca vuelve.
  guardarClave: (clave) => ipcRenderer.invoke('traduccion:guardarClave', clave),
  borrarClave: () => ipcRenderer.invoke('traduccion:borrarClave'),
  ayudaClave: () => ipcRenderer.invoke('traduccion:ayuda'),
  traducir: (id, textos, urgente) => ipcRenderer.invoke('traduccion:traducir', id, textos, urgente),
});

// 1.7: hábito de lectura (sesiones, estadísticas, relecturas y la columna «Estado»).
contextBridge.exposeInMainWorld('habito', {
  minuto: ipcRenderer.sendSync('habito:minuto'), // ms de un minuto del reloj (más corto solo en pruebas)
  abrir: (uuid) => ipcRenderer.invoke('habito:abrir', uuid),
  guardarSesion: (sesion) => ipcRenderer.invoke('habito:sesion', sesion),
  todo: () => ipcRenderer.invoke('habito:todo'),
  terminar: (uuid, resultado) => ipcRenderer.invoke('habito:terminar', uuid, resultado),
  retomar: (uuid) => ipcRenderer.invoke('habito:retomar', uuid),
  releer: (uuid, leidoAntes) => ipcRenderer.invoke('habito:releer', uuid, leidoAntes),
  archivar: () => ipcRenderer.invoke('habito:archivar'),
  crearColumna: () => ipcRenderer.invoke('habito:crearColumna'),
  pantallaCompleta: (activa) => ipcRenderer.invoke('ventana:pantallaCompleta', activa),
});

// 1.8: subrayados y notas del lector, la lista única de cada libro (Broots y Kindle) y su .md.
contextBridge.exposeInMainWorld('subrayados', {
  delLibro: (id, opciones) => ipcRenderer.invoke('subrayados:libro', id, opciones),
  guardar: (id, registro) => ipcRenderer.invoke('subrayados:guardar', id, registro),
  borrar: (id, idSubrayado) => ipcRenderer.invoke('subrayados:borrar', id, idSubrayado),
  resumen: () => ipcRenderer.invoke('subrayados:resumen'),
  mostrarMd: (id) => ipcRenderer.invoke('subrayados:mostrarMd', id),
  guardarCopia: (id) => ipcRenderer.invoke('subrayados:guardarCopia', id),
});

// Familia: compartir libros con cada integrante (copia en Drive, solo lectura).
contextBridge.exposeInMainWorld('familia', {
  estado: () => ipcRenderer.invoke('familia:estado'),
  agregar: (datos) => ipcRenderer.invoke('familia:agregar', datos),
  cambiarKindle: (id, direccion) => ipcRenderer.invoke('familia:cambiarKindle', id, direccion),
  quitar: (id) => ipcRenderer.invoke('familia:quitar', id),
  elegirCarpeta: (id) => ipcRenderer.invoke('familia:elegirCarpeta', id),
  actualizar: (id) => ipcRenderer.invoke('familia:actualizar', id),
  marcar: (id, bookIds, marcar) => ipcRenderer.invoke('familia:marcar', id, bookIds, marcar),
  abrirCarpeta: (id) => ipcRenderer.invoke('familia:abrirCarpeta', id),
  abrirDrive: () => ipcRenderer.invoke('familia:abrirDrive'),
  alProgresar: (funcion) => {
    const oyente = (_e, datos) => funcion(datos);
    ipcRenderer.on('familia:progreso', oyente);
    return () => ipcRenderer.removeListener('familia:progreso', oyente);
  },
});

// Herramientas de Calibre propias: estado de la descarga o actualización.
contextBridge.exposeInMainWorld('herramientasCalibre', {
  estado: () => ipcRenderer.invoke('calibre:estado'),
  reintentar: () => ipcRenderer.invoke('calibre:reintentar'),
  alCambiar: (funcion) => {
    const oyente = (_e, estado) => funcion(estado);
    ipcRenderer.on('calibre:estado', oyente);
    return () => ipcRenderer.removeListener('calibre:estado', oyente);
  },
});

// Actualizaciones de Broots: buscar, el aviso de una versión lista y el festejo después de instalarla.
contextBridge.exposeInMainWorld('actualizaciones', {
  estado: () => ipcRenderer.invoke('actualizacion:estado'),
  buscar: () => ipcRenderer.invoke('actualizacion:buscar'),
  // Instala la versión bajada y vuelve a abrir Broots.
  reiniciar: () => ipcRenderer.invoke('actualizacion:reiniciar'),
  marcarAvisada: (version) => ipcRenderer.invoke('actualizacion:avisada', version),
  frase: (tipo, cantidad) => ipcRenderer.invoke('actualizacion:frase', tipo, cantidad),
  festejo: () => ipcRenderer.invoke('actualizacion:festejo'),
  festejoVisto: () => ipcRenderer.invoke('actualizacion:festejoVisto'),
  alCambiar: (funcion) => {
    const oyente = (_e, estado) => funcion(estado);
    ipcRenderer.on('actualizacion:estado', oyente);
    return () => ipcRenderer.removeListener('actualizacion:estado', oyente);
  },
});

// Configuración: preferencias de Broots (config.json de esta PC) y datos para mostrar.
contextBridge.exposeInMainWorld('preferencias', {
  // Idioma de Broots al abrir la ventana ('es', 'en' o 'pt'); después lo cambia Configuración.
  idioma: ipcRenderer.sendSync('idioma:actual'),
  leer: () => ipcRenderer.invoke('config:leer'),
  guardar: (cambios) => ipcRenderer.invoke('config:guardar', cambios),
  calibre: () => ipcRenderer.invoke('config:calibre'),
  abrir: (sitio) => ipcRenderer.invoke('config:abrir', sitio),
});

// Etapa 3: club de lectura.
contextBridge.exposeInMainWorld('club', {
  exportar: (bookId) => ipcRenderer.invoke('club:exportar', bookId),
  mostrarArchivo: () => ipcRenderer.invoke('club:mostrarArchivo'),
  abrir: (sitio) => ipcRenderer.invoke('club:abrir', sitio),
  copiar: (texto) => ipcRenderer.invoke('portapapeles:copiar', texto),
});
