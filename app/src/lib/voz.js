// 1.13: leer en voz alta. Lo que no depende de la pantalla: en qué pedazos se parte un párrafo, las velocidades y el
// audio para el reproductor. Va sin dependencias: lo prueba también pruebas/escenarios desde Node.

export const VELOCIDADES = [0.75, 1, 1.25, 1.5, 2];

// Sin internet se pide de a pedazos cortos: el primero suena enseguida y los demás se preparan mientras tanto. Con
// Gemini, al revés: el cupo es de pocos pedidos por minuto, así que cada pedido lleva varios párrafos.
export const LARGO_LOCAL = 240;
export const LARGO_GEMINI = { minimo: 700, maximo: 1500 };

/**
 * Parte un texto en pedazos de hasta `maximo` letras sin cortar oraciones (salvo que una sola sea más larga: entonces
 * por comas y, si no alcanza, por espacios). Devuelve [{ desde, hasta }], posiciones en el texto; los espacios del
 * medio quedan dentro del pedazo anterior, así entre todos cubren el texto entero.
 */
export function pedazosDe(texto, maximo = LARGO_LOCAL) {
  const largo = texto.length;
  if (!largo) return [];
  // Fin de oración: . ? ! … (y lo que cierra: comillas, paréntesis, rayas) seguido de espacio.
  const cortes = [];
  const fin = /[.?!…]+["'»”’)\]—]*\s+/g;
  for (let m = fin.exec(texto); m; m = fin.exec(texto)) cortes.push(m.index + m[0].length);
  cortes.push(largo);
  const oraciones = [];
  let desde = 0;
  for (const hasta of cortes) {
    if (hasta > desde) oraciones.push({ desde, hasta });
    desde = hasta;
  }
  const pedazos = [];
  const partirLarga = ({ desde: d, hasta: h }) => {
    while (h - d > maximo) {
      const tramo = texto.slice(d, d + maximo);
      const coma = Math.max(tramo.lastIndexOf(', '), tramo.lastIndexOf('; '), tramo.lastIndexOf(': '));
      const espacio = tramo.lastIndexOf(' ');
      const corte = coma > maximo / 3 ? coma + 2 : espacio > maximo / 3 ? espacio + 1 : maximo;
      pedazos.push({ desde: d, hasta: d + corte });
      d += corte;
    }
    if (h > d) pedazos.push({ desde: d, hasta: h });
  };
  for (const o of oracionesDe(texto)) {
    const ultimo = pedazos.at(-1);
    if (o.hasta - o.desde > maximo) partirLarga(o);
    else if (ultimo && o.hasta - ultimo.desde <= maximo) ultimo.hasta = o.hasta;
    else pedazos.push({ ...o });
  }
  return pedazos;
}

/** Las oraciones de un texto: [{ desde, hasta }], con el espacio que las sigue (entre todas cubren el texto entero). */
export function oracionesDe(texto) {
  // Fin de oración: . ? ! … (y lo que cierra: comillas, paréntesis, rayas) seguido de espacio.
  const cortes = [];
  const fin = /[.?!…]+["'»”’)\]—]*\s+/g;
  for (let m = fin.exec(texto); m; m = fin.exec(texto)) cortes.push(m.index + m[0].length);
  cortes.push(texto.length);
  const oraciones = [];
  let desde = 0;
  for (const hasta of cortes) {
    if (hasta > desde) oraciones.push({ desde, hasta });
    desde = hasta;
  }
  return oraciones;
}

/** El pedazo que contiene una posición del texto (o el último, si la posición quedó afuera). */
export function pedazoEn(pedazos, lugar) {
  return pedazos.find((p) => lugar < p.hasta) ?? pedazos.at(-1) ?? null;
}

/** ¿Se lee este párrafo? Las notas al pie y lo que no tiene letras ni números, no. */
export const seLee = (texto) => /[\p{L}\p{N}]/u.test(texto ?? '');

/** Un WAV (PCM de 16 bits, mono) para el reproductor, con las muestras que da la voz (de -1 a 1). */
export function wavDe(muestras, tasa) {
  const datos = muestras.length * 2;
  const b = new DataView(new ArrayBuffer(44 + datos));
  const texto = (lugar, s) => [...s].forEach((c, i) => b.setUint8(lugar + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  b.setUint32(4, 36 + datos, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, tasa, true);
  b.setUint32(28, tasa * 2, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  texto(36, 'data');
  b.setUint32(40, datos, true);
  for (let i = 0; i < muestras.length; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, muestras[i])) * 32767, true);
  return b.buffer;
}

/** Dentro de un pedazo de audio que lleva varias partes de texto: por dónde va, según cuánto sonó (proporcional al largo). */
export function lugarSegunAvance(partes, avance) {
  const total = partes.reduce((s, p) => s + (p.hasta - p.desde), 0);
  let resto = Math.max(0, Math.min(1, avance)) * total;
  for (const p of partes) {
    const largo = p.hasta - p.desde;
    if (resto < largo || p === partes.at(-1)) return { parrafo: p.parrafo, lugar: p.desde + Math.min(largo - 1, Math.floor(resto)) };
    resto -= largo;
  }
  return null;
}
