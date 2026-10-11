// Calcula el horario de un día: llegada, espera, inicio y fin de cada parada, tramos (a pie o en transporte) y alertas.
import { get } from './store.js';
import { toMin, fmt, dow, rangesFor, DOW } from './time.js';
import { walkInfo, sameLoc, requestRoute } from './geo.js';
import { getTransit, requestTransit, resolveLeg, estimatePT, isAutoMove, MIN_PT_M, DEFAULT_WALK_MAX } from './transit.js';
import { optFare, manualFare } from './fares.js';

export const MODE_LABEL = { walk: 'a pie', metro: 'metro', bus: 'bus', train: 'tren', tram: 'tranvía', vaporetto: 'vaporetto', taxi: 'taxi', plane: 'vuelo', pt: 'transporte', 'pt-est': 'transporte' };

export function cityLodgingLoc(city) {
  if (!city) return null;
  const l = city.lodging;
  if (l && typeof l.lat === 'number' && typeof l.lng === 'number') return { lat: l.lat, lng: l.lng, name: l.name || 'Alojamiento', real: true };
  if (city.ref) return { lat: city.ref.lat, lng: city.ref.lng, name: `Alojamiento (referencia: ${city.ref.name})`, real: false };
  return null;
}

export function placeLoc(id) {
  const p = id && get(id);
  return p ? { lat: p.lat, lng: p.lng, name: p.name } : null;
}

export function transferEnds(tr) {
  const from = tr.fromId ? placeLoc(tr.fromId) : tr.fromPlace;
  const to = tr.toId ? placeLoc(tr.toId) : tr.toPlace;
  return { from, to };
}

// Resuelve qué es cada elemento y dónde está
export function resolveItem(it, day) {
  const mainCity = it.city || (day.cities && day.cities[0]);
  switch (it.t) {
    case 'place': {
      const p = get(it.p);
      return { kind: 'place', place: p, name: it.name || (p ? p.name : 'Lugar eliminado'), loc: p ? { lat: p.lat, lng: p.lng } : null, dur: it.dur ?? (p ? p.dur : 30) };
    }
    case 'custom':
      return { kind: 'custom', name: it.name || 'Parada', loc: typeof it.lat === 'number' ? { lat: it.lat, lng: it.lng } : null, dur: it.dur ?? 30 };
    case 'meal':
      return { kind: 'meal', name: it.name || 'Comida', loc: null, dur: it.dur ?? 60 };
    case 'lodging': {
      const city = get(mainCity);
      const loc = cityLodgingLoc(city);
      return { kind: 'lodging', city, cityId: mainCity, name: it.name || 'Alojamiento', lodgingName: loc ? loc.name : '', lodgingReal: loc ? loc.real : false, loc: loc ? { lat: loc.lat, lng: loc.lng } : null, dur: it.dur ?? 15 };
    }
    case 'transfer': {
      const tr = get(it.tr);
      if (!tr) return { kind: 'custom', name: 'Traslado eliminado', loc: null, dur: 0 };
      const { from, to } = transferEnds(tr);
      return { kind: 'transfer', transfer: tr, name: tr.label, loc: from ? { lat: from.lat, lng: from.lng } : null, endLoc: to ? { lat: to.lat, lng: to.lng } : null, fromName: from?.name, toName: to?.name, dur: 0 };
    }
    default:
      return { kind: 'custom', name: it.name || '?', loc: null, dur: it.dur ?? 30 };
  }
}

