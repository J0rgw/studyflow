import { defineConfig } from 'vitest/config';

// Pruebas de reglas contra el emulador de Firestore: npm run test:rules
export default defineConfig({
  test: { environment: 'node', include: ['tests-rules/**/*.test.js'], testTimeout: 20000, hookTimeout: 30000 },
});
