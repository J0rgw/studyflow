import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// base relativa ('./'): funciona en cualquier subruta de GitHub Pages sin
// conocer el nombre del repositorio. La navegacion usa hash (#/hoy), asi que
// no hay rutas de servidor que den 404 al recargar. VITE_BASE permite forzar
// otra base (por ejemplo '/studyflow/') si se necesita.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [tailwindcss()],
  build: { outDir: 'dist', sourcemap: false },
});
