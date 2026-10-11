// Rutas de transporte público por tramo: Transitous (gratis, datos abiertos de cada operador) + metro propio (OSM).
// Los resultados se guardan como entidades "route" para que los dos teléfonos los tengan sin internet.
import { useSyncExternalStore } from 'react';
import { get, put } from './store.js';
import { haversine, decodePolyline, encodePolyline, simplify, pathLength } from './geo.js';
import { dow } from './time.js';
import { metroRoute } from './metro.js';

export const TRANSITOUS_API = 'https://api.transitous.org/api/v6/plan';
export const TRANSITOUS_SOURCES = 'https://transitous.org/sources/';
const MODES = 'SUBWAY,TRAM,BUS,FERRY,SUBURBAN,REGIONAL_RAIL,FUNICULAR,AERIAL_LIFT';
export const MIN_PT_M = 600;       // por debajo de esto no se busca transporte
export const DEFAULT_WALK_MAX = 2000;
const WAIT_BUFFER = 3;             // minutos de margen para esperar el primer vehículo

export const MODE_NAME = {
  SUBWAY: 'Metro', TRAM: 'Tranvía', BUS: 'Bus', FERRY: 'Vaporetto', SUBURBAN: 'Tren urbano', REGIONAL_RAIL: 'Tren',
  FUNICULAR: 'Funicular', AERIAL_LIFT: 'Teleférico', WALK: 'A pie'
};
export const MODE_ICON = { SUBWAY: 'metro', TRAM: 'tram', BUS: 'bus', FERRY: 'vaporetto', SUBURBAN: 'train', REGIONAL_RAIL: 'train', FUNICULAR: 'train', AERIAL_LIFT: 'train', WALK: 'walk' };
export const MODE_COLOR = { SUBWAY: '#1f3c88', TRAM: '#b4236b', BUS: '#c2410c', FERRY: '#0f766e', SUBURBAN: '#5b21b6', REGIONAL_RAIL: '#334155', FUNICULAR: '#334155', AERIAL_LIFT: '#334155' };

