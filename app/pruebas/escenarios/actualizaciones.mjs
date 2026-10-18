// Actualizaciones de Broots, sin internet: un servidor en esta PC hace de GitHub (BROOTS_ACTUALIZACIONES).
// Al abrir hay festejo (Broots venía de la 1.5.0). Con las automáticas apagadas no consulta nada; «Buscar ahora»
// baja la versión nueva, aparece el aviso y al cerrar Broots se instala (sin empaquetar, el instalador no se
// ejecuta: queda anotado en actualizaciones/simulado.json). En Node se prueba que una descarga adulterada se descarta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const APP = path.resolve(import.meta.dirname, '..', '..');
const PUERTO = 47391;
const NUEVA = '99.0.0';
const INSTALADOR = crypto.randomBytes(300 * 1024);
const huella = (datos) => crypto.createHash('sha256').update(datos).digest('hex');
const RUTA_API = '/repos/IVANICUSXXIII/broots/releases/latest';
const RUTA_ARCHIVO = `/IVANICUSXXIII/broots/releases/download/v${NUEVA}/Instalar-Broots-${NUEVA}.exe`;
const NOVEDADES = { es: ['Novedad de prueba'], en: ['Test news'], pt: ['Novidade de teste'] };

/** Un GitHub de mentira: la última versión y su instalador. digest: la huella que dice tener el instalador. */
function servidor(puerto, digest = huella(INSTALADOR)) {
  const pedidos = [];
  const base = `http://127.0.0.1:${puerto}`;
  const servidor = http.createServer((pedido, respuesta) => {
    pedidos.push(pedido.url);
    if (pedido.url === RUTA_API) {
      respuesta.setHeader('content-type', 'application/json');
      respuesta.end(
        JSON.stringify({
          tag_name: `v${NUEVA}`,
          body: `## Novedades\n\n- Novedad de prueba\n\n<!-- novedades ${JSON.stringify(NOVEDADES)} -->`,
          assets: [{ name: `Instalar-Broots-${NUEVA}.exe`, size: INSTALADOR.length, digest: `sha256:${digest}`, browser_download_url: `${base}${RUTA_ARCHIVO}` }],
        }),
      );
    } else if (pedido.url === RUTA_ARCHIVO) {
      respuesta.end(INSTALADOR);
    } else {
      respuesta.statusCode = 404;
      respuesta.end();
    }
  });
  servidor.listen(puerto, '127.0.0.1');
  return { servidor, pedidos, base };
}

let github = null;

