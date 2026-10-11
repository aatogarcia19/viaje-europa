// "Armar el día por mí": elige y ordena lugares del catálogo para llenar el tiempo libre de cada día.
// Respeta traslados, alojamiento, entradas con hora fija, horarios de apertura y horas de comida del país,
// prefiere lo que queda cerca y al final ordena cada tramo para caminar lo menos posible.
import { get, all, newId } from './store.js';
import { buildSchedule } from './schedule.js';
import { haversine, bestOrder } from './geo.js';
import { toMin, fmt, dow, rangesFor } from './time.js';

export const PACE = {
  tranquilo: { label: 'Tranquilo', dur: 1.25, speed: 1.15, maxWalk: 1800 },
  normal: { label: 'Normal', dur: 1, speed: 1.28, maxWalk: 2200 },
  intenso: { label: 'A tope', dur: 0.8, speed: 1.38, maxWalk: 2800 }
};
// Ventana para EMPEZAR a comer (hora local del país)
const MEALS = {
  'España': { lunch: ['13:30', '14:45'], dinner: ['20:30', '22:00'] },
  'Italia': { lunch: ['12:30', '13:45'], dinner: ['19:30', '21:00'] },
  default: { lunch: ['12:00', '13:15'], dinner: ['19:00', '20:30'] }
};

export function isAnchor(it) {
  if (it.t === 'transfer' || it.t === 'lodging' || it.t === 'custom') return true;
  if (it.t === 'meal') return false;
  if (it.fixed) return true;
  if (it.t === 'place') { const p = get(it.p); if (!p || p.cat === 'transporte') return true; }
  return false;
}

function leg(a, b, pace) {
  if (!a || !b) return { min: 0, mode: 'walk', d: 0 };
  const d = haversine(a, b) * 1.3;
  if (d < 25) return { min: 0, mode: 'walk', d: 0 };
  if (d > pace.maxWalk) return { min: Math.round(15 + (d / 1000) * 3.5), mode: 'metro', d };
  return { min: Math.max(1, Math.round(d / pace.speed / 60)), mode: 'walk', d };
}

function valueOf(p, ctx) {
  let v = { 1: 100, 2: 40, 3: 12 }[p.pri || 3];
  if (p.audio) v += 4;
  if (p.price) v -= Math.min(20, p.price * 0.6);
  if (ctx.focus) { const d = haversine(ctx.focus, p) / 1500; v *= 1 / (1 + d * d); }
  if (ctx.zoneOf && ctx.zone != null) v *= ctx.zoneOf.get(p.id) === ctx.zone ? 1 : 0.3;
  return Math.max(2, v);
}

function allowed(p, tickets) {
  if (p.cat === 'transporte') return false;
  if (tickets === 'gratis') return !p.price;
  if (tickets === 'imprescindibles') return !p.price || p.pri === 1;
  return true;
}

function cityOfRow(r, day) {
  if (r.kind === 'transfer') return r.transfer.to || null;
  if (r.kind === 'lodging') return r.cityId;
  if (r.place) return r.place.cityId;
  return (day.cities || [])[0] || null;
}

function simulate(route, seg, pace, wd, rec) {
  let t = seg.startT, loc = seg.startLoc, walk = 0, wait = 0, tPlaces = seg.startT;
  for (const node of route) {
    if (node.type === 'meal') {
      const s = Math.max(t, node.ws);
      if (s > node.we) return null;
      if (rec) rec.push(s);
      wait += s - t;
      t = s + node.dur;
      continue;
    }
    const p = node.p;
    const lg = leg(loc, p, pace);
    const arrive = t + lg.min;
    walk += lg.mode === 'walk' ? lg.d : lg.d * 0.5;
    let start = arrive;
    if (p.h) {
      const ranges = rangesFor(p.h, wd);
      if (ranges === null) return null;
      let ok = false;
      for (const [s, e] of ranges) {
        const st = Math.max(arrive, s);
        if (st - arrive > 40) continue;
        if (st <= e - (p.lastEntry || 0) && st + node.dur <= e + 5) { start = st; ok = true; break; }
      }
      if (!ok) return null;
    }
    wait += start - arrive;
    t = start + node.dur;
    loc = p;
    tPlaces = t;
  }
  const tail = seg.endMin != null ? seg.endMin : (seg.endLoc ? leg(loc, seg.endLoc, pace).min : 0);
  const check = seg.soft ? tPlaces : t;
  if (check + tail > seg.deadline) return null;
  return { endT: t + tail, walk, wait };
}

