// Mapa vectorial de OpenFreeMap (gratis, sin clave) con caché propia para que funcione sin internet.
// Todas las peticiones del mapa pasan por el protocolo "ofm://", que se resuelve en el hilo principal
// y guarda cada pieza (estilo, teselas, fuentes, iconos) en Cache Storage.
import maplibregl from 'maplibre-gl';
import { MAP_STYLE } from '../config.js';

const CACHE = 'mapa-vector-v1';
const PROTO = 'ofm';
let registered = false;

const toHttps = u => u.replace(/^ofm:\/\//, 'https://');
const toProto = u => u.replace(/^https:\/\//, `${PROTO}://`);
const isVolatile = u => /\/styles\/|\/planet$/.test(u); // estilo y TileJSON cambian cada semana

export async function cachedFetch(url, { prefer = 'cache' } = {}) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* sin Cache Storage */ }
  const fromCache = async () => (cache ? cache.match(url) : null);
  const fromNet = async () => {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok && cache) { try { await cache.put(url, res.clone()); } catch { /* cuota */ } }
    return res;
  };
  if (prefer === 'network' || isVolatile(url)) {
    try { const r = await fromNet(); if (r.ok) return r; } catch { /* sin red */ }
    const c = await fromCache();
    if (c) return c;
    throw new Error('sin-mapa');
  }
  const c = await fromCache();
  if (c) return c;
  return fromNet();
}

export function registerMapProtocol() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(PROTO, async (params) => {
    const res = await cachedFetch(toHttps(params.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (params.type === 'json') return { data: await res.json() };
    if (params.type === 'string') return { data: await res.text() };
    return { data: await res.arrayBuffer() };
  });
}

// Descarga el estilo y lo reescribe para que todo pase por la caché
let styleMemo = null;
export async function loadStyle() {
  if (styleMemo) return styleMemo;
  registerMapProtocol();
  const res = await cachedFetch(MAP_STYLE, { prefer: 'network' });
  const st = await res.json();
  for (const src of Object.values(st.sources || {})) {
    if (src.url) src.url = toProto(src.url);
    if (src.tiles) src.tiles = src.tiles.map(toProto);
  }
  if (st.glyphs) st.glyphs = toProto(st.glyphs);
  if (typeof st.sprite === 'string') st.sprite = toProto(st.sprite);
  else if (Array.isArray(st.sprite)) st.sprite = st.sprite.map(s => ({ ...s, url: toProto(s.url) }));
  styleMemo = st;
  return st;
}

export function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// Lista de piezas a guardar para ver el mapa sin conexión en estas zonas
export async function offlineUrls(boxes) {
  const res = await cachedFetch(MAP_STYLE, { prefer: 'network' });
  const st = await res.json();
  const vec = Object.values(st.sources).find(s => s.type === 'vector' && s.url);
  const tj = await (await cachedFetch(vec.url, { prefer: 'network' })).json();
  const tpl = tj.tiles[0];
  const urls = new Set([MAP_STYLE, vec.url]);
  const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
  const lat2y = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
  for (const b of boxes) {
    for (let z = 9; z <= 14; z++) {
      for (let x = lon2x(b.w, z); x <= lon2x(b.e, z); x++)
        for (let y = lat2y(b.n, z); y <= lat2y(b.s, z); y++) urls.add(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    }
  }
  // Relieve de fondo a escala de Europa
  const ras = Object.values(st.sources).find(s => s.type === 'raster' && s.tiles);
  if (ras) for (let z = 0; z <= 5; z++) {
    const eu = { w: -10, e: 20, n: 56, s: 36 };
    for (let x = lon2x(eu.w, z); x <= lon2x(eu.e, z); x++)
      for (let y = lat2y(eu.n, z); y <= lat2y(eu.s, z); y++) urls.add(ras.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y));
  }
  const fonts = new Set();
  for (const l of st.layers) { const f = l.layout && l.layout['text-font']; if (Array.isArray(f) && typeof f[0] === 'string') fonts.add(f.join(',')); }
  for (const f of fonts) for (const r of ['0-255', '256-511', '8192-8447']) urls.add(st.glyphs.replace('{fontstack}', f).replace('{range}', r));
  const sprite = typeof st.sprite === 'string' ? st.sprite : null;
  if (sprite) for (const s of ['.json', '.png', '@2x.json', '@2x.png']) urls.add(sprite + s);
  return [...urls];
}
