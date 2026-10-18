// Manual de Broots en español (Configuración → Ayuda). Solo texto: lo muestra y lo busca Ayuda.jsx.
// Cada tema tiene bloques de un tipo: texto, subtitulo, pasos (numerados), lista, teclas o preguntas.
// Escribir para alguien que no es técnico: sin jerga, en rioplatense y con los nombres que se ven en pantalla.
// Tono divertido y descontracturado, pero claro y serio en errores, borrado, respaldos, DRM, envío al Kindle y claves.
// El mismo manual está en inglés (en.js) y en portugués (pt.js): si cambia una función, actualizar los tres.

export const MANUAL = [
  {
    id: 'que-es',
    titulo: 'Qué es Broots',
    bloques: [
      { texto: 'Broots es tu bibliotecario de bolsillo: te ayuda a ordenar, encontrar y leer tus libros electrónicos. Usa la misma carpeta que Calibre, así que no hay que importar ni copiar nada: llegar y leer.' },
      { texto: 'Calibre y Broots conviven en paz. Lo que cambiás en uno lo ves en el otro, porque los dos usan el mismo archivo de la biblioteca (metadata.db).' },
      {
        lista: [
          'Broots nunca toca ese archivo por su cuenta: cada cambio lo hace con las herramientas oficiales de Calibre.',
          'Antes de cada cambio guarda un respaldo de la base en la carpeta .broots/respaldos, dentro de tu biblioteca.',
          'Si Calibre no está instalado en esta PC, Broots descarga su propia copia de esas herramientas (lo ves en Configuración → Calibre).',
        ],
      },
      { texto: 'Broots es gratis y es software libre, con la misma licencia que Calibre (GPL versión 3): podés usarlo, compartirlo y cambiarlo. Lo ves en Configuración → Acerca de.' },
    ],
  },
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos',
    bloques: [
      {
        pasos: [
          'La primera vez, Broots busca la biblioteca de Calibre de esta PC. Si no la encuentra, tocá «Elegir carpeta» y elegí la carpeta que tiene el archivo metadata.db.',
          'A la izquierda están tus bibliotecas (las de Calibre y las de Familia) y los filtros: autores, etiquetas, series y más.',
          'Arriba está el buscador: escribí parte del título, del autor o de una etiqueta.',
          'Tocá un libro para abrir su panel, con la portada, los datos y lo que podés hacer con él: leer, editar, enviar al Kindle o compartir.',
        ],
      },
      { subtitulo: 'Búsquedas de experto (como en Calibre)' },
      {
        lista: [
          'tags:novela → libros con una etiqueta que contiene «novela».',
          'author:"=Jorge Luis Borges" → ese autor exacto.',
          'rating:>3 → más de tres estrellas.',
          'Podés combinar con and, or y not: tags:novela not tags:leído.',
        ],
      },
      { texto: 'Para usar otra carpeta de biblioteca, pasarte al tema oscuro (o volver a la luz) o elegir el idioma de Broots (español, inglés o portugués), entrá a Configuración → General.' },
    ],
  },
  {
    id: 'agregar',
    titulo: 'Agregar y convertir libros',
    bloques: [
      {
        lista: [
          'Tocá el «+» de la barra de arriba, o arrastrá los archivos (EPUB, PDF, MOBI…) a la ventana de Broots. Se aceptan pilas enteras.',
          'Si un libro no tiene EPUB o PDF, en su panel aparece «Convertir a EPUB» o «Convertir a PDF». Puede tardar un poco: buen momento para cebarte un mate.',
          'Los libros con protección (DRM) se copian tal cual: Broots no les quita la protección ni los convierte.',
        ],
      },
    ],
  },
  {
    id: 'editar',
    titulo: 'Editar los datos de un libro',
    bloques: [
      { texto: 'En el panel del libro, tocá «Editar». Ahí están todos los datos: título, autores, serie, etiquetas, fechas, editorial, las columnas que creaste en Calibre, la portada y los formatos.' },
      {
        lista: [
          '«Buscar datos» trae datos y portadas de Google Books y Open Library. Si querés que busque también en Amazon (suele tener mejores portadas), prendelo en Configuración → Privacidad.',
          'También podés pegar la dirección de la página del libro en cualquier sitio, y Broots copia sus datos al formulario.',
          'Para cambiar la portada, arrastrá una imagen sobre ella. Así de fácil.',
          'Revisá lo que trajo y tocá «Guardar». Se guardan solo los campos que cambiaste: lo demás queda como estaba.',
        ],
      },
    ],
  },
  {
    id: 'kindle',
    titulo: 'Kindle: envío y subrayados',
    bloques: [
      { subtitulo: 'Enviar libros al Kindle' },
      {
        pasos: [
          'En Configuración → Kindle y correo, escribí tu Gmail, una contraseña de aplicación (ver Preguntas frecuentes) y la dirección @kindle.com de tu Kindle.',
          'En Amazon, entrá a Preferencias de contenido y dispositivos → Documentos personales y agregá tu Gmail a la lista de correos aprobados.',
          'Listo: en el panel de cada libro aparece «Enviar al Kindle».',
        ],
      },
      { texto: 'Amazon acepta EPUB y PDF de hasta 50 MB. Los formatos MOBI y AZW ya no los acepta por mail: convertí el libro a EPUB primero.' },
      { subtitulo: 'Importar tus subrayados' },
      {
        lista: [
          'Conectá el Kindle por USB (desbloqueado), tocá el botón Kindle de la barra y después «Importar desde el Kindle».',
          'También podés arrastrar el archivo My Clippings.txt del Kindle a la ventana.',
          'Broots reparte los subrayados por libro y los guarda en la carpeta de tu biblioteca. Si no reconoce un libro, te pregunta cuál es (y no se lo olvida más).',
          'Si un libro está en el Kindle pero no en tu biblioteca, lo podés agregar desde la misma hoja.',
        ],
      },
    ],
  },
  {
    id: 'lector',
    titulo: 'Leer y traducir',
    bloques: [
      { texto: 'En el panel de un libro EPUB, tocá «Leer» para abrirlo en el lector de Broots. El sillón lo ponés vos.' },
      {
        lista: [
          'Pasá de página con las flechas ← →, la rueda del mouse o un clic en los costados (sin chuparte el dedo).',
          'Arriba tenés el índice, el tamaño de letra y el número de página: escribí un número y apretá Enter para ir ahí.',
          'Para traducir al idioma de Broots, cargá tu clave de Gemini en Configuración → Lectura y traducción (ver Preguntas frecuentes) y tocá el botón de traducir del lector.',
          'Tocá un párrafo traducido para ver el original, por si querés comparar.',
          'Esc vuelve a la biblioteca.',
        ],
      },
    ],
  },
  {
    id: 'habito',
    titulo: 'Hábito de lectura',
    bloques: [
      { texto: 'Cada vez que leés en el lector, Broots anota la sesión solo: cuánto tiempo leíste de verdad y cuántas páginas. El reloj se frena si pasan 5 minutos sin pasar de página o si minimizás la ventana, así que ir a cebar un mate no cuenta como lectura.' },
      { subtitulo: 'Sesión de lectura' },
      {
        lista: [
          'El botón del reloj de arena, arriba en el lector, tiene tres modos: Libre (sin reloj a la vista), Minutos (una meta de 15 a 60) y Hasta el fin del capítulo.',
          'Los avisos nunca cortan a mitad de un párrafo: aparecen recién cuando pasás de página.',
          'Descanso para la vista (regla 20-20-20): cada 20 minutos, un cartelito suave te invita a mirar algo lejos unos 20 segundos. Se va solo y se puede apagar en el mismo botón o en Configuración → Lectura y traducción.',
          'Abajo, al lado del porcentaje, Broots te dice cuánto te queda para terminar el capítulo y el libro, según tu ritmo real.',
        ],
      },
      { subtitulo: 'Modo enfoque' },
      { texto: 'Apretá F (o el botón de las cuatro esquinas) y queda solo el texto, en pantalla completa. Llevá el mouse al borde de arriba o de abajo para que se asomen las barras. F o Esc vuelven a la normalidad.' },
      { subtitulo: 'Mi lectura' },
      {
        lista: [
          'El botón de la llama, en la barra de arriba, abre tus estadísticas: racha de días, horas del mes, ritmo, libros terminados, el mapa de calor del año y a qué hora leés.',
          '«Leyendo ahora» lista tus libros en curso con cuánto les falta. Si uno lleva más de 30 días sin abrirse, Broots te sugiere pasarlo a En pausa (nunca lo cambia solo).',
        ],
      },
      { subtitulo: 'Estados y relecturas' },
      {
        lista: [
          'Los estados son Por leer, Leyendo, En pausa, Leído y Abandonado, y se guardan en Calibre. Si tu biblioteca no tiene esa columna, «Mi lectura» ofrece crearla: lo hace con la herramienta oficial de Calibre, te pide permiso antes y guarda un respaldo de la base.',
          'Si tu columna ya existe pero no tiene «En pausa», Broots te explica cómo agregarlo en Calibre (las herramientas de Calibre no permiten hacerlo desde afuera).',
          'Cuando leés 5 minutos un libro «Por leer», pasa solo a «Leyendo» y te avisa. Al llegar a la última página, Broots te ofrece marcarlo como leído.',
          'En el panel de un libro leído aparece «Releer»: arranca una vuelta nueva desde el principio y lo que leíste antes queda guardado aparte.',
          'Las sesiones viven en la carpeta .broots/habito de tu biblioteca. En Configuración → Lectura y traducción podés dejar de anotarlas o borrar las estadísticas (Broots guarda una copia, por las dudas).',
        ],
      },
    ],
  },
  {
    id: 'club',
    titulo: 'Club de lectura',
    bloques: [
      { texto: 'Para charlar sobre un libro con una inteligencia artificial que leyó tus subrayados. Como un club de lectura, pero sin tener que coordinar horarios.' },
      {
        pasos: [
          'En el panel del libro, tocá «Llevar al club de lectura». Broots crea un archivo .md con los datos del libro y tus subrayados, y te abre la carpeta.',
          'Arrastrá ese archivo a tu Project de Claude o a NotebookLM.',
          'La primera vez, la hoja Club de lectura te explica cómo armar el Project de Claude o la skill de Gemini: pegás las instrucciones y completás la parte «Quién soy». Se hace una sola vez.',
        ],
      },
    ],
  },
  {
    id: 'familia',
    titulo: 'Familia',
    bloques: [
      { texto: 'Para compartir libros con la gente de tu casa. Cada integrante tiene su propia biblioteca dentro de Broots: los libros con la etiqueta «Para <nombre>». A cada cual su estante.' },
      {
        pasos: [
          'Tocá el botón Familia de la barra (o entrá a Configuración → Familia) y agregá a alguien con su nombre.',
          'Marcá sus libros: en el panel de cada libro, en «Compartir con», tocá su nombre. También podés sumar una biblioteca entera de una vez.',
          'Tocá «Actualizar copia». Broots arma en tu Google Drive (carpeta «Broots compartido») una copia solo con sus libros. Tu biblioteca no se toca.',
          'En Google Drive, compartí esa carpeta con su mail como «Lector». La ve desde la app de Drive, o con Broots en una PC, en modo solo lectura.',
        ],
      },
      { texto: 'Si anotás la dirección de su Kindle, en el panel de cada libro aparece «También al Kindle de…».' },
    ],
  },
  {
    id: 'duplicados',
    titulo: 'Libros repetidos',
    bloques: [
      {
        lista: [
          'Tocá el botón de duplicados de la barra: Broots busca libros que estén dos veces, como gemelos separados al nacer.',
          'Para cada caso elegís cuál conservar. Los formatos y subrayados que solo tenía el otro pasan al que conservás.',
          'El que descartás va a la papelera de Calibre: si te equivocaste, lo recuperás desde Calibre.',
        ],
      },
    ],
  },
  {
    id: 'actualizaciones',
    titulo: 'Actualizaciones',
    bloques: [
      { texto: 'Broots se actualiza solo. Cada vez que lo abrís (y cada seis horas si queda abierto) le pregunta a GitHub si hay una versión nueva; si la hay, la baja sin molestar y verifica que llegó entera.' },
      {
        lista: [
          'Cuando la versión nueva está lista, aparece un aviso en el centro de la pantalla. Si estás leyendo, espera a que cierres el libro.',
          '«Reiniciar ahora» la instala en unos segundos y vuelve a abrir Broots. «Más tarde» la deja para cuando cierres Broots.',
          'La primera vez que abrís la versión nueva hay festejo: confeti, matasuegras y lo que cambió.',
          'Tus libros, tu configuración y tus claves quedan como estaban.',
        ],
      },
      { texto: 'En Configuración → Actualizaciones podés buscar una versión nueva cuando quieras, o apagar las actualizaciones automáticas o el sonido del festejo.' },
    ],
  },
  {
    id: 'atajos',
    titulo: 'Atajos de teclado',
    bloques: [
      {
        teclas: [
          [['/', 'Ctrl+F'], 'Ir al buscador'],
          [['Ctrl+B'], 'Mostrar u ocultar la barra lateral'],
          [['Esc'], 'Cerrar el panel, la portada en grande o la hoja abierta'],
          [['F1'], 'Abrir esta ayuda (sí, esta misma)'],
          [['←', '→'], 'En el lector: página anterior y siguiente'],
          [['F'], 'En el lector: modo enfoque (solo el texto, en pantalla completa)'],
        ],
      },
    ],
  },
  {
    id: 'preguntas',
    titulo: 'Preguntas frecuentes',
    bloques: [
      {
        preguntas: [
          [
            'Me dice «Calibre está abierto u ocupado». ¿Qué hago?',
            'Para guardar cambios, Broots necesita que Calibre no esté usando la biblioteca. Cerrá Calibre y probá de nuevo en unos segundos. Si Calibre ya estaba cerrado, esperá un momento: a veces Windows o el antivirus están revisando un archivo recién creado.',
          ],
          [
            '¿Qué es la contraseña de aplicación de Gmail?',
            'Google no deja que otros programas usen tu contraseña de siempre. Una contraseña de aplicación es una clave de 16 letras solo para Broots: la creás en tu cuenta de Google (hace falta tener activada la verificación en dos pasos) y la podés borrar cuando quieras. Configuración → Kindle y correo tiene el botón que abre esa página.',
          ],
          [
            '¿Cómo consigo la clave de Gemini?',
            'Es gratis. Entrá a Google AI Studio con tu cuenta de Google, creá una clave («Create API key»), copiala y pegala en Configuración → Lectura y traducción. La versión gratuita tiene un límite de uso por día.',
          ],
          [
            '¿Dónde quedan mis claves?',
            'La contraseña de Gmail y la clave de Gemini se guardan cifradas por Windows en esta PC. Broots no las vuelve a mostrar nunca ni las manda a ningún otro lado.',
          ],
          [
            'Mi biblioteca está en Google Drive. ¿Hay que tener algún cuidado?',
            'Broots trabaja sobre la carpeta de tu PC y el programa de Google Drive la sube solo. Evitá cambiar la biblioteca desde dos PCs al mismo tiempo, y si un cambio no aparece en la otra PC, esperá a que Drive termine de sincronizar.',
          ],
          [
            '¿Broots le quita la protección (DRM) a mis libros?',
            'No. Los libros protegidos se copian tal cual, y para leerlos necesitás la app o el dispositivo de la tienda donde los compraste.',
          ],
          [
            '¿Por qué un libro no se puede enviar al Kindle?',
            'Puede ser una ficha sin archivo, un libro de más de 50 MB o uno que solo está en MOBI o AZW. En este último caso, convertilo a EPUB desde su panel.',
          ],
          [
            'Hice un cambio por error. ¿Lo puedo deshacer?',
            'Los libros descartados están en la papelera de Calibre. Además, antes de cada cambio Broots guarda un respaldo de la base en la carpeta .broots/respaldos de tu biblioteca.',
          ],
          [
            'Al instalar Broots, Windows dice «Windows protegió su PC». ¿Es peligroso?',
            'Aparece porque el instalador todavía no tiene firma digital, el sello con el que Windows reconoce quién hizo un programa. Si lo bajaste de la página de Broots en GitHub, tocá «Más información» y después «Ejecutar de todas formas». Las actualizaciones automáticas se verifican antes de instalarse.',
          ],
        ],
      },
    ],
  },
];
