// Fechas siempre como cadenas ISO locales YYYY-MM-DD en zona Europe/Madrid.

const ZONA = 'Europe/Madrid';

/** Fecha y hora actuales de Madrid: { fecha: 'YYYY-MM-DD', hora: 'HH:MM' }. */
export function ahoraMadrid(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function toISO(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function utc(iso) {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Dias entre dos fechas ISO (b - a). */
export function diasEntre(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

export function formatoLargo(iso) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(utc(iso));
}

export function nombreMes(y, m) {
  const t = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function sumarMeses(y, m, n) {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Cuadricula del mes: semanas de 7 celdas, lunes primero. */
export function cuadriculaMes(y, m) {
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const offset = (primero.getUTCDay() + 6) % 7;
  const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((offset + diasMes) / 7) * 7;
  const semanas = [];
  for (let i = 0; i < total; i += 7) {
    semanas.push(Array.from({ length: 7 }, (_, j) => {
      const f = new Date(Date.UTC(y, m - 1, 1 - offset + i + j));
      return {
        iso: toISO(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()),
        dia: f.getUTCDate(),
        delMes: f.getUTCMonth() === m - 1,
      };
    }));
  }
  return semanas;
}

export function formatoMinutos(min) {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