export default {
  descripcion: 'Actualizaciones: festejo, buscar, aviso, instalar al cerrar (con un GitHub de mentira)',
  necesita: {},
  // Venía de la 1.5.0 y tiene las automáticas apagadas (así solo consulta al tocar «Buscar ahora»).
  config: () => ({ versionVista: '1.5.0', actualizarSola: false }),
  entorno: () => {
    github = servidor(PUERTO);
    return { BROOTS_ACTUALIZACIONES: github.base };
  },
  async prueba({ hasta, esperar, comprobar, boton }) {
    // (Esto corre dentro de la ventana: la versión nueva va escrita, es NUEVA.)
    const prefs = await window.preferencias.leer();

    // 1. El festejo de la versión recién instalada.
    const festejo = await hasta(() => document.querySelector('[data-actualizacion="festejo"]'), 8000);
    comprobar('al abrir la versión nueva hay festejo', festejo);
    comprobar('con la versión en el título', festejo?.innerText.includes(prefs.version), prefs.version);
    comprobar('con una frase', await hasta(() => festejo.querySelector('[data-frase]')?.innerText.trim().length > 20, 3000));
    comprobar('y lo que cambió en esta versión', festejo?.querySelector('[data-novedades] li'));
    await hasta(() => festejo.dataset.sonido !== 'esperando', 3000);
    comprobar('suena el matasuegras', festejo?.dataset.sonido === 'sono', festejo?.dataset.sonido);
    boton(festejo, '¡A leer!').click();
    comprobar('«¡A leer!» lo cierra', await hasta(() => !document.querySelector('[data-actualizacion]'), 3000));

    // 2. Configuración → Actualizaciones.
    boton(document.querySelector('header'), 'Configuración').click();
    const dialogo = await hasta(() => document.querySelector('[role="dialog"][aria-label="Configuración"]'), 5000);
    const abrirSeccion = async (id) => {
      dialogo.querySelector(`[data-seccion="${id}"]`).click();
      return hasta(() => document.querySelector(`[data-config-seccion="${id}"]`), 5000);
    };
    let seccion = await abrirSeccion('actualizaciones');
    await esperar(300);
    comprobar('muestra la versión instalada', seccion.innerText.includes(prefs.version));
    comprobar('respeta las automáticas apagadas', seccion.querySelector('[data-actualizar-sola="no"]'));

    // El confeti, con «Probar»: tiene que ir fluido (se mide cuántos cuadros por segundo dibuja).
    boton(seccion, 'Probar').click();
    comprobar('«Probar» tira confeti', await hasta(() => document.querySelector('[data-confeti]'), 2000));
    const cuadros = await new Promise((resolver) => {
      const tiempos = [];
      const contar = (ahora) => {
        tiempos.push(ahora);
        if (ahora - tiempos[0] < 1500) requestAnimationFrame(contar);
        else resolver(tiempos);
      };
      requestAnimationFrame(contar);
    });
    const fps = Math.round(((cuadros.length - 1) * 1000) / (cuadros.at(-1) - cuadros[0]));
    comprobar('el confeti va fluido', fps >= 40, `${fps} cuadros por segundo`);
    comprobar('el confeti se va solo', await hasta(() => !document.querySelector('[data-confeti]'), 5000));

    // Buscar ahora: baja la 99.0.0 del GitHub de mentira y aparece el aviso, por encima de Configuración.
    boton(seccion, 'Buscar ahora').click();
    const aviso = await hasta(() => document.querySelector('[data-actualizacion="lista"]'), 20000);
    comprobar('«Buscar ahora» baja la versión nueva y avisa', aviso, document.querySelector('[data-estado-actualizacion]')?.innerText);
    comprobar('el aviso dice qué versión', aviso?.innerText.includes(`La 99.0.0 ya está lista`));
    comprobar('con una frase', await hasta(() => aviso.querySelector('[data-frase]')?.innerText.trim().length > 20, 3000));
    comprobar('y las novedades en español', aviso?.querySelector('[data-novedades]')?.innerText.includes('Novedad de prueba'));
    boton(aviso, 'Más tarde').click();
    comprobar('«Más tarde» lo cierra', await hasta(() => !document.querySelector('[data-actualizacion]'), 3000));
    seccion = document.querySelector('[data-config-seccion="actualizaciones"]');
    comprobar('la sección dice que está lista', seccion?.innerText.includes(`La 99.0.0 está lista`), seccion?.innerText.replace(/\n/g, ' · ').slice(0, 200));
    comprobar('y ofrece reiniciar e instalar', boton(seccion, 'Reiniciar e instalar'));
    comprobar('el aviso no vuelve a aparecer', (await window.actualizaciones.estado()).avisada === true);

    // Prender las automáticas y apagar el sonido: se guardan.
    const [sola, sonido] = seccion.querySelectorAll('[role="switch"]');
    sola.click();
    sonido.click();
    await esperar(600);
    const guardadas = await window.preferencias.leer();
    comprobar('se guardan las preferencias', guardadas.actualizarSola === true && guardadas.festejarConSonido === false, JSON.stringify({ sola: guardadas.actualizarSola, sonido: guardadas.festejarConSonido }));

    // Privacidad: la consulta a GitHub figura en la lista de lo que sale de la PC.
    const privacidad = await abrirSeccion('privacidad');
    await esperar(300);
    comprobar('Privacidad nombra las actualizaciones', privacidad.innerText.includes('Actualizaciones de Broots') && privacidad.innerText.includes('→ GitHub'));

    // Las frases van al azar, sin repetirse hasta pasar por todas.
    const elegidas = [];
    for (let i = 0; i < 5; i++) elegidas.push(await window.actualizaciones.frase('prueba', 5));
    comprobar('las frases no se repiten hasta pasar por todas', [...new Set(elegidas)].length === 5 && elegidas.every((n) => n >= 0 && n < 5), elegidas.join(','));
  },
  // Corre en Node, después de cerrar Broots.
  async verificar({ DATOS }) {
    github.servidor.close();
    const resultados = [];
    const consultas = github.pedidos.filter((u) => u === RUTA_API).length;
    resultados.push({ nombre: 'con las automáticas apagadas solo consulta al tocar «Buscar ahora»', ok: consultas === 1, detalle: `${consultas} consultas` });

    // Al cerrar se "instaló" la versión bajada, con el instalador intacto.
    const carpeta = path.join(DATOS, 'actualizaciones');
    let simulado = null;
    try {
      simulado = JSON.parse(fs.readFileSync(path.join(carpeta, 'simulado.json'), 'utf8'));
    } catch {}
    resultados.push({ nombre: 'al cerrar Broots ejecuta el instalador sin preguntar', ok: simulado?.version === NUEVA && simulado.argumentos.join(' ') === '/S --updated', detalle: simulado ? simulado.argumentos.join(' ') : 'no se ejecutó' });
    resultados.push({ nombre: 'el instalador bajado es el publicado', ok: Boolean(simulado) && huella(fs.readFileSync(simulado.archivo)) === huella(INSTALADOR) });
    const config = JSON.parse(fs.readFileSync(path.join(DATOS, 'config.json'), 'utf8'));
    const { version } = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
    resultados.push({ nombre: 'recuerda que ya festejó esta versión', ok: config.versionVista === version, detalle: config.versionVista });

    // Una descarga que no coincide con la huella publicada se descarta.
    const adulterado = servidor(PUERTO + 1, huella(Buffer.from('otra cosa')));
    process.env.BROOTS_ACTUALIZACIONES = adulterado.base;
    const actualizaciones = require('../../electron/actualizaciones.cjs');
    const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'broots-act-'));
    actualizaciones.configurar({ carpeta: temporal, versionActual: '1.6.0', empaquetado: false });
    const r = await actualizaciones.buscar();
    adulterado.servidor.close();
    delete process.env.BROOTS_ACTUALIZACIONES; // que no les llegue a los escenarios que siguen
    const quedaron = fs.readdirSync(temporal).filter((n) => n !== 'estado.json');
    resultados.push({ nombre: 'descarta una descarga que no coincide con la publicada', ok: !r.ok && /no coincide|doesn’t match|não confere/.test(r.mensaje) && !quedaron.length, detalle: r.mensaje });
    resultados.push({ nombre: 'y no queda nada para instalar', ok: actualizaciones.instalar() === false });
    fs.rmSync(temporal, { recursive: true, force: true });

    // Versiones y novedades.
    const { esMasNueva, leerNovedades } = actualizaciones;
    const casos = [['1.6.1', '1.6.0', true], ['1.10.0', '1.9.9', true], ['2.0.0', '1.99.99', true], ['1.6.0', '1.6.0', false], ['1.5.9', '1.6.0', false], ['basura', '1.0.0', false]];
    const mal = casos.filter(([a, b, esperado]) => esMasNueva(a, b) !== esperado).map(([a, b]) => `${a}>${b}`);
    resultados.push({ nombre: 'compara bien las versiones', ok: !mal.length, detalle: mal.join(', ') });
    resultados.push({
      nombre: 'lee las novedades escondidas y tolera las rotas',
      ok: leerNovedades(`x <!-- novedades ${JSON.stringify(NOVEDADES)} -->`)?.en[0] === 'Test news' && leerNovedades('<!-- novedades {rota -->') === null && leerNovedades('nada') === null,
    });

    // Cada versión tiene sus novedades en los tres idiomas, y la actual también.
    const novedades = JSON.parse(fs.readFileSync(path.join(APP, 'novedades.json'), 'utf8'));
    const incompletas = Object.entries(novedades).filter(([, n]) => ['es', 'en', 'pt'].some((i) => !n[i]?.length || n[i].length !== n.es.length)).map(([v]) => v);
    resultados.push({ nombre: 'novedades.json: cada versión en los tres idiomas', ok: !incompletas.length && Boolean(novedades[version]), detalle: incompletas.length ? incompletas.join(', ') : novedades[version] ? '' : `falta la ${version}` });
    return resultados;
  },
};
