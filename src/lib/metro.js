// Enrutador propio de metro con datos de OpenStreetMap (entidad "net-<ciudad>").
// Se usa en Madrid, donde el servicio de rutas no tiene el metro, y como respaldo en otras ciudades.
import { meta } from './store.js';
import { haversine, encodePolyline } from './geo.js';

const WALK_M_MIN = 75;     // 4,5 km/h
const DETOUR = 1.3;        // calle real vs línea recta
const MAX_ACCESS = 15;     // minutos máximos caminando a/desde la estación
const nets = new Map();
const memo = new Map();

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)/g, ' ').replace(/^(metro|estacion de|estacion)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const walkMin = (a, b) => haversine(a, b) * DETOUR / WALK_M_MIN;

function buildNet(data) {
  const stations = [];
  const find = (name, lat, lng) => {
    const key = norm(name);
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      if (s.key === key && haversine(s, { lat, lng }) < 700) return i;
    }
    stations.push({ name, key, lat, lng });
    return stations.length - 1;
  };
  const rels = (data.lines || []).filter(l => l.stops && l.stops.length > 1).map(l => {
    const seq = l.stops.map(([n, la, ln]) => find(n, la, ln));
    return { ref: l.ref, color: l.color || '#15233f', mode: l.mode || 'SUBWAY', to: l.to || stations[seq[seq.length - 1]].name, seq, circ: seq[0] === seq[seq.length - 1] };
  });
  const at = stations.map(() => []);
  rels.forEach((r, ri) => r.seq.forEach((s, k) => { if (!(r.circ && k === r.seq.length - 1)) at[s].push([ri, k]); }));
  const near = stations.map(() => []);
  for (let i = 0; i < stations.length; i++) for (let j = i + 1; j < stations.length; j++) {
    const d = haversine(stations[i], stations[j]);
    if (d < 350) { near[i].push([j, d]); near[j].push([i, d]); }
  }
  const offs = [];
  let total = 0;
  rels.forEach((r, ri) => { offs[ri] = total; total += r.seq.length; });
  return { stations, rels, at, near, offs, total, name: data.name || 'Metro' };
}

export function getNet(cityId) {
  const e = meta('net-' + cityId);
  if (!e || e.deleted || !e.data) return null;
  const c = nets.get(cityId);
  if (c && c.at === e.updated_at) return c.net;
  const net = buildNet(e.data);
  nets.set(cityId, { at: e.updated_at, net });
  return net;
}
export const hasNet = cityId => !!getNet(cityId);

