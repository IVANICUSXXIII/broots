# Broots

Gestor de e-books de escritorio (Windows) compatible con Calibre: misma carpeta y misma base
(`metadata.db`). Electron 44 + React 19 + Tailwind 4 + Motion. Todo el código está en `app/`.

## Estructura

- `app/electron/`: proceso principal (Node). Un módulo por tema:
  - `main.cjs` (ventana e IPC) y `preload.cjs` (puente seguro hacia la interfaz).
  - `library.cjs` lee la biblioteca.
  - `calibre.cjs` y `calibrePropio.cjs` manejan las herramientas de Calibre.
  - `idioma.cjs`: el idioma de Broots y la función `t()` para los mensajes de Electron.
  - `actualizaciones.cjs`: busca versiones nuevas de Broots en GitHub (`IVANICUSXXIII/broots`), las baja, verifica su huella y las instala al cerrar.
  - El resto, una función cada uno: `edicion`, `agregar`, `nombreDeArchivo` (qué dice el nombre de un archivo sin datos adentro: título, autores, serie, editorial; lo usa `agregarArchivos`), `duplicados`, `metadatos`, `web` (Amazon), `envio` (Kindle por Gmail), `subrayados` (los del Kindle), `club`, `lector` (EPUB), `paginas` (PDF de a pedazos y cómics; los CBR los descomprime `extraerComic.cjs` en otro hilo, a `cache/comics`), `traduccion` (Gemini: traducir y, desde la 1.9, «Explicar», que guarda cada explicación 30 días en `.broots/explicaciones`), `compartir`, `habito` (sesiones de lectura y relecturas en `.broots/habito`, un archivo por mes y por PC; crea la columna «Estado» con `calibredb add_custom_column`), `anotaciones` (subrayados y notas del lector en `.broots/subrayados-lector`, un archivo por PC, y la lista única Broots + Kindle de cada libro), `diccionario` («Definir»: baja, verifica y busca; ver Diccionario) y `cuaderno` (el .md de cada libro en su carpeta `data`, la de Calibre para archivos extra; lo de abajo de `<!-- broots:fin -->` es del usuario y no se toca).
- `app/src/`: interfaz React. `components/` con una pantalla u hoja por archivo (`Tour.jsx`: el tour de bienvenida, textos en `tour.*`); `lib/` con búsqueda tipo Calibre, formato, movimiento (resortes), epub, `lectura.js` (tema, fuente, interlineado y márgenes del lector; los colores de cada tema están en `index.css`, `[data-tema-lector]`), `paginas.js` y `pdf.js` (el lector de páginas: `LectorPaginas.jsx`, para PDF y cómics), subrayados (anclas por párrafo y pintar con `<mark>`, que no mueve el texto), `idioma.js` (`t()` de la interfaz), el manual de la Ayuda (`manual/<idioma>.js`: si cambia una función, actualizar los tres) y las instrucciones del club (`club/<idioma>.js`).
- `app/idiomas/`: los textos de Broots, un archivo por idioma (`es.json`, `en.json`, `pt.json`), con una sección `interfaz` y otra `electron`.
- `app/pruebas/`: pruebas automáticas (ver abajo).
- `app/build/`: ícono. `app/instalador/`: instaladores generados (no van al repositorio).
- `app/scripts/`: `dev`, `publicar` (ver Versiones), `notas` (la descripción de cada versión), `preparar-version` (lo usa Actions) y `armar-diccionarios` (a mano, ver Diccionario).
- `.github/workflows/instalador.yml`: GitHub Actions arma el instalador en el repositorio público.

## Reglas de oro

1. **Nunca escribir `metadata.db` a mano.** Broots la lee con `node:sqlite` (copia en caché, solo lectura). Toda modificación pasa por `calibre.calibredb()`, que usa las herramientas oficiales de Calibre en fila, con respaldo previo en `.broots/respaldos` y reintentos si la base está ocupada.
2. **Nunca probar sobre la biblioteca real del usuario.** Usar siempre `app/pruebas/` (biblioteca de prueba en `%TEMP%`, configuración aparte con `BROOTS_DATOS`). Con `BROOTS_DATOS` puesto, Broots no busca la biblioteca real por su cuenta: no quitar esa protección.
3. **Escribir JSON de configuración con Node** (`JSON.stringify`), nunca con `echo` y barras invertidas: un JSON inválido hizo que una prueba abriera la biblioteca real.
4. **Nunca quitar DRM.** Los archivos protegidos se copian tal cual; no se convierten.
5. **Las claves y contraseñas** (Gmail, Gemini) las escribe el usuario en Broots, se cifran con `safeStorage` y nunca vuelven a la interfaz. Nunca leer la contraseña que guarda Calibre.
6. **Sin datos personales en el repositorio:** ni mails, ni direcciones de Kindle, ni nombres, ni rutas de la PC del usuario. Los documentos internos de trabajo viven fuera del repositorio.
7. **Las bibliotecas compartidas** (`broots-compartida.json` en la carpeta) son de solo lectura: `calibre.cjs` rechaza escrituras ahí.

