// Distancias, rutas a pie (OSRM de FOSSGIS, gratis) con caché local, optimización de orden y enlaces de mapas.
import { useSyncExternalStore } from 'react';
import { ROUTER_URL } from '../config.js';

export function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export const sameLoc = (a, b) => a && b && haversine(a, b) < 25;

// Estimación sin internet: la distancia real a pie suele ser ~1,3 veces la línea recta; 4,6 km/h.
export function estimateWalk(a, b) {
  const d = haversine(a, b) * 1.3;
  return { d, t: d / 1.28, est: true };
}

export function decodePolyline(str, precision = 5) {
  let index = 0, lat = 0, lng = 0;
  const coords = [], factor = 10 ** precision;
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

const RKEY = 've.routes.v1';
let routes = {};
try { routes = JSON.parse(localStorage.getItem(RKEY) || '{}'); } catch { routes = {}; }
const rListeners = new Set();
let rVersion = 0;
const queue = [];
const queued = new Set();
let working = false;
let saveTimer = null;
let failures = 0;

export const routeKey = (a, b) => `${a.lat.toFixed(5)},${a.lng.toFixed(5)};${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
export function useRoutes() {
  return useSyncExternalStore(l => { rListeners.add(l); return () => rListeners.delete(l); }, () => rVersion);
}
export function getRoute(a, b) {
  const r = routes[routeKey(a, b)];
  return r ? { d: r.d, t: r.t, g: r.g, est: false } : null;
}
export function walkInfo(a, b) {
  return getRoute(a, b) || estimateWalk(a, b);
}
export function requestRoute(a, b) {
  const k = routeKey(a, b);
  if (routes[k] || queued.has(k)) return;
  if (haversine(a, b) > 12000) return; // demasiado lejos para caminar
  queued.add(k);
  queue.push([k, a, b]);
  work();
}
async function work() {
  if (working || !navigator.onLine) return;
  working = true;
  while (queue.length) {
    const [k, a, b] = queue.shift();
    try {
      const url = `${ROUTER_URL}${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=polyline&steps=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      const r = j.routes && j.routes[0];
      if (r) {
        routes[k] = { d: Math.round(r.distance), t: Math.round(r.duration), g: r.geometry };
        rVersion++; for (const l of rListeners) l();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { try { localStorage.setItem(RKEY, JSON.stringify(routes)); } catch { /* */ } }, 800);
      }
      failures = 0;
    } catch {
      failures++;
      if (failures > 3) { queue.length = 0; queued.clear(); break; }
    } finally {
      queued.delete(k);
    }
    await new Promise(r => setTimeout(r, 350));
  }
  working = false;
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { failures = 0; });

// Mejor orden para una lista corta de paradas con inicio y final fijos (fuerza bruta hasta 8, si no vecino más cercano + 2-opt).
export function bestOrder(points, start, end) {
  const n = points.length;
  if (n < 2) return points.map((_, i) => i);
  const D = (p, q) => (p && q ? haversine(p, q) : 0);
  const cost = order => {
    let c = start ? D(start, points[order[0]]) : 0;
    for (let i = 0; i < order.length - 1; i++) c += D(points[order[i]], points[order[i + 1]]);
    if (end) c += D(points[order[order.length - 1]], end);
    return c;
  };
  let best = points.map((_, i) => i);
  let bestCost = cost(best);
  if (n <= 8) {
    const perm = (arr, l) => {
      if (l === arr.length) { const c = cost(arr); if (c < bestCost - 1) { bestCost = c; best = arr.slice(); } return; }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    };
    perm(best.slice(), 0);
    return best;
  }
  const left = new Set(best);
  const order = [];
  let cur = start || points[0];
  while (left.size) {
    let bi = -1, bd = Infinity;
    for (const i of left) { const d = D(cur, points[i]); if (d < bd) { bd = d; bi = i; } }
    order.push(bi); left.delete(bi); cur = points[bi];
  }
  let improved = true;
  let o = order;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const cand = [...o.slice(0, i), ...o.slice(i, j + 1).reverse(), ...o.slice(j + 1)];
      if (cost(cand) < cost(o) - 1) { o = cand; improved = true; }
    }
  }
  return o;
}

export function gmapsDir(dest, mode = 'walking') {
  const m = { walk: 'walking', walking: 'walking', metro: 'transit', bus: 'transit', tram: 'transit', train: 'transit', vaporetto: 'transit', transit: 'transit', taxi: 'driving' }[mode] || 'walking';
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=${m}`;
}
export function gmapsTransit(from, to) {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=transit`;
}
export function appleDir(dest, mode = 'walk') {
  const f = mode === 'walk' ? 'w' : (mode === 'taxi' ? 'd' : 'r');
  return `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=${f}`;
}
export function gmapsPlace(p) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=&center=${p.lat},${p.lng}`;
}

export async function geocode(q, near) {
  const params = new URLSearchParams({ format: 'json', limit: '6', q, 'accept-language': 'es' });
  if (near) params.set('viewbox', `${near.lng - 0.3},${near.lat + 0.2},${near.lng + 0.3},${near.lat - 0.2}`);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error('geocode');
  const j = await res.json();
  return j.map(r => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

// Tiles para guardar mapas sin conexión
export function tilesFor(bounds, zMin, zMax) {
  const out = [];
  const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
  const lat2y = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
  for (let z = zMin; z <= zMax; z++) {
    const x1 = lon2x(bounds.w, z), x2 = lon2x(bounds.e, z);
    const y1 = lat2y(bounds.n, z), y2 = lat2y(bounds.s, z);
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) out.push([z, x, y]);
  }
  return out;
}
