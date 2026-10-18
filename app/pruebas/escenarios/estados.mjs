// 1.7: una biblioteca sin columna de estado. «Mi lectura» ofrece crearla (calibredb add_custom_column, con
// permiso y respaldo); después se marca un libro como Leído y se relee: la vuelta anterior queda guardada.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const CALIBREDB = ['C:\\Program Files\\Calibre2', 'C:\\Program Files (x86)\\Calibre2', path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Calibre2')]
  .map((c) => path.join(c, 'calibredb.exe'))
  .find((r) => fs.existsSync(r));

export default {
  descripcion: 'Crea la columna «Estado», marca Leído y relee un libro',
  necesita: { epub: 1 },
  // Le saca a la COPIA de prueba sus columnas de estado (con la herramienta de Calibre), para empezar sin ninguna.
  config: ({ BIBLIOTECA }) => {
    const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
    const etiquetas = db.prepare("SELECT label FROM custom_columns WHERE datatype = 'enumeration'").all().map((c) => c.label);
    db.close();
    for (const etiqueta of etiquetas) spawnSync(CALIBREDB, ['remove_custom_column', '--force', '--with-library', BIBLIOTECA, etiqueta]);
    return {};
  },
  async prueba({ PRUEBA, hasta, comprobar, boton, esperar, tecla }) {
    const id = PRUEBA.libros.epub[0].id;
    document.querySelector('[data-boton-mi-lectura]').click();
    const tarjeta = await hasta(() => document.querySelector('[data-tarjeta-estados="crear"]'));
    comprobar('sin columna de estado, ofrece crearla', tarjeta);
    if (!tarjeta) return;
    boton(tarjeta, 'Crear la columna «Estado»').click();
    await hasta(() => !document.querySelector('[data-tarjeta-estados]'), 90000);
    comprobar('creó la columna (ya no la ofrece ni pide «En pausa»)', !document.querySelector('[data-tarjeta-estados]'));
    tecla('Escape');
    await esperar(600);

    document.querySelector(`[data-tarjeta="${id}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    const chip = (texto) => [...panel.querySelectorAll('button')].find((b) => b.innerText.trim() === texto);
    comprobar('el panel muestra los cinco estados', ['Por leer', 'Leyendo', 'En pausa', 'Leído', 'Abandonado'].every(chip));
    chip('Leído')?.click();
    const releer = await hasta(() => boton(document.querySelector('[data-tu-lectura]') ?? document.body, 'Releer'), 60000);
    comprobar('un libro leído ofrece «Releer»', releer);
    releer?.click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'), 60000);
    comprobar('«Releer» abre el lector', texto);
    tecla('Escape');
    await esperar(1500);
    const leyendo = await hasta(() => chip('Leyendo')?.className.includes('bg-verde'), 30000);
    comprobar('al releer, el libro vuelve a «Leyendo»', leyendo);
    const tuLectura = document.querySelector('[data-tu-lectura]');
    comprobar('cuenta la lectura anterior', tuLectura?.querySelector('[data-veces]')?.dataset.veces === '1', tuLectura?.innerText);
  },
  verificar({ BIBLIOTECA }) {
    const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
    const columna = db.prepare("SELECT name, display FROM custom_columns WHERE label = 'estado_lectura' AND mark_for_delete = 0").get();
    db.close();
    const valores = columna ? JSON.parse(columna.display).enum_values : [];
    const lecturas = JSON.parse(fs.readFileSync(path.join(BIBLIOTECA, '.broots', 'habito', 'lecturas.json'), 'utf8'));
    const vueltas = Object.values(lecturas)[0] ?? [];
    const respaldos = fs.readdirSync(path.join(BIBLIOTECA, '.broots', 'respaldos'));
    return [
      { nombre: 'la columna «Estado» quedó en Calibre con sus cinco opciones (y tildes)', ok: columna?.name === 'Estado' && valores.join('|') === 'Por leer|Leyendo|En pausa|Leído|Abandonado', detalle: valores.join('|') },
      { nombre: 'hizo respaldos de la base antes de cambiarla', ok: respaldos.length > 0, detalle: `${respaldos.length} respaldos` },
      { nombre: 'la relectura no pisa la vuelta anterior', ok: vueltas.length === 2 && vueltas[0].resultado === 'leido' && vueltas[1].n === 2 && !vueltas[1].resultado, detalle: JSON.stringify(vueltas) },
    ];
  },
};
