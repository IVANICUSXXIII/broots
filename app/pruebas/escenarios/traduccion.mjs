// La traducción (simulada) se aplica a lo visible y se adelanta; volver atrás queda traducido.
export default {
  descripcion: 'Traduce un libro en inglés (Gemini simulado)',
  necesita: { ingles: 1 },
  entorno: { BROOTS_TRADUCCION_FALSA: '1' },
  async prueba({ PRUEBA, hasta, comprobar, boton, tecla, esperar }) {
    if (!PRUEBA.libros.ingles.length) return comprobar('hay un EPUB en inglés en la biblioteca', false, 'no encontré ninguno');
    document.querySelector(`[data-tarjeta="${PRUEBA.libros.ingles[0].id}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    boton(panel, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    // El recorte se mide en cada consulta: medido al abrir, podía tomar el lector a mitad de su animación.
    const visibles = () => {
      const recorte = texto.parentElement.getBoundingClientRect();
      return [...texto.querySelectorAll('[data-p]')].filter((el) => [...el.getClientRects()].some((r) => r.right > recorte.left + 5 && r.left < recorte.right - 5));
    };
    const enIngles = () => visibles().filter((el) => !el.innerText.startsWith('ES·'));
    // Avanzar hasta una página con texto
    for (let i = 0; i < 12 && visibles().length < 3; i++) {
      tecla('ArrowRight');
      await esperar(700);
    }
    const ok = await hasta(() => visibles().length && !enIngles().length, 15000);
    comprobar('lo visible queda traducido', ok, `${enIngles().length} párrafos sin traducir`);
    tecla('ArrowRight');
    await esperar(700);
    tecla('ArrowLeft');
    await esperar(1200);
    comprobar('al volver atrás sigue traducido', !enIngles().length, `${enIngles().length} párrafos sin traducir`);
    const parrafo = visibles()[0];
    parrafo.click();
    await esperar(800); // desde la 1.8 el clic espera un instante, por si es un doble clic para elegir una palabra
    comprobar('tocar un párrafo muestra el original', !parrafo.innerText.startsWith('ES·'));
  },
};
