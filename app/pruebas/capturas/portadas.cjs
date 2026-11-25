// Dibuja las portadas de la biblioteca de las capturas (lo corre capturas.mjs con Electron):
//   electron portadas.cjs <libros.json> <carpeta de salida>
// Cada portada es una página HTML de 600×900 con Literata e Inter, guardada como JPG.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const [entrada, salida] = process.argv.slice(-2);
const fuentes = path.resolve(__dirname, '../../node_modules/@fontsource-variable');
const url = (archivo) => 'file:///' + archivo.replace(/\\/g, '/');
const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function pagina(libro) {
  const largo = libro.titulo.length;
  const tamaño = largo > 28 ? 54 : largo > 16 ? 66 : 82;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Literata; src: url('${url(path.join(fuentes, 'literata/files/literata-latin-wght-normal.woff2'))}'); font-weight: 200 900; }
    @font-face { font-family: Literata; src: url('${url(path.join(fuentes, 'literata/files/literata-latin-ext-wght-normal.woff2'))}'); font-weight: 200 900; unicode-range: U+0100-024F; }
    @font-face { font-family: Inter; src: url('${url(path.join(fuentes, 'inter/files/inter-latin-wght-normal.woff2'))}'); font-weight: 100 900; }
    html, body { margin: 0; width: 600px; height: 900px; overflow: hidden; }
    body { background: ${libro.fondo}; color: ${libro.tinta}; font-family: Literata, serif; position: relative; }
    .autor { font-family: Inter, sans-serif; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; font-size: 22px; }
    .titulo { font-size: ${tamaño}px; line-height: 1.08; font-weight: 600; letter-spacing: -0.01em; text-wrap: balance; }
    .adorno { width: 70px; height: 3px; background: currentColor; opacity: .7; }
    .centro { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 44px; padding: 0 64px; }
    .marco { position: absolute; inset: 34px; border: 3px solid currentColor; outline: 1px solid currentColor; outline-offset: -14px;
      display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; padding: 96px 50px 84px; }
    .franja .arriba { position: absolute; left: 0; right: 0; top: 0; height: 520px; display: flex; align-items: flex-end; padding: 0 56px 46px; }
    .franja .linea { position: absolute; left: 56px; right: 56px; top: 540px; height: 3px; background: currentColor; opacity: .75; }
    .franja .autor { position: absolute; left: 56px; top: 584px; }
    .franja .anio { position: absolute; left: 56px; bottom: 56px; font-family: Inter, sans-serif; font-size: 20px; opacity: .65; letter-spacing: .1em; }
  </style></head><body>${
    libro.estilo === 'marco'
      ? `<div class="marco"><div class="autor">${escapar(libro.autores[0])}</div><div class="titulo">${escapar(libro.titulo)}</div><div class="adorno"></div></div>`
      : libro.estilo === 'franja'
        ? `<div class="franja"><div class="arriba"><div class="titulo">${escapar(libro.titulo)}</div></div><div class="linea"></div><div class="autor">${escapar(libro.autores[0])}</div><div class="anio">${libro.fecha.slice(0, 4)}</div></div>`
        : `<div class="centro"><div class="adorno"></div><div class="titulo">${escapar(libro.titulo)}</div><div class="autor">${escapar(libro.autores[0])}</div></div>`
  }</body></html>`;
}

app.whenReady().then(async () => {
  const libros = JSON.parse(fs.readFileSync(entrada, 'utf8'));
  const ventana = new BrowserWindow({ width: 600, height: 900, useContentSize: true, show: false, paintWhenInitiallyHidden: true });
  const html = path.join(salida, 'portada.html');
  for (const [i, libro] of libros.entries()) {
    fs.writeFileSync(html, pagina(libro));
    await ventana.loadFile(html);
    await ventana.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 150)))');
    const imagen = await ventana.webContents.capturePage(undefined, { stayHidden: true });
    fs.writeFileSync(path.join(salida, `${i}.jpg`), imagen.resize({ width: 600, height: 900 }).toJPEG(92));
  }
  fs.rmSync(html);
  app.quit();
});
