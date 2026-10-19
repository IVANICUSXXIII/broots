// 1.8: los subrayados del Kindle conviven con los de Broots. La prueba arma (en la COPIA de prueba) dos subrayados
// del Kindle para un libro (uno con una frase del EPUB y otro que no está) y uno «de otra PC», anclado mal a
// propósito (como si el EPUB hubiera cambiado), y un .md viejo con texto propio abajo de la línea de fin. Revisa:
// una sola lista en el panel (con filtros por origen), la lista del lector, que el del Kindle se pinte en su
// capítulo, que el de otra PC se reubique por su texto, el club con todos, «Guardar una copia…» y que el .md se
// renombre sin tocar lo tuyo.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync, strFromU8 } from 'fflate';

const PROPIO = 'MI TEXTO PROPIO QUE BROOTS NO TOCA';
const INVENTADO = 'Esta frase no aparece en el libro de ninguna manera, la inventó la prueba';

// El mismo libro que elige el corredor para «necesita: { epub: 1 }» (el EPUB más chico entre 300 KB y 4 MB).
function libroDeLaPrueba(biblioteca) {
  const db = new DatabaseSync(path.join(biblioteca, 'metadata.db'), { readOnly: true });
  const fila = db
    .prepare(
      `SELECT b.id, b.uuid, b.title, b.path, d.name FROM books b JOIN data d ON d.book = b.id AND d.format = 'EPUB'
       WHERE d.uncompressed_size BETWEEN 300000 AND 4000000 ORDER BY d.uncompressed_size LIMIT 1`,
    )
    .get();
  db.close();
  return fila;
}

