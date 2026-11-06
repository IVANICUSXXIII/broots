// 1.11: al agregar un libro, Broots te lleva hasta él. Se prueba con títulos que caen al final del orden alfabético, que es
// lo que hacía parecer que no había entrado. BROOTS_AGREGAR reemplaza al diálogo de «+»: el agregado es de verdad, con calibredb.
//
// 1.11.1: los títulos limpios. Un archivo sin datos adentro no deja su nombre como título, y lo que trae datos propios no se toca.
// Los archivos que se agregan imitan a los casos reales con «Zzz»: la biblioteca de prueba es una copia de la real, y si los
// reales ya están ahí, Calibre los tomaría por repetidos. Los nombres reales están en la tabla NOMBRES.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { paginasDeComic, zip } from '../libros-de-prueba.mjs';

const { datosDelNombre } = createRequire(import.meta.url)('../../electron/nombreDeArchivo.cjs');

const CARPETA = path.join(os.tmpdir(), 'broots-agregar');
const archivo = (nombre, extension = 'cbz') => path.join(CARPETA, `${nombre}.${extension}`);

const SPIDER = 'ZZZ-VERSE ACROSS THE MULTIVERSE (Marvel Zzz-Man Zzz-Verse) (Dana Prueba, Marvel Various) (z-library.sk, 1lib.sk, z-lib.sk)';
const TIM = 'ZzzTylerCowboy017-StandardComics';
const TIM_CON_ESPACIOS = 'Zzz Tyler Cowboy 018 - Standard Comics';
const BATMAN = 'Zzz Batman 001 (2016) (Digital) (Zone-Empire)';
const CON_DATOS = 'Novela Zzz (Otro Nombre) (z-library.sk, 1lib.sk, z-lib.sk)';
const AUTOR_ADENTRO = 'Ensayo Zzz (Nombre Falso) (z-lib.org)';

