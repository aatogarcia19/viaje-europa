// Resúmenes de transporte: por ciudad (viajes del plan, abonos) y del viaje completo.
import { get, all } from './store.js';
import { buildSchedule } from './schedule.js';
import { comparePasses, FARES } from './fares.js';
import { requestTransit, MIN_PT_M, retryFailed } from './transit.js';
import { haversine } from './geo.js';

export function daysOfCity(cityId) {
  return all('day').filter(d => (d.cities || []).includes(cityId)).sort((a, b) => a.date.localeCompare(b.date));
}

export function cityTransport(cityId) {
  const trips = [];
  for (const d of daysOfCity(cityId)) {
    const s = buildSchedule(d, { fetchRoutes: false });
    for (const tr of s.transport.trips) if (tr.cityId === cityId) trips.push(tr);
  }
  const travelers = ((get('trip') || {}).travelers || [1, 2]).length || 2;
  const cmp = comparePasses(cityId, trips, travelers);
  const byDate = {};
  for (const t of trips) { byDate[t.date] = byDate[t.date] || { n: 0, amt: 0 }; byDate[t.date].n++; byDate[t.date].amt += t.amt; }
  return { cityId, trips, byDate, cmp, est: trips.some(t => t.est) };
}

// Costo estimado por persona en quetzales, ciudad por ciudad
export function tripTransport() {
  const trip = get('trip') || {};
  const rates = trip.rates || { EUR: 8.8, CHF: 9.5, GTQ: 1 };
  const out = [];
  let q = 0;
  for (const c of all('city').sort((a, b) => a.order - b.order)) {
    if (!FARES[c.id]) continue;
    const ct = cityTransport(c.id);
    const best = ct.cmp ? ct.cmp.best.cost : 0;
    const gtq = best * (rates[ct.cmp?.cur || 'EUR'] || 1);
    q += gtq;
    out.push({ city: c, ...ct, best, gtq });
  }
  return { cities: out, totalQ: Math.round(q) };
}

// Pide al servicio las rutas de todos los tramos largos (de una ciudad o de todo el viaje)
export function computeRoutes(cityId = null) {
  retryFailed();
  let n = 0;
  const days = cityId ? daysOfCity(cityId) : all('day');
  for (const d of days) {
    const s = buildSchedule(d, { fetchRoutes: false });
    for (const r of s.rows) {
      const mv = r.move;
      if (!mv || !mv.from || !mv.to) continue;
      if (cityId && mv.cityId !== cityId) continue;
      if (haversine(mv.from, mv.to) < MIN_PT_M) continue;
      if (mv.tstatus === 'ok' || mv.tstatus === 'none') continue;
      requestTransit(mv.from, mv.to, mv.depart ?? r.arrive - mv.min, d.date, { force: true });
      n++;
    }
  }
  return n;
}
