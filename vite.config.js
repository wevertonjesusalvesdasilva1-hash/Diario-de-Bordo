import { defineConfig } from 'vite';
// Bibliotecas grandes em arquivos separados: o código do app fica pequeno e o navegador guarda as bibliotecas em cache.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/xlsx')) return 'xlsx';
          if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs';
        },
      },
    },
  },
});
