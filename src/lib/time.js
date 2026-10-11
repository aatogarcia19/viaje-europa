// Horas como minutos desde la medianoche del día. Pueden pasar de 1440 (después de medianoche).
export const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function toMin(s) {
  if (s == null || s === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function fmt(min) {
  if (min == null || Number.isNaN(min)) return '';
  const m = Math.round(min);
  const h = Math.floor(m / 60) % 24;
  const mm = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function dateObj(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function dow(iso) { return dateObj(iso).getDay(); }
export function fmtDate(iso, long = false) {
  const d = dateObj(iso);
  return long ? `${DOW[d.getDay()]} ${d.getDate()} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getMonth()]}`
    : `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function todayISO() {
  try { const sim = localStorage.getItem('ve.simDate'); if (sim) return sim; } catch { /* */ }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function nowMin() {
  try { const sim = localStorage.getItem('ve.simTime'); if (sim) return toMin(sim); } catch { /* */ }
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
export function daysBetween(a, b) { return Math.round((dateObj(b) - dateObj(a)) / 86400000); }

// Horarios: { d: '10:00-20:00', 0: '10:00-19:00', 2: null } → rangos del día de la semana
export function rangesFor(h, weekday) {
  if (!h) return undefined; // sin horario: siempre abierto (exterior)
  const v = Object.prototype.hasOwnProperty.call(h, weekday) ? h[weekday] : h.d;
  if (v === null || v === undefined) return null; // cerrado
  return String(v).split(',').map(r => {
    const [a, b] = r.trim().split('-');
    let s = toMin(a), e = toMin(b);
    if (e <= s) e += 1440;
    return [s, e];
  });
}
export function hoursText(h, weekday) {
  const r = rangesFor(h, weekday);
  if (r === undefined) return 'Abierto siempre';
  if (r === null) return 'Cerrado';
  return r.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(' y ');
}

// Atardecer aproximado (algoritmo NOAA simplificado). Devuelve minutos en horario de verano europeo (UTC+2).
export function sunset(lat, lng, iso, utcOffset = 2) {
  const d = dateObj(iso);
  const start = new Date(d.getFullYear(), 0, 0);
  const N = Math.floor((d - start) / 86400000);
  const rad = Math.PI / 180;
  const lngHour = lng / 15;
  const t = N + ((18 - lngHour) / 24);
  const M = (0.9856 * t) - 3.289;
  let L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = ((RA % 360) + 360) % 360;
  RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / rad / 15;
  const T = H + RA - (0.06571 * t) - 6.622;
  let UT = ((T - lngHour) % 24 + 24) % 24;
  return Math.round((UT + utcOffset) * 60) % 1440;
}
