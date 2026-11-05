import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 1.11: lo que pdf.js necesita aparte de su código (tipografías estándar, tablas de caracteres, decodificadores y su
// licencia) va a dist/pdfjs. Lo sirve electron/paginas.cjs. pdfjs-dist no se empaqueta entero: pesa 37 MB.
function recursosDePdf() {
  return {
    name: 'recursos-de-pdf',
    apply: 'build',
    closeBundle() {
      const origen = path.resolve(import.meta.dirname, 'node_modules/pdfjs-dist');
      const destino = path.resolve(import.meta.dirname, 'dist/pdfjs');
      for (const carpeta of ['cmaps', 'standard_fonts', 'wasm']) fs.cpSync(path.join(origen, carpeta), path.join(destino, carpeta), { recursive: true });
      fs.copyFileSync(path.join(origen, 'LICENSE'), path.join(destino, 'LICENSE'));
    },
  };
}

// base './' para que la app empaquetada cargue sus archivos desde el disco.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), recursosDePdf()],
  server: { port: 5199, strictPort: true },
});