## Detalles de Calibre que ya costaron

- calibredb necesita la ruta de la biblioteca en menos de ~89 caracteres (en pruebas, usar `%TEMP%` con ruta corta).
- Fechas: mandar `AAAA-MM-DDT12:00:00+00:00`. Sin hora, calibredb guarda el día siguiente.
- `--field identifiers:` reemplaza todos los identificadores: combinar con los que ya tenía.
- Una versión nueva de calibredb actualiza el esquema de `metadata.db`. Por eso, si Calibre está instalado, se usa ese y no la copia propia.
- Jerarquías: «Sagas.Harry Potter» cuelga de «Sagas». Broots siempre las muestra en árbol (`ramasDeEtiqueta` en `lib/biblioteca.js`, que no parte puntos finales, iniciales, números ni direcciones web) y entiende `tags:"=.Sagas"` y `tags:"=..Sagas"`.
- `calibredb remove` manda a la papelera de Calibre (`--permanent` solo en copias temporales).
- Sin datos adentro, Calibre copia el nombre del archivo como título (y parte «Título - Autor» solo). `ebook-meta` lee lo mismo sin tocar nada: si el título es el nombre, Broots lo limpia. Va en `calibredb add --title`, no en un `set_metadata` posterior: Calibre busca los repetidos con el título que recibe, y si se limpiara después, el mismo archivo agregado dos veces no se reconocería.

## PDF y cómics

- RAR con **libarchive** (BSD, vía `libarchive-wasm`), nunca con UnRAR: su licencia prohíbe usarlo para recrear el compresor, y esa restricción no es compatible con la GPL de Broots. Los avisos de terceros van en `licencias-de-terceros.txt`.
- `pdfjs-dist` es dependencia de desarrollo a propósito: Vite lo mete en `dist` y `vite.config.mjs` copia a `dist/pdfjs` solo lo que hace falta. Empaquetado entero pesa 37 MB.
- Con la app en el disco no hay servidor: pdf.js pide tipografías y tablas por IPC (`recursoPdf`) y el archivo de a pedazos (`rangoPdf`).
- DRM y contraseña: pdf.js se niega a abrirlos y `lib/pdf.js` traduce el error. Nunca pasarle una contraseña ni insistir. Los PDF con la marca de «no copiar» y contraseña vacía se leen (decisión del usuario).
- Posición: en `lectura.json`, cada formato en `formatos.<FORMATO>`. Capítulo y párrafo de afuera son del EPUB; progreso y página de afuera son los del último formato leído (los muestra el panel).

## Diccionario

- «Definir» (`components/Definir.jsx`, `lib/diccionario.js`, `electron/diccionario.cjs`): uno por idioma (español, inglés, portugués), resumido de Wiktionary. No viaja en el instalador: se baja la primera vez que se pide, de **`IVANICUSXXIII/broots-diccionarios`**, a `%LOCALAPPDATA%\Broots\diccionarios`. Después no usa internet.
- Licencia CC BY-SA 4.0: es un archivo de datos aparte, no se mezcla con el código GPL. Cada definición muestra el crédito (enlace a su página de Wiktionary, «resumido» y la licencia): no sacarlo. Avisos en `licencias-de-terceros.txt` y `CREDITOS.txt` (en el repositorio de diccionarios).
- Va en su propio repositorio para no tocar `releases/latest` de `broots`, de donde salen las actualizaciones. Es público: subir ahí solo con el OK del usuario.
- `electron/diccionarios.json` fija versión, dirección, huella y pesos de cada uno. Para sacar diccionarios nuevos: `scripts/armar-diccionarios.mjs` (las instrucciones están al principio; tarda más de una hora), subir los `.db.br` a una versión nueva, copiar el json y correr `diccionario-real`. Un diccionario de una versión anterior se sigue usando mientras baja el nuevo en silencio.
- Qué diccionario se usa lo decide `elegirDiccionario`: lo que se ve en pantalla (párrafo traducido → idioma de Broots; si no, por sus palabras), después el idioma del libro y después el de Broots. Por el texto y no por Calibre a propósito: hay libros mal etiquetados y citas en otro idioma.
- En `palabras`, varias filas pueden compartir `clave` («año» y «ano»): siempre gana la coincidencia exacta. En el crudo de wiktextract hay verbos raros cuya base no tiene definición: esas formas guardan su texto («Participio de bosticar»).

