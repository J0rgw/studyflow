import { defineConfig } from 'vitest/config';

// Configuracion de pruebas separada para no cargar Tailwind en los tests.
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