export function buildSchedule(day, { fetchRoutes = true } = {}) {
  const wd = dow(day.date);
  const walkMax = (get('trip') || {}).walkMax || DEFAULT_WALK_MAX;
  const online = typeof navigator === 'undefined' || navigator.onLine;
  const rows = [];
  const trips = [];
  let t = toMin(day.start) ?? 9 * 60;
  let prev = null;      // última ubicación conocida
  let prevPid = null;   // lugar de la última ubicación (para tarifas de aeropuerto)
  let curCity = (day.cities || [])[0] || null;
  let walkM = 0;
  for (let i = 0; i < (day.items || []).length; i++) {
    const it = day.items[i];
    const r = resolveItem(it, day);
    const row = { item: it, index: i, ...r, alerts: [], move: null };
    if (r.kind === 'place' && r.place) curCity = r.place.cityId || curCity;
    if (r.kind === 'lodging' && r.cityId) curCity = r.cityId;
    const legCity = r.kind === 'transfer' ? (r.transfer.from || curCity) : curCity;
    const destPid = r.kind === 'place' ? it.p : r.kind === 'transfer' ? r.transfer.fromId : r.kind === 'lodging' ? 'lodging' : null;
    // Tramo desde la parada anterior
    let travel = 0;
    if (r.loc && prev && !sameLoc(prev, r.loc)) {
      const w = walkInfo(prev, r.loc);
      if (fetchRoutes && w.est) requestRoute(prev, r.loc);
      const tr = w.d >= MIN_PT_M ? getTransit(prev, r.loc, t, legCity) : null;
      if (fetchRoutes && online && tr && tr.status !== 'ok' && tr.status !== 'none' && tr.status !== 'pending') requestTransit(prev, r.loc, t, day.date);
      const ch = resolveLeg(it.move, w, tr, walkMax);
      const walkMinutes = Math.max(1, Math.round(w.t / 60));
      const base = {
        from: prev, to: r.loc, km: w.d / 1000, walkMin: walkMinutes, walkEst: w.est,
        opts: tr ? tr.opts : [], tstatus: tr ? tr.status : 'short', tkey: tr ? tr.key : null,
        auto: ch.auto, suggest: ch.suggest || null, cityId: legCity, txt: (it.move && !isAutoMove(it.move) && it.move.txt) || '', depart: t
      };
      if (ch.kind === 'walk') {
        travel = walkMinutes;
        walkM += w.d;
        row.move = { ...base, mode: 'walk', min: travel, est: w.est };
        if (ch.auto && w.d > 3500 && !base.opts.length && base.tstatus !== 'pending' && base.tstatus !== 'missing') row.alerts.push({ level: 'warn', text: `Tramo largo a pie (${(w.d / 1000).toFixed(1)} km) y no encontré transporte: revisen Google Maps` });
      } else if (ch.kind === 'pt') {
        travel = ch.opt.min;
        walkM += ch.opt.walkM || 0;
        row.move = { ...base, mode: 'pt', min: travel, opt: ch.opt, fare: optFare(ch.opt, legCity) };
      } else if (ch.kind === 'pt-est') {
        travel = estimatePT(w.d);
        row.move = { ...base, mode: 'pt-est', min: travel, est: true, fare: manualFare(legCity, 'metro', prevPid, destPid) };
      } else {
        const mv = it.move;
        travel = typeof mv.min === 'number' ? mv.min : (mv.m === 'walk' ? walkMinutes : estimatePT(w.d));
        if (mv.m === 'walk') walkM += w.d;
        row.move = { ...base, mode: mv.m, min: travel, manual: true, est: typeof mv.min !== 'number', fare: manualFare(legCity, mv.m, prevPid, destPid) };
      }
    } else if (it.move && typeof it.move.min === 'number' && it.move.min > 0 && r.loc) {
      travel = it.move.min;
      row.move = { mode: it.move.m || 'walk', min: travel, txt: it.move.txt || '', from: prev, to: r.loc, manual: true, cityId: legCity, opts: [], fare: manualFare(legCity, it.move.m, prevPid, destPid) };
    }
    if (row.move && row.move.fare && row.move.fare.amt > 0) {
      trips.push({ date: day.date, cityId: row.move.cityId, parts: row.move.fare.parts, amt: row.move.fare.amt, cur: row.move.fare.cur, est: !!(row.move.est || row.move.fare.est), j: `${day.date}#${it.id || i}` });
    }
    row.arrive = t + travel;
    let start = row.arrive;

    if (r.kind === 'transfer') {
      const dep = toMin(r.transfer.dep);
      let arr = toMin(r.transfer.arr);
      if (dep != null) {
        if (row.arrive > dep) row.alerts.push({ level: 'danger', text: `Llegas a las ${fmt(row.arrive)} y sale a las ${r.transfer.dep}` });
        else {
          const need = r.transfer.mode === 'plane' ? 90 : /eurostar/i.test(r.transfer.label + (r.transfer.ops || []).join(' ')) ? 30 : 10;
          if (dep - row.arrive < need) row.alerts.push({ level: 'warn', text: `Llegas con solo ${dep - row.arrive} min de margen (conviene ${need})` });
        }
        start = dep;
      }
      if (arr != null && dep != null) {
        if (r.transfer.arrDate && r.transfer.arrDate !== day.date) { row.overnight = true; arr = dep + 1; }
        else if (arr < dep) arr += 1440;
      }
      row.wait = Math.max(0, start - row.arrive);
      row.start = start;
      row.end = arr ?? start;
      if (r.transfer.status !== 'comprado') row.alerts.push({ level: 'info', text: 'Boleto pendiente de comprar' });
    } else {
      const fixed = toMin(it.fixed);
      if (fixed != null) {
        // En comidas la hora fija significa "no antes de": solo avisa si se va muy tarde
        if (r.kind === 'meal') { if (row.arrive > fixed + 45) row.alerts.push({ level: 'warn', text: `${r.name} muy tarde (${fmt(row.arrive)})` }); }
        else if (row.arrive > fixed + 2) row.alerts.push({ level: 'danger', text: `Llegas a las ${fmt(row.arrive)}, tarde para las ${it.fixed}` });
        start = Math.max(row.arrive, fixed);
      }
      row.wait = Math.max(0, start - row.arrive);
      row.start = start;
      row.end = start + (r.dur || 0);
      // Horarios del lugar
      const p = r.place;
      if (p && !it.ext && p.h) {
        const ranges = rangesFor(p.h, wd);
        if (ranges === null) row.alerts.push({ level: 'danger', text: `Cerrado los ${DOW[wd]}` });
        else if (ranges) {
          const inside = ranges.find(([s, e]) => start >= s && start < e);
          if (!inside) {
            const nextOpen = ranges.find(([s]) => s > start);
            row.alerts.push(nextOpen
              ? { level: 'warn', text: `Abre a las ${fmt(nextOpen[0])}` }
              : { level: 'danger', text: `Ya cerró (cierra a las ${fmt(ranges[ranges.length - 1][1])})` });
          } else {
            const close = inside[1];
            if (p.lastEntry && start > close - p.lastEntry) row.alerts.push({ level: 'danger', text: `Última entrada a las ${fmt(close - p.lastEntry)}` });
            else if (row.end > close) row.alerts.push({ level: 'warn', text: `Cierra a las ${fmt(close)}: te quedan ${Math.max(0, close - start)} min` });
          }
        }
        if (p.gratis) {
          const g = rangesFor(p.gratis, wd);
          if (g && g.some(([s, e]) => start >= s - 5 && start < e)) { row.alerts.push({ level: 'ok', text: 'Entrada gratis en este horario' }); row.free = true; }
        }
      }
      if (p && !it.ext) {
        if (p.res === 'obligatoria' && !it.booked) row.alerts.push({ level: 'warn', text: 'Necesita entrada con reserva' });
        else if (p.res === 'recomendada' && !it.booked && !row.free) row.alerts.push({ level: 'info', text: 'Conviene reservar' });
      }
    }
    if (it.booked) row.booked = true;
    rows.push(row);
    t = row.end;
    if (r.kind === 'transfer') { prev = r.endLoc || prev; prevPid = r.transfer.toId || null; curCity = r.transfer.to || curCity; }
    else if (r.loc) { prev = r.loc; prevPid = destPid; }
  }
  const end = rows.length ? rows[rows.length - 1].end : t;
  const alerts = rows.reduce((n, r) => n + r.alerts.filter(a => a.level === 'danger' || a.level === 'warn').length, 0);
  const totals = {};
  for (const tr of trips) totals[tr.cur] = Math.round(((totals[tr.cur] || 0) + tr.amt) * 100) / 100;
  return { rows, end, walkKm: walkM / 1000, alertCount: alerts, transport: { trips, totals, count: trips.length, est: trips.some(x => x.est) } };
}

// Ubicaciones dibujables (para mapa y optimización)
export function mapPoints(sched) {
  let n = 0;
  return sched.rows.map(r => {
    if (!r.loc || r.kind === 'meal') return null;
    if (r.kind === 'place' || r.kind === 'custom') { n++; return { n, row: r }; }
    return { n: null, row: r };
  }).filter(Boolean);
}
