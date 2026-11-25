// Las voces de verdad: las baja de Hugging Face (unos 240 MB entre las tres), verifica su huella, las prepara y las
// hace hablar con el motor de verdad, en el proceso aparte. Sale a internet, por eso es «lento» y no corre con «todos»:
// correrlo cada vez que cambian voces.json, el motor (sherpa-onnx) o Electron. Ojo: %TEMP% llega con su nombre corto
// (8.3, sin el nombre de la cuenta), así que esta prueba no pasa por una ruta con tilde; eso se probó a mano
// (ver CLAUDE.md, Voz alta).
export default {
  descripcion: 'Escuchar con las voces de verdad, bajadas de Hugging Face (sale a internet)',
  lento: true,
  entorno: { BROOTS_VOCES: 'real' },
  async prueba({ comprobar }) {
    // Adentro de prueba(): corre en la ventana de Broots y no ve lo que está afuera.
    const TEXTOS = {
      es: 'Esa tarde, Martina cerró el libro y se quedó mirando por la ventana. ¿Vos también lo escuchaste?',
      en: 'That evening, Martha closed the book and stared out of the window. Did you hear it too?',
      pt: 'Naquela tarde, Marta fechou o livro e ficou olhando pela janela. Você também ouviu?',
    };
    for (const idioma of ['es', 'en', 'pt']) {
      const inicio = performance.now();
      const r = await window.lector.bajarVoz(idioma);
      comprobar(`baja, verifica y prepara la voz de ${idioma}`, r.ok, `${JSON.stringify(r)}, ${Math.round((performance.now() - inicio) / 1000)} s`);
      if (!r.ok) continue;
      for (const vez of ['la primera vez (carga la voz)', 'ya cargada']) {
        const t0 = performance.now();
        const audio = await window.lector.decir({ idioma, texto: TEXTOS[idioma], velocidad: 1, motor: 'local' });
        const ms = performance.now() - t0;
        const segundos = audio.ok ? audio.muestras.length / audio.tasa : 0;
        // Que suene algo (no silencio): el pico de la onda.
        let pico = 0;
        if (audio.ok) for (let i = 0; i < audio.muestras.length; i += 7) pico = Math.max(pico, Math.abs(audio.muestras[i]));
        comprobar(`${idioma}: habla, ${vez}`, audio.ok && segundos > 2 && segundos < 20 && pico > 0.05, audio.ok ? `${segundos.toFixed(1)} s de voz en ${(ms / 1000).toFixed(1)} s (${(segundos / (ms / 1000)).toFixed(1)}× tiempo real), pico ${pico.toFixed(2)}` : JSON.stringify(audio));
      }
    }
    const rapida = await window.lector.decir({ idioma: 'es', texto: 'Hola.', velocidad: 1.5, motor: 'local' });
    comprobar('a 1,5× también habla', rapida.ok && rapida.muestras.length > 1000, JSON.stringify({ ok: rapida.ok, motivo: rapida.motivo }));
  },
};
