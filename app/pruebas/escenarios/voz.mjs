// 1.13 «Escuchar»: leer en voz alta, sin bajar voces de verdad. Un servidor en esta PC hace de Hugging Face
// (BROOTS_VOCES) y sirve voces de juguete; BROOTS_VOZ_FALSA hace que el proceso de la voz «hable» con silencios que
// duran según el largo del texto. Lo que importa:
// - La voz se baja la primera vez que se pide, con su avance; una descarga adulterada se descarta; «Cancelar» corta.
// - Al bajarla se prepara como la necesita el motor: metadatos al final del .onnx y tokens.txt (y espeak-ng-data al lado).
// - Lee lo que se ve: un párrafo traducido, en el idioma de Broots; resalta el que suena y pasa de página sola.
// - Pausa (botón y «L»), velocidad que se recuerda, párrafo siguiente, Gemini, y al terminar el capítulo sigue en el próximo.
// - Si pasás de página a mano, sigue desde lo que ves.
// - Lo que encontró el usuario en la primera prueba (25/11): la voz se apagaba a los 3 minutos en plena lectura (acá se apaga
//   a los 0,7 s sin pedidos, y se tiene que volver a abrir sola sin un solo error); el pedazo que falla queda en rojizo;
//   al terminarse el cupo de Gemini el botón pasa a «Sin internet»; la velocidad cambia al instante, con un menú; la
//   barrita no tapa el texto.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { LARGO_LOCAL, lugarSegunAvance, oracionesDe, pedazosDe, wavDe } from '../../src/lib/voz.js';

const PUERTO = 47396;
const BASE = `http://127.0.0.1:${PUERTO}`;
const CARPETA = path.join(os.tmpdir(), 'broots-voz-prueba');
const huella = (datos) => crypto.createHash('sha256').update(datos).digest('hex');

// Una voz de juguete con la forma de las de Piper: el .onnx no se carga (la voz es falsa), pero se prepara igual.
const jsonDe = (voz, idioma) => ({
  audio: { sample_rate: 22050, quality: 'medium' },
  espeak: { voice: voz },
  language: { name_english: idioma },
  inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
  num_speakers: 1,
  phoneme_id_map: { _: [0], '^': [1], $: [2], ' ': [3], a: [14], e: [18] },
});
const TOKENS = '_ 0\n^ 1\n$ 2\n  3\na 14\ne 18\n';

const pedidos = [];
let servidor = null;

function levantarServidor(archivos) {
  const veces = {};
  servidor = http.createServer((pedido, respuesta) => {
    const nombre = pedido.url.slice(1);
    pedidos.push(nombre);
    const vez = (veces[nombre] = (veces[nombre] ?? 0) + 1);
    const datos = archivos[nombre];
    if (!datos) {
      respuesta.statusCode = 404;
      return respuesta.end();
    }
    // Español: la primera vez, adulterado. Después, bien y de a poco (para ver el avance).
    if (nombre === 'es.onnx' && vez === 1) return respuesta.end(crypto.randomBytes(datos.length));
    // Inglés: se cuelga a mitad de camino, para tocar «Cancelar».
    const hasta = nombre === 'en.onnx' ? datos.length >> 1 : datos.length;
    let lugar = 0;
    respuesta.setHeader('content-length', datos.length);
    const seguir = () => {
      if (respuesta.destroyed) return;
      if (lugar >= hasta) return hasta >= datos.length ? respuesta.end() : undefined;
      respuesta.write(datos.subarray(lugar, lugar + 32 * 1024));
      lugar += 32 * 1024;
      setTimeout(seguir, 40);
    };
    seguir();
  });
  servidor.listen(PUERTO, '127.0.0.1');
}