const decodificar = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/** Capítulos del EPUB en orden de lectura (como lector.cjs) y, de cada uno, sus párrafos con texto. */
function capitulos(epub) {
  const zip = unzipSync(fs.readFileSync(epub));
  const opfRuta = /full-path\s*=\s*"([^"]+)"/.exec(strFromU8(zip['META-INF/container.xml']))[1];
  const opf = strFromU8(zip[opfRuta]);
  const base = path.posix.dirname(opfRuta);
  const manifiesto = new Map([...opf.matchAll(/<item\b[^>]*>/gi)].map(([e]) => [/\bid\s*=\s*"([^"]+)"/.exec(e)?.[1], /\bhref\s*=\s*"([^"]+)"/.exec(e)?.[1]]));
  return [...opf.matchAll(/<itemref\b[^>]*idref\s*=\s*"([^"]+)"/gi)]
    .map((m) => manifiesto.get(m[1]))
    .filter(Boolean)
    .map((href) => path.posix.normalize(path.posix.join(base, decodeURIComponent(href))).replace(/^\.\//, ''))
    .filter((href) => zip[href])
    .map((href) => ({
      href,
      parrafos: [...strFromU8(zip[href]).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((m) => m[1])
        .filter((html) => !/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.test(html)) // sin entidades raras, para comparar fácil
        .map((html) => decodificar(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
        .filter((texto) => texto.length > 120),
    }));
}

/** Las primeras palabras (hasta ~largo letras, sin cortar una palabra). */
const principio = (texto, largo) => texto.slice(0, texto.indexOf(' ', largo) > 0 ? texto.indexOf(' ', largo) : largo).trim();

export default {
  descripcion: 'Kindle y Broots juntos: lista única, ubicados en el EPUB, .md con lo tuyo y club',
  necesita: { epub: 1 },
  config: ({ BIBLIOTECA }) => {
    const libro = libroDeLaPrueba(BIBLIOTECA);
    const caps = capitulos(path.join(BIBLIOTECA, libro.path, `${libro.name}.epub`)).map((c, i) => ({ ...c, i })).filter((c) => c.parrafos.length >= 2);
    const deKindle = caps[Math.min(1, caps.length - 1)];
    const deOtraPc = caps.at(-1) === deKindle && caps.length > 1 ? caps[0] : caps.at(-1);
    const textoKindle = principio(deKindle.parrafos[1], 70);
    const textoOtraPc = principio(deOtraPc.parrafos.at(-1), 50);
    const ahora = new Date().toISOString();

    // Subrayados del Kindle, como los deja subrayados.cjs al importar My Clippings.txt.
    const broots = path.join(BIBLIOTECA, '.broots');
    fs.mkdirSync(path.join(broots, 'subrayados-lector'), { recursive: true });
    fs.writeFileSync(
      path.join(broots, 'subrayados.json'),
      JSON.stringify({
        version: 1, actualizado: ahora, sinAsignar: {}, ignorados: {}, asignaciones: {}, importaciones: [],
        libros: {
          [libro.uuid]: {
            titulo: libro.title,
            subrayados: [
              { id: 'kindle-encontrado', tipo: 'subrayado', texto: textoKindle, nota: 'Nota escrita en el Kindle', ubicacion: [120, 122], pagina: [10, 10], fecha: '2024-06-03T22:10:05.000Z', fechaTexto: null },
              { id: 'kindle-inventado', tipo: 'subrayado', texto: INVENTADO, ubicacion: [900, 901], pagina: [80, 80], fecha: '2024-06-04T22:10:05.000Z', fechaTexto: null },
            ],
          },
        },
      }),
    );
    // Uno de «otra PC», anclado en el párrafo 0 (mal a propósito): Broots tiene que encontrarlo por su texto.
    fs.writeFileSync(
      path.join(broots, 'subrayados-lector', 'otrapc00.json'),
      JSON.stringify({
        version: 1, pc: 'otrapc00',
        libros: {
          [libro.uuid]: [
            {
              id: 'de-otra-pc-0001', href: deOtraPc.href, capitulo: deOtraPc.i, tituloCapitulo: '', parrafo: 0, inicio: 0, parrafoFin: 0, fin: textoOtraPc.length,
              version: 'original', idioma: null, texto: textoOtraPc, antes: '', despues: '', orden: 0.5, color: 'celeste', nota: 'Nota de la otra PC',
              creado: ahora, modificado: ahora, pc: 'otrapc00', borrado: false,
            },
          ],
        },
      }),
    );
    // Un .md viejo (con otro nombre) con texto tuyo abajo de la línea de fin.
    const data = path.join(BIBLIOTECA, libro.path, 'data');
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'Nombre viejo.md'), `<!-- broots:subrayados ${libro.uuid} · viejo -->\n# Viejo\n\n<!-- broots:fin -->\n\n${PROPIO}\n`);
    fs.writeFileSync(path.join(broots, 'prueba-subrayados-kindle.json'), JSON.stringify({ textoKindle, textoOtraPc, carpeta: libro.path }));
    return {};
  },
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    const id = PRUEBA.libros.epub[0].id;
    document.querySelector(`[data-tarjeta="${id}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    const lista = await hasta(() => panel.querySelector('[data-subrayados-panel]'), 10000);
    const items = () => [...(lista?.querySelectorAll('[data-subrayado-panel]') ?? [])];
    comprobar('el panel muestra una sola lista con los tres', items().length === 3, lista?.innerText.slice(0, 300));
    comprobar('con el origen de cada uno', items().filter((e) => e.dataset.origen === 'kindle').length === 2 && items().filter((e) => e.dataset.origen === 'broots').length === 1);
    lista?.querySelector('[data-filtro-origen="kindle"]')?.click();
    await esperar(300);
    comprobar('el filtro «Kindle» deja solo los del Kindle', items().length === 2 && items().every((e) => e.dataset.origen === 'kindle'));
    lista?.querySelector('[data-filtro-origen="todos"]')?.click();
    await esperar(300);

    // En el lector: la lista tiene los tres; el inventado no se puede ir (no está en el EPUB).
    boton(panel, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    const lector = texto?.closest('.fixed');
    await hasta(() => !/de (~|…)/.test(lector.querySelector('footer').innerText), 60000);
    await hasta(() => /\d/.test(lector.querySelector('[data-boton-subrayados]')?.innerText ?? ''), 10000);
    lector.querySelector('[data-boton-subrayados]').click();
    const enLector = await hasta(() => lector.querySelector('[data-panel-subrayados]'), 5000);
    const itemsLector = () => [...(enLector?.querySelectorAll('[data-item-subrayado]') ?? [])];
    comprobar('la lista del lector tiene los tres', itemsLector().length === 3, enLector?.innerText.slice(0, 300));
    comprobar('el del Kindle que no está en el EPUB no lleva a ningún lado', lector.querySelector('[data-item-subrayado="kindle-inventado"]')?.disabled);

    // Ir al del Kindle: se pinta en su capítulo y queda a la vista.
    const enPantalla = (el) => {
      const recorte = texto.parentElement.getBoundingClientRect();
      return el && [...el.getClientRects()].some((r) => r.right > recorte.left && r.left < recorte.right && r.width > 0);
    };
    lector.querySelector('[data-item-subrayado="kindle-encontrado"]')?.click();
    const kindle = await hasta(() => texto.querySelector('mark[data-subrayado="kindle-encontrado"].kindle'), 15000);
    await esperar(800);
    comprobar('el del Kindle se pinta en su capítulo, a la vista', enPantalla(kindle), kindle?.textContent);
    comprobar('y llega con el anillo para encontrarlo', kindle?.classList.contains('destacado') || texto.querySelector('mark.destacado'));
    // Tocarlo abre una barrita sin colores (solo Copiar): los del Kindle se cambian en el Kindle.
    kindle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const barraKindle = await hasta(() => lector.querySelector('[data-barra-subrayado="kindle"]'), 5000);
    comprobar('tocar el del Kindle abre la barrita, sin colores ni borrar', barraKindle && !barraKindle.querySelector('[data-color], [data-accion="borrar"]'));
    tecla('Escape');
    await hasta(() => !lector.querySelector('[data-barra-subrayado]'), 3000);

    // Ir al de la otra PC: estaba mal anclado, Broots lo encontró por su texto.
    lector.querySelector('[data-boton-subrayados]').click();
    await hasta(() => lector.querySelector('[data-item-subrayado="de-otra-pc-0001"]'), 5000);
    lector.querySelector('[data-item-subrayado="de-otra-pc-0001"]').click();
    const otra = await hasta(() => texto.querySelector('mark[data-subrayado="de-otra-pc-0001"].celeste'), 15000);
    await esperar(800);
    comprobar('el de la otra PC se reubica por su texto y se ve', enPantalla(otra), otra?.textContent);
    tecla('Escape'); // cierra el libro (no queda nada abierto adentro)
    await hasta(() => !document.body.contains(lector), 5000);
    await esperar(1200);

    // Club y copia del .md desde el panel.
    [...panel.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith('Llevar al club de lectura'))?.click();
    await hasta(() => /club/i.test(panel.innerText) && panel.innerText.includes('está listo'), 10000);
    comprobar('el club arma su archivo', panel.innerText.includes('está listo'));
    const copia = await hasta(() => panel.querySelector('[data-copia-md]'), 5000);
    copia?.click();
    await hasta(() => panel.innerText.includes('Copia guardada'), 10000);
    comprobar('«Guardar una copia…» guarda el .md', panel.innerText.includes('Copia guardada'));
    panel.querySelector('[data-mostrar-md]')?.click();
    await hasta(() => panel.innerText.includes('Ahí está'), 10000);
    comprobar('«Mostrar el .md» lo encuentra', panel.innerText.includes('Ahí está'));
    await esperar(1500);
  },
  verificar({ BIBLIOTECA, DATOS }) {
    const resultados = [];
    const datos = JSON.parse(fs.readFileSync(path.join(BIBLIOTECA, '.broots', 'prueba-subrayados-kindle.json'), 'utf8'));
    const data = path.join(BIBLIOTECA, datos.carpeta, 'data');
    const mds = fs.readdirSync(data).filter((n) => n.endsWith('.md'));
    resultados.push({ nombre: 'el .md viejo se renombró (uno solo, con el nombre del libro)', ok: mds.length === 1 && mds[0] !== 'Nombre viejo.md', detalle: mds.join(', ') });
    const md = mds[0] ? fs.readFileSync(path.join(data, mds[0]), 'utf8') : '';
    const [arriba, abajo = ''] = md.split('<!-- broots:fin -->');
    resultados.push({ nombre: 'lo tuyo, abajo de la línea de fin, quedó igual', ok: abajo.includes(PROPIO) && !arriba.includes(PROPIO) });
    resultados.push({ nombre: 'el .md tiene los del Kindle y el de la otra PC', ok: [datos.textoKindle, datos.textoOtraPc, INVENTADO].every((x) => arriba.includes(x)), detalle: arriba.slice(0, 400) });
    resultados.push({ nombre: 'el que no está en el EPUB va aparte, «Del Kindle, sin capítulo»', ok: arriba.includes('## Del Kindle, sin capítulo') && arriba.indexOf(INVENTADO) > arriba.indexOf('## Del Kindle, sin capítulo') });
    resultados.push({ nombre: 'el del Kindle ubicado va antes, bajo su capítulo', ok: arriba.indexOf(datos.textoKindle) < arriba.indexOf('## Del Kindle, sin capítulo') && /\n## /.test(arriba.slice(0, arriba.indexOf(datos.textoKindle))) });

    const club = path.join(BIBLIOTECA, '.broots', 'club-de-lectura');
    const delClub = fs.existsSync(club) ? fs.readdirSync(club).map((n) => fs.readFileSync(path.join(club, n), 'utf8')).join('\n') : '';
    resultados.push({ nombre: 'el club incluye los del Kindle y los de Broots', ok: [datos.textoKindle, datos.textoOtraPc, 'Nota de la otra PC'].every((x) => delClub.includes(x)) });
    const copias = path.join(DATOS, 'copias');
    const copia = fs.existsSync(copias) ? fs.readdirSync(copias).map((n) => fs.readFileSync(path.join(copias, n), 'utf8')).join('\n') : '';
    resultados.push({ nombre: 'la copia del .md tiene todo (y lo tuyo)', ok: copia.includes(datos.textoKindle) && copia.includes(datos.textoOtraPc) && copia.includes(PROPIO) });
    const cache = path.join(DATOS, 'cache');
    resultados.push({ nombre: 'recuerda dónde quedó cada subrayado del Kindle (caché de esta PC)', ok: fs.existsSync(cache) && fs.readdirSync(cache).some((n) => n.startsWith('ubicados-')) });
    // Esta PC no tenía nada que guardar: no tiene que haber escrito su archivo.
    const propios = fs.readdirSync(path.join(BIBLIOTECA, '.broots', 'subrayados-lector')).filter((n) => n.endsWith('.json'));
    resultados.push({ nombre: 'esta PC no escribió el archivo de la otra', ok: propios.length === 1 && propios[0] === 'otrapc00.json', detalle: propios.join(', ') });
    return resultados;
  },
};
