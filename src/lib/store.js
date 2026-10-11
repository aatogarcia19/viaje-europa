// Almacén local primero: todo se guarda en el teléfono y se sincroniza con Supabase cuando hay internet.
import { useSyncExternalStore } from 'react';
import { SUPABASE_URL, SUPABASE_KEY, TRIP_ID } from '../config.js';

const LS = {
  ents: 've.ents.v1', pending: 've.pending.v1', sync: 've.lastSync.v1',
  code: 've.code', me: 've.me'
};

const ents = new Map();
const pending = new Map();
const listeners = new Set();
let version = 0;
let lastSync = null;
let persistTimer = null;
let pushTimer = null;
export const status = { syncing: false, error: null, lastOk: null, online: typeof navigator !== 'undefined' ? navigator.onLine : true };

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* sin espacio o bloqueado */ } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* */ } }

(function load() {
  try { for (const e of JSON.parse(safeGet(LS.ents) || '[]')) ents.set(e.id, e); } catch { /* */ }
  try { for (const e of JSON.parse(safeGet(LS.pending) || '[]')) pending.set(e.id, e); } catch { /* */ }
  lastSync = safeGet(LS.sync);
})();

function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    safeSet(LS.ents, JSON.stringify([...ents.values()]));
    safeSet(LS.pending, JSON.stringify([...pending.values()]));
    if (lastSync) safeSet(LS.sync, lastSync);
  }, 250);
}

function emit() { version++; for (const l of listeners) l(); }
export function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }
export function useStore() { return useSyncExternalStore(subscribe, () => version); }

export const getCode = () => safeGet(LS.code);
export const setCode = c => { c ? safeSet(LS.code, c) : safeDel(LS.code); emit(); };
export const me = () => safeGet(LS.me) || '';
export const setMe = n => { safeSet(LS.me, n); emit(); };
export const pendingCount = () => pending.size;
export const hasData = () => ents.size > 0;

export function get(id) { const e = ents.get(id); return e && !e.deleted ? e.data : null; }
export function all(kind) {
  const out = [];
  for (const e of ents.values()) if (e.kind === kind && !e.deleted) out.push({ id: e.id, ...e.data });
  return out;
}
export function meta(id) { return ents.get(id) || null; }

export function put(id, kind, data) {
  const e = { id, kind, data, deleted: false, updated_at: new Date().toISOString(), updated_by: me() };
  ents.set(id, e);
  pending.set(id, e);
  persistSoon(); emit(); pushSoon();
}
export function update(id, fn) {
  const e = ents.get(id);
  if (!e) return;
  const data = structuredClone(e.data);
  const r = fn(data);
  put(id, e.kind, r === undefined ? data : r);
}
export function remove(id) {
  const e = ents.get(id);
  if (!e) return;
  const d = { ...e, deleted: true, updated_at: new Date().toISOString(), updated_by: me() };
  ents.set(id, d); pending.set(id, d);
  persistSoon(); emit(); pushSoon();
}
export function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function rpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(text || res.statusText);
    err.kind = text.includes('codigo_invalido') ? 'codigo' : 'servidor';
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

export async function checkCode(code) {
  try {
    await rpc('trip_pull', { p_trip: TRIP_ID, p_code: code, p_since: '2100-01-01T00:00:00Z' });
    return 'ok';
  } catch (e) {
    return e.kind === 'codigo' ? 'codigo' : 'red';
  }
}

function pushSoon() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => sync(), 1200);
}

let running = null;
export function sync(opts = {}) {
  if (running) { running.then(() => pending.size && pushSoon()); return running; }
  running = doSync(opts).finally(() => { running = null; });
  return running;
}

async function doSync({ full = false } = {}) {
  const code = getCode();
  if (!code) return;
  status.syncing = true; emit();
  try {
    if (pending.size) {
      const snapshot = new Map(pending);
      const items = [...snapshot.values()].map(e => ({ id: e.id, kind: e.kind, data: e.data, deleted: e.deleted }));
      for (let i = 0; i < items.length; i += 200) {
        await rpc('trip_push', { p_trip: TRIP_ID, p_code: code, p_items: items.slice(i, i + 200), p_who: me() || null });
      }
      for (const [id, e] of snapshot) if (pending.get(id) === e) pending.delete(id);
    }
    const since = full || !lastSync ? null : new Date(new Date(lastSync).getTime() - 120000).toISOString();
    const rows = await rpc('trip_pull', { p_trip: TRIP_ID, p_code: code, p_since: since });
    let max = lastSync ? new Date(lastSync).getTime() : 0;
    for (const r of rows || []) {
      const t = new Date(r.updated_at).getTime();
      if (t > max) max = t;
      if (pending.has(r.id)) continue;
      ents.set(r.id, r);
    }
    if (max) lastSync = new Date(max).toISOString();
    status.error = null;
    status.lastOk = new Date().toISOString();
  } catch (e) {
    status.error = e.kind === 'codigo' ? 'codigo' : 'red';
  } finally {
    status.syncing = false;
    persistSoon(); emit();
  }
}

export function startAutoSync() {
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine) sync(); };
  window.addEventListener('online', () => { status.online = true; emit(); sync(); });
  window.addEventListener('offline', () => { status.online = false; emit(); });
  document.addEventListener('visibilitychange', tick);
  setInterval(tick, 60000);
  sync({ full: !lastSync });
}

export function exportBackup() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), entities: [...ents.values()] }, null, 1);
}

export function resetLocal() {
  ents.clear(); pending.clear(); lastSync = null;
  safeDel(LS.ents); safeDel(LS.pending); safeDel(LS.sync);
  emit();
}
