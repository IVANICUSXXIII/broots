// 1.11: descomprime un cómic con libarchive, en un hilo aparte para que Broots no se trabe mientras tanto (ver paginas.cjs).
// Las imágenes se guardan numeradas, nunca con el nombre que traen adentro: así un archivo mal armado (con «..» en el
// nombre, por ejemplo) no puede escribir fuera de la carpeta temporal.
const fs = require('node:fs');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const { ArchiveReader, libarchiveWasm } = require('libarchive-wasm');

const ES_IMAGEN = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const ES_FICHA = /(^|\/)comicinfo\.xml$/i;
const ES_BASURA = /(^|\/)(__MACOSX\/|\.)/;
const TOTAL_MAXIMO = 8 * 1024 * 1024 * 1024; // nadie lee un cómic de más de 8 GB: es un archivo dañado o una trampa

(async () => {
  const { ruta, destino } = workerData;
  const crudo = fs.readFileSync(ruta);
  const lector = new ArchiveReader(await libarchiveWasm(), new Int8Array(crudo.buffer, crudo.byteOffset, crudo.length));
  const imagenes = [];
  let ficha = '';
  let total = 0;
  for (const entrada of lector.entries()) {
    if (entrada.getFiletype() !== 'File') continue;
    const nombre = String(entrada.getPathname()).replace(/\\/g, '/');
    if (ES_BASURA.test(nombre) || !(ES_IMAGEN.test(nombre) || ES_FICHA.test(nombre))) continue;
    if (entrada.isEncrypted()) return parentPort.postMessage({ error: 'cifrado' });
    total += entrada.getSize();
    if (total > TOTAL_MAXIMO) return parentPort.postMessage({ error: 'noPudeAbrir' });
    const datos = entrada.readData();
    if (!datos) continue;
    const bytes = Buffer.from(datos.buffer, datos.byteOffset, datos.length);
    if (ES_FICHA.test(nombre)) ficha = bytes.toString('utf8');
    else {
      const archivo = `${String(imagenes.length).padStart(6, '0')}${path.extname(nombre).toLowerCase()}`;
      fs.writeFileSync(path.join(destino, archivo), bytes);
      imagenes.push({ nombre, archivo });
    }
  }
  // Sin una sola imagen legible puede ser un RAR con los nombres cifrados: libarchive no ve nada adentro.
  if (!imagenes.length && lector.hasEncryptedData()) return parentPort.postMessage({ error: 'cifrado' });
  lector.free();
  parentPort.postMessage({ imagenes, ficha });
})().catch((error) => {
  parentPort.postMessage({ error: /encrypt|prefix found/i.test(error?.message ?? '') ? 'cifrado' : 'noPudeAbrir' });
});
