// Subrayados del Kindle: lectura de "My Clippings.txt", asignación a libros y guardado en Drive.
//
// El Kindle anota cada subrayado, nota y marcador en un único archivo de texto, con este formato
// (en el idioma del Kindle):
//
//   La psicología del dinero (Morgan Housel)
//   - Tu subrayado en la página 23 | posición 345-347 | Añadido el lunes, 3 de junio de 2024 22:10:05
//
//   La riqueza es lo que no ves.
//   ==========
//
// Los subrayados se guardan en <biblioteca>/.broots/subrayados.json: dentro de la carpeta de Drive
// (respaldo y acceso desde otra PC) pero fuera de la base de Calibre, que no se toca.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const NOMBRE_CLIPPINGS = 'My Clippings.txt';
const CARPETA_DATOS = '.broots';
const ARCHIVO = 'subrayados.json';

// ---------- Texto ----------

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Título: subtítulo (Edición x)" -> "titulo" (para comparar sin subtítulos ni aclaraciones). */
function tituloCorto(titulo) {
  return normalizar(String(titulo).split(/[:(\[]| - | — /)[0]);
}

const MESES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

/** Fecha del Kindle a ISO (español o inglés). Si no se entiende, null (se conserva el texto). */
function fechaIso(texto) {
  if (!texto) return null;
  const es = /(\d{1,2}) de ([a-záéíóú]+) de (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?/i.exec(texto);
  if (es) {
    const mes = MESES[normalizar(es[2])];
    if (mes != null) return new Date(+es[3], mes, +es[1], +es[4], +es[5], +(es[6] ?? 0)).toISOString();
  }
  const en = Date.parse(texto.replace(/^[a-z]+,\s*/i, ''));
  return Number.isNaN(en) ? null : new Date(en).toISOString();
}

// ---------- Lectura del archivo ----------

function tipoDe(meta) {
  if (/subrayado|resaltado|highlight|destaque|surlignement|markierung/i.test(meta)) return 'subrayado';
  if (/marcador|bookmark|signet|lesezeichen/i.test(meta)) return 'marcador';
  if (/\bnota\b|\bnote\b|notiz/i.test(meta)) return 'nota';
  return 'otro';
}

function rango(meta, palabras) {
  const m = new RegExp(`(?:${palabras})\\s*(\\d+)(?:\\s*-\\s*(\\d+))?`, 'i').exec(meta);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? m[1])];
}

/** Separa "Título (Autor)" usando el ÚLTIMO paréntesis (los títulos también pueden tener paréntesis). */
function tituloYAutor(linea) {
  const limpia = linea.replace(/^﻿/, '').trim();
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(limpia);
  return m ? { titulo: m[1].trim(), autor: m[2].trim() } : { titulo: limpia, autor: '' };
}

function idDe(...partes) {
  return crypto.createHash('sha1').update(partes.join('\u0000')).digest('hex').slice(0, 16);
}

/**
 * Lee el contenido de My Clippings.txt.
 * Devuelve [{ clave, titulo, autor, subrayados: [{ id, tipo, texto, nota, ubicacion, pagina, fecha, fechaTexto }] }]
 * - Une cada nota con el subrayado donde fue escrita.
 * - Si un subrayado se editó en el Kindle, quedan dos versiones: se conserva la más completa.
 * - Los marcadores (sin texto) se descartan.
 */
function leerClippings(contenido) {
  const porLibro = new Map();
  for (const bloque of contenido.replace(/\r/g, '').split(/^==========\s*$/m)) {
    const lineas = bloque.split('\n');
    while (lineas.length && !lineas[0].trim()) lineas.shift();
    if (lineas.length < 2) continue;
    const { titulo, autor } = tituloYAutor(lineas[0]);
    const meta = lineas[1];
    const tipo = tipoDe(meta);
    const texto = lineas.slice(2).join('\n').trim();
    if (tipo === 'marcador' || !texto) continue;

    const fechaTexto = (/\|\s*(?:añadido|agregado|added|adicionado|ajouté|hinzugefügt)[^|]*$/i.exec(meta)?.[0] ?? '')
      .replace(/^\|\s*(?:añadido el|agregado el|añadido|agregado|added on|adicionado em|ajouté le|hinzugefügt am)\s*/i, '')
      .trim();
    const clave = `${normalizar(titulo)}|${normalizar(autor)}`;
    if (!porLibro.has(clave)) porLibro.set(clave, { clave, titulo, autor, entradas: [] });
    porLibro.get(clave).entradas.push({
      tipo,
      texto,
      ubicacion: rango(meta, 'posición|posicion|location|loc\\.|posição|emplacement|position'),
      pagina: rango(meta, 'página|pagina|page|seite'),
      fechaTexto: fechaTexto || null,
      fecha: fechaIso(fechaTexto),
    });
  }

  return [...porLibro.values()].map(({ entradas, ...libro }) => {
    const subrayados = entradas.filter((e) => e.tipo !== 'nota');
    // Versiones repetidas de un mismo subrayado editado: gana la más larga.
    const finales = subrayados.filter(
      (s) =>
        !subrayados.some(
          (otro) =>
            otro !== s &&
            otro.texto.length > s.texto.length &&
            otro.texto.includes(s.texto) &&
            (!s.ubicacion || !otro.ubicacion || (otro.ubicacion[0] <= s.ubicacion[1] && s.ubicacion[0] <= otro.ubicacion[1])),
        ),
    );
    const sueltas = [];
    for (const nota of entradas.filter((e) => e.tipo === 'nota')) {
      const destino = nota.ubicacion && finales.find((s) => s.ubicacion && s.ubicacion[0] <= nota.ubicacion[0] && nota.ubicacion[0] <= s.ubicacion[1]);
      if (destino) destino.nota = destino.nota ? `${destino.nota}\n${nota.texto}` : nota.texto;
      else sueltas.push(nota);
    }
    const todos = [...finales, ...sueltas]
      .map((e) => ({ ...e, id: idDe(libro.clave, e.tipo, e.ubicacion?.join('-') ?? '', e.texto) }))
      .sort((a, b) => (a.ubicacion?.[0] ?? Infinity) - (b.ubicacion?.[0] ?? Infinity));
    return { ...libro, subrayados: todos };
  });
}

// ---------- Asignación a los libros de la biblioteca ----------

/** Busca el libro de la biblioteca que corresponde a un título/autor del Kindle. Devuelve uuid o null. */
function asignarLibro({ titulo, autor }, libros) {
  const t = normalizar(titulo);
  const corto = tituloCorto(titulo);
  const autorClip = new Set(normalizar(autor).split(' ').filter((p) => p.length > 2));
  let mejor = null;
  let empate = false;
  for (const libro of libros) {
    const lt = normalizar(libro.title);
    const lc = tituloCorto(libro.title);
    let puntaje = 0;
    if (lt === t) puntaje = 100;
    else if (lc && lc === corto) puntaje = 80;
    else if (Math.min(lt.length, t.length) >= 8 && (lt.includes(t) || t.includes(lt))) puntaje = 60;
    if (!puntaje) continue;
    const autorLibro = normalizar(libro.authors.join(' ')).split(' ');
    if (autorLibro.some((p) => autorClip.has(p))) puntaje += 15;
    if (!mejor || puntaje > mejor.puntaje) {
      mejor = { uuid: libro.uuid, puntaje };
      empate = false;
    } else if (puntaje === mejor.puntaje) {
      empate = true;
    }
  }
  return mejor && mejor.puntaje >= 75 && !empate ? mejor.uuid : null;
}

// ---------- Guardado en Drive ----------

function rutaDatos(libraryPath) {
  return path.join(libraryPath, CARPETA_DATOS, ARCHIVO);
}

// sinAsignar: libros del Kindle que no se reconocieron y esperan que el usuario elija.
// ignorados:  libros que el usuario marcó como "No está en mi biblioteca". Sus subrayados se guardan
//             igual, por si más adelante agrega el libro a Calibre (ahí se asignan solos).
function vacio() {
  return { version: 1, actualizado: null, libros: {}, sinAsignar: {}, ignorados: {}, asignaciones: {}, importaciones: [] };
}

function leerGuardados(libraryPath) {
  try {
    return { ...vacio(), ...JSON.parse(fs.readFileSync(rutaDatos(libraryPath), 'utf8')) };
  } catch {
    return vacio();
  }
}

/** Escritura segura: copia de respaldo del archivo anterior y reemplazo atómico. */
function guardar(libraryPath, datos) {
  const destino = rutaDatos(libraryPath);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (fs.existsSync(destino)) fs.copyFileSync(destino, `${destino}.bak`);
  const temporal = `${destino}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify({ ...datos, actualizado: new Date().toISOString() }, null, 1));
  fs.renameSync(temporal, destino);
}

function agregar(lista, nuevos) {
  const ids = new Set(lista.map((s) => s.id));
  const agregados = nuevos.filter((s) => !ids.has(s.id));
  lista.push(...agregados);
  lista.sort((a, b) => (a.ubicacion?.[0] ?? Infinity) - (b.ubicacion?.[0] ?? Infinity));
  return agregados.length;
}

/**
 * Importa un My Clippings.txt: asigna cada libro, suma solo lo nuevo y guarda.
 * Devuelve un resumen para mostrar en pantalla.
 */
/**
 * Intenta de nuevo reconocer los libros pendientes e ignorados: si el usuario agregó el libro a
 * Calibre, sus subrayados pasan a ese libro solos. Devuelve cuántos libros se reasignaron.
 */
function reconocerPendientes(datos, libros) {
  const porUuid = new Map(libros.map((l) => [l.uuid, l]));
  let reasignados = 0;
  for (const grupo of ['sinAsignar', 'ignorados']) {
    for (const [clave, pendiente] of Object.entries(datos[grupo])) {
      const uuid = asignarLibro(pendiente, libros);
      if (!uuid) continue;
      datos.libros[uuid] ??= { titulo: porUuid.get(uuid).title, subrayados: [] };
      agregar(datos.libros[uuid].subrayados, pendiente.subrayados);
      delete datos[grupo][clave];
      reasignados++;
    }
  }
  return reasignados;
}

function importar(libraryPath, rutaClippings, libros, origen) {
  const leidos = leerClippings(fs.readFileSync(rutaClippings, 'utf8'));
  const datos = leerGuardados(libraryPath);
  const porUuid = new Map(libros.map((l) => [l.uuid, l]));
  const reasignados = reconocerPendientes(datos, libros);
  let nuevos = 0;
  for (const libroKindle of leidos) {
    const uuid = datos.asignaciones[libroKindle.clave] ?? asignarLibro(libroKindle, libros);
    if (uuid && porUuid.has(uuid)) {
      datos.libros[uuid] ??= { titulo: porUuid.get(uuid).title, subrayados: [] };
      nuevos += agregar(datos.libros[uuid].subrayados, libroKindle.subrayados);
    } else {
      // Si el usuario ya dijo que no está en su biblioteca, se guarda en silencio entre los ignorados.
      const grupo = datos.ignorados[libroKindle.clave] ? 'ignorados' : 'sinAsignar';
      datos[grupo][libroKindle.clave] ??= { titulo: libroKindle.titulo, autor: libroKindle.autor, subrayados: [] };
      nuevos += agregar(datos[grupo][libroKindle.clave].subrayados, libroKindle.subrayados);
    }
  }
  datos.importaciones = [...datos.importaciones, { fecha: new Date().toISOString(), origen, nuevos }].slice(-20);
  guardar(libraryPath, datos);
  return { nuevos, reasignados, librosEnArchivo: leidos.length, datos };
}

/** Lectura al abrir Broots: si algún libro pendiente ya está en la biblioteca, se asigna y se guarda. */
function leerYReconocer(libraryPath, libros) {
  const datos = leerGuardados(libraryPath);
  if (reconocerPendientes(datos, libros) > 0) guardar(libraryPath, datos);
  return datos;
}

/** Mueve un libro del Kindle entre "pendientes" y "No está en mi biblioteca". */
function moverPendiente(libraryPath, clave, desde, hacia) {
  const datos = leerGuardados(libraryPath);
  if (!datos[desde][clave]) return datos;
  datos[hacia][clave] = datos[desde][clave];
  delete datos[desde][clave];
  guardar(libraryPath, datos);
  return datos;
}

/** Pasa los subrayados de un libro a otro (al resolver un duplicado) y actualiza las asignaciones. */
function moverLibro(libraryPath, deUuid, aUuid, tituloDestino) {
  const datos = leerGuardados(libraryPath);
  const origen = datos.libros[deUuid];
  if (!origen) return datos;
  datos.libros[aUuid] ??= { titulo: tituloDestino, subrayados: [] };
  agregar(datos.libros[aUuid].subrayados, origen.subrayados);
  delete datos.libros[deUuid];
  for (const [clave, uuid] of Object.entries(datos.asignaciones)) if (uuid === deUuid) datos.asignaciones[clave] = aUuid;
  guardar(libraryPath, datos);
  return datos;
}

const ignorar = (libraryPath, clave) => moverPendiente(libraryPath, clave, 'sinAsignar', 'ignorados');
const restaurar = (libraryPath, clave) => moverPendiente(libraryPath, clave, 'ignorados', 'sinAsignar');

/** Asigna a mano un libro del Kindle (sin asignar) a un libro de la biblioteca, y lo recuerda. */
function asignarManual(libraryPath, clave, uuid, libros) {
  const datos = leerGuardados(libraryPath);
  // El libro puede estar entre los pendientes o entre los marcados como 'no está en mi biblioteca'.
  const grupo = datos.sinAsignar[clave] ? 'sinAsignar' : 'ignorados';
  const pendiente = datos[grupo][clave];
  const libro = libros.find((l) => l.uuid === uuid);
  if (!pendiente || !libro) return datos;
  datos.asignaciones[clave] = uuid;
  datos.libros[uuid] ??= { titulo: libro.title, subrayados: [] };
  agregar(datos.libros[uuid].subrayados, pendiente.subrayados);
  delete datos[grupo][clave];
  guardar(libraryPath, datos);
  return datos;
}

// ---------- Encontrar el archivo en el Kindle ----------

/** Kindle que aparece como unidad (E:, F:...): lectura directa. */
function buscarEnUnidades() {
  for (let c = 'D'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const ruta = `${String.fromCharCode(c)}:\\documents\\${NOMBRE_CLIPPINGS}`;
    try {
      if (fs.existsSync(ruta)) return ruta;
    } catch {}
  }
  return null;
}

// Kindle que aparece como "dispositivo" (Paperwhite 2021 en adelante, protocolo MTP): Node no puede
// leerlo directamente, así que Windows lo copia a una carpeta temporal mediante PowerShell.
const SCRIPT_MTP = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject Shell.Application
$equipo = $shell.Namespace(17)
$kindle = $equipo.Items() | Where-Object { $_.Name -like '*Kindle*' } | Select-Object -First 1
if (-not $kindle) { 'SIN_KINDLE'; exit }
function Buscar($carpeta, $nombre, $profundidad) {
  foreach ($item in $carpeta.Items()) {
    if ($item.Name -eq $nombre) { return $item }
  }
  if ($profundidad -le 0) { return $null }
  foreach ($item in $carpeta.Items()) {
    if ($item.IsFolder) {
      $hallado = Buscar $item.GetFolder $nombre ($profundidad - 1)
      if ($hallado) { return $hallado }
    }
  }
  return $null
}
$documentos = Buscar $kindle.GetFolder 'documents' 2
if (-not $documentos) { 'SIN_DOCUMENTOS'; exit }
$archivo = Buscar $documentos.GetFolder '${NOMBRE_CLIPPINGS}' 0
if (-not $archivo) { 'SIN_CLIPPINGS'; exit }
$destino = $env:BROOTS_DESTINO
$copia = Join-Path $destino '${NOMBRE_CLIPPINGS}'
if (Test-Path $copia) { Remove-Item $copia -Force }
$shell.Namespace($destino).CopyHere($archivo, 4 + 16)
$anterior = -1
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 250
  if (Test-Path $copia) {
    $tamano = (Get-Item $copia).Length
    if ($tamano -gt 0 -and $tamano -eq $anterior) { "OK|$copia"; exit }
    $anterior = $tamano
  }
}
'SIN_COPIA'
`;

function copiarDesdeDispositivo(carpetaTemporal) {
  fs.mkdirSync(carpetaTemporal, { recursive: true });
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT_MTP],
      { env: { ...process.env, BROOTS_DESTINO: carpetaTemporal }, timeout: 30000, windowsHide: true },
      (error, salida) => {
        if (error) return resolve({ estado: 'error', mensaje: error.message });
        const texto = String(salida).trim().split(/\r?\n/).pop();
        if (texto.startsWith('OK|')) return resolve({ estado: 'ok', ruta: texto.slice(3) });
        resolve({ estado: texto || 'SIN_KINDLE' });
      },
    );
  });
}

/** Busca el Kindle conectado (unidad o dispositivo). Devuelve { ruta, via } o { estado } si no lo encuentra. */
async function buscarKindle(carpetaTemporal) {
  const unidad = buscarEnUnidades();
  if (unidad) return { ruta: unidad, via: 'unidad' };
  const dispositivo = await copiarDesdeDispositivo(carpetaTemporal);
  if (dispositivo.estado === 'ok') return { ruta: dispositivo.ruta, via: 'dispositivo' };
  return { estado: dispositivo.estado, mensaje: dispositivo.mensaje };
}

module.exports = {
  leerClippings, asignarLibro, leerGuardados, leerYReconocer, importar, asignarManual, ignorar, restaurar, moverLibro, buscarKindle, NOMBRE_CLIPPINGS,
};