// Reordena los lugares entre comidas para caminar menos, si sigue cumpliendo horarios
function improveOrder(route, seg, pace, wd) {
  let best = route, bestSim = simulate(route, seg, pace, wd);
  if (!bestSim) return route;
  const chunks = [];
  let cur = [];
  route.forEach((n, i) => { if (n.type === 'meal') { if (cur.length) chunks.push(cur); cur = []; } else cur.push(i); });
  if (cur.length) chunks.push(cur);
  for (const idxs of chunks) {
    if (idxs.length < 3) continue;
    const before = best[idxs[0] - 1];
    const after = best[idxs[idxs.length - 1] + 1];
    let start = seg.startLoc;
    for (let k = idxs[0] - 1; k >= 0; k--) if (best[k].type === 'place') { start = best[k].p; break; }
    let end = null;
    if (!after) end = seg.endLoc;
    else for (let k = idxs[idxs.length - 1] + 1; k < best.length; k++) if (best[k].type === 'place') { end = best[k].p; break; }
    void before;
    const pts = idxs.map(i => best[i].p);
    const ord = bestOrder(pts, start, end);
    const cand = best.slice();
    ord.forEach((o, j) => { cand[idxs[j]] = best[idxs[o]]; });
    const sim = simulate(cand, seg, pace, wd);
    if (sim && sim.walk < bestSim.walk - 50) { best = cand; bestSim = sim; }
  }
  return best;
}

function fillSegment(seg, candidates, pace, wd, meals, ctx) {
  let route = [];
  for (const m of meals) {
    const trial = [...route, m];
    if (simulate(trial, seg, pace, wd)) route = trial;
  }
  let base = simulate(route, seg, pace, wd) || { endT: seg.startT, walk: 0, wait: 0 };
  const pool = candidates.slice();
  for (let iter = 0; iter < 30 && pool.length; iter++) {
    let best = null;
    for (let c = 0; c < pool.length; c++) {
      const p = pool[c];
      const node = { type: 'place', p, dur: Math.max(10, Math.round(((p.dur || 30) * pace.dur) / 5) * 5) };
      const v = valueOf(p, ctx);
      for (let i = 0; i <= route.length; i++) {
        const r2 = [...route.slice(0, i), node, ...route.slice(i)];
        const sim = simulate(r2, seg, pace, wd);
        if (!sim) continue;
        const cost = (sim.endT - base.endT) + 0.5 * (sim.wait - base.wait) + (sim.walk - base.walk) / 150;
        const ratio = v / Math.max(4, cost);
        if (!best || ratio > best.ratio) best = { ratio, route: r2, sim, c };
      }
    }
    if (!best) break;
    route = best.route; base = best.sim;
    pool.splice(best.c, 1);
  }
  return improveOrder(route, seg, pace, wd);
}

function toItems(route, seg, pace, wd) {
  const out = [];
  const starts = [];
  simulate(route, seg, pace, wd, starts);
  let mi = 0;
  let loc = seg.startLoc;
  for (const node of route) {
    if (node.type === 'meal') { const s = starts[mi++] ?? node.ws; out.push({ id: newId('i'), t: 'meal', name: node.name, dur: node.dur, fixed: fmt(Math.ceil(s / 5) * 5) }); continue; }
    const p = node.p;
    const lg = leg(loc, p, pace);
    const it = { id: newId('i'), t: 'place', p: p.id };
    if (node.dur !== p.dur) it.dur = node.dur;
    if (lg.mode === 'metro') it.move = { m: 'metro', min: lg.min, txt: 'Más de 2 km: metro o bus. Toca "Ver en transporte" para la mejor línea.' };
    out.push(it);
    loc = p;
  }
  return out;
}

