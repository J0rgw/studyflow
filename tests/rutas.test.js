import { describe, it, expect } from 'vitest';
import { leerRuta } from '../src/app.js';

describe('rutas por hash', () => {
  it('destinos principales, datos, sesion y cierre del dia', () => {
    expect(leerRuta('#/progreso')).toEqual({ ruta: 'progreso', param: null });
    expect(leerRuta('#/datos')).toEqual({ ruta: 'datos', param: null });
    expect(leerRuta('#/sesion/alg-01')).toEqual({ ruta: 'sesion', param: 'alg-01' });
    expect(leerRuta('#/cierre/2026-10-17')).toEqual({ ruta: 'cierre', param: '2026-10-17' });
  });
  it('lo desconocido o mal formado vuelve a Hoy', () => {
    expect(leerRuta('#/cierre/2026-02-30')).toEqual({ ruta: 'hoy', param: null });
    expect(leerRuta('#/cierre/ayer')).toEqual({ ruta: 'hoy', param: null });
    expect(leerRuta('#/sesion/<script>')).toEqual({ ruta: 'hoy', param: null });
    expect(leerRuta('')).toEqual({ ruta: 'hoy', param: null });
  });
});
