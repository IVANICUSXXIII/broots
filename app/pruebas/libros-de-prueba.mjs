// 1.11: PDF y cómics armados a mano para las pruebas. Nada sale de la biblioteca real, y así se puede probar lo que no se
// consigue fácil: un RAR sin tener WinRAR, un PDF con DRM o con contraseña, un zip cifrado.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { zipSync, strToU8 } from 'fflate';

// ---------- Imágenes ----------

const tablaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(datos) {
  let c = 0xffffffff;
  for (const b of datos) c = tablaCrc[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const u32be = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};

/** PNG de un solo color. El ancho sirve de documento: la página n mide 300 + n, así se ve en qué orden quedaron. */
export function png(ancho, alto, [r, g, b] = [200, 120, 90]) {
  const fila = Buffer.alloc(1 + ancho * 3);
  for (let x = 0; x < ancho; x++) fila.set([r, g, b], 1 + x * 3);
  const bloque = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
    return Buffer.concat([u32be(datos.length), cuerpo, u32be(crc32(cuerpo))]);
  };
  const cabecera = Buffer.concat([u32be(ancho), u32be(alto), Buffer.from([8, 2, 0, 0, 0])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: alto }, () => fila)))),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

/** Las páginas de un cómic: { nombre, datos }. `anchas` son las que ya vienen a doble página. */
export function paginasDeComic(cantidad, { anchas = [], carpeta = (n) => '' } = {}) {
  return Array.from({ length: cantidad }, (_, n) => ({
    nombre: `${carpeta(n)}pagina ${n + 1}.png`, // sin ceros adelante: «10» tiene que ir después de «2»
    datos: png(anchas.includes(n) ? 800 + n : 300 + n, 420, [80 + n * 20, 200 - n * 10, 120]),
  }));
}

// ---------- Cómics ----------

/** CBZ: unas páginas guardadas tal cual y otras comprimidas, como pasa en los de verdad. */
export function zip(paginas, otros = {}) {
  const archivos = { 'Thumbs.txt': strToU8('no es una página'), '__MACOSX/._pagina 1.png': strToU8('basura'), ...otros };
  paginas.forEach((p, i) => (archivos[p.nombre] = [p.datos, { level: i % 2 ? 0 : 6 }]));
  return Buffer.from(zipSync(archivos));
}

/** Un zip con sus entradas marcadas como cifradas (la bandera alcanza: no se debe intentar leerlas). */
export function zipCifrado(paginas) {
  const d = Buffer.from(zip(paginas));
  for (let i = 0; i + 4 < d.length; i++) {
    const firma = d.readUInt32LE(i);
    if (firma === 0x04034b50) d[i + 6] |= 1;
    if (firma === 0x02014b50) d[i + 8] |= 1;
  }
  return d;
}

/** RAR 4 sin compresión, armado a mano según el formato. El comprimido se probó aparte con las muestras de libarchive. */
export function rar4(paginas) {
  const bloque = (cuerpo) => {
    const crc = Buffer.alloc(2);
    crc.writeUInt16LE(crc32(cuerpo) & 0xffff);
    return Buffer.concat([crc, cuerpo]);
  };
  const partes = [Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])];
  const principal = Buffer.alloc(11);
  principal[0] = 0x73;
  principal.writeUInt16LE(13, 3);
  partes.push(bloque(principal));
  for (const p of paginas) {
    const nombre = Buffer.from(p.nombre, 'latin1');
    const h = Buffer.alloc(30 + nombre.length);
    h[0] = 0x74;
    h.writeUInt16LE(0x8000, 1);
    h.writeUInt16LE(32 + nombre.length, 3);
    h.writeUInt32LE(p.datos.length, 5);
    h.writeUInt32LE(p.datos.length, 9);
    h[13] = 2; // Windows
    h.writeUInt32LE(crc32(p.datos), 14);
    h.writeUInt32LE(0x5a210000, 18); // fecha
    h[22] = 20; // versión para descomprimir
    h[23] = 0x30; // sin compresión
    h.writeUInt16LE(nombre.length, 24);
    h.writeUInt32LE(0x20, 26);
    nombre.copy(h, 30);
    partes.push(bloque(h), p.datos);
  }
  const fin = Buffer.alloc(5);
  fin[0] = 0x7b;
  fin.writeUInt16LE(0x4000, 1);
  fin.writeUInt16LE(7, 3);
  partes.push(bloque(fin));
  return Buffer.concat(partes);
}

/** RAR 5 sin compresión. */
export function rar5(paginas) {
  const vint = (n) => {
    const salida = [];
    do {
      salida.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0));
      n = Math.floor(n / 128);
    } while (n > 0);
    return Buffer.from(salida);
  };
  const bloque = (cuerpo) => {
    const conLargo = Buffer.concat([vint(cuerpo.length), cuerpo]);
    return Buffer.concat([Buffer.from(new Uint32Array([crc32(conLargo)]).buffer), conLargo]);
  };
  const partes = [Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])];
  partes.push(bloque(Buffer.concat([vint(1), vint(0), vint(0)])));
  for (const p of paginas) {
    const nombre = Buffer.from(p.nombre, 'utf8');
    const crc = Buffer.from(new Uint32Array([crc32(p.datos)]).buffer);
    const cuerpo = Buffer.concat([vint(2), vint(2), vint(p.datos.length), vint(4), vint(p.datos.length), vint(0x20), crc, vint(0), vint(0), vint(nombre.length), nombre]);
    partes.push(bloque(cuerpo), p.datos);
  }
  partes.push(bloque(Buffer.concat([vint(5), vint(0), vint(0)])));
  return Buffer.concat(partes);
}

// ---------- PDF ----------