export function usedPlaces(exceptDayIds = []) {
  const s = new Set();
  for (const d of all('day')) {
    if (exceptDayIds.includes('d-' + d.date)) continue;
    for (const it of d.items || []) if (it.t === 'place') s.add(it.p);
  }
  return s;
}

// Devuelve los nuevos elementos del día. opts: { pace, tickets, end, meals, onlyCity }
export function planDay(day, opts, used = new Set(), ctxExtra = {}) {
  const pace = PACE[opts.pace] || PACE.normal;
  const wd = dow(day.date);
  const endDay = toMin(opts.end || '22:30');
  let work = day;
  if (!(day.items || []).some(isAnchor)) {
    const cid = (day.cities || [])[0];
    if (!get(cid)) return { items: day.items, added: 0 };
    work = { ...day, items: [{ id: newId('i'), t: 'lodging', city: cid, name: 'Salida del alojamiento', dur: 0 }, ...(day.items || [])] };
  }
  const sched = buildSchedule(work, { fetchRoutes: false });
  const rows = sched.rows;
  // Lo que ya está fijo en el día no se repite
  for (const r of rows) if (r.item.t === 'place' && isAnchor(r.item)) used.add(r.item.p);
  const anchorIdx = rows.map((r, i) => (isAnchor(r.item) ? i : -1)).filter(i => i >= 0);
  const country = c => (get(c) || {}).country;
  let lunchDone = false, dinnerDone = false;
  const items = [];
  let added = 0;
  for (let i = 0; i < anchorIdx[0]; i++) items.push(rows[i].item);
  for (let k = 0; k < anchorIdx.length; k++) {
    const ai = anchorIdx[k];
    const a = rows[ai];
    items.push(a.item);
    const nextIdx = anchorIdx[k + 1];
    const original = rows.slice(ai + 1, nextIdx === undefined ? rows.length : nextIdx).map(r => r.item);
    const city = cityOfRow(a, work);
    const startLoc = a.kind === 'transfer' ? a.endLoc : a.loc;
    const keep = () => { items.push(...original); original.forEach(it => it.t === 'place' && used.add(it.p)); };
    if (!city || !startLoc || (opts.onlyCity && city !== opts.onlyCity)) { keep(); continue; }
    const next = nextIdx === undefined ? null : rows[nextIdx];
    const seg = { startT: a.end, startLoc, deadline: endDay, endLoc: null, endMin: null, soft: !next };
    if (next) {
      seg.deadline = next.start;
      seg.endLoc = next.kind === 'meal' ? null : next.loc;
      if (next.item.move && typeof next.item.move.min === 'number') seg.endMin = next.item.move.min;
    }
    if (seg.deadline - seg.startT < 25) { keep(); continue; }
    const W = MEALS[country(city)] || MEALS.default;
    const meals = [];
    if (opts.meals !== false) {
      const [ls, le] = W.lunch.map(toMin), [ds, de] = W.dinner.map(toMin);
      const lunchDur = opts.pace === 'tranquilo' ? 75 : 60;
      if (!lunchDone && seg.startT <= le && seg.deadline >= ls + 30) meals.push({ type: 'meal', name: 'Almuerzo', ws: ls, we: le, dur: lunchDur });
      if (!dinnerDone && seg.startT <= de && (seg.soft || seg.deadline >= ds + 45)) meals.push({ type: 'meal', name: 'Cena', ws: ds, we: de, dur: 75 });
    }
    // En el último tramo del día (de noche) solo se agrega lo que queda cerca
    const candidates = all('place').filter(p => p.cityId === city && !used.has(p.id) && allowed(p, opts.tickets) && (!seg.soft || haversine(startLoc, p) < 1200));
    const focus = seg.endLoc && !seg.soft ? { lat: (startLoc.lat + seg.endLoc.lat) / 2, lng: (startLoc.lng + seg.endLoc.lng) / 2 } : startLoc;
    const ctx = { focus, ...(ctxExtra.zoneOf && ctxExtra.zoneCity === city ? { zoneOf: ctxExtra.zoneOf, zone: ctxExtra.zone } : {}) };
    const route = fillSegment(seg, candidates, pace, wd, meals, ctx);
    for (const n of route) {
      if (n.type === 'meal') { if (n.name === 'Almuerzo') lunchDone = true; else dinnerDone = true; }
      else { used.add(n.p.id); added++; }
    }
    items.push(...toItems(route, seg, pace, wd));
  }
  return { items, added };
}

