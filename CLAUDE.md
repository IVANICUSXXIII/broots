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
  - El resto, una función cada uno: `edicion`, `agregar`, `duplicados`, `metadatos`, `web` (Amazon), `envio` (Kindle por Gmail), `subrayados`, `club`, `lector`, `traduccion` (Gemini), `compartir` y `habito` (sesiones de lectura y relecturas en `.broots/habito`, un archivo por mes y por PC; crea la columna «Estado» con `calibredb add_custom_column`).
- `app/src/`: interfaz React. `components/` con una pantalla u hoja por archivo; `lib/` con búsqueda tipo Calibre, formato, movimiento (resortes), epub, `idioma.js` (`t()` de la interfaz), el manual de la Ayuda (`manual/<idioma>.js`: si cambia una función, actualizar los tres) y las instrucciones del club (`club/<idioma>.js`).
- `app/idiomas/`: los textos de Broots, un archivo por idioma (`es.json`, `en.json`, `pt.json`), con una sección `interfaz` y otra `electron`.
- `app/pruebas/`: pruebas automáticas (ver abajo).
- `app/build/`: ícono. `app/instalador/`: instaladores generados (no van al repositorio).
- `app/scripts/`: `dev`, `publicar` (ver Versiones), `notas` (la descripción de cada versión) y `preparar-version` (lo usa Actions).
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
- `calibredb remove` manda a la papelera de Calibre (`--permanent` solo en copias temporales).

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

El corredor arma la biblioteca de prueba copiando la base real (solo lectura) y algunos libros, corre Broots con `BROOTS_DATOS`, verifica que la ventana abrió la biblioteca de prueba y, al final, que la base real no cambió. Simulaciones disponibles:
- `BROOTS_TRADUCCION_FALSA=1`: traduce anteponiendo el idioma ("ES· ", "EN· "…).
- `BROOTS_IDIOMA_WINDOWS=pt-BR`: simula el idioma de Windows. El corredor pone `es-AR` en todos los escenarios (las pruebas buscan textos en español), salvo que el escenario pida otro.
- `BROOTS_SIN_CALIBRE=1`: simula una PC sin Calibre.
- `BROOTS_CALIBRE_PROPIO=carpeta`: lugar de la copia propia de Calibre.
- `BROOTS_ACTUALIZACIONES=http://127.0.0.1:puerto`: un servidor local hace de GitHub para las actualizaciones. Sin esta variable, las pruebas no buscan versiones nuevas ni muestran el festejo. Sin empaquetar, el instalador bajado no se ejecuta: se anota en `actualizaciones/simulado.json`.
- `BROOTS_MINUTO_PRUEBA=2000`: un «minuto» del reloj de la sesión de lectura dura esos milisegundos (solo con `BROOTS_DATOS`), para probar la meta, el descanso y el paso a «Leyendo» sin esperar.
- `BROOTS_VENTANA=960x600`: abre la ventana con ese tamaño (solo con `BROOTS_DATOS`). Fuera de las pruebas, Broots recuerda el tamaño en `ventana.json` y la primera vez abre maximizada.

Un escenario puede sumar claves al `config.json` de prueba con `config: () => ({ … })` (el corredor lo escribe con `JSON.stringify` y siempre fija `libraryPath` a la biblioteca de prueba).

## Versiones e instalador

- Antes de publicar, subir `version` en `package.json` (y en `package-lock.json`) y escribir lo que cambió en `novedades.json` (es, en y pt: lo muestra el aviso de actualización y la descripción de la versión).
- `npm run instalador` (en `app/`) arma el instalador en la PC, para probarlo; el que se publica lo arma GitHub Actions.
- `npm run publicar` (desde `main`, con todo en commit) sube a `IVANICUSXXIII/broots` la foto del código de esa versión (un commit «Broots X.Y.Z», con el mail anónimo de GitHub), le pone la etiqueta `vX.Y.Z` y le pide a Actions (`.github/workflows/instalador.yml`, `gh workflow run` sobre la etiqueta) que arme el instalador y cree la versión; se queda mirando y al final verifica que quedó como «Latest» con su huella. Las copias instaladas desde la 1.6.0 la bajan solas. Publicar solo con el OK del usuario. `-- --ensayo` muestra qué publicaría; `-- --solo-codigo` sube solo el código; `-- --prueba-ci` sube el código y pide un armado de prueba (el .exe queda 5 días en los Artifacts de la corrida, sin versión).
- En Actions (Windows de GitHub, gratis por ser público): `npm ci`, `npm run instalador -- --publish never`, `scripts/preparar-version.mjs` (nombre sin espacios, SHA-256 y descripción con `scripts/notas.mjs`, incluido el comentario oculto `<!-- novedades … -->` que lee `actualizaciones.cjs`), constancia de origen (`attest-build-provenance`) y `gh release create`. Mientras arma, la versión no existe (gh la crea como borrador, sube el .exe y recién ahí la publica): `releases/latest` sigue dando la anterior. Si la huella de GitHub no coincide con la del .exe, la vuelve a borrador. Si Actions falla, volver a correr `npm run publicar` reusa la etiqueta. El workflow solo corre en el público (en el privado no hace nada) y llega ahí con `publicar`, como el resto del código: nunca subirlo a mano. Las acciones van fijadas por commit (SHA).
- Antes de subir el código, `publicar` busca datos personales: mails de Gmail y de Kindle (salvo los ejemplos), rutas de la PC, claves, y las palabras de `%APPDATA%\Broots\publicar\revision.txt` (fuera del repositorio, porque son los datos personales). Si encuentra algo, no publica nada: corregirlo en el código, nunca saltear la revisión.
- Si falla con `EPERM ... rename win-unpacked.tmp` es el antivirus revisando el programa recién armado: borrar `instalador/` y correr `npx electron-builder --win nsis` de nuevo. No usar `--prepackaged` con la carpeta renombrada a mano: sale un instalador sin la app (revisar que exista `win-unpacked/resources/app.asar`).
- La app instalada y la de desarrollo comparten `%APPDATA%\Broots`.

## Git

- Dos repositorios. El **privado** (`origin`) es el taller: ramas, commits e historial completo. El **público** (`IVANICUSXXIII/broots`) es la vidriera: el código de cada versión publicada y los instaladores. Al público solo llega lo que sube `npm run publicar`: nunca agregarlo como remoto ni hacerle push a mano.
- Una rama por función grande; se une a `main` cuando el usuario la probó.
- Commit: solo cuando el usuario lo pida o lo apruebe.
- Push al privado (`origin`): sin pedir permiso, después de cada commit (de `main` y de las ramas), para que el respaldo esté siempre al día (decisión del usuario, 17/10).
- Todo lo público (la organización `IVANICUSXXIII`, publicar versiones o código): solo con el OK del usuario.
- Autor: `IVANICUSXXIII`, con el mail anónimo de GitHub (ya configurado en este repositorio). GitHub rechaza los push con el mail personal: no cambiarlo. Mensajes en español; terminan con la línea `Co-Authored-By` que indique la sesión.
