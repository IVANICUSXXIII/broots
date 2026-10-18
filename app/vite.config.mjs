import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' para que la app empaquetada cargue sus archivos desde el disco.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true },
});
