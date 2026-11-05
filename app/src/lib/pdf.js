// 1.11: abrir un PDF con pdf.js (el motor de Firefox). Se carga recién cuando hace falta: nadie paga su peso si no lee PDF.
// Se le entrega el archivo de a pedazos desde Electron (no carga el PDF entero), y lo que necesita aparte de su código
// (tipografías, tablas de caracteres) también. Sin texto seleccionable todavía: subrayar y traducir PDF es otra etapa.
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

  return {
    tipo: 'pdf',
    total,
    tamanoInicial: await medirUna(0),
    medir: medirUna,
    indice: () => leerIndice(pdf),
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
