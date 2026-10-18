// Ayuda: se abre desde la barra y con F1, tiene índice y el buscador filtra y resalta.
export default {
  descripcion: 'Abre la Ayuda, recorre el índice y busca en el manual',
  necesita: {},
  async prueba({ hasta, esperar, comprobar, boton, escribir, tecla }) {
    const dialogo = () => document.querySelector('[role="dialog"][aria-label="Configuración"]');
    const ayuda = () => document.querySelector('[data-config-seccion="ayuda"] [data-ayuda]');
    const temas = () => [...ayuda().querySelectorAll('[data-tema]')].map((t) => t.dataset.tema);
    const campo = () => ayuda().querySelector('input[aria-label="Buscar en la ayuda"]');
    const buscar = async (texto) => {
      escribir(campo(), texto);
      await esperar(400);
    };

    boton(document.querySelector('header'), 'Ayuda (F1)').click();
    comprobar('el botón «?» abre la Ayuda', await hasta(() => dialogo() && ayuda(), 5000));
    await esperar(400);
    const todos = temas();
    comprobar('tiene todos los temas', todos.length >= 11, todos.join(', '));
    comprobar('el índice nombra cada tema', ayuda().querySelectorAll('[data-indice]').length === todos.length);
    comprobar('el buscador queda listo para escribir', document.activeElement === campo());
    const textos = ['Calibre', 'Ctrl+B', 'contraseña de aplicación', 'Gemini', 'Familia', 'duplicados'];
    const faltan = textos.filter((t) => !ayuda().innerText.includes(t));
    comprobar('cubre lo pedido', !faltan.length, faltan.length ? `falta: ${faltan.join(', ')}` : '');

    // El índice lleva a cada tema.
    const contenedor = ayuda().closest('.overflow-y-auto');
    ayuda().querySelector('[data-indice="preguntas"]').click();
    comprobar('el índice baja hasta el tema', await hasta(() => contenedor.scrollTop > 200, 3000), `scrollTop ${contenedor.scrollTop}`);

    // Buscar filtra y resalta (sin importar tildes ni mayúsculas).
    await buscar('GMAIL');
    let hallados = temas();
    comprobar('«gmail» encuentra Kindle y Preguntas', hallados.includes('kindle') && hallados.includes('preguntas'), hallados.join(', '));
    comprobar('«gmail» deja afuera lo que no tiene que ver', !hallados.includes('duplicados') && !hallados.includes('atajos'));
    comprobar('resalta lo buscado', ayuda().querySelectorAll('mark').length > 0);
    const preguntas = ayuda().querySelector('[data-tema="preguntas"]');
    comprobar('en Preguntas quedan solo las que coinciden', preguntas && !preguntas.innerText.includes('DRM'));
    await buscar('traduccion');
    comprobar('busca sin tildes', temas().includes('lector'), temas().join(', '));
    await buscar('papelera calibre');
    comprobar('con dos palabras pide las dos', temas().includes('duplicados') && !temas().includes('kindle'), temas().join(', '));
    await buscar('zzqqxx');
    comprobar('avisa si no encuentra nada', ayuda().querySelector('[data-sin-resultados]') && !temas().length);

    // Esc borra la búsqueda; con el buscador vacío, cierra.
    campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await esperar(300);
    comprobar('Esc borra la búsqueda', campo().value === '' && temas().length === todos.length);
    campo().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    comprobar('Esc cierra la Ayuda', await hasta(() => !dialogo(), 3000));

    // F1 la abre de nuevo.
    tecla('F1');
    comprobar('F1 abre la Ayuda', await hasta(() => dialogo() && ayuda(), 5000));
    tecla('Escape');
    await hasta(() => !dialogo(), 3000);
  },
};