/** Los metadatos (campo 14) que se agregaron al final del .onnx. */
function metadatosDe(buffer, desde) {
  const salida = {};
  let i = desde;
  const varint = () => {
    let v = 0;
    let s = 0;
    for (;;) {
      const b = buffer[i++];
      v += (b & 127) * 2 ** s;
      s += 7;
      if (!(b & 128)) return v;
    }
  };
  while (i < buffer.length) {
    if (varint() !== (14 << 3 | 2)) return null;
    const fin = i + varint();
    const campos = {};
    while (i < fin) {
      const tag = varint();
      const largo = varint();
      campos[tag >> 3] = buffer.subarray(i, i + largo).toString();
      i += largo;
    }
    salida[campos[1]] = campos[2];
  }
  return salida;
}

export default {
  descripcion: 'Escuchar: leer en voz alta (bajar la voz, leer lo que se ve, pasar de página, pausa, Gemini)',
  necesita: { ingles: 1 },
  entorno: () => {
    fs.rmSync(CARPETA, { recursive: true, force: true });
    fs.mkdirSync(CARPETA, { recursive: true });
    const archivos = {};
    const manifiesto = {};
    for (const [idioma, voz, nombre, lengua] of [['es', 'es-419', 'Daniela', 'Spanish'], ['en', 'en-us', 'Kristin', 'English']]) {
      const json = Buffer.from(JSON.stringify(jsonDe(voz, lengua)));
      const onnx = crypto.randomBytes(700 * 1024);
      archivos[`${idioma}.json`] = json;
      archivos[`${idioma}.onnx`] = onnx;
      manifiesto[idioma] = {
        id: nombre.toLowerCase(), nombre, version: '1.0', ritmo: 0.7,
        onnx: { url: `${BASE}/${idioma}.onnx`, sha256: huella(onnx), bytes: onnx.length },
        json: { url: `${BASE}/${idioma}.json`, sha256: huella(json), bytes: json.length },
      };
    }
    fs.writeFileSync(path.join(CARPETA, 'onnx-es'), archivos['es.onnx']); // para comparar en verificar()
    const ruta = path.join(CARPETA, 'manifiesto.json');
    fs.writeFileSync(ruta, JSON.stringify(manifiesto));
    levantarServidor(archivos);
    return {
      BROOTS_VOCES: ruta, BROOTS_VOZ_FALSA: '1', BROOTS_VOZ_FALSA_MS: '6', BROOTS_VOZ_INACTIVO_MS: '700', BROOTS_VOZ_FALSA_CUPO: '2',
      BROOTS_VOZ_FALSA_FALLA: 'XFALLAX', BROOTS_TRADUCCION_FALSA: '1', BROOTS_VENTANA: '960x600',
    };
  },
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    if (!PRUEBA.libros.ingles.length) return comprobar('hay un EPUB en inglés en la biblioteca', false, 'no encontré ninguno');
    localStorage.removeItem('broots-voz-velocidad');
    localStorage.removeItem('broots-voz-motor');

    // ---------- Sin ventana ----------
    const antes = await window.lector.estadoVoz('es');
    comprobar('el español tiene voz sin internet, todavía sin bajar', antes.tiene && !antes.lista && antes.nombre === 'Daniela', JSON.stringify(antes));
    comprobar('el francés no tiene voz sin internet', !(await window.lector.estadoVoz('fr')).tiene);
    const sinBajar = await window.lector.decir({ idioma: 'es', texto: 'Hola.', velocidad: 1, motor: 'local' });
    comprobar('sin la voz bajada, pide bajarla', !sinBajar.ok && sinBajar.motivo === 'falta' && sinBajar.bajar > 700 * 1024, JSON.stringify(sinBajar));

    // ---------- El libro ----------
    document.querySelector(`[data-tarjeta="${PRUEBA.libros.ingles[0].id}"] button`).click();
    const panelLibro = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    boton(panelLibro, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    const lector = texto?.closest('.fixed');
    comprobar('el lector abre el libro', texto);
    if (!texto) return;
    const pie = () => lector.querySelector('footer').innerText;
    await hasta(() => !/de (~|…)/.test(pie()), 60000);
    const visibles = () => {
      const recorte = texto.parentElement.getBoundingClientRect();
      return [...texto.querySelectorAll('[data-p]')].filter((el) => [...el.getClientRects()].some((r) => r.right > recorte.left + 5 && r.left < recorte.right - 5 && r.top < recorte.bottom - 20));
    };
    for (let i = 0; i < 15 && visibles().filter((p) => p.textContent.length > 120).length < 2; i++) {
      tecla('ArrowRight');
      await esperar(700);
    }
    await hasta(() => visibles().length && visibles().every((p) => p.textContent.startsWith('ES·')), 20000);
    const pagina = () => Number(lector.querySelector('footer input')?.value);
    const barra = () => lector.querySelector('[data-barra-voz]');
    const fase = () => barra()?.dataset.barraVoz;
    const sonando = () => texto.querySelector('.voz-sonando');
    // Cada fase por la que pasa la barrita: mientras lee de corrido no tiene que aparecer ningún error.
    const fases = [];
    new MutationObserver(() => fases.push(fase())).observe(lector, { subtree: true, attributes: true, attributeFilter: ['data-barra-voz'], childList: true });

    // ---------- La primera vez: hay que bajar la voz (y llega adulterada) ----------
    lector.querySelector('[data-boton-voz]').click();
    await hasta(() => fase() === 'falta', 8000);
    comprobar('con la traducción prendida, pide la voz de español', /bajar la voz de Daniela/.test(barra()?.innerText ?? ''), barra()?.innerText);
    const cajaBarra = barra()?.getBoundingClientRect();
    comprobar('la barrita de la voz entra en la ventana a 960 px', cajaBarra && cajaBarra.left >= 0 && cajaBarra.right <= window.innerWidth, cajaBarra ? `${Math.round(cajaBarra.left)} a ${Math.round(cajaBarra.right)}` : '');
    barra().querySelector('[data-voz-bajar-si]').click();
    await hasta(() => fase() === 'falta' && /no coincide/.test(barra()?.innerText ?? ''), 15000);
    comprobar('una descarga adulterada se descarta y lo dice', /no coincide/.test(barra()?.innerText ?? ''), barra()?.innerText);
    barra().querySelector('[data-voz-bajar-si]').click();
    const avance = () => Number(/scaleX\(([\d.]+)\)/.exec(barra()?.querySelector('[data-voz-avance]')?.style.transform ?? '')?.[1] ?? 0);
    comprobar('muestra el avance', await hasta(() => avance() > 0 && avance() < 1, 10000), String(avance()));

    // ---------- Lee lo que se ve, resaltado, y pasa de página sola ----------
    comprobar('al terminar de bajar, empieza a leer', await hasta(() => fase() === 'sonando' && sonando(), 20000), fase());
    // El 1× es el ritmo que eligió el usuario (0,7 del de la voz).
    const muestra = await window.lector.decir({ idioma: 'es', texto: 'a'.repeat(100), velocidad: 1, motor: 'local' });
    // La voz falsa dura 6 ms por letra a 8000 muestras por segundo, dividido la velocidad con que se arma.
    comprobar('la voz sale al ritmo de 1× (0,7) y devuelve la velocidad pedida', muestra.ok && Math.abs(muestra.muestras.length - Math.round((100 * 6 * 8000) / 1000 / 0.7)) < 3 && muestra.velocidad === 1, JSON.stringify({ largo: muestra.muestras?.length, velocidad: muestra.velocidad }));
    comprobar('lee la traducción (lo que se ve)', sonando()?.textContent.startsWith('ES·'), sonando()?.textContent.slice(0, 40));
    comprobar('lo que suena está en pantalla', await hasta(() => visibles().includes(sonando()), 3000));
    const cajaTexto = texto.parentElement.getBoundingClientRect();
    const cajaFranja = barra()?.getBoundingClientRect();
    comprobar('la barrita no tapa el texto', cajaFranja && cajaFranja.top >= cajaTexto.bottom - 1, cajaFranja ? `texto hasta ${Math.round(cajaTexto.bottom)}, barrita desde ${Math.round(cajaFranja.top)}` : '');
    const paginaInicial = pagina();
    const pasoSola = await hasta(() => pagina() > paginaInicial, 40000);
    comprobar('pasa de página sola', pasoSola, `${paginaInicial} → ${pagina()}`);
    comprobar('y lo que suena sigue en pantalla', await hasta(() => sonando() && visibles().includes(sonando()), 3000));
    // Más páginas de corrido: la voz se apaga a los 0,7 s sin pedidos y se vuelve a abrir sola. Ni un error.
    const paginaAntes = pagina();
    await hasta(() => pagina() >= paginaAntes + 2, 40000);
    comprobar('lee de corrido aunque la voz se apague y se vuelva a abrir', pagina() >= paginaAntes + 2 && !fases.includes('error'), `${paginaAntes} → ${pagina()}; fases: ${[...new Set(fases)].join(', ')}`);

    // ---------- Pausa, «L», velocidad, párrafo siguiente ----------
    barra().querySelector('[data-voz-pausa]').click();
    await hasta(() => fase() === 'pausado', 3000);
    await esperar(600); // si el pedazo terminaba justo, la pausa queda al principio del siguiente
    const enPausa = pagina();
    const marcado = sonando();
    await esperar(2500);
    // La página puede moverse una (si llega una traducción, el lector se reacomoda desde el principio del párrafo), pero
    // la lectura no sigue: el mismo párrafo marcado y nada de pasar páginas de corrido.
    comprobar('en pausa no avanza', fase() === 'pausado' && Math.abs(pagina() - enPausa) <= 1 && sonando() === marcado, `${fase()}, ${enPausa} → ${pagina()}`);
    tecla('l');
    comprobar('la «L» la sigue', await hasta(() => fase() === 'sonando', 3000), fase());
    tecla('l');
    comprobar('y la vuelve a pausar', await hasta(() => fase() === 'pausado', 3000), fase());
    tecla('l');
    await hasta(() => fase() === 'sonando', 5000);
    barra().querySelector('[data-voz-velocidad]').click();
    const menu = await hasta(() => barra()?.querySelector('[data-voz-velocidades]'), 2000);
    comprobar('la velocidad abre un menú con las cinco', menu?.querySelectorAll('[data-velocidad]').length === 5, menu?.innerText);
    const cajaMenu = menu?.getBoundingClientRect();
    comprobar('el menú se abre hacia arriba y entra en la ventana', cajaMenu && cajaMenu.bottom <= barra().getBoundingClientRect().top + 2 && cajaMenu.top >= 0, cajaMenu ? `${Math.round(cajaMenu.top)} a ${Math.round(cajaMenu.bottom)}` : '');
    const marcaAntes = fases.length;
    menu?.querySelector('[data-velocidad="0.75"]').click();
    comprobar('elegís 0,75× directo', await hasta(() => /0,75×/.test(barra()?.querySelector('[data-voz-velocidad]')?.innerText ?? ''), 1000), barra()?.querySelector('[data-voz-velocidad]')?.innerText);
    await esperar(1500);
    comprobar('y cambia al instante, sin frenar la lectura', fase() === 'sonando' && !fases.slice(marcaAntes).includes('preparando'), fases.slice(marcaAntes).join(', '));
    for (const x of ['2', '1', '1.25']) {
      barra().querySelector('[data-voz-velocidad]').click();
      (await hasta(() => barra()?.querySelector(`[data-velocidad="${x}"]`), 2000))?.click();
    }
    await esperar(1200);
    comprobar('varios cambios seguidos no la traban', fase() === 'sonando' && /1,25×/.test(barra()?.querySelector('[data-voz-velocidad]')?.innerText ?? ''), `${fase()}, ${barra()?.querySelector('[data-voz-velocidad]')?.innerText}`);
    comprobar('y se recuerda', localStorage.getItem('broots-voz-velocidad') === '1.25');
    const antesDelSalto = sonando();
    barra().querySelector('[data-voz-siguiente]').click();
    comprobar('«Párrafo siguiente» salta', await hasta(() => sonando() && sonando() !== antesDelSalto && Number(sonando().dataset.p) > Number(antesDelSalto?.dataset.p ?? -1), 8000));

    // ---------- A mano: sigue desde lo que se ve ----------
    for (let i = 0; i < 3; i++) {
      tecla('ArrowRight');
      await esperar(500);
    }
    comprobar('si pasás de página a mano, sigue desde lo que ves', await hasta(() => sonando() && visibles().includes(sonando()), 8000), `página ${pagina()}`);

    // ---------- Gemini ----------
    barra().querySelector('[data-voz-motor="gemini"]').click();
    comprobar('con clave, se puede elegir la voz de Gemini', await hasta(() => barra()?.querySelector('[data-voz-motor="gemini"]')?.className.includes('bg-seleccion'), 3000));
    comprobar('y sigue leyendo', await hasta(() => fase() === 'sonando' && sonando(), 10000), fase());
    comprobar('se recuerda la voz elegida', localStorage.getItem('broots-voz-motor') === '"gemini"');
    // A los dos pedidos, Gemini dice que se terminó el cupo del día: sigue con la voz de la PC y el botón lo muestra.
    const pasoALocal = await hasta(() => barra()?.querySelector('[data-voz-motor="local"]')?.className.includes('bg-seleccion'), 30000);
    comprobar('sin cupo de Gemini, el botón pasa a «Sin internet»', pasoALocal);
    comprobar('lo avisa', /cupo/.test(lector.querySelector('[data-aviso-lector]')?.innerText ?? ''), lector.querySelector('[data-aviso-lector]')?.innerText);
    comprobar('y sigue leyendo con la voz de la PC', (await hasta(() => fase() === 'sonando', 10000)) && localStorage.getItem('broots-voz-motor') === '"local"', `${fase()}, ${localStorage.getItem('broots-voz-motor')}`);

    // ---------- Fin del capítulo: sigue en el próximo ----------
    // A la última página del capítulo (la que sigue ya es otro capítulo: el primer párrafo cambia de elemento).
    barra().querySelector('[data-voz-cerrar]').click();
    await hasta(() => !barra(), 3000);
    let primero = texto.querySelector('[data-p="0"]');
    for (let i = 0; i < 60; i++) {
      tecla('ArrowRight');
      await esperar(350);
      if (texto.querySelector('[data-p="0"]') !== primero) break;
    }
    await esperar(800);
    tecla('ArrowLeft');
    await esperar(1500);
    primero = texto.querySelector('[data-p="0"]');
    lector.querySelector('[data-boton-voz]').click();
    await hasta(() => fase() === 'sonando', 10000);
    comprobar('al terminar el capítulo, sigue en el próximo', await hasta(() => texto.querySelector('[data-p="0"]') !== primero && sonando(), 60000), `página ${pagina()}`);

    // ---------- Un pedazo que no se puede leer: se frena, lo dice y queda en rojizo ----------
    // Primero se para lo que suena: si no, la página pasa sola y cierra la barrita de subrayar.
    barra()?.querySelector('[data-voz-cerrar]')?.click();
    await hasta(() => !barra(), 3000);
    const roto = visibles().find((p) => p.textContent.length > 40 && p.textContent.startsWith('ES·'));
    roto.textContent = 'ES· Este párrafo XFALLAX no se puede leer en voz alta.';
    const r2 = document.createRange();
    r2.setStart(roto.firstChild, 4);
    r2.setEnd(roto.firstChild, 9);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r2);
    roto.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    (await hasta(() => lector.querySelector('[data-barra-subrayado] [data-accion="escuchar"]'), 5000))?.click();
    comprobar('si un pedazo no se puede leer, se frena y lo dice', (await hasta(() => fase() === 'error', 10000)) && /No pude leer/.test(barra()?.innerText ?? ''), barra()?.innerText);
    comprobar('y ese párrafo queda en rojizo', roto.classList.contains('voz-error') && !texto.querySelector('.voz-sonando'), roto.className);
    barra().querySelector('[data-voz-cerrar]').click();
    await hasta(() => !barra(), 3000);
    comprobar('al cerrar, se va la marca', !texto.querySelector('.voz-error'));

    // ---------- Original en inglés: otra voz (y «Cancelar» la bajada) ----------
    lector.querySelector('[data-tour="traducir"]')?.click();
    await hasta(() => !visibles().some((p) => p.textContent.startsWith('ES·')), 8000);
    // El libro sale de la biblioteca y no siempre está en el idioma que dice Calibre: el párrafo se escribe acá.
    const ingles = visibles().find((p) => p.textContent.length > 40);
    ingles.textContent = 'The dog was running through the park and she had a strange conversation with the neighbours that morning, but nobody knew what they were saying.';
    // «Escuchar desde acá», desde la barrita de subrayar.
    const rango = document.createRange();
    rango.setStart(ingles.firstChild, 4);
    rango.setEnd(ingles.firstChild, 7);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(rango);
    ingles.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const barrita = await hasta(() => lector.querySelector('[data-barra-subrayado]'), 5000);
    comprobar('la barrita de subrayar ofrece «Escuchar desde acá»', barrita?.querySelector('[data-accion="escuchar"]'));
    const cajaBarrita = barrita?.getBoundingClientRect();
    comprobar('y sigue entrando en la ventana', cajaBarrita && cajaBarrita.left >= 0 && cajaBarrita.right <= window.innerWidth, cajaBarrita ? `${Math.round(cajaBarrita.left)} a ${Math.round(cajaBarrita.right)}` : '');
    barrita?.querySelector('[data-accion="escuchar"]').click();
    await hasta(() => fase() === 'falta', 8000);
    comprobar('el original en inglés pide la voz de inglés', /bajar la voz de Kristin/.test(barra()?.innerText ?? ''), barra()?.innerText);
    barra().querySelector('[data-voz-bajar-si]').click();
    await hasta(() => fase() === 'bajando', 5000);
    await esperar(1200);
    barra().querySelector('[data-voz-bajar-cancelar]').click();
    comprobar('«Cancelar» corta la bajada y cierra la barrita', await hasta(() => !barra(), 5000));
    const ingles2 = await window.lector.estadoVoz('en');
    comprobar('la voz cancelada no quedó a medias', ingles2.tiene && !ingles2.lista, JSON.stringify(ingles2));

    // Al cerrar el libro, se calla (y no queda nada abierto).
    lector.querySelector('[data-boton-voz]').click();
    await hasta(() => barra(), 3000);
    tecla('Escape');
    await esperar(300);
    tecla('Escape');
    comprobar('Esc cierra el libro aunque esté sonando', await hasta(() => !document.body.contains(lector), 5000));
    await esperar(800);
  },

  // En Node, con Broots ya cerrado.
  async verificar({ DATOS: datos }) {
    servidor?.close();
    const resultados = [];
    const raiz = path.join(datos, 'voces');
    const hay = fs.existsSync(raiz) ? fs.readdirSync(raiz).sort() : [];
    resultados.push({ nombre: 'quedan solo la voz entera, los datos de espeak-ng y el registro', ok: hay.join() === 'es-daniela-1.0,espeak-ng-data,voz.log', detalle: hay.join(', ') });
    const registro = fs.existsSync(path.join(raiz, 'voz.log')) ? fs.readFileSync(path.join(raiz, 'voz.log'), 'utf8') : '';
    resultados.push({ nombre: 'el registro anota lo que no se pudo leer', ok: /no pude leer \(es\): falla simulada/.test(registro), detalle: registro.trim().split('\n').slice(-2).join(' | ') });
    const voz = path.join(raiz, 'es-daniela-1.0');
    const leer = (n) => (fs.existsSync(path.join(voz, n)) ? fs.readFileSync(path.join(voz, n)) : Buffer.alloc(0));
    resultados.push({ nombre: 'tokens.txt sale del .onnx.json', ok: leer('tokens.txt').toString() === TOKENS, detalle: JSON.stringify(leer('tokens.txt').toString()) });
    const original = fs.readFileSync(path.join(CARPETA, 'onnx-es'));
    const modelo = leer('modelo.onnx');
    const meta = modelo.subarray(0, original.length).equals(original) ? metadatosDe(modelo, original.length) : null;
    resultados.push({
      nombre: 'el .onnx es el original con los metadatos del motor al final',
      ok: meta?.model_type === 'vits' && meta.comment === 'piper' && meta.voice === 'es-419' && meta.sample_rate === '22050' && meta.has_espeak === '1',
      detalle: JSON.stringify(meta),
    });
    const ajustes = JSON.parse(leer('voz.json').toString() || '{}');
    resultados.push({ nombre: 'guarda los ajustes de la voz', ok: ajustes.ruido === 0.667 && ajustes.ruidoW === 0.8 && ajustes.largo === 1, detalle: JSON.stringify(ajustes) });
    resultados.push({ nombre: 'espeak-ng-data se copió al lado de las voces', ok: fs.existsSync(path.join(raiz, 'espeak-ng-data', 'phontab')) && fs.existsSync(path.join(raiz, 'espeak-ng-data', 'es_dict')) });
    const veces = (n) => pedidos.filter((x) => x === n).length;
    resultados.push({ nombre: 'el español se bajó dos veces (adulterado y bien), ni una más', ok: veces('es.onnx') === 2, detalle: String(veces('es.onnx')) });

    // Los pedazos.
    const texto = 'Esa tarde, Martina cerró el libro. —¿Vos también lo escuchaste? —le preguntó. Afuera llovía sobre las baldosas de la calle Defensa, y el reloj de la esquina marcaba las 18:45. Nadie contestó. Recién después, cuando el agua dejó de golpear los vidrios, entendió que el ruido venía del tercer piso y que no era la primera vez.';
    const pedazos = pedazosDe(texto);
    const cubre = pedazos[0].desde === 0 && pedazos.at(-1).hasta === texto.length && pedazos.every((p, i) => i === 0 || p.desde === pedazos[i - 1].hasta);
    resultados.push({ nombre: 'los pedazos cubren el texto entero, sin huecos', ok: cubre, detalle: JSON.stringify(pedazos) });
    resultados.push({ nombre: 'ningún pedazo pasa el largo', ok: pedazos.every((p) => p.hasta - p.desde <= LARGO_LOCAL) && pedazosDe('palabra '.repeat(100)).every((p) => p.hasta - p.desde <= LARGO_LOCAL) });
    resultados.push({ nombre: 'no corta oraciones', ok: pedazos.every((p) => /[.?!…]\s*$/.test(texto.slice(p.desde, p.hasta))), detalle: pedazos.map((p) => texto.slice(p.hasta - 8, p.hasta)).join(' | ') });
    resultados.push({ nombre: 'reconoce las oraciones (con rayas y signos de pregunta)', ok: oracionesDe(texto).length === 6, detalle: String(oracionesDe(texto).length) });
    const donde = lugarSegunAvance([{ parrafo: 3, desde: 0, hasta: 100 }, { parrafo: 4, desde: 0, hasta: 300 }], 0.5);
    resultados.push({ nombre: 'sabe por qué párrafo va según cuánto sonó', ok: donde.parrafo === 4 && donde.lugar === 100, detalle: JSON.stringify(donde) });
    const wav = Buffer.from(wavDe(new Float32Array([0, 0.5, -0.5, 1]), 22050));
    resultados.push({ nombre: 'arma un WAV válido', ok: wav.subarray(0, 4).toString() === 'RIFF' && wav.readUInt32LE(24) === 22050 && wav.length === 44 + 8 && wav.readInt16LE(46) === Math.trunc(0.5 * 32767) });

    fs.rmSync(CARPETA, { recursive: true, force: true });
    return resultados;
  },
};