// k-means sencillo para repartir la ciudad en zonas, una por cada día completo
function zones(places, k) {
  if (k <= 1 || places.length <= k) return new Map(places.map(p => [p.id, 0]));
  const sorted = places.slice().sort((a, b) => (a.pri || 3) - (b.pri || 3));
  let cents = [sorted[0]];
  while (cents.length < k) {
    let far = null, fd = -1;
    for (const p of sorted) { const d = Math.min(...cents.map(c => haversine(c, p))); if (d > fd) { fd = d; far = p; } }
    cents.push(far);
  }
  cents = cents.map(c => ({ lat: c.lat, lng: c.lng }));
  let assign = new Map();
  for (let it = 0; it < 15; it++) {
    assign = new Map(places.map(p => [p.id, cents.reduce((bi, c, i) => (haversine(c, p) < haversine(cents[bi], p) ? i : bi), 0)]));
    cents = cents.map((c, i) => {
      const ps = places.filter(p => assign.get(p.id) === i);
      return ps.length ? { lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length, lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length } : c;
    });
  }
  assign.cents = cents;
  return assign;
}

// Arma todos los días de una ciudad, repartiendo los lugares por zonas y sin repetir
export function planCity(cityId, opts) {
  const days = all('day').filter(d => (d.cities || []).includes(cityId)).sort((a, b) => a.date.localeCompare(b.date));
  const used = usedPlaces(days.map(d => 'd-' + d.date));
  const full = days.filter(d => d.cities.length === 1 && d.cities[0] === cityId);
  const places = all('place').filter(p => p.cityId === cityId && p.cat !== 'transporte' && allowed(p, opts.tickets));
  const zoneOf = zones(places, full.length);
  // Cada día completo se queda con la zona más cercana a lo que ya tiene fijo (por ejemplo, el Prado a las 18:00)
  const dayZone = new Map();
  if (zoneOf.cents) {
    const free = new Set(zoneOf.cents.map((_, i) => i));
    const anchorsOf = d => (d.items || []).filter(it => it.t === 'place' && isAnchor(it)).map(it => get(it.p)).filter(p => p && p.cat !== 'transporte');
    const order = full.slice().sort((a, b) => anchorsOf(b).length - anchorsOf(a).length);
    for (const d of order) {
      const an = anchorsOf(d);
      let pick = [...free][0];
      if (an.length) {
        const c = { lat: an.reduce((s, p) => s + p.lat, 0) / an.length, lng: an.reduce((s, p) => s + p.lng, 0) / an.length };
        pick = [...free].reduce((bi, i) => (haversine(zoneOf.cents[i], c) < haversine(zoneOf.cents[bi], c) ? i : bi), [...free][0]);
      }
      dayZone.set(d.date, pick);
      free.delete(pick);
    }
  }
  const result = {};
  // Primero los días completos (eligen lo mejor de su zona), luego los de paso
  const ordered = [...full, ...days.filter(d => !full.includes(d))];
  for (const d of ordered) {
    const extra = dayZone.has(d.date) ? { zoneOf, zone: dayZone.get(d.date), zoneCity: cityId } : {};
    result['d-' + d.date] = planDay(d, { ...opts, onlyCity: cityId }, used, extra);
  }
  return result;
}
