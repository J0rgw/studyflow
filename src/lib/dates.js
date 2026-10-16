// Fechas siempre como cadenas ISO locales YYYY-MM-DD en zona Europe/Madrid.

const ZONA = 'Europe/Madrid';

function partesMadrid(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
}

/** Fecha y hora actuales de Madrid: { fecha: 'YYYY-MM-DD', hora: 'HH:MM' }. */
export function ahoraMadrid(now = new Date()) {
  const p = partesMadrid(now);
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

// Diferencia (ms) entre la hora local de Madrid y UTC en el instante t.
function desfaseMadrid(t) {
  const p = partesMadrid(new Date(t));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** Instante (ms desde epoch) de una fecha y hora locales de Madrid; respeta el cambio CEST/CET. */
export function instanteMadrid(fecha, hora = '00:00') {
  const { y, m, d } = parseISO(fecha);
  const [hh, mm] = hora.split(':').map(Number);
  const local = Date.UTC(y, m - 1, d, hh, mm);
  // Segunda pasada: cerca del cambio de hora el desfase del instante real puede ser otro.
  return local - desfaseMadrid(local - desfaseMadrid(local));
}

/** Fraccion transcurrida de [inicio, fin] en el instante t, limitada a 0..1. */
export function fraccion(inicio, fin, t) {
  if (fin <= inicio) return 1;
  return Math.min(1, Math.max(0, (t - inicio) / (fin - inicio)));
}

/** Tiempo restante en dias, horas, minutos y segundos (nunca negativo). */
export function restante(ms) {
  const seg = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(seg / 86400), h: Math.floor((seg % 86400) / 3600), m: Math.floor((seg % 3600) / 60), s: seg % 60 };
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

/** «jue 15 oct» */
export function formatoCorto(iso) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(utc(iso)).replace(',', '');
}

/** «jueves 15 de octubre», sin año, para cabeceras. */
export function formatoMedio(iso) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(utc(iso)).replace(',', '');
}

/** Dia de la semana con lunes = 0. */
export function diaSemana(iso) {
  return (utc(iso).getUTCDay() + 6) % 7;
}

export function sumarDias(iso, n) {
  const f = utc(iso);
  f.setUTCDate(f.getUTCDate() + n);
  return toISO(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

/** Fechas ISO de inicio a fin, ambas incluidas. */
export function rangoFechas(inicio, fin) {
  const out = [];
  for (let d = inicio; d <= fin; d = sumarDias(d, 1)) out.push(d);
  return out;
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

/** Horas con un decimal y coma: 150 -> «2,5», 120 -> «2». */
export function horasDecimal(min) {
  return (Math.round(min / 6) / 10).toString().replace('.', ',');
}

export function formatoMinutos(min) {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