const RELLENO = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const md5 = (...partes) => crypto.createHash('md5').update(Buffer.concat(partes)).digest();
function rc4(clave, datos) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + clave[i % clave.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const salida = Buffer.alloc(datos.length);
  for (let n = 0, i = 0, j = 0; n < datos.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    salida[n] = datos[n] ^ s[(s[i] + s[j]) & 255];
  }
  return salida;
}

/**
 * Un PDF de texto con la tipografía Helvetica sin incrustar (hace que pdf.js pida sus tipografías estándar).
 * proteccion: 'contrasena' | 'drm' | 'soloPermisos' (se abre sin pedir nada, pero «no copiar» e «no imprimir»).
 */
export function pdf({ paginas = 10, anchas = [], indice = [], proteccion = null } = {}) {
  const objetos = []; // [número, texto o { dict, datos }]
  const paginasPrimera = 5;
  const idPagina = (n) => paginasPrimera + n * 2;
  const idContenido = (n) => paginasPrimera + n * 2 + 1;
  const primerMarcador = paginasPrimera + paginas * 2;
  const idCifrado = primerMarcador + indice.length;
  const idArchivo = Buffer.from('00112233445566778899aabbccddeeff', 'hex');

  let claveArchivo = null;
  let cifrado = null;
  if (proteccion === 'contrasena') cifrado = `<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -44 >>`;
  if (proteccion === 'drm') cifrado = '<< /Filter /EBX_HANDLER /V 4 /Length 128 >>';
  if (proteccion === 'soloPermisos') {
    const dueno = rc4(md5(RELLENO).subarray(0, 5), RELLENO); // la contraseña del dueño es vacía: da igual, nadie la pide
    const permisos = Buffer.alloc(4);
    permisos.writeInt32LE(-44);
    claveArchivo = md5(RELLENO, dueno, permisos, idArchivo).subarray(0, 5);
    cifrado = `<< /Filter /Standard /V 1 /R 2 /O <${dueno.toString('hex')}> /U <${rc4(claveArchivo, RELLENO).toString('hex')}> /P -44 >>`;
  }
  const cifrar = (numero, datos) => {
    if (!claveArchivo) return datos;
    const sufijo = Buffer.from([numero & 255, (numero >> 8) & 255, (numero >> 16) & 255, 0, 0]);
    return rc4(md5(claveArchivo, sufijo).subarray(0, 10), datos);
  };

  objetos.push([1, `<< /Type /Catalog /Pages 2 0 R${indice.length ? ' /Outlines 3 0 R' : ''} >>`]);
  objetos.push([2, `<< /Type /Pages /Count ${paginas} /Kids [${Array.from({ length: paginas }, (_, n) => `${idPagina(n)} 0 R`).join(' ')}] >>`]);
  if (indice.length) objetos.push([3, `<< /Type /Outlines /Count ${indice.length} /First ${primerMarcador} 0 R /Last ${primerMarcador + indice.length - 1} 0 R >>`]);
  objetos.push([4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']);
  for (let n = 0; n < paginas; n++) {
    const caja = anchas.includes(n) ? '0 0 842 595' : '0 0 595 842';
    objetos.push([idPagina(n), `<< /Type /Page /Parent 2 0 R /MediaBox [${caja}] /Contents ${idContenido(n)} 0 R /Resources << /Font << /F1 4 0 R >> >> >>`]);
    const contenido = Buffer.from(`0.2 0.4 0.3 rg 40 40 200 12 re f BT /F1 48 Tf 0 0 0 rg 72 400 Td (Pagina ${n + 1}) Tj ET`, 'latin1');
    objetos.push([idContenido(n), { dict: `<< /Length ${contenido.length} >>`, datos: cifrar(idContenido(n), contenido) }]);
  }
  indice.forEach((e, k) => {
    const numero = primerMarcador + k;
    const enlaces = `${k > 0 ? ` /Prev ${numero - 1} 0 R` : ''}${k < indice.length - 1 ? ` /Next ${numero + 1} 0 R` : ''}`;
    // Los títulos en hexadecimal no llevan caracteres raros; en estas pruebas el índice no va con PDF cifrados.
    objetos.push([numero, `<< /Title (${e.titulo}) /Parent 3 0 R${enlaces} /Dest [${idPagina(e.pagina)} 0 R /Fit] >>`]);
  });
  if (cifrado) objetos.push([idCifrado, cifrado]);

  const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let largo = partes[0].length;
  const lugares = new Map();
  const escribir = (b) => {
    partes.push(b);
    largo += b.length;
  };
  for (const [numero, contenido] of objetos) {
    lugares.set(numero, largo);
    if (typeof contenido === 'string') escribir(Buffer.from(`${numero} 0 obj\n${contenido}\nendobj\n`, 'latin1'));
    else {
      escribir(Buffer.from(`${numero} 0 obj\n${contenido.dict}\nstream\n`, 'latin1'));
      escribir(contenido.datos);
      escribir(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    }
  }
  const tamano = Math.max(...lugares.keys()) + 1;
  const inicioTabla = largo;
  let tabla = `xref\n0 ${tamano}\n0000000000 65535 f \n`;
  for (let n = 1; n < tamano; n++) tabla += lugares.has(n) ? `${String(lugares.get(n)).padStart(10, '0')} 00000 n \n` : '0000000000 00000 f \n';
  const extraTrailer = cifrado ? ` /Encrypt ${idCifrado} 0 R /ID [<${idArchivo.toString('hex')}> <${idArchivo.toString('hex')}>]` : '';
  escribir(Buffer.from(`${tabla}trailer\n<< /Size ${tamano} /Root 1 0 R${extraTrailer} >>\nstartxref\n${inicioTabla}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}
