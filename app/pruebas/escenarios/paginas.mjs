// 1.11: PDF y cómics. Abrir desde el panel y con doble clic, una o dos páginas, manga, zoom, posición, «Mi lectura», la
// cruz, Esc, y los archivos que no se deben abrir (DRM, contraseña). Los libros se arman en libros-de-prueba.mjs y se suman
// a la COPIA de prueba con la herramienta de Calibre.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { strToU8 } from 'fflate';
import { paginasDeComic, pdf, rar4, rar5, zip, zipCifrado } from '../libros-de-prueba.mjs';

const require = createRequire(import.meta.url);
const CALIBREDB = ['C:\\Program Files\\Calibre2', 'C:\\Program Files (x86)\\Calibre2', path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Calibre2')]
  .map((c) => path.join(c, 'calibredb.exe'))
  .find((r) => fs.existsSync(r));

const FICHA_MANGA = `<?xml version="1.0"?><ComicInfo><Manga>YesAndRightToLeft</Manga><Pages><Page Image="0" Bookmark="Tapa"/><Page Image="3" Bookmark="Capítulo &amp; uno"/></Pages></ComicInfo>`;
const ids = {};

export default {
  descripcion: 'PDF, CBZ y CBR: abrir, una o dos páginas, manga, zoom, posición, Mi lectura, cruz, DRM y contraseña',
  necesita: { epub: 1 },
  entorno: { BROOTS_MINUTO_PRUEBA: '1000', BROOTS_VENTANA: '1440x900' },
  config: ({ BIBLIOTECA, libros }) => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'broots-paginas-'));
    const agregar = (clave, formato, datos, { titulo = clave, etiquetas } = {}) => {
      const r = spawnSync(CALIBREDB, ['add', '--with-library', BIBLIOTECA, '--empty', '--title', `Prueba ${titulo}`, ...(etiquetas ? ['--tags', etiquetas] : [])], { encoding: 'utf8' });
      const id = Number(/(\d+)\s*$/.exec(r.stdout.trim())?.[1]);
      if (!id) throw new Error(`calibredb no agregó «${titulo}»: ${r.stdout} ${r.stderr}`);
      const archivo = path.join(carpeta, `${clave}.${formato.toLowerCase()}`);
      fs.writeFileSync(archivo, datos);
      const f = spawnSync(CALIBREDB, ['add_format', '--with-library', BIBLIOTECA, String(id), archivo], { encoding: 'utf8' });
      if (f.status !== 0) throw new Error(`calibredb no agregó el archivo de «${titulo}»: ${f.stderr}`);
      ids[clave] = id;
    };
    const capitulos = [{ titulo: 'Primera parte', pagina: 2 }, { titulo: 'Segunda parte', pagina: 8 }];
    agregar('pdf', 'PDF', pdf({ paginas: 12, anchas: [5], indice: capitulos }));
    agregar('pdfPermisos', 'PDF', pdf({ paginas: 3, proteccion: 'soloPermisos' }));
    agregar('pdfContrasena', 'PDF', pdf({ paginas: 3, proteccion: 'contrasena' }));
    agregar('pdfDrm', 'PDF', pdf({ paginas: 3, proteccion: 'drm' }));
    agregar('pdfRoto', 'PDF', Buffer.from('esto no es un PDF, es una mentira con extensión'));
    agregar('cbz', 'CBZ', zip(paginasDeComic(12, { anchas: [4] }), { 'ComicInfo.xml': strToU8(FICHA_MANGA) }));
    agregar('cbzCarpetas', 'CBZ', zip(paginasDeComic(6, { carpeta: (n) => (n < 3 ? 'Tomo 1/' : 'Tomo 2/') })));
    agregar('cbr', 'CBR', rar4(paginasDeComic(5)), { etiquetas: 'Cómics.Manga' });
    agregar('cbr5', 'CBR', rar5(paginasDeComic(4)));
    agregar('cbrEsZip', 'CBR', zip(paginasDeComic(3)));
    agregar('cbzCifrado', 'CBZ', zipCifrado(paginasDeComic(3)));
    agregar('cbzVacio', 'CBZ', zip([]));
    // Un libro que ya tiene EPUB también tiene PDF.
    const archivo = path.join(carpeta, 'con-epub.pdf');
    fs.writeFileSync(archivo, pdf({ paginas: 6 }));
    spawnSync(CALIBREDB, ['add_format', '--with-library', BIBLIOTECA, String(libros.epub[0].id), archivo]);
    fs.rmSync(carpeta, { recursive: true, force: true });
    return {};
  },
  datos: () => ({ ids }),
  async prueba({ PRUEBA, hasta, comprobar, boton, escribir, tecla, esperar }) {
    const { ids } = PRUEBA;
    const raiz = () => document.querySelector('[data-lector-paginas]');
    const lista = (n) => document.querySelector(`[data-hoja="${n}"][data-lista="si"]`);
    const pliego = () => [...document.querySelectorAll('[data-pliego]')].at(-1)?.dataset.pliego;
    const orden = () => [...[...document.querySelectorAll('[data-pliego]')].at(-1).querySelectorAll('[data-hoja]')].map((h) => Number(h.dataset.hoja));
    const pie = () => raiz().querySelector('footer').innerText;
    const tarjeta = (id) => document.querySelector(`[data-tarjeta="${id}"] button`);
    let enElPanel = null;
    const abrirPanel = async (id) => {
      const abierto = document.querySelector('.fixed.top-11');
      if (!abierto || enElPanel !== id) {
        tarjeta(id).click(); // con el panel de ese mismo libro ya abierto, el clic lo cerraría
        await esperar(700);
      }
      enElPanel = id;
      return hasta(() => document.querySelector('.fixed.top-11'));
    };
    const dobleClic = (id) => {
      const el = tarjeta(id);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    };
    const cerrarCruz = async () => {
      await window.lector.pruebaCruz();
      await hasta(() => !raiz() && !document.querySelector('.texto-libro'), 5000);
      await esperar(500);
    };
    const pasar = async (key) => {
      tecla(key);
      await esperar(350);
    };
    const pellizco = (deltaY, x = 700, y = 400) =>
      raiz().querySelector('[data-marco-paginas]').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY, clientX: x, clientY: y }));
    const rueda = (deltaY) => raiz().querySelector('[data-marco-paginas]').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, clientX: 700, clientY: 400 }));
    const transformado = () => raiz().querySelector('[data-lienzo]').style.transform;
    const escala = () => Number(/scale\(([\d.]+)\)/.exec(transformado())?.[1] ?? 1);
    /** ¿El lienzo tiene algo dibujado, además del papel en blanco? */
    const tinta = (hoja) => {
      const lienzo = hoja.querySelector('canvas');
      const d = lienzo.getContext('2d').getImageData(0, 0, lienzo.width, lienzo.height).data;
      let oscuros = 0;
      for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 120 && d[i + 3] > 0) oscuros++;
      return oscuros;
    };
    const mensajeAlAbrir = async (id) => {
      boton(await abrirPanel(id), 'Leer').click();
      const aviso = await hasta(() => document.querySelector('[data-error-paginas]'), 15000);
      const texto = aviso?.innerText ?? '';
      const huboPagina = Boolean(document.querySelector('[data-hoja]'));
      tecla('Escape');
      await hasta(() => !raiz(), 4000);
      await esperar(500);
      return { texto, huboPagina };
    };

    // ---------- PDF: desde el panel ----------
    let panel = await abrirPanel(ids.pdf);
    comprobar('un PDF sin EPUB ofrece «Leer»', boton(panel, 'Leer'));
    comprobar('no ofrece un segundo botón si solo hay un formato', !panel.querySelector('[data-leer-formato]'));
    boton(panel, 'Leer').click();
    let hoja = await hasta(() => lista(0), 30000);
    comprobar('el PDF se abre en el lector de páginas', raiz()?.dataset.lectorPaginas === 'pdf' && hoja);
    if (!hoja) return;
    comprobar('la página tiene texto dibujado (con las tipografías de pdf.js)', tinta(hoja) > 200, tinta(hoja));
    comprobar('dice cuántas páginas tiene', /de 12/.test(pie()), pie());
    comprobar('no ofrece traducir ni subrayar: quedan para otra etapa', !raiz().querySelector('[data-tour="traducir"], [data-boton-subrayados]'));
    comprobar('en una ventana ancha, la tapa va sola', pliego() === '0' && raiz().dataset.dos === 'si', pliego());

    // ---------- De a dos, y la página ancha sola ----------
    await pasar('ArrowRight');
    comprobar('después de la tapa, de a dos páginas', pliego() === '1-2', pliego());
    comprobar('el pie dice las dos', /2/.test(raiz().querySelector('footer input').value) && /–3/.test(pie()), pie());
    await hasta(() => lista(1) && lista(2), 8000);
    comprobar('las dos se dibujan', lista(1) && lista(2));
    const anchoUna = lista(1).getBoundingClientRect().width;
    await pasar('PageDown');
    comprobar('Av Pág también avanza', pliego() === '3-4', pliego());
    await pasar(' ');
    comprobar('una página más ancha que alta va sola', pliego() === '5', pliego());
    const ancha = await hasta(() => lista(5), 8000);
    comprobar('y se ve apaisada', ancha && ancha.getBoundingClientRect().width > ancha.getBoundingClientRect().height, `${ancha?.getBoundingClientRect().width}`);
    await pasar('PageUp');
    comprobar('Re Pág vuelve', pliego() === '3-4', pliego());

    // ---------- Una por vez ----------
    raiz().querySelector('[data-boton-doble]').click();
    await esperar(400);
    comprobar('el botón pasa a una página', orden().length === 1 && raiz().dataset.dos === 'no', pliego());
    const unaSola = await hasta(() => lista(3), 8000);
    comprobar('sola, se ve igual de alta', unaSola && Math.abs(unaSola.getBoundingClientRect().width - anchoUna) < 3, `${unaSola?.getBoundingClientRect().width} y ${anchoUna}`);
    raiz().querySelector('[data-boton-doble]').click();
    await esperar(400);
    comprobar('y vuelve a dos', raiz().dataset.dos === 'si' && orden().length === 2, pliego());

    // ---------- Zoom: pellizco, recorrer, Ctrl 0 ----------
    const paginaAntes = pliego();
    await hasta(() => lista(3), 8000);
    const pixelesAntes = lista(3).querySelector('canvas').width;
    pellizco(-30);
    pellizco(-30);
    pellizco(-30);
    await esperar(100);
    comprobar('pellizcar acerca', escala() > 1.5, transformado());
    comprobar('se ve cuánto mientras se pellizca', raiz().querySelector('[data-zoom-al-pellizcar]')?.innerText.includes('%'), raiz().querySelector('[data-zoom-al-pellizcar]')?.innerText);
    comprobar('el pellizco no pasa de página', pliego() === paginaAntes, pliego());
    await hasta(() => lista(3)?.querySelector('canvas').width > pixelesAntes * 1.4, 8000);
    comprobar('quieto, se vuelve a dibujar con más detalle', lista(3)?.querySelector('canvas').width > pixelesAntes * 1.4, `${pixelesAntes} -> ${lista(3)?.querySelector('canvas').width}`);
    const antesDeRecorrer = transformado();
    rueda(120);
    await esperar(50);
    comprobar('acercada, la rueda recorre la página', transformado() !== antesDeRecorrer && pliego() === paginaAntes, transformado());
    const raton = (tipo, el, x, y) => el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, button: 0, clientX: x, clientY: y }));
    const capa = raiz().querySelector('[data-lienzo]').parentElement;
    const antesDeArrastrar = transformado();
    raton('mousedown', capa, 800, 500);
    raton('mousemove', window, 760, 440);
    raton('mouseup', window, 760, 440);
    await esperar(450);
    comprobar('arrastrando se desplaza y no pasa de página', transformado() !== antesDeArrastrar && pliego() === paginaAntes, transformado());
    raton('mousedown', capa, 700, 400);
    raton('mouseup', window, 700, 400);
    await esperar(450);
    comprobar('acercada, un clic suelto no pasa de página', pliego() === paginaAntes, pliego());
    const conCtrl = new KeyboardEvent('keydown', { key: '0', ctrlKey: true });
    window.dispatchEvent(conCtrl);
    await esperar(300);
    comprobar('Ctrl 0 vuelve a la página entera', escala() === 1, transformado());
    pellizco(-30);
    await esperar(50);
    raton('mousedown', capa, 700, 400);
    raton('mouseup', window, 700, 400);
    raton('mousedown', capa, 700, 400);
    raton('mouseup', window, 700, 400);
    await esperar(400);
    comprobar('doble clic también aleja', escala() === 1, transformado());

    // ---------- Clic en los costados de la página ----------
    raton('mousedown', capa, 1200, 400);
    raton('mouseup', window, 1200, 400);
    await esperar(650);
    comprobar('un clic a la derecha avanza', pliego() === '5', pliego());
    raton('mousedown', capa, 200, 400);
    raton('mouseup', window, 200, 400);
    await esperar(650);
    comprobar('un clic a la izquierda vuelve', pliego() === '3-4', pliego());
    raiz().querySelector('[data-costado="derecha"]').click();
    await esperar(350);
    comprobar('la flecha del costado avanza', pliego() === '5', pliego());

    // ---------- Índice e «Ir a» ----------
    const botonIndice = await hasta(() => {
      const b = raiz().querySelector('[data-boton-indice]');
      return b && !b.disabled && b;
    }, 8000);
    comprobar('el índice del PDF está disponible', botonIndice);
    botonIndice.click();
    const indice = await hasta(() => raiz().querySelector('[data-indice-paginas]'), 3000);
    comprobar('lista sus capítulos', /Primera parte/.test(indice?.innerText) && /Segunda parte/.test(indice?.innerText), indice?.innerText);
    tecla('Escape');
    await hasta(() => !raiz().querySelector('[data-indice-paginas]'), 3000);
    comprobar('Esc cierra el índice y no el libro', !raiz().querySelector('[data-indice-paginas]') && raiz());
    botonIndice.click();
    await hasta(() => raiz().querySelector('[data-indice-paginas]'), 3000);
    boton(raiz().querySelector('[data-indice-paginas]'), 'Segunda parte').click();
    await esperar(500);
    comprobar('ir a un capítulo lleva a su página', orden().includes(8), pliego());
    comprobar('el título del capítulo aparece arriba', /Segunda parte/.test(raiz().querySelector('header').innerText), raiz().querySelector('header').innerText);
    const entrada = raiz().querySelector('footer input');
    entrada.focus();
    escribir(entrada, '11');
    await esperar(50);
    entrada.form.requestSubmit();
    entrada.blur();
    await esperar(400);
    comprobar('«Ir a» salta a esa página', orden().includes(10), pliego());

    // ---------- Sesión con capítulos ----------
    raiz().querySelector('[data-sesion]').click();
    await esperar(300);
    comprobar('con índice, se puede leer hasta el fin del capítulo', boton(raiz(), 'Hasta el fin del capítulo') || /capítulo/i.test(raiz().querySelector('[data-panel-sesion]')?.innerText), raiz().querySelector('[data-panel-sesion]')?.innerText);
    tecla('Escape');
    await esperar(300);
    comprobar('Esc cierra el panel de la sesión y no el libro', !raiz().querySelector('[data-panel-sesion]') && raiz());

    // ---------- «Aa»: solo el tema ----------
    raiz().querySelector('[data-boton-medida]').click();
    const medida = await hasta(() => raiz().querySelector('[data-panel-medida]'), 3000);
    comprobar('el panel «Aa» explica que la letra no cambia', medida?.querySelector('[data-solo-tema]'));
    comprobar('y no ofrece letra ni fuente', !medida?.querySelector('[data-letra-mas], [data-fuente]'));
    medida.querySelector('[data-tema="oscuro"]').click();
    await esperar(200);
    comprobar('el tema pinta lo que rodea a la página', raiz().dataset.temaLector === 'oscuro', raiz().dataset.temaLector);
    medida.querySelector('[data-tema="auto"]').click();
    tecla('Escape');
    await hasta(() => !raiz().querySelector('[data-panel-medida]'), 3000);
    comprobar('Esc cierra el panel y no el libro', raiz() && !raiz().querySelector('[data-panel-medida]'));

    // ---------- Enfoque ----------
    tecla('f');
    await esperar(500);
    comprobar('F prende el modo enfoque', raiz().dataset.enfoque === 'si');
    tecla('Escape');
    await esperar(500);
    comprobar('Esc sale del enfoque y no cierra el libro', raiz()?.dataset.enfoque === 'no');

    // ---------- Última página, sesión y cruz ----------
    await pasar('ArrowRight');
    await pasar('ArrowRight');
    comprobar('al final, ofrece marcarlo como leído', await hasta(() => raiz().querySelector('[data-aviso-sesion="terminado"]'), 2000));
    await esperar(1800); // que el reloj de la sesión cuente y se escriba la posición
    await cerrarCruz();
    comprobar('la cruz vuelve a la biblioteca', !raiz() && document.querySelector('[data-tarjeta]'));

    const uuidDe = async (id) => {
      const todo = await window.habito.todo();
      return { todo };
    };
    // Se busca el uuid por lo guardado: es el único libro con posición de PDF de 12 páginas.
    await esperar(1800);
    let { todo } = await uuidDe();
    const [uuidPdf, posicionPdf] = Object.entries(todo.posiciones).find(([, p]) => p.formatos?.PDF?.paginas === 12) ?? [];
    comprobar('guardó la posición del PDF', posicionPdf?.formatos.PDF.hoja > 0, JSON.stringify(posicionPdf?.formatos?.PDF));
    comprobar('también lo que muestra el panel del libro', posicionPdf?.paginas === 12 && posicionPdf.progreso > 0.5, JSON.stringify(posicionPdf));
    const sesiones = JSON.stringify(todo.sesiones ?? []);
    comprobar('cuenta en «Mi lectura»', uuidPdf && sesiones.includes(uuidPdf), sesiones.slice(0, 200));
    const unaSesion = (todo.sesiones ?? []).find((s) => s.uuid === uuidPdf);
    comprobar('con sus páginas', unaSesion?.paginas > 3 && unaSesion?.paginasLibro === 12, JSON.stringify(unaSesion));

    // ---------- Volver: doble clic y misma página ----------
    panel = await abrirPanel(ids.pdf);
    comprobar('el panel muestra por dónde vas', await hasta(() => panel.querySelector('[data-avance-libro]'), 4000), panel.querySelector('[data-avance-libro]')?.dataset.avanceLibro);
    boton(panel, 'Leer').click();
    await hasta(() => raiz()?.dataset.lectorPaginas === 'pdf' && pliego(), 15000);
    comprobar('vuelve a la misma página, sin que los pares se reacomoden', pliego() === '10-11', `${pliego()} y guardó ${posicionPdf.formatos.PDF.hoja}`);
    tecla('Escape');
    await hasta(() => !raiz(), 4000);
    await esperar(600);

    // ---------- Los que no se abren ----------
    let r = await mensajeAlAbrir(ids.pdfDrm);
    comprobar('un PDF con DRM no se abre, y lo explica', /protegido \(DRM\)/.test(r.texto) && !r.huboPagina, r.texto);
    r = await mensajeAlAbrir(ids.pdfContrasena);
    comprobar('un PDF con contraseña no se abre, y lo explica', /contraseña/.test(r.texto) && !r.huboPagina, r.texto);
    r = await mensajeAlAbrir(ids.pdfRoto);
    comprobar('un archivo que no es un PDF avisa', /dañado/.test(r.texto) && !r.huboPagina, r.texto);
    r = await mensajeAlAbrir(ids.cbzCifrado);
    comprobar('un cómic con contraseña no se abre, y lo explica', /contraseña/.test(r.texto) && !r.huboPagina, r.texto);
    r = await mensajeAlAbrir(ids.cbzVacio);
    comprobar('un cómic sin imágenes avisa', /ninguna imagen/.test(r.texto) && !r.huboPagina, r.texto);

    // Solo con la marca de «no copiar»: se lee como cualquier otro.
    boton(await abrirPanel(ids.pdfPermisos), 'Leer').click();
    hoja = await hasta(() => lista(0), 15000);
    comprobar('un PDF con la marca «no copiar» se abre y se lee', hoja && tinta(hoja) > 200, hoja ? tinta(hoja) : 'no abrió');
    await cerrarCruz();

    // ---------- CBZ con manga marcado adentro, con doble clic ----------
    dobleClic(ids.cbz);
    hoja = await hasta(() => lista(0), 20000);
    comprobar('el doble clic abre el cómic', raiz()?.dataset.lectorPaginas === 'comic' && hoja);
    if (!hoja) return;
    const anchoImagen = (n) => lista(n)?.querySelector('img')?.naturalWidth;
    comprobar('es una imagen del cómic', anchoImagen(0) === 300, anchoImagen(0));
    comprobar('la ficha del cómic prende el manga', raiz().dataset.rtl === 'si');
    comprobar('la basura del archivo no cuenta como página', /de 12/.test(pie()), pie());
    await pasar('ArrowLeft');
    comprobar('en manga, ← avanza', pliego() === '1-2', pliego());
    comprobar('y la página que se lee primero va a la derecha', orden().join() === '2,1', orden().join());
    await hasta(() => lista(1) && lista(2), 5000);
    comprobar('cada imagen cargó', anchoImagen(1) === 301 && anchoImagen(2) === 302, `${anchoImagen(1)} ${anchoImagen(2)}`);
    await pasar('ArrowLeft');
    comprobar('la siguiente', pliego() === '3', pliego()); // la 5 (índice 4) es ancha: la 4 queda sola
    await pasar('ArrowLeft');
    comprobar('la ancha va sola', pliego() === '4', pliego());
    const anchaDelComic = await hasta(() => lista(4), 5000);
    comprobar('y se ve a lo ancho', anchaDelComic && anchaDelComic.getBoundingClientRect().width > anchaDelComic.getBoundingClientRect().height);
    await pasar('ArrowRight');
    comprobar('en manga, → vuelve', pliego() === '3', pliego());
    raiz().querySelector('[data-costado="izquierda"]').click();
    await esperar(350);
    comprobar('en manga, la flecha de la izquierda avanza', pliego() === '4', pliego());
    await pasar('PageDown');
    comprobar('Av Pág siempre avanza', pliego() === '5-6', pliego());
    const barra = raiz().querySelector('[data-barra-avance]').getBoundingClientRect();
    raiz().querySelector('[data-barra-avance]').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: barra.left + barra.width * 0.9, clientY: barra.top + 2 }));
    await esperar(400);
    comprobar('en manga, la barra de abajo también va al revés', orden().some((n) => n <= 2), pliego());

    // Índice de la ficha.
    raiz().querySelector('[data-boton-indice]').click();
    const indiceCbz = await hasta(() => raiz().querySelector('[data-indice-paginas]'), 3000);
    comprobar('las marcas de la ficha arman el índice', /Tapa/.test(indiceCbz?.innerText) && /Capítulo & uno/.test(indiceCbz?.innerText), indiceCbz?.innerText);
    boton(indiceCbz, 'Capítulo & uno').click();
    await esperar(400);
    comprobar('y llevan a su página', orden().includes(3), pliego());

    // Pellizco sobre una imagen.
    pellizco(-30);
    pellizco(-30);
    await esperar(100);
    comprobar('el pellizco también acerca un cómic', escala() > 1.2, transformado());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }));
    await esperar(300);

    // Se apaga el manga: queda así para este libro.
    raiz().querySelector('[data-boton-manga]').click();
    await esperar(200);
    comprobar('el botón apaga el manga', raiz().dataset.rtl === 'no');
    await pasar('ArrowRight');
    comprobar('y → vuelve a avanzar', orden().includes(4) || orden().includes(5), pliego());
    const dondeQuedo = orden();
    await esperar(1800);
    await cerrarCruz();
    dobleClic(ids.cbz);
    await hasta(() => raiz()?.dataset.lectorPaginas === 'comic' && pliego(), 15000);
    comprobar('recuerda que apagaste el manga', raiz().dataset.rtl === 'no');
    comprobar('y la página', dondeQuedo.some((n) => orden().includes(n)), `${dondeQuedo} y ${orden()}`);
    tecla('Escape');
    await hasta(() => !raiz(), 4000);
    await esperar(500);

    // ---------- CBR ----------
    panel = await abrirPanel(ids.cbr);
    boton(panel, 'Leer').click();
    hoja = await hasta(() => lista(0), 30000);
    comprobar('un CBR (RAR 4) se abre', raiz()?.dataset.lectorPaginas === 'comic' && anchoImagen(0) === 300, anchoImagen(0));
    comprobar('con todas sus páginas', /de 5/.test(pie()), pie());
    comprobar('la etiqueta «Manga» (también colgada de otra) prende el manga', raiz().dataset.rtl === 'si');
    await pasar('ArrowLeft');
    await hasta(() => lista(1) && lista(2), 5000);
    comprobar('y las páginas van en orden', anchoImagen(1) === 301 && anchoImagen(2) === 302, `${anchoImagen(1)} ${anchoImagen(2)}`);
    raiz().querySelector('[data-sesion]').click();
    await esperar(300);
    comprobar('sin índice, no ofrece leer hasta el fin del capítulo', !/capítulo/i.test([...raiz().querySelectorAll('[data-panel-sesion] button')].map((b) => b.innerText).join(' ')), raiz().querySelector('[data-panel-sesion]')?.innerText.slice(0, 120));
    tecla('Escape');
    await esperar(200);
    await cerrarCruz();

    boton(await abrirPanel(ids.cbr5), 'Leer').click();
    hoja = await hasta(() => lista(0), 30000);
    comprobar('un CBR en RAR 5 se abre', anchoImagen(0) === 300 && /de 4/.test(pie()), anchoImagen(0));
    comprobar('sin marcas de manga, se lee de izquierda a derecha', raiz().dataset.rtl === 'no');
    await cerrarCruz();

    boton(await abrirPanel(ids.cbrEsZip), 'Leer').click();
    hoja = await hasta(() => lista(0), 30000);
    comprobar('un .cbr que por dentro es zip también se abre', anchoImagen(0) === 300 && /de 3/.test(pie()), anchoImagen(0));
    await cerrarCruz();

    boton(await abrirPanel(ids.cbzCarpetas), 'Leer').click();
    await hasta(() => lista(0), 20000);
    raiz().querySelector('[data-boton-indice]').click();
    const tomos = await hasta(() => raiz().querySelector('[data-indice-paginas]'), 3000);
    comprobar('las carpetas del archivo arman el índice', /Tomo 1/.test(tomos?.innerText) && /Tomo 2/.test(tomos?.innerText), tomos?.innerText);
    tecla('Escape');
    await esperar(200);
    await cerrarCruz();

    // ---------- El mismo libro en EPUB y en PDF ----------
    const idEpub = PRUEBA.libros.epub[0].id;
    panel = await abrirPanel(idEpub);
    const leerPdf = panel.querySelector('[data-leer-formato="PDF"]');
    comprobar('con EPUB y PDF, ofrece los dos', boton(panel, 'Leer') && leerPdf?.innerText === 'Leer el PDF', leerPdf?.innerText);
    boton(panel, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'), 30000);
    comprobar('«Leer» abre el EPUB', texto && !raiz());
    tecla('ArrowRight');
    await esperar(800);
    tecla('ArrowRight');
    await esperar(2000);
    await window.lector.pruebaCruz();
    await hasta(() => !document.querySelector('.texto-libro'), 5000);
    await esperar(700);
    panel = await hasta(() => document.querySelector('.fixed.top-11'), 2000) ?? (await abrirPanel(idEpub));
    panel.querySelector('[data-leer-formato="PDF"]').click();
    await hasta(() => lista(0) || raiz()?.querySelector('[data-hoja]'), 20000);
    comprobar('«Leer el PDF» abre el PDF', raiz()?.dataset.lectorPaginas === 'pdf');
    await pasar('ArrowRight');
    await esperar(1800);
    await cerrarCruz();
    await esperar(1800);
    ({ todo } = await uuidDe());
    const conLosDos = Object.values(todo.posiciones).find((p) => p.formatos?.PDF?.paginas === 6);
    comprobar('cada formato guarda su posición', conLosDos?.formatos.PDF.hoja >= 1 && conLosDos?.capitulo != null, JSON.stringify(conLosDos));
    dobleClic(idEpub);
    await hasta(() => document.querySelector('.texto-libro')?.childElementCount, 20000);
    comprobar('con los dos, el doble clic abre el EPUB', document.querySelector('.texto-libro') && !raiz());
    await esperar(800);
    await window.lector.pruebaCruz();
    await hasta(() => !document.querySelector('.texto-libro'), 5000);
  },
  async verificar({ DATOS, fs, path }) {
    const pruebas = [];
    let quedaron = [];
    try {
      quedaron = fs.readdirSync(path.join(DATOS, 'cache', 'comics'));
    } catch {}
    pruebas.push({ nombre: 'al cerrar Broots, no quedan páginas descomprimidas', ok: quedaron.length === 0, detalle: quedaron.join(', ') });

    // Lo que mide una imagen, según su cabecera (los fabricados arriba son todos PNG).
    const { tamanoImagen } = require('../../electron/paginas.cjs');
    const jpeg = Buffer.alloc(80);
    jpeg.set([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20], 0); // un bloque cualquiera antes del tamaño
    jpeg.set([0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x78, 0x03, 0xe8], 36);
    const vp8x = Buffer.alloc(40);
    vp8x.write('RIFF', 0, 'latin1');
    vp8x.write('WEBPVP8X', 8, 'latin1');
    vp8x.writeUIntLE(999, 24, 3);
    vp8x.writeUIntLE(1399, 27, 3);
    const gif = Buffer.alloc(30);
    gif.write('GIF89a', 0, 'latin1');
    gif.writeUInt16LE(1000, 6);
    gif.writeUInt16LE(1400, 8);
    for (const [nombre, datos] of [['JPEG', jpeg], ['WEBP', vp8x], ['GIF', gif]]) {
      const t = tamanoImagen(datos);
      pruebas.push({ nombre: `lee lo que mide un ${nombre}`, ok: t?.ancho === 1000 && t?.alto === 1400, detalle: JSON.stringify(t) });
    }
    return pruebas;
  },
};