// Montículo binario mínimo sencillo
class Heap {
  constructor() { this.a = []; }
  push(v, p) { const a = this.a; a.push([p, v]); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

function rideMin(a, b) { return Math.max(1.3, haversine(a, b) / 550 + 0.5); }

// Devuelve una opción con el mismo formato que las rutas de transporte calculadas en línea
export function metroRoute(cityId, from, to, minute) {
  const net = getNet(cityId);
  if (!net) return null;
  const m = ((minute % 1440) + 1440) % 1440;
  if (m >= 90 && m < 6 * 60 + 5) return null; // cerrado de 1:30 a 6:05
  const key = `${cityId}|${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}|${m >= 22 * 60 || m < 7 * 60 ? 'n' : 'd'}`;
  if (memo.has(key)) return memo.get(key);
  const res = route(net, from, to, m);
  memo.set(key, res);
  return res;
}

function route(net, from, to, m) {
  const { stations, rels, at, near, offs, total } = net;
  const night = m >= 22 * 60 || m < 7 * 60;
  const WAIT = night ? 7 : 4, TRANSFER = night ? 9 : 6;
  const destWalk = new Map();
  stations.forEach((s, i) => { const w = walkMin(s, to); if (w <= MAX_ACCESS) destWalk.set(i, w); });
  if (!destWalk.size) return null;
  const dist = new Float64Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);    // estado anterior (-2 = inicio)
  const how = new Uint8Array(total);              // 0 inicio, 1 viaje, 2 transbordo en estación, 3 transbordo caminando
  const sOf = (ri, k) => rels[ri].seq[k];
  const heap = new Heap();
  stations.forEach((s, i) => {
    const w = walkMin(from, s);
    if (w > MAX_ACCESS) return;
    for (const [ri, k] of at[i]) {
      const id = offs[ri] + k, c = w + WAIT;
      if (c < dist[id]) { dist[id] = c; prev[id] = -2; how[id] = 0; heap.push(id, c); }
    }
  });
  let best = Infinity, bestId = -1;
  const decode = id => { let ri = 0; while (ri + 1 < offs.length && offs[ri + 1] <= id) ri++; return [ri, id - offs[ri]]; };
  while (heap.size) {
    const [c, id] = heap.pop();
    if (c > dist[id] || c >= best) continue;
    const [ri, k] = decode(id);
    const r = rels[ri];
    const s = r.seq[k];
    if (how[id] === 1 && destWalk.has(s)) {
      const tot = c + destWalk.get(s);
      if (tot < best) { best = tot; bestId = id; }
    }
    // seguir en el mismo tren
    let nk = k + 1;
    if (nk >= r.seq.length) nk = r.circ ? 1 : -1;
    if (nk > 0) {
      const nid = offs[ri] + nk;
      const nc = c + rideMin(stations[s], stations[r.seq[nk]]);
      if (nc < dist[nid]) { dist[nid] = nc; prev[nid] = id; how[nid] = 1; heap.push(nid, nc); }
    }
    if (how[id] !== 1) continue; // solo se transborda después de viajar
    for (const [rj, kj] of at[s]) {
      if (rj === ri) continue;
      const nid = offs[rj] + kj, nc = c + TRANSFER;
      if (nc < dist[nid]) { dist[nid] = nc; prev[nid] = id; how[nid] = 2; heap.push(nid, nc); }
    }
    for (const [t, d] of near[s]) {
      for (const [rj, kj] of at[t]) {
        const nid = offs[rj] + kj, nc = c + TRANSFER + d * DETOUR / WALK_M_MIN;
        if (nc < dist[nid]) { dist[nid] = nc; prev[nid] = id; how[nid] = 3; heap.push(nid, nc); }
      }
    }
  }
  if (bestId < 0) return null;
  // reconstruir
  const path = [];
  for (let id = bestId; id >= 0; id = prev[id]) path.unshift(id);
  const legs = [];
  const first = decode(path[0]);
  const s0 = stations[sOf(...first)];
  const w0 = walkMin(from, s0);
  if (w0 >= 0.5) legs.push({ mode: 'WALK', min: Math.round(w0), m: Math.round(haversine(from, s0) * DETOUR), a: [from.lat, from.lng], b: [s0.lat, s0.lng], to: s0.name });
  let run = null;
  const flush = () => {
    if (!run) return;
    const r = rels[run.ri];
    const ids = run.stations;
    legs.push({
      mode: r.mode, line: r.ref, color: r.color, text: '#ffffff', head: r.to,
      from: stations[ids[0]].name, to: stations[ids[ids.length - 1]].name, stops: ids.length - 1, min: Math.round(run.min),
      g: encodePolyline(ids.map(i => [stations[i].lat, stations[i].lng])), agency: net.name, src: 'osm'
    });
    run = null;
  };
  let transfers = 0;
  for (let i = 0; i < path.length; i++) {
    const [ri, k] = decode(path[i]);
    const s = sOf(ri, k);
    const h = how[path[i]];
    if (i > 0 && h !== 1) {
      flush();
      transfers++;
      if (h === 3) {
        const [pri, pk] = decode(path[i - 1]);
        const ps = stations[sOf(pri, pk)];
        legs.push({ mode: 'WALK', min: Math.round(walkMin(ps, stations[s])), m: Math.round(haversine(ps, stations[s]) * DETOUR), a: [ps.lat, ps.lng], b: [stations[s].lat, stations[s].lng], to: stations[s].name, transfer: true });
      }
    }
    if (!run) run = { ri, stations: [s], min: 0 };
    else { run.min += rideMin(stations[run.stations[run.stations.length - 1]], stations[s]); run.stations.push(s); }
  }
  flush();
  const last = stations[sOf(...decode(bestId))];
  const w1 = walkMin(last, to);
  if (w1 >= 0.5) legs.push({ mode: 'WALK', min: Math.round(w1), m: Math.round(haversine(last, to) * DETOUR), a: [last.lat, last.lng], b: [to.lat, to.lng], to: null });
  const rides = legs.filter(l => l.mode !== 'WALK');
  if (!rides.length || rides.every(l => l.stops < 1)) return null;
  const walkLegs = legs.filter(l => l.mode === 'WALK');
  return {
    sig: rides.map(l => `${l.mode}:${l.line}`).join('>'),
    min: Math.round(best),
    walkMin: walkLegs.reduce((s, l) => s + l.min, 0),
    walkM: walkLegs.reduce((s, l) => s + l.m, 0),
    transfers,
    legs,
    src: 'osm'
  };
}
