// 1.11: abrir un PDF con pdf.js (el motor de Firefox). Se carga recién cuando hace falta: nadie paga su peso si no lee PDF.
// Se le entrega el archivo de a pedazos desde Electron (no carga el PDF entero), y lo que necesita aparte de su código
// (tipografías, tablas de caracteres) también.
//
// 1.14: cada página trae además su texto (modelo, ver lib/textoPdf.js) y una capa de texto invisible para seleccionar
// con el mouse (la de pdf.js, la misma de Firefox): cada palabra queda justo encima de la letra dibujada.
import { modeloDePagina } from './textoPdf.js';

let motor = null;
async function cargarMotor() {
  if (!motor) {
    const [pdfjs, hilo] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = hilo.default;
    motor = pdfjs;
  }
  return motor;
}

const CARPETAS = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' };
/** Lo pide pdf.js en vez de bajarlo de una dirección: con la app en el disco, no hay servidor del cual bajarlo. */
class RecursosDePdf {
  async fetch({ kind, filename }) {
    const datos = await window.lector.recursoPdf(CARPETAS[kind], filename);
    if (!datos) throw new Error(`Falta ${filename}`);
    return datos;
  }
}

// 1.14: cómo se gira la capa de texto de una página con /Rotate (las mismas cuentas que el visor de pdf.js).
const GIRO_DE_CAPA = { 90: 'rotate(90deg) translateY(-100%)', 180: 'rotate(180deg) translate(-100%, -100%)', 270: 'rotate(270deg) translateX(-100%)' };

const LADO_MAXIMO = 8192; // lo que un lienzo se banca sin problemas
const AREA_MAXIMA = 24_000_000;

/** Por qué no se pudo abrir: 'contrasena', 'drm' (protección de una tienda) o 'danado'. */
function motivo(error) {
  if (error?.name === 'PasswordException') return 'contrasena';
  if (/encryption/i.test(error?.message ?? '')) return 'drm';
  return 'danado';
}

/** Lista plana del índice del PDF: { titulo, pagina, nivel }. Las entradas que no llevan a una página se omiten. */
async function leerIndice(pdf) {
  const plano = [];
  const recorrer = async (items, nivel) => {
    for (const item of items ?? []) {
      try {
        const destino = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        const referencia = destino?.[0];
        const pagina = referencia == null ? null : typeof referencia === 'number' ? referencia : await pdf.getPageIndex(referencia);
        if (pagina != null && item.title?.trim()) plano.push({ titulo: item.title.trim(), pagina, nivel });
      } catch {}
      await recorrer(item.items, nivel + 1);
    }
  };
  await recorrer(await pdf.getOutline().catch(() => null), 0);
  return plano;
}

/**
 * Abre el PDF y devuelve lo que necesita el lector de páginas, o lanza un error con .motivo.
 * Un PDF con DRM de una tienda (por ejemplo Adobe) o con contraseña no se abre: pdf.js se niega y acá no se le insiste.
 */