export const period = min => { const m = ((min % 1440) + 1440) % 1440; return (m >= 21 * 60 + 30 || m < 6 * 60 + 30) ? 'n' : 'd'; };
export const transitKey = (a, b, per) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}|${per}`;
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
export const routeId = key => 'r-' + hash(key);

// ——— Estado de la cola (para "Calcular rutas" y el aviso de "buscando…") ———
const listeners = new Set();
let version = 0;
const pending = new Set();
const queue = [];
let running = false;
export const tstatus = { done: 0, failed: 0, offline: false, lastError: '' };
function emit() { version++; for (const l of listeners) l(); }
export function useTransit() { return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => version); }
export const queueSize = () => queue.length + (running ? 1 : 0);
export const isPending = key => pending.has(key);

// Hora de consulta: el mismo día de la semana del viaje, en las próximas semanas (los horarios de 2027 aún no existen)
function tzOffsetMin(date, tz = 'Europe/Paris') {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - date.getTime()) / 60000;
  } catch { return 120; }
}
export function refTime(dateISO, minute) {
  const target = dow(dateISO);
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 12);
  while (d.getDay() !== target) d.setDate(d.getDate() + 1);
  const m = ((minute % 1440) + 1440) % 1440;
  const guess = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60);
  return new Date(guess - tzOffsetMin(new Date(guess)) * 60000).toISOString();
}

const placeName = p => (!p || !p.name || p.name === 'START' || p.name === 'END') ? null : p.name;

// Convierte la respuesta de Transitous a opciones compactas
export function parsePlan(j) {
  const out = [];
  for (const it of j.itineraries || []) {
    const legs = [];
    for (const l of it.legs || []) {
      if (l.mode === 'WALK') {
        legs.push({ mode: 'WALK', min: Math.max(1, Math.round((l.duration || 0) / 60)), m: Math.round(l.distance || 0), a: [l.from.lat, l.from.lon], b: [l.to.lat, l.to.lon], to: placeName(l.to) });
        continue;
      }
      let pts = [];
      try { pts = l.legGeometry && l.legGeometry.points ? decodePolyline(l.legGeometry.points, l.legGeometry.precision || 6) : []; } catch { pts = []; }
      if (pts.length < 2) pts = [[l.from.lat, l.from.lon], [l.to.lat, l.to.lon]];
      const g = simplify(pts.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]));
      legs.push({
        mode: l.mode, line: l.displayName || l.routeShortName || '', color: l.routeColor ? '#' + l.routeColor : null, text: l.routeTextColor ? '#' + l.routeTextColor : null,
        head: l.headsign || '', from: placeName(l.from) || '', to: placeName(l.to) || '', stops: (l.intermediateStops || []).length + 1,
        min: Math.max(1, Math.round((l.duration || 0) / 60)), km: Math.round(pathLength(pts) / 100) / 10, agency: l.agencyName || '', g: encodePolyline(g)
      });
    }
    const rides = legs.filter(x => x.mode !== 'WALK');
    if (!rides.length) continue;
    const walks = legs.filter(x => x.mode === 'WALK');
    out.push({
      sig: rides.map(x => `${x.mode}:${x.line}`).join('>'),
      min: Math.round((it.duration || 0) / 60) + WAIT_BUFFER,
      walkMin: walks.reduce((s, x) => s + x.min, 0),
      walkM: walks.reduce((s, x) => s + x.m, 0),
      transfers: Math.max(0, rides.length - 1),
      legs,
      src: 'tt'
    });
  }
  return mergeOpts([], out);
}

export const optScore = o => o.min + 4 * o.transfers + o.walkMin * 0.15;
export function mergeOpts(a, b) {
  const by = new Map();
  for (const o of [...a, ...b]) {
    const cur = by.get(o.sig);
    if (!cur || o.min < cur.min) by.set(o.sig, o);
  }
  return [...by.values()].sort((x, y) => optScore(x) - optScore(y)).slice(0, 4);
}

// Opciones conocidas para un tramo (sin red): las guardadas + el metro propio
export function getTransit(a, b, minute, cityId) {
  const key = transitKey(a, b, period(minute));
  const e = get(routeId(key));
  let opts = [];
  let status = 'missing';
  if (e && e.key === key) { opts = e.opts || []; status = e.status || 'ok'; }
  else if (pending.has(key)) status = 'pending';
  if (cityId) {
    let m = null;
    try { m = metroRoute(cityId, a, b, minute); } catch (err) { console.warn('metro', err); }
    if (m) { opts = mergeOpts(opts, [m]); if (status !== 'ok') status = status === 'pending' ? 'pending' : 'ok-local'; }
  }
  return { key, status, opts };
}

const failed = new Set(); // errores temporales en esta sesión: no reintentar en bucle
export function requestTransit(a, b, minute, dateISO, { force = false } = {}) {
  const key = transitKey(a, b, period(minute));
  if (pending.has(key) || (!force && failed.has(key))) return;
  const e = get(routeId(key));
  if (e && e.key === key) return;
  if (haversine(a, b) < MIN_PT_M) return;
  pending.add(key);
  queue.push({ key, a, b, minute, dateISO });
  emit();
  work();
}

async function fetchPlan(job) {
  const params = new URLSearchParams({
    fromPlace: `${job.a.lat},${job.a.lng}`, toPlace: `${job.b.lat},${job.b.lng}`,
    time: refTime(job.dateISO, job.minute), numItineraries: '4', maxPreTransitTime: '1200', maxPostTransitTime: '1200',
    detailedTransfers: 'false', language: 'es', transitModes: MODES, maxTravelTime: '120'
  });
  const res = await fetch(`${TRANSITOUS_API}?${params}`);
  if (!res.ok) { const err = new Error('http ' + res.status); err.http = res.status; throw err; }
  return res.json();
}

async function work() {
  if (running) return;
  running = true;
  while (queue.length) {
    if (!navigator.onLine) { tstatus.offline = true; break; }
    const job = queue.shift();
    emit();
    try {
      const j = await fetchPlan(job);
      const opts = parsePlan(j);
      put(routeId(job.key), 'route', { key: job.key, at: new Date().toISOString(), status: opts.length ? 'ok' : 'none', opts });
      tstatus.done++;
      tstatus.offline = false;
    } catch (e) {
      tstatus.failed++;
      tstatus.lastError = e.http ? `El servicio respondió ${e.http}` : 'Sin conexión con el servicio de rutas';
      if (e.http && e.http >= 400 && e.http < 500 && e.http !== 429) {
        put(routeId(job.key), 'route', { key: job.key, at: new Date().toISOString(), status: 'none', opts: [] });
      } else failed.add(job.key);
      if (!e.http) { tstatus.offline = true; pending.delete(job.key); queue.forEach(q => pending.delete(q.key)); queue.length = 0; break; }
    } finally {
      pending.delete(job.key);
      emit();
    }
    await new Promise(r => setTimeout(r, 1100)); // uso ligero del servicio comunitario
  }
  running = false;
  emit();
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { tstatus.offline = false; emit(); });

export function retryFailed() { failed.clear(); tstatus.offline = false; tstatus.failed = 0; emit(); }

// ——— Elección del tramo ———
const LEGACY_AUTO = /^Más de 2 km/;
export function isAutoMove(move) {
  return !move || move.m === 'auto' || (move.txt && LEGACY_AUTO.test(move.txt));
}
export function bestOpt(opts) { return opts && opts.length ? opts[0] : null; }
export const estimatePT = meters => Math.round(12 + (meters / 1000) * 3.5);

/**
 * Decide cómo se hace un tramo.
 * w: { d, t, est } a pie; tr: { opts, status } transporte; walkMax en metros.
 * Devuelve { kind: 'walk'|'pt'|'pt-est'|'manual', opt, auto }
 */
export function resolveLeg(move, w, tr, walkMax = DEFAULT_WALK_MAX) {
  const walkMinutes = Math.max(1, Math.round(w.t / 60));
  const opts = (tr && tr.opts) || [];
  if (move && !isAutoMove(move)) {
    if (move.m === 'walk') return { kind: 'walk', auto: false };
    if (move.m === 'pt') {
      const opt = opts.find(o => o.sig === move.sig) || (move.opt && move.opt.sig === move.sig ? move.opt : null) || bestOpt(opts);
      if (opt) return { kind: 'pt', opt, auto: false };
      return { kind: 'pt-est', auto: false };
    }
    return { kind: 'manual', auto: false };
  }
  const best = bestOpt(opts);
  if (w.d <= walkMax) return { kind: 'walk', auto: true, suggest: best };
  if (best && best.min < walkMinutes) return { kind: 'pt', opt: best, auto: true };
  if (best) return { kind: 'walk', auto: true, suggest: best };
  if (tr && (tr.status === 'missing' || tr.status === 'pending')) return { kind: 'pt-est', auto: true };
  return { kind: 'walk', auto: true };
}

export function optTitle(o) {
  const rides = o.legs.filter(l => l.mode !== 'WALK');
  const modes = [...new Set(rides.map(l => MODE_NAME[l.mode] || l.mode))];
  return modes.join(' + ');
}
export function optIcon(o) {
  const r = o && o.legs.find(l => l.mode !== 'WALK');
  return r ? (MODE_ICON[r.mode] || 'metro') : 'walk';
}
