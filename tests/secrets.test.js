import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}

describe('sin credenciales en el repositorio', () => {
  it('.env.example solo tiene marcadores y ningun nombre de contrasena', () => {
    const txt = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    expect(txt).not.toMatch(/VITE_[A-Z_]*(PASSWORD|SECRET|TOKEN)/);
    const valores = txt.split('\n').filter((l) => /^VITE_/.test(l)).map((l) => l.split('=')[1]);
    expect(valores.every((v) => v.startsWith('REEMPLAZAR'))).toBe(true);
  });
  it('el codigo fuente no compara ni guarda contrasenas', () => {
    const src = archivos(new URL('../src', import.meta.url).pathname).filter((f) => f.endsWith('.js'));
    for (const f of src) {
      const txt = readFileSync(f, 'utf8');
      expect(txt, f).not.toMatch(/localStorage|sessionStorage/);
      expect(txt, f).not.toMatch(/innerHTML/);
      expect(txt, f).not.toMatch(/console\.\w+\([^)]*password/i);
    }
  });
});
