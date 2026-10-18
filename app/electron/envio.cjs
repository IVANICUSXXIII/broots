// Envío de libros al Kindle por mail (Gmail), como lo hacía Calibre.
//
// - Toma de Calibre los datos que NO son secretos (servidor, remitente, dirección del Kindle).
// - La contraseña de aplicación de Gmail la escribe el usuario en Broots y se guarda cifrada por
//   Windows (safeStorage/DPAPI): no se puede leer desde otra cuenta ni desde otra PC, y nunca se
//   devuelve a la pantalla.
// - El historial de envíos se guarda en <biblioteca>/.broots/envios.json.
const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');
const nodemailer = require('nodemailer');
const { t } = require('./idioma.cjs');

// Formatos que Amazon acepta por mail, en orden de preferencia (MOBI/AZW/AZW3 ya no se aceptan).
const FORMATOS_ACEPTADOS = ['EPUB', 'PDF', 'DOCX', 'DOC', 'RTF', 'TXT', 'HTML', 'HTM'];
const LIMITE_BYTES = 50 * 1024 * 1024;

/** Lee de Calibre la configuración de mail, sin la contraseña. */
function configDeCalibre() {
  try {
    const crudo = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'calibre', 'smtp.py.json'), 'utf8'));
    return {
      servidor: crudo.relay_host || '',
      puerto: Number(crudo.relay_port) || 587,
      cifrado: crudo.encryption || 'TLS',
      usuario: crudo.relay_username || '',
      remitente: crudo.from_ || crudo.relay_username || '',
      destino: Object.keys(crudo.accounts || {}).find((mail) => /@(free\.)?kindle\.com$/i.test(mail)) || '',
    };
  } catch {
    return null;
  }
}

/** Configuración efectiva: lo guardado en Broots, completado con lo de Calibre. Nunca incluye la contraseña. */
function estado(config) {
  const calibre = configDeCalibre() ?? {};
  const propio = config.envio ?? {};
  const efectivo = {
    servidor: propio.servidor ?? calibre.servidor ?? 'smtp.gmail.com',
    puerto: propio.puerto ?? calibre.puerto ?? 587,
    cifrado: propio.cifrado ?? calibre.cifrado ?? 'TLS',
    usuario: propio.usuario ?? calibre.usuario ?? '',
    remitente: propio.remitente ?? calibre.remitente ?? '',
    destino: propio.destino ?? calibre.destino ?? '',
  };
  return {
    ...efectivo,
    desdeCalibre: Boolean(calibre.servidor) && !config.envio?.usuario,
    tieneClave: Boolean(propio.claveCifrada),
    cifradoDisponible: safeStorage.isEncryptionAvailable(),
  };
}

/** Devuelve la configuración nueva a guardar. Si viene `clave`, se cifra; si viene vacía, se conserva la anterior. */
function actualizar(config, cambios) {
  const actual = estado(config);
  const envio = { ...(config.envio ?? {}) };
  for (const campo of ['servidor', 'puerto', 'cifrado', 'usuario', 'remitente', 'destino']) {
    envio[campo] = cambios[campo] ?? actual[campo];
  }
  envio.puerto = Number(envio.puerto) || 587;
  if (cambios.clave) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error(t('envio.sinCifrado'));
    // Gmail muestra la contraseña de aplicación en grupos de 4 letras: se quitan los espacios.
    envio.claveCifrada = safeStorage.encryptString(cambios.clave.replace(/\s+/g, '')).toString('base64');
  }
  if (cambios.borrarClave) delete envio.claveCifrada;
  return { ...config, envio };
}

function transporte(config) {
  const e = estado(config);
  if (!config.envio?.claveCifrada) throw new Error(t('envio.sinClave'));
  const clave = safeStorage.decryptString(Buffer.from(config.envio.claveCifrada, 'base64'));
  return nodemailer.createTransport({
    host: e.servidor,
    port: e.puerto,
    secure: e.puerto === 465 || e.cifrado === 'SSL',
    requireTLS: e.cifrado === 'TLS',
    auth: { user: e.usuario, pass: clave },
    connectionTimeout: 20000,
  });
}

/** Explica los errores típicos en el idioma de Broots. */
function mensajeDeError(error) {
  const texto = String(error?.message ?? error);
  if (/Invalid login|Username and Password not accepted|535/i.test(texto)) {
    return t('envio.rechazo');
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ESOCKET|getaddrinfo/i.test(texto)) {
    return t('envio.sinConexion');
  }
  return texto;
}

async function probar(config) {
  try {
    await transporte(config).verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }
}

/** Elige el archivo a enviar de un libro (EPUB primero). Devuelve { formato, ruta } o null. */
function elegirArchivo(formatos) {
  for (const formato of FORMATOS_ACEPTADOS) {
    if (formatos[formato] && fs.existsSync(formatos[formato])) return { formato, ruta: formatos[formato] };
  }
  return null;
}

// ---------- Historial ----------

function rutaHistorial(libraryPath) {
  return path.join(libraryPath, '.broots', 'envios.json');
}

function leerHistorial(libraryPath) {
  try {
    return JSON.parse(fs.readFileSync(rutaHistorial(libraryPath), 'utf8'));
  } catch {
    return {};
  }
}

function anotarEnvio(libraryPath, uuid, registro) {
  const historial = leerHistorial(libraryPath);
  historial[uuid] = [...(historial[uuid] ?? []), registro].slice(-10);
  const destino = rutaHistorial(libraryPath);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(`${destino}.tmp`, JSON.stringify(historial, null, 1));
  fs.renameSync(`${destino}.tmp`, destino);
  return historial;
}

/**
 * Envía un libro al Kindle. `libro` = { uuid, title, authors }, `formatos` = { EPUB: ruta, ... }.
 * `otroDestino`: la dirección del Kindle de alguien de la familia (si no, va al Kindle propio).
 */
async function enviar(config, libraryPath, libro, formatos, otroDestino = null) {
  const archivo = elegirArchivo(formatos);
  if (!archivo) {
    return { ok: false, mensaje: t('envio.formatoViejo') };
  }
  const { size } = fs.statSync(archivo.ruta);
  if (size > LIMITE_BYTES) return { ok: false, mensaje: t('envio.muyGrande') };
  const e = estado(config);
  const destino = otroDestino || e.destino;
  if (!destino) return { ok: false, mensaje: t('envio.sinDestino') };
  try {
    await transporte(config).sendMail({
      from: e.remitente || e.usuario,
      to: destino,
      subject: libro.title,
      text: `${libro.title} — ${libro.authors.join(', ')}\n${t('envio.cuerpo')}`,
      attachments: [{ filename: path.basename(archivo.ruta), path: archivo.ruta }],
    });
    const registro = { fecha: new Date().toISOString(), formato: archivo.formato, destino };
    const historial = anotarEnvio(libraryPath, libro.uuid, registro);
    return { ok: true, registro, historial };
  } catch (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }
}

module.exports = { estado, actualizar, probar, enviar, elegirArchivo, leerHistorial, FORMATOS_ACEPTADOS };
