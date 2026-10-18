// 1.7 «Hábito de lectura»: sesión con meta, descanso para la vista, «te quedan», modo enfoque, el paso
// automático a «Leyendo» y la pantalla «Mi lectura» (racha, mapa, últimas sesiones y la guía de «En pausa»).
// Con BROOTS_MINUTO_PRUEBA un minuto del reloj dura 2 segundos: la meta de 15 minutos llega a los 30 s.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MINUTO = 2000;
const dia = (atras) => {
  const d = new Date();
  d.setDate(d.getDate() - atras);
  d.setHours(21, 0, 0, 0);
  return d.toISOString();
};

export default {
  descripcion: 'Sesión de lectura, descanso, enfoque, «te quedan» y «Mi lectura»',
  necesita: { epub: 1 },
  entorno: { BROOTS_MINUTO_PRUEBA: String(MINUTO) },
  // Sesiones de «otra PC» de ayer, anteayer y hace 5 días: con la de hoy, la racha da 3.
  config: ({ BIBLIOTECA }) => {
    const carpeta = path.join(BIBLIOTECA, '.broots', 'habito');
    fs.mkdirSync(carpeta, { recursive: true });
    const sesiones = [5, 2, 1].map((atras) => ({
      id: `previa-${atras}`, uuid: 'libro-de-otra-pc', titulo: 'Libro de otra PC', lectura: 1, inicio: dia(atras), fin: dia(atras),
      minutos: 25, paginas: 20, paginasLibro: 300, desde: 0, hasta: 0.07,
    }));
    fs.writeFileSync(path.join(carpeta, 'sesiones-2000-01-otrapc.json'), JSON.stringify({ sesiones }));
    return {};
  },
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    const id = PRUEBA.libros.epub[0].id;
    document.querySelector(`[data-tarjeta="${id}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);

    // El libro arranca «Por leer» (o sin estado): a los 5 minutos de lectura tiene que pasar a «Leyendo».
    const chip = (texto) => [...panel.querySelectorAll('button')].find((b) => b.innerText.trim() === texto);
    const porLeer = chip('Por leer');
    if (porLeer && !porLeer.className.includes('bg-verde')) {
      porLeer.click();
      await hasta(() => chip('Por leer')?.className.includes('bg-verde'), 30000);
    }
    boton(panel, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    comprobar('el lector abre el libro', texto);
    const lector = texto.closest('.fixed');
    await hasta(() => !/de (~|…)/.test(lector.querySelector('footer').innerText), 60000);

    // Sesión: modo «Minutos» con meta de 15.
    lector.querySelector('[data-sesion]').click();
    const panelSesion = await hasta(() => lector.querySelector('[data-panel-sesion]'));
    boton(panelSesion, 'Minutos').click();
    await hasta(() => boton(panelSesion, '15'));
    boton(panelSesion, '15').click();
    comprobar('elige el modo por minutos', lector.querySelector('[data-sesion]').dataset.sesion === 'minutos');
    // El clic afuera cierra el panel sin pasar de página, y Esc lo cierra sin cerrar el libro.
    const pagina = () => lector.querySelector('footer input')?.value;
    const antes = pagina();
    lector.querySelector('[data-velo-sesion]').click();
    await esperar(500);
    comprobar('el clic afuera cierra el panel sin pasar de página', !lector.querySelector('[data-panel-sesion]') && pagina() === antes, `${antes} → ${pagina()}`);
    lector.querySelector('[data-sesion]').click();
    await hasta(() => lector.querySelector('[data-panel-sesion]'));
    tecla('Escape');
    await esperar(500);
    comprobar('Esc cierra el panel y deja el libro abierto', !lector.querySelector('[data-panel-sesion]') && document.body.contains(lector));

    // Lectura simulada: una página cada segundo y medio durante ~46 «minutos de prueba» (≈ 46 s).
    const vistos = new Set();
    let quedan = null;
    const inicio = Date.now();
    while (Date.now() - inicio < 46000) {
      tecla('ArrowRight');
      await esperar(1500);
      const aviso = lector.querySelector('[data-aviso-sesion]')?.dataset.avisoSesion;
      if (aviso) vistos.add(aviso);
      quedan ??= lector.querySelector('[data-quedan]')?.innerText;
    }
    comprobar('avisa la meta al pasar de página', vistos.has('meta'), [...vistos].join(', '));
    comprobar('avisa el descanso para la vista', vistos.has('descanso'), [...vistos].join(', '));
    comprobar('pasa el libro a «Leyendo» solo', vistos.has('leyendo'), [...vistos].join(', '));
    comprobar('muestra «te quedan» según el ritmo', /para el libro/.test(quedan ?? ''), quedan);
    comprobar('el botón muestra el avance de la meta', /15 min/.test(lector.querySelector('[data-sesion]').innerText), lector.querySelector('[data-sesion]').innerText);

    // Modo enfoque: F esconde las barras; Esc sale del enfoque sin cerrar el libro.
    tecla('f');
    await esperar(400);
    // La ventana de prueba es real: si el puntero del mouse quedó arriba, la barra se asoma (como debe). Se lo lleva
    // al medio del texto con eventos simulados antes de mirar.
    const cabecera = lector.querySelector('header');
    cabecera.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: texto }));
    lector.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 600, clientY: Math.round(window.innerHeight / 2) }));
    await esperar(400);
    comprobar('F activa el modo enfoque', lector.dataset.enfoque === 'si' && cabecera.className.includes('opacity-0'), cabecera.className.slice(-90));
    lector.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 600, clientY: 10 }));
    await esperar(400);
    comprobar('con el mouse arriba, la barra se asoma', !cabecera.className.includes('opacity-0'));
    tecla('Escape');
    await esperar(400);
    comprobar('Esc sale del enfoque sin cerrar el libro', lector.dataset.enfoque === 'no' && document.body.contains(lector));

    tecla('Escape'); // cierra el libro (y guarda la sesión)
    await hasta(() => !document.body.contains(lector), 5000);
    await esperar(1500);

    // «Mi lectura»
    document.querySelector('[data-boton-mi-lectura]').click();
    const pantalla = await hasta(() => document.querySelector('[data-mi-lectura] [data-racha]') && document.querySelector('[data-mi-lectura]'));
    comprobar('«Mi lectura» abre con estadísticas', pantalla);
    comprobar('racha de 3 días (con sesiones de otra PC)', pantalla?.querySelector('[data-racha]')?.dataset.racha === '3', pantalla?.querySelector('[data-racha]')?.dataset.racha);
    const hoy = new Date();
    const clave = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const celda = pantalla?.querySelector(`[data-dia="${clave}"]`);
    comprobar('el mapa de calor pinta hoy', Number(celda?.dataset.minutos) >= 15, celda?.dataset.minutos);
    comprobar('lista las últimas sesiones', pantalla?.querySelectorAll('[data-ultimas] > div').length >= 4);
    comprobar('el libro aparece en «Leyendo ahora»', pantalla?.querySelector(`[data-en-curso="${id}"]`));
    comprobar('ofrece la guía para agregar «En pausa»', pantalla?.querySelector('[data-tarjeta-estados="pausa"]'));
    tecla('Escape');
    await esperar(500);

    // Panel del libro: «Tu lectura».
    const tuLectura = await hasta(() => document.querySelector('[data-tu-lectura]'));
    comprobar('el panel muestra «Tu lectura»', /sesi/.test(tuLectura?.innerText ?? ''), tuLectura?.innerText);
  },
  verificar({ BIBLIOTECA }) {
    const resultados = [];
    const carpeta = path.join(BIBLIOTECA, '.broots', 'habito');
    const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((n) => n.startsWith('sesiones-') && !n.includes('otrapc')) : [];
    const sesiones = archivos.flatMap((n) => JSON.parse(fs.readFileSync(path.join(carpeta, n), 'utf8')).sesiones);
    const s = sesiones[0];
    resultados.push({ nombre: 'guardó la sesión en .broots/habito (un archivo por mes y por PC)', ok: archivos.length === 1 && sesiones.length === 1, detalle: archivos.join(', ') });
    resultados.push({ nombre: 'la sesión tiene minutos, páginas y avance', ok: s?.minutos >= 15 && s?.paginas >= 20 && s?.hasta > s?.desde && s?.paginasLibro > 0, detalle: JSON.stringify(s ?? {}).slice(0, 200) });
    const lecturas = JSON.parse(fs.readFileSync(path.join(carpeta, 'lecturas.json'), 'utf8'));
    resultados.push({ nombre: 'anotó la primera vuelta del libro', ok: lecturas[s?.uuid]?.[0]?.n === 1 });

    // El estado se cambió con calibredb en la copia de prueba.
    const db = new DatabaseSync(path.join(BIBLIOTECA, 'metadata.db'), { readOnly: true });
    const columna = db.prepare("SELECT id FROM custom_columns WHERE label = 'read_progress'").get();
    const libro = db.prepare('SELECT id FROM books WHERE uuid = ?').get(s?.uuid ?? '');
    const valor = columna && libro
      ? db.prepare(`SELECT v.value FROM books_custom_column_${columna.id}_link l JOIN custom_column_${columna.id} v ON v.id = l.value WHERE l.book = ?`).get(libro.id)?.value
      : null;
    db.close();
    resultados.push({ nombre: 'el libro quedó «Leyendo» en Calibre', ok: valor === 'Leyendo', detalle: valor });
    return resultados;
  },
};