export async function abrirPdf(libroId, largo) {
  const pdfjs = await cargarMotor();
  class Pedazos extends pdfjs.PDFDataRangeTransport {
    requestDataRange(inicio, fin) {
      window.lector.rangoPdf(libroId, inicio, fin).then(
        (datos) => this.onDataRange(inicio, new Uint8Array(datos)),
        () => this.onDataRange(inicio, new Uint8Array(0)),
      );
    }
  }
  const tarea = pdfjs.getDocument({
    range: new Pedazos(largo, null),
    length: largo,
    disableAutoFetch: true,
    disableStream: true,
    useWorkerFetch: false,
    BinaryDataFactory: RecursosDePdf,
    cMapUrl: 'pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'pdfjs/standard_fonts/',
    wasmUrl: 'pdfjs/wasm/',
  });
  let pdf;
  try {
    pdf = await tarea.promise;
  } catch (error) {
    tarea.destroy();
    const fallo = new Error(error?.message ?? 'PDF');
    fallo.motivo = motivo(error);
    throw fallo;
  }

  const total = pdf.numPages;
  const medirUna = async (n) => {
    const { width, height } = (await pdf.getPage(n + 1)).getViewport({ scale: 1 });
    return { ancho: width, alto: height };
  };

  // El texto de cada página se pide una sola vez (lo usan la capa, la traducción y el aviso de escaneado).
  const textos = new Map(); // página -> Promise<{ contenido, modelo }>
  const textoDe = (n) => {
    if (!textos.has(n)) {
      const promesa = pdf.getPage(n + 1).then(async (pagina) => {
        const contenido = await pagina.getTextContent();
        return { contenido, modelo: modeloDePagina(contenido.items), base: pagina.getViewport({ scale: 1 }) };
      });
      promesa.catch(() => textos.delete(n));
      textos.set(n, promesa);
    }
    return textos.get(n);
  };

  return {
    tipo: 'pdf',
    total,
    tamanoInicial: await medirUna(0),
    medir: medirUna,
    indice: () => leerIndice(pdf),
    /** Los números de página impresos en el libro («xii», «45»), si el PDF los trae; si no, null. */
    etiquetas: () => pdf.getPageLabels().catch(() => null),
    /** El texto de una página (ver modeloDePagina en lib/textoPdf.js). */
    modelo: async (n) => (await textoDe(n)).modelo,
    /**
     * La capa de texto de una página, del tamaño de la página en puntos (se agranda con transform). Devuelve
     * { el, modelo, base: { ancho, alto } }. La arma pdf.js con su TextLayer.
     */
    async capa(n) {
      const { contenido, modelo, base } = await textoDe(n);
      const el = document.createElement('div');
      el.className = 'capa-texto';
      el.dataset.capaTexto = n;
      el.lang = contenido.lang ?? '';
      const capa = new pdfjs.TextLayer({ textContentSource: contenido, container: el, viewport: base });
      await capa.render();
      // TextLayer pone el tamaño con variables de su visor; acá la capa mide la página en puntos y crece con transform.
      // Una página girada (/Rotate) se arma derecha y se gira con GIRO_DE_CAPA, como en el visor de pdf.js.
      const { pageWidth, pageHeight } = base.rawDims;
      el.style.width = `${pageWidth}px`;
      el.style.height = `${pageHeight}px`;
      // Mientras se arrastra para seleccionar, esto tapa los huecos: así la selección no salta a cualquier lado.
      const fin = document.createElement('div');
      fin.className = 'fin-de-capa';
      el.append(fin);
      return { el, modelo, base: { ancho: base.width, alto: base.height, giro: GIRO_DE_CAPA[base.rotation] ?? '' } };
    },
    /** Dibuja una página en un lienzo nuevo, de ese ancho en píxeles. */
    hoja(n, anchoPixeles) {
      let cancelada = false;
      let render = null;
      const promesa = (async () => {
        const pagina = await pdf.getPage(n + 1);
        const base = pagina.getViewport({ scale: 1 });
        const escala = Math.min(anchoPixeles / base.width, LADO_MAXIMO / Math.max(base.width, base.height), Math.sqrt(AREA_MAXIMA / (base.width * base.height)));
        const viewport = pagina.getViewport({ scale: escala });
        if (cancelada) return null;
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.max(1, Math.floor(viewport.width));
        lienzo.height = Math.max(1, Math.floor(viewport.height));
        render = pagina.render({ canvas: lienzo, viewport });
        await render.promise;
        return lienzo;
      })();
      return {
        promesa,
        cancelar() {
          cancelada = true;
          render?.cancel();
        },
      };
    },
    cerrar: () => tarea.destroy(),
  };
}

/** Lo mismo para un cómic, cuyas páginas son imágenes que sirve Electron. */
export function abrirComicEnLector(libroId, { tamanos, version }) {
  return {
    tipo: 'comic',
    total: tamanos.length,
    hoja(n) {
      const imagen = new Image();
      imagen.draggable = false;
      imagen.alt = '';
      imagen.src = `libro://comic/${libroId}/${n}?v=${version}`;
      return { promesa: imagen.decode().then(() => imagen), cancelar() {} };
    },
    cerrar() {},
  };
}