## Interfaz y rendimiento

- Broots está en español, inglés y portugués de Brasil. Ningún texto visible va escrito en el código: va en `idiomas/*.json` (en los tres a la vez) y se usa con `t('seccion.clave')`, o `tx()` si lleva <marcas>. Plurales: `{ "one": "…", "other": "{n} …" }`. Fechas y números, con `region()` (es-AR, en-US, pt-BR).
- El español sigue rioplatense; el inglés y el portugués, naturales (no traducción literal). Código, nombres y comentarios en español, con la densidad de comentarios del código existente.
- Tono divertido y descontracturado (cada idioma con su propio humor), pero claro y serio en errores, borrado y papelera, respaldos, DRM, envío al Kindle y claves. Botones y menús, cortos y obvios.
- Los nombres de carpetas y archivos internos (`.broots/club-de-lectura`, `traducciones`…) no se traducen. La etiqueta de Familia («Para Ana», «For Ana») se guarda en el integrante al crearlo: no calcularla con el nombre.
- Animar solo `transform` y `opacity`. Nada de `backdrop-filter` en vivo: la placa integrada del usuario cae a ~30 fps. Usar los resortes de `src/lib/movimiento.js`.
- Colores con las variables de `src/index.css` (paleta verde/tierra, claro y oscuro). Estilo macOS sin efecto glass.

## Pruebas

```
cd app
node pruebas/correr.mjs            # lista los escenarios
node pruebas/correr.mjs lector     # corre uno
```

Cuánto probar: mientras se trabaja, solo los escenarios del tema. `todos`, una sola vez antes de unir (tarda de 7 a 14 minutos); después, repetir solo lo que falló, con el comando que da el resumen final. Otra corrida completa solo si un arreglo toca algo compartido, y diciendo por qué.

Una sola corrida a la vez en toda la PC: la que llega después espera su turno hasta 20 minutos (`%LOCALAPPDATA%\Broots-pruebas\turno.json`), así que no hacen falta esperas ni bucles a mano. Cada escenario se corta a los 4 minutos (10 los marcados `lento`). Con `BROOTS_DATOS`, la ventana no se frena al quedar tapada o minimizada (`backgroundThrottling` en `main.cjs`): frenada, una prueba de 25 s tardaba más de 3 minutos.

El corredor arma la biblioteca de prueba copiando la base real (solo lectura) y algunos libros, corre Broots con `BROOTS_DATOS`, verifica que la ventana abrió la biblioteca de prueba y, al final, que la base real no cambió. Simulaciones disponibles:
- `BROOTS_TRADUCCION_FALSA=1`: traduce anteponiendo el idioma ("ES· ", "EN· "…).
- `BROOTS_IDIOMA_WINDOWS=pt-BR`: simula el idioma de Windows. El corredor pone `es-AR` en todos los escenarios (las pruebas buscan textos en español), salvo que el escenario pida otro.
- `BROOTS_SIN_CALIBRE=1`: simula una PC sin Calibre.
- `BROOTS_CALIBRE_PROPIO=carpeta`: lugar de la copia propia de Calibre.
- `BROOTS_ACTUALIZACIONES=http://127.0.0.1:puerto`: un servidor local hace de GitHub para las actualizaciones. Sin esta variable, las pruebas no buscan versiones nuevas ni muestran el festejo. Sin empaquetar, el instalador bajado no se ejecuta: se anota en `actualizaciones/simulado.json`.
- `BROOTS_MINUTO_PRUEBA=2000`: un «minuto» del reloj de la sesión de lectura dura esos milisegundos (solo con `BROOTS_DATOS`), para probar la meta, el descanso y el paso a «Leyendo» sin esperar.
- En pruebas, «Buscar» no abre el navegador: anota la dirección en `busquedas.log` (dentro de `BROOTS_DATOS`). Y `window.lector.pruebaCruz()` hace lo mismo que tocar la cruz (`window.close()` no sirve: se saltea el evento).
- `BROOTS_AGREGAR=a.cbz;b.pdf|c.epub`: con `BROOTS_DATOS`, cada toque de «+» agrega esos archivos sin abrir el diálogo («;» separa una vez de otra y «|», los archivos).
- `BROOTS_EJECUTABLE=instalador/win-unpacked/Broots.exe` (con `--sin-compilar`): corre las pruebas sobre el programa ya empaquetado. Sirve para lo que cambia dentro del `.asar`, como el hilo que descomprime los CBR.
- `BROOTS_DICCIONARIOS=manifiesto.json`: de dónde bajar los diccionarios, en vez de GitHub; `=real` baja los de verdad (lo usa el escenario `diccionario-real`, que es lento y no corre con `todos`). Sin esta variable, las pruebas no bajan ningún diccionario.
- `BROOTS_VENTANA=960x600`: abre la ventana con ese tamaño (solo con `BROOTS_DATOS`). Fuera de las pruebas, Broots recuerda el tamaño en `ventana.json` y la primera vez abre maximizada.

