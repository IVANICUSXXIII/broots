# Broots

**Tu biblioteca de libros electrónicos, compatible con Calibre.** Una app para Windows para ordenar, buscar,
editar y leer tus e-books, mandarlos a tu Kindle, guardar tus subrayados y compartir libros con tu familia.

Broots es gratis y es software libre. **[Bajar la última versión](https://github.com/IVANICUSXXIII/broots/releases/latest)**.

> **English.** An e-book manager for Windows that works with your Calibre library. Free software (GPL-3.0 or
> later), in English, Spanish and Brazilian Portuguese. [Download the latest version](https://github.com/IVANICUSXXIII/broots/releases/latest);
> it updates itself from 1.6.0 on. The installer isn’t digitally signed yet: if Windows says “Windows protected
> your PC”, click “More info” and then “Run anyway”.
>
> **Português.** Um gerenciador de e-books para Windows que funciona com a sua biblioteca do Calibre. Software
> livre (GPL-3.0 ou posterior), em português do Brasil, inglês e espanhol. [Baixe a versão mais recente](https://github.com/IVANICUSXXIII/broots/releases/latest);
> a partir da 1.6.0 ele se atualiza sozinho. O instalador ainda não tem assinatura digital: se o Windows disser
> “O Windows protegeu o computador”, clique em “Mais informações” e depois em “Executar assim mesmo”.

## Qué es Broots

Broots trabaja sobre la misma carpeta que [Calibre](https://calibre-ebook.com/), el gestor de libros
electrónicos más usado del mundo. No hay que importar ni copiar nada: abrís Broots y ves tu biblioteca de
siempre, con otra cara.

Calibre y Broots conviven. Lo que cambiás en uno lo ves en el otro, porque los dos usan el mismo archivo de
la biblioteca (`metadata.db`).

## Broots y Calibre

- Broots lee tu biblioteca directamente, pero **nunca la cambia por su cuenta**: cada cambio lo hace con las
  herramientas oficiales de Calibre, de a uno por vez.
- Antes de cada cambio guarda un respaldo de la base en la carpeta `.broots/respaldos`, dentro de tu
  biblioteca.
- Si Calibre está instalado en tu PC, Broots usa ese. Si no, descarga una copia oficial de sus herramientas
  desde el sitio de Calibre, la verifica y la mantiene al día sola.
- Broots no es parte de Calibre ni lo reemplaza. Si Calibre te sirve, considerá
  [donarle](https://calibre-ebook.com/donate): sin Calibre, Broots no existiría.

## Qué podés hacer

- **Tu estantería:** tus libros en grilla o en lista, con portadas grandes, filtros por autor, etiqueta o
  serie, y el buscador con las mismas búsquedas que Calibre (`tags:novela`, `rating:>3`…). También ves las
  bibliotecas virtuales que armaste en Calibre.
- **Editar:** todos los datos de un libro (título, autores, serie, etiquetas, fechas, editorial, tus columnas
  propias), la portada y los formatos. «Buscar datos» trae datos y portadas de Google Books y Open Library, o
  de la página de un libro que pegues.
- **Agregar y convertir:** arrastrá archivos a la ventana para sumarlos. Si un libro no tiene EPUB o PDF,
  Broots lo convierte con las herramientas de Calibre.
- **Libros repetidos:** Broots encuentra los libros que tenés dos veces y te deja elegir cuál conservar,
  sin perder formatos ni subrayados.
- **Kindle:** mandá libros a tu Kindle por mail, desde tu cuenta de Gmail, e importá tus subrayados (el
  archivo `My Clippings.txt`). Si un libro está en el Kindle pero no en tu biblioteca, lo podés sumar.
- **Club de lectura:** llevá un libro con tus subrayados y notas a Claude, Gemini o NotebookLM, para charlar
  sobre él con una inteligencia artificial.
- **Lector:** leé tus EPUB dentro de Broots, con el tamaño de letra que quieras. Con una clave gratuita de Gemini,
  puede traducir el libro mientras leés.
- **Familia:** compartí libros con la gente de tu casa. Broots arma en tu Google Drive una copia solo con
  los libros de cada uno, que ellos abren en modo solo lectura.
- **Ayuda:** un manual completo dentro de la app (tecla F1), con buscador.

## Cómo instalarlo

Necesitás Windows 10 u 11 y una biblioteca de Calibre. Si todavía no usás Calibre, instalalo, abrilo una vez
para crear tu biblioteca y sumá algunos libros.

1. Bajá el instalador más reciente («Instalar-Broots-X.Y.Z.exe») de la
   [página de versiones de Broots](https://github.com/IVANICUSXXIII/broots/releases/latest) en GitHub.
2. Abrilo. Como el instalador todavía no tiene firma digital, puede aparecer el aviso «Windows protegió su
   PC»: tocá «Más información» y después «Ejecutar de todas formas».
3. Broots busca solo la biblioteca de Calibre de tu PC. Si no la encuentra, te pide que elijas la carpeta
   (la que tiene el archivo `metadata.db`). Puede estar en Google Drive.

Desde la 1.6.0, Broots se actualiza solo: cada vez que lo abrís (y cada seis horas si queda abierto) se fija si hay una versión nueva, la baja y la
instala cuando lo cerrás. Se apaga en Configuración → Actualizaciones. Si tenés una versión anterior,
instalá la nueva encima: tu configuración queda como estaba.

## Privacidad

Broots trabaja en tu PC y **no tiene servidores propios**: tu biblioteca, tus subrayados y tus notas no se
mandan a ningún lado por su cuenta. Esto es lo único que sale de tu PC, y solo cuando usás esa función:

| Qué | Hacia dónde | Cuándo |
|---|---|---|
| El texto de los párrafos que traducís | Gemini (Google) | Solo si cargaste tu clave y activaste la traducción en el lector. |
| El libro que enviás al Kindle | Gmail (Google) → Amazon | Cuando tocás «Enviar al Kindle». |
| Título, autor e ISBN del libro que buscás | Google Books y Open Library | Cuando tocás «Buscar datos» al editar un libro. |
| Lo mismo, también a Amazon | Amazon | Solo si lo prendés en Configuración → Privacidad (viene apagado). |
| Las herramientas de Calibre | GitHub y calibre-ebook.com | Si Calibre no está instalado: Broots descarga su copia oficial y revisa una vez por semana si hay versión nueva. No viaja nada tuyo. |
| La consulta por versiones nuevas de Broots | GitHub | Cada vez que abrís Broots (y cada seis horas si queda abierto), y la descarga si hay una. No viaja nada tuyo. Se apaga en Configuración → Actualizaciones. |

- Tu biblioteca y las copias de Familia están en carpetas de tu PC (o de Google Drive). Si están en Drive,
  las sube el programa de Google Drive, no Broots.
- La contraseña de aplicación de Gmail y la clave de Gemini las escribís vos. Se guardan cifradas por Windows
  en tu PC y Broots no las vuelve a mostrar nunca.
- Broots **no quita la protección (DRM)** de ningún libro: los libros protegidos se copian tal cual.

## Apoyar a Broots

Broots es gratis. Si te sirve, podés apoyar a quienes lo hacen posible:

- [Donar a Calibre](https://calibre-ebook.com/donate), la base de todo.
- [Invitar un cafecito al autor](https://cafecito.app/IVANICUSXXIII), desde Argentina.
<!-- Cuando la página de GitHub Sponsors del autor esté activa, sumar:
- [Apoyar al autor en GitHub Sponsors](<dirección>), desde cualquier país. -->


## Licencia

Broots es software libre, con licencia [GNU GPL versión 3](LICENSE) o posterior: podés usarlo, compartirlo
y cambiarlo. Si publicás una versión cambiada, también tiene que ser libre y con su código abierto.

Broots usa las herramientas de [Calibre](https://calibre-ebook.com/), de Kovid Goyal y su comunidad (también
GPL versión 3), y está hecho con Electron, React, Motion y Tailwind CSS, con las fuentes Inter y Literata.
El sonido del matasuegras es «Party horn 2», de Joseph Sardin en [BigSoundBank.com](https://bigsoundbank.com/),
libre de derechos.

Broots no está asociado con Calibre, Amazon ni Google. Kindle es una marca de Amazon.

## Para quien quiera programar

Todo el código está en la carpeta `app/` (Electron, React y Tailwind). Hace falta [Node.js](https://nodejs.org/).
Este repositorio recibe el código de cada versión publicada, un commit por versión («Broots X.Y.Z»), y la versión de
la página de descargas apunta a ese commit. El código de la 1.6.2 se subió después de publicarla: es el primer commit
con código. Desde la 1.6.3, el instalador lo arma GitHub Actions a partir de ese código
([`instalador.yml`](.github/workflows/instalador.yml)), con su huella SHA-256 y una constancia de origen.

```
cd app
npm install
npm run dev                       # Broots en modo desarrollo
node pruebas/correr.mjs todos     # pruebas automáticas
npm run instalador                # arma el instalador de Windows (para probar)
npm run publicar                  # publica la versión: GitHub Actions arma el instalador (hace falta permiso)
```

Las pruebas nunca tocan tu biblioteca: copian su base y algunos libros a una carpeta temporal y, al final,
comprueban que la original no cambió (antes hay que abrir Broots una vez con tu biblioteca). Las reglas técnicas del proyecto están en [`CLAUDE.md`](CLAUDE.md).
