// Amazon: viene apagado de fábrica, pero quien lo prendió lo sigue teniendo prendido.
// Además se prueba (sin internet) que la búsqueda de datos no consulta Amazon si no se lo pide.
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default {
  descripcion: 'Amazon: respeta la opción guardada y no se consulta si está apagado',
  necesita: {},
  // Alguien que ya había prendido Amazon en Configuración → Privacidad.
  config: () => ({ amazon: true }),
  async prueba({ hasta, esperar, comprobar, boton }) {
    comprobar('respeta Amazon prendido', (await window.preferencias.leer()).amazon === true);

    boton(document.querySelector('header'), 'Configuración').click();
    const dialogo = await hasta(() => document.querySelector('[role="dialog"][aria-label="Configuración"]'), 5000);
    dialogo.querySelector('[data-seccion="privacidad"]').click();
    const privacidad = await hasta(() => document.querySelector('[data-config-seccion="privacidad"]'), 5000);
    await esperar(300);
    comprobar('el interruptor aparece prendido', privacidad?.querySelector('[data-amazon="si"]'));
    comprobar('la lista de salidas nombra Amazon', privacidad?.innerText.includes('→ Amazon, Google Books y Open Library'));
  },
  // Corre en Node, después de cerrar Broots: web.cjs se reemplaza por uno que anota si alguien busca en
  // Amazon, y sin herramientas de Calibre la búsqueda termina ahí (no sale nada a internet).
  async verificar() {
    const web = require.resolve('../../electron/web.cjs');
    const llamadas = [];
    require.cache[web] = {
      id: web,
      filename: web,
      loaded: true,
      exports: {
        buscarEnAmazon: async () => (llamadas.push('amazon'), { ok: false }),
        descargarPortada: async () => null,
      },
    };
    const calibre = require('../../electron/calibre.cjs');
    calibre.herramienta = () => null;
    const metadatos = require('../../electron/metadatos.cjs');
    const libro = { id: 1, title: 'Prueba', authors: [], identifiers: { isbn: '9780000000000' } };

    await metadatos.buscar(libro, os.tmpdir());
    const sinPedirlo = llamadas.length;
    await metadatos.buscar(libro, os.tmpdir(), { amazon: false });
    const apagado = llamadas.length;
    await metadatos.buscar(libro, os.tmpdir(), { amazon: true });
    return [
      { nombre: 'la búsqueda de datos no consulta Amazon si no se lo pide', ok: sinPedirlo === 0 && apagado === 0, detalle: `consultas: ${apagado}` },
      { nombre: 'con Amazon prendido, lo consulta', ok: llamadas.length === 1 },
    ];
  },
};