/** Un EPUB mínimo con sus datos adentro. */
function epub(titulo, autor) {
  return zip([], {
    mimetype: Buffer.from('application/epub+zip'),
    'META-INF/container.xml': Buffer.from('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'c.opf': Buffer.from(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="i"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${titulo}</dc:title><dc:creator>${autor}</dc:creator><dc:identifier id="i">prueba</dc:identifier><dc:language>es</dc:language></metadata><manifest><item id="t" href="t.html" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="t"/></spine></package>`),
    't.html': Buffer.from('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body><p>Texto.</p></body></html>'),
  });
}

// Lo que el nombre dice, sin pasar por Calibre. null: no hay nada que mejorar.
const NOMBRES = [
  ['SPIDER-VERSE ACROSS THE MULTIVERSE (Marvel Spider-Man Spider-Verse) (David Hine, Marvel Various) (z-library.sk, 1lib.sk, z-lib.sk).cbz', { titulo: 'Spider-Verse Across the Multiverse', autores: ['David Hine'], serie: 'Marvel Spider-Man Spider-Verse', numero: null, editorial: null }],
  ['TimTylerCowboy017-StandardComics.cbz', { titulo: 'Tim Tyler Cowboy 017', autores: [], serie: 'Tim Tyler Cowboy', numero: 17, editorial: 'Standard Comics' }],
  ['Sapiens (Yuval Noah Harari) (z-library.sk, 1lib.sk, z-lib.sk).pdf', { titulo: 'Sapiens', autores: ['Yuval Noah Harari'] }],
  ['Rayuela (Spanish Edition) (Julio Cortázar) (z-library.sk).pdf', { titulo: 'Rayuela (Spanish Edition)', autores: ['Julio Cortázar'], serie: null }],
  ['Mistborn (Mistborn Book 3) (Brandon Sanderson) (z-lib.org).pdf', { titulo: 'Mistborn', serie: 'Mistborn', numero: 3 }],
  ['Libro (2018) (z-lib.org).pdf', { titulo: 'Libro (2018)', autores: [] }],
  ['Libro (Hine, David) (z-lib.org).pdf', { titulo: 'Libro', autores: ['David Hine'] }],
  ['Star Wars - A New Hope (George Lucas) (z-lib.org).pdf', { titulo: 'Star Wars - A New Hope', autores: ['George Lucas'] }],
  ['El Aleph - Jorge Luis Borges (z-lib.org).epub', { titulo: 'El Aleph', autores: ['Jorge Luis Borges'] }],
  ['Foo Bar -- Jane Doe; John Roe -- 2nd ed, 2018 -- Acme -- 9781234567890 -- abc123 -- Anna’s Archive.pdf', { titulo: 'Foo Bar', autores: ['Jane Doe', 'John Roe'] }],
  ['[Stephen King] The Stand (1990, Doubleday) - libgen.li.epub', { titulo: 'The Stand', autores: ['Stephen King'], editorial: 'Doubleday' }],
  ['_OceanofPDF.com_Some_Book_-_Jane_Doe.pdf', { titulo: 'Some Book', autores: ['Jane Doe'] }],
  ['LA CASA DE LOS ESPIRITUS.epub', { titulo: 'La Casa de los Espiritus' }],
  ['ROCKY II Y III.pdf', { titulo: 'Rocky II y III' }],
  ['EL NIÑO Y EL ÑANDÚ (Ana Pérez) (z-lib.org).cbz', { titulo: 'El Niño y el Ñandú', autores: ['Ana Pérez'] }],
  ['ElAleph.pdf', { titulo: 'El Aleph' }],
  ['Batman 001.cbz', { titulo: 'Batman 001', serie: 'Batman', numero: 1 }],
  ['Batman 001 (2016) (Digital) (Zone-Empire).cbz', null],
  ['Batman 001.pdf', null],
  ['Fahrenheit 451.cbz', null],
  ['Sandman - Neil Gaiman.cbz', null],
  ['mi_comic_de_prueba.cbz', null],
  ['McDonalds.pdf', null],
  ['iPhone.pdf', null],
  ['AMOR.pdf', null],
  ['1984.pdf', null],
  ['Marvel-Comics.cbz', null],
];

export default {
  descripcion: 'Agregar libros: te lleva al nuevo, saca lo que lo tapa, marca una pila, avisa los repetidos y limpia los títulos sin datos',
  necesita: { epub: 1 },
  entorno: {
    BROOTS_VENTANA: '1440x900',
    BROOTS_AGREGAR: [
      archivo('Zzz uno'),
      archivo('Zzz dos'),
      `${archivo('Zzz tres')}|${archivo('Zzz cuatro')}`,
      archivo('Zzz uno'),
      archivo('Zzz cinco'),
      archivo(SPIDER),
      archivo(TIM),
      archivo(TIM),
      archivo(TIM_CON_ESPACIOS),
      archivo(BATMAN),
      archivo(CON_DATOS, 'epub'),
      archivo(AUTOR_ADENTRO, 'epub'),
    ].join(';'),
  },
  config: () => {
    fs.rmSync(CARPETA, { recursive: true, force: true });
    fs.mkdirSync(CARPETA, { recursive: true });
    for (const nombre of ['Zzz uno', 'Zzz dos', 'Zzz tres', 'Zzz cuatro', 'Zzz cinco', SPIDER, TIM, TIM_CON_ESPACIOS, BATMAN]) fs.writeFileSync(archivo(nombre), zip(paginasDeComic(3)));
    fs.writeFileSync(archivo(CON_DATOS, 'epub'), epub('Novela con datos propios', 'Autora Verdadera'));
    fs.writeFileSync(archivo(AUTOR_ADENTRO, 'epub'), epub(AUTOR_ADENTRO, 'Autora Verdadera'));
    return {};
  },
  limpiar: () => [CARPETA],
  // Lo que el panel no muestra entero se mira en la base de prueba, ya con Broots cerrado.
  async verificar({ BIBLIOTECA }) {
    const resultados = [];
    const comprobar = (nombre, ok, detalle = '') => resultados.push({ nombre, ok: Boolean(ok), detalle: String(detalle) });

    for (const [archivoDePrueba, esperado] of NOMBRES) {
      const obtenido = datosDelNombre(archivoDePrueba);
      const bien = esperado ? obtenido && Object.entries(esperado).every(([k, v]) => JSON.stringify(obtenido[k]) === JSON.stringify(v)) : obtenido === null;
      comprobar(`nombre: ${archivoDePrueba.slice(0, 50)}`, bien, bien ? '' : JSON.stringify(obtenido));
    }

    const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
    const fichas = (titulo) =>
      db.prepare(`SELECT b.title AS titulo, b.series_index AS numero,
        (SELECT group_concat(a.name, ' & ') FROM books_authors_link l JOIN authors a ON a.id = l.author WHERE l.book = b.id) AS autores,
        (SELECT s.name FROM books_series_link l JOIN series s ON s.id = l.series WHERE l.book = b.id) AS serie,
        (SELECT p.name FROM books_publishers_link l JOIN publishers p ON p.id = l.publisher WHERE l.book = b.id) AS editorial
        FROM books b WHERE b.title = ?`).all(titulo);
    const verFicha = (nombre, titulo, esperado) => {
      const [ficha, ...otras] = fichas(titulo);
      const bien = ficha && !otras.length && Object.entries(esperado).every(([k, v]) => ficha[k] === v);
      comprobar(nombre, bien, bien ? '' : JSON.stringify(fichas(titulo)));
    };
    const desconocido = 'Desconocido'; // el corredor pone Broots en español

    verFicha('título, autor y serie salen del nombre', 'Zzz-Verse Across the Multiverse', { autores: 'Dana Prueba', serie: 'Marvel Zzz-Man Zzz-Verse', editorial: null });
    verFicha('separa las palabras, y el número y la editorial van a su lugar', 'Zzz Tyler Cowboy 017', { autores: desconocido, serie: 'Zzz Tyler Cowboy', numero: 17, editorial: 'Standard Comics' });
    verFicha('«- Standard Comics» no queda como autor', 'Zzz Tyler Cowboy 018', { autores: desconocido, serie: 'Zzz Tyler Cowboy', numero: 18, editorial: 'Standard Comics' });
    verFicha('sin firma de un sitio, los paréntesis quedan como están', BATMAN, { autores: desconocido, serie: null, editorial: null });
    verFicha('un archivo con datos propios no se toca', 'Novela con datos propios', { autores: 'Autora Verdadera' });
    verFicha('si el título es el nombre pero el autor vino de adentro, se respeta', 'Ensayo Zzz', { autores: 'Autora Verdadera' });
    const sucios = [SPIDER, TIM, AUTOR_ADENTRO].flatMap(fichas);
    comprobar('nada quedó con el nombre del archivo como título', !sucios.length, JSON.stringify(sucios));
    db.close();
    return resultados;
  },
  async prueba({ hasta, comprobar, escribir, tecla, esperar }) {
    const mas = document.querySelector('[data-tour="agregar"]');
    const estante = () => document.querySelector('[data-estanteria]');
    const panel = () => document.querySelector('.fixed.top-11');
    const tarjeta = (titulo) => [...document.querySelectorAll('[data-tarjeta]')].find((t) => t.innerText.includes(titulo));
    const seVe = (el) => {
      if (!el?.offsetParent) return false;
      const c = el.getBoundingClientRect();
      const m = estante().getBoundingClientRect();
      return c.top >= m.top - 1 && c.bottom <= m.bottom + 1;
    };
    const marcada = (el) => getComputedStyle(el.querySelector('.marco-seleccion')).opacity === '1';
    const cerrarPanel = async () => {
      tecla('Escape');
      await hasta(() => !panel(), 3000);
      await esperar(500);
    };
    const avisoCon = (texto) => hasta(() => [...document.querySelectorAll('body *')].find((e) => e.childElementCount === 0 && e.textContent.includes(texto)), 60000);

    // ---------- Uno solo: por título queda último, y Broots va hasta allá ----------
    comprobar('la estantería arranca desde arriba', estante().scrollTop === 0);
    mas.click();
    await avisoCon('1 libro nuevo en el estante');
    const abierto = await hasta(() => panel()?.innerText.includes('Zzz uno') && panel(), 8000);
    comprobar('abre el panel del libro nuevo', abierto, panel()?.innerText.slice(0, 60));
    await esperar(2600); // la portada aterriza, la grilla le hace lugar y se hace el ajuste final
    const uno = tarjeta('Zzz uno');
    comprobar('el libro nuevo se ve en la estantería', seVe(uno), `${Math.round(uno?.getBoundingClientRect().top)} con estante en ${estante().scrollTop}`);
    comprobar('la estantería bajó hasta él', estante().scrollTop > 300, estante().scrollTop);
    comprobar('queda marcado como el libro abierto', uno && marcada(uno));
    await cerrarPanel();

    // ---------- Una búsqueda lo tapa: se saca y se avisa ----------
    const buscador = document.querySelector('header input');
    escribir(buscador, 'una búsqueda que no encuentra absolutamente nada');
    await hasta(() => !tarjeta('Zzz uno')?.offsetParent, 4000);
    comprobar('con la búsqueda, el libro de antes no se ve', !tarjeta('Zzz uno')?.offsetParent);
    mas.click();
    const avisoFiltros = await avisoCon('Saqué los filtros');
    comprobar('avisa que sacó los filtros', avisoFiltros, avisoFiltros?.textContent);
    await hasta(() => panel()?.innerText.includes('Zzz dos'), 8000);
    comprobar('saca la búsqueda', buscador.value === '', buscador.value);
    comprobar('y abre el libro que tapaba', panel()?.innerText.includes('Zzz dos'), panel()?.innerText.slice(0, 60));
    await esperar(2600);
    comprobar('que se ve en la estantería', seVe(tarjeta('Zzz dos')));
    await cerrarPanel();

    // ---------- Una pila: muestra el primero, sin panel, y los marca ----------
    estante().scrollTop = 0;
    await esperar(200);
    mas.click();
    await avisoCon('2 libros nuevos en el estante');
    await hasta(() => tarjeta('Zzz tres') && tarjeta('Zzz cuatro') && marcada(tarjeta('Zzz tres')), 8000);
    await esperar(400);
    comprobar('con varios, no abre ningún panel', !panel());
    comprobar('los marca a todos', marcada(tarjeta('Zzz tres')) && marcada(tarjeta('Zzz cuatro')));
    comprobar('y muestra el primero', seVe(tarjeta('Zzz cuatro')) || seVe(tarjeta('Zzz tres')), estante().scrollTop);
    await hasta(() => !marcada(tarjeta('Zzz tres')), 8000);
    comprobar('la marca se va sola', !marcada(tarjeta('Zzz tres')));

    // ---------- Repetido: no se mueve nada y avisa ----------
    estante().scrollTop = 0;
    await esperar(200);
    mas.click();
    const repetido = await avisoCon('ya está en tu biblioteca');
    comprobar('un repetido lo avisa y no lo duplica', repetido, repetido?.textContent);
    await esperar(800);
    comprobar('y no te mueve de donde estabas', estante().scrollTop === 0 && !panel(), estante().scrollTop);

    // ---------- En la vista de lista ----------
    document.querySelector('[title="Vista de lista"]').click();
    await esperar(600);
    mas.click();
    await hasta(() => panel()?.innerText.includes('Zzz cinco'), 60000);
    comprobar('en la lista también abre el panel', panel()?.innerText.includes('Zzz cinco'), panel()?.innerText.slice(0, 60));
    await esperar(2600);
    const fila = [...document.querySelectorAll('tr')].find((f) => f.innerText.includes('Zzz cinco'));
    comprobar('y deja la fila a la vista', seVe(fila), fila ? Math.round(fila.getBoundingClientRect().top) : 'sin fila');
    document.querySelector('[title="Vista de portadas"]').click();
    await esperar(600);
    await cerrarPanel();

    // ---------- Títulos limpios: agrega de verdad y mira qué ficha abre (el detalle se verifica en la base) ----------
    const agregarYVer = async (titulo) => {
      mas.click();
      await hasta(() => panel()?.innerText.includes(titulo), 60000);
      const ficha = panel()?.innerText ?? '';
      await cerrarPanel();
      return ficha;
    };
    const spider = await agregarYVer('Zzz-Verse Across the Multiverse');
    comprobar('el título del cómic queda limpio', spider.includes('Zzz-Verse Across the Multiverse') && !/z-lib/i.test(spider), spider.slice(0, 80));
    comprobar('y el autor sale de los paréntesis', spider.includes('Dana Prueba') && !spider.includes('Various'), spider.slice(0, 80));
    const tim = await agregarYVer('Zzz Tyler Cowboy 017');
    comprobar('las palabras pegadas se separan', tim.includes('Zzz Tyler Cowboy 017') && !tim.includes('StandardComics'), tim.slice(0, 80));

    // El mismo archivo otra vez: Calibre tiene que reconocerlo aunque en la biblioteca ya no se llame como el archivo.
    await esperar(800);
    mas.click();
    const repetidoLimpio = await avisoCon('ya está en tu biblioteca');
    comprobar('un repetido con el título limpio también se avisa', repetidoLimpio, repetidoLimpio?.textContent);
    await esperar(800);
    comprobar('y no abre nada', !panel());

    await agregarYVer('Zzz Tyler Cowboy 018');
    const batman = await agregarYVer('Zzz Batman 001 (2016) (Digital) (Zone-Empire)');
    comprobar('sin firma de un sitio, los paréntesis se quedan', batman.includes('Zone-Empire'), batman.slice(0, 80));
    const conDatos = await agregarYVer('Novela con datos propios');
    comprobar('un archivo con datos propios queda como viene', conDatos.includes('Autora Verdadera') && !conDatos.includes('Otro Nombre'), conDatos.slice(0, 80));
    const autorAdentro = await agregarYVer('Ensayo Zzz');
    comprobar('un autor que vino de adentro se respeta', autorAdentro.includes('Autora Verdadera') && !autorAdentro.includes('Nombre Falso'), autorAdentro.slice(0, 80));
  },
};