Un escenario puede sumar claves al `config.json` de prueba con `config: () => ({ … })` (el corredor lo escribe con `JSON.stringify` y siempre fija `libraryPath` a la biblioteca de prueba) y mandarle datos a su prueba con `datos: () => ({ … })`. `pruebas/libros-de-prueba.mjs` arma a mano PDF (también con DRM o contraseña), CBZ y CBR (RAR 4 y 5, sin compresión; sin WinRAR no se pueden armar comprimidos).

## Versiones e instalador

- Antes de publicar, subir `version` en `package.json` (y en `package-lock.json`) y escribir lo que cambió en `novedades.json` (es, en y pt: lo muestra el aviso de actualización y la descripción de la versión).
- `npm run instalador` (en `app/`) arma el instalador en la PC, para probarlo; el que se publica lo arma GitHub Actions.
- `npm run publicar` (desde `main`, con todo en commit) sube a `IVANICUSXXIII/broots` la foto del código de esa versión (un commit «Broots X.Y.Z», con el mail anónimo de GitHub), le pone la etiqueta `vX.Y.Z` y le pide a Actions (`.github/workflows/instalador.yml`, `gh workflow run` sobre la etiqueta) que arme el instalador y cree la versión; se queda mirando y al final verifica que quedó como «Latest» con su huella. Las copias instaladas desde la 1.6.0 la bajan solas. Publicar solo con el OK del usuario. `-- --ensayo` muestra qué publicaría; `-- --solo-codigo` sube solo el código; `-- --prueba-ci` sube el código y pide un armado de prueba (el .exe queda 5 días en los Artifacts de la corrida, sin versión).
- En Actions (Windows de GitHub, gratis por ser público): `npm ci`, `npm run instalador -- --publish never`, `scripts/preparar-version.mjs` (nombre sin espacios, SHA-256 y descripción con `scripts/notas.mjs`, incluido el comentario oculto `<!-- novedades … -->` que lee `actualizaciones.cjs`), constancia de origen (`attest-build-provenance`) y `gh release create`. Mientras arma, la versión no existe (gh la crea como borrador, sube el .exe y recién ahí la publica): `releases/latest` sigue dando la anterior. Si la huella de GitHub no coincide con la del .exe, la vuelve a borrador. Si Actions falla, volver a correr `npm run publicar` reusa la etiqueta. El workflow solo corre en el público (en el privado no hace nada) y llega ahí con `publicar`, como el resto del código: nunca subirlo a mano. Las acciones van fijadas por commit (SHA).
- Antes de subir el código, `publicar` busca datos personales: mails de Gmail y de Kindle (salvo los ejemplos), rutas de la PC, claves, y las palabras de `%APPDATA%\Broots\publicar\revision.txt` (fuera del repositorio, porque son los datos personales). Si encuentra algo, no publica nada: corregirlo en el código, nunca saltear la revisión.
- Si falla con `EPERM ... rename win-unpacked.tmp` es el antivirus revisando el programa recién armado: borrar `instalador/` y correr `npx electron-builder --win nsis` de nuevo. Si sigue fallando, usar la copia de Electron ya revisada: `npx electron-builder --win nsis --publish never -c.electronDist=node_modules/electron/dist`. No usar `--prepackaged` con la carpeta renombrada a mano: sale un instalador sin la app (revisar que exista `win-unpacked/resources/app.asar`).
- La app instalada y la de desarrollo comparten `%APPDATA%\Broots`.

## Git

- Dos repositorios. El **privado** (`origin`) es el taller: ramas, commits e historial completo. El **público** (`IVANICUSXXIII/broots`) es la vidriera: el código de cada versión publicada y los instaladores. Al público solo llega lo que sube `npm run publicar`: nunca agregarlo como remoto ni hacerle push a mano.
- Una rama por función grande; se une a `main` cuando el usuario la probó.
- Commit: solo cuando el usuario lo pida o lo apruebe.
- Push al privado (`origin`): sin pedir permiso, después de cada commit (de `main` y de las ramas), para que el respaldo esté siempre al día (decisión del usuario, 17/10).
- Todo lo público (la organización `IVANICUSXXIII`, publicar versiones o código): solo con el OK del usuario.
- Autor: `IVANICUSXXIII`, con el mail anónimo de GitHub (ya configurado en este repositorio). GitHub rechaza los push con el mail personal: no cambiarlo. Mensajes en español; terminan con la línea `Co-Authored-By` que indique la sesión.
