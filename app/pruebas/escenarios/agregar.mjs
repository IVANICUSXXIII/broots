// 1.11: al agregar un libro, Broots te lleva hasta él. Se prueba con títulos que caen al final del orden alfabético, que es
// lo que hacía parecer que no había entrado. BROOTS_AGREGAR reemplaza al diálogo de «+»: el agregado es de verdad, con calibredb.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paginasDeComic, zip } from '../libros-de-prueba.mjs';

const CARPETA = path.join(os.tmpdir(), 'broots-agregar');
const archivo = (nombre) => path.join(CARPETA, `${nombre}.cbz`);

export default {
  descripcion: 'Agregar libros: te lleva al nuevo, saca lo que lo tapa, marca una pila y avisa los repetidos',
  necesita: { epub: 1 },
  entorno: {
    BROOTS_VENTANA: '1440x900',
    BROOTS_AGREGAR: [
      archivo('Zzz uno'),
      archivo('Zzz dos'),
      `${archivo('Zzz tres')}|${archivo('Zzz cuatro')}`,
      archivo('Zzz uno'),
      archivo('Zzz cinco'),
    ].join(';'),
  },
  config: () => {
    fs.rmSync(CARPETA, { recursive: true, force: true });
    fs.mkdirSync(CARPETA, { recursive: true });
    for (const nombre of ['Zzz uno', 'Zzz dos', 'Zzz tres', 'Zzz cuatro', 'Zzz cinco']) fs.writeFileSync(archivo(nombre), zip(paginasDeComic(3)));
    return {};
  },
  limpiar: () => [CARPETA],
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
  },
};
