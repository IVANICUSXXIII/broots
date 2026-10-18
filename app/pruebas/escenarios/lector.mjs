// El lector abre un EPUB, pasa de página y salta a una página.
export default {
  descripcion: 'Abre un EPUB, pasa de página e «Ir a»',
  necesita: { epub: 1 },
  async prueba({ PRUEBA, hasta, comprobar, boton, escribir, tecla, esperar }) {
    document.querySelector(`[data-tarjeta="${PRUEBA.libros.epub[0].id}"] button`).click();
    const panel = await hasta(() => document.querySelector('.fixed.top-11'));
    await esperar(800);
    boton(panel, 'Leer').click();
    const texto = await hasta(() => document.querySelector('.texto-libro')?.childElementCount && document.querySelector('.texto-libro'));
    comprobar('el lector muestra el libro', texto);
    const lector = texto.closest('.fixed');
    const pagina = () => Number(lector.querySelector('footer input')?.value);
    const totalEnPie = () => Number(/de ~?(\d+)/.exec(lector.querySelector('footer').innerText)?.[1] ?? 0); // 0 mientras dice «de …»
    const total = await hasta(() => totalEnPie() > 2 && totalEnPie());
    comprobar('cuenta las páginas', total > 2, `${total} páginas`);
    const antes = pagina();
    tecla('ArrowRight');
    await esperar(900);
    tecla('ArrowRight');
    await esperar(900);
    comprobar('pasa de página con las flechas', pagina() > antes, `${antes} → ${pagina()}`);
    const destino = Math.max(3, Math.floor(total / 2));
    const entrada = lector.querySelector('footer input');
    entrada.focus();
    escribir(entrada, String(destino));
    await esperar(100);
    // Se pide apenas abierto, mientras todavía cuenta las páginas: tiene que esperar el conteo y llegar bien.
    entrada.form.requestSubmit();
    await hasta(() => !/de (~|…)/.test(lector.querySelector('footer').innerText), 60000);
    await esperar(2500);
    const esperado = Math.min(destino, totalEnPie());
    comprobar('«Ir a» lleva a la página pedida', Math.abs(pagina() - esperado) <= 2, `pedí ${destino}, quedó en ${pagina()} de ${totalEnPie()}`);
  },
};
