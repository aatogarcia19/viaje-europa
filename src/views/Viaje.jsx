import { useMemo, useState } from 'react';
import { get, all, useStore } from '../lib/store.js';
import { buildSchedule, transferEnds } from '../lib/schedule.js';
import { fmt, fmtDate, dateObj, DOW_SHORT } from '../lib/time.js';
import Icon, { modeIcon } from '../components/Icon.jsx';
import MapView from '../components/MapView.jsx';
import { Header, go, money } from '../components/ui.jsx';

export const STATUS = { pendiente: 'Por comprar', cotizado: 'Cotizado', comprado: 'Comprado' };

export function Ticket({ t, onClick, compact }) {
  const { from, to } = transferEnds(t);
  return (
    <button className={`ticket btn-plain ${t.status === 'comprado' ? 'paid' : ''} ${compact ? 'compact' : ''}`} onClick={onClick}>
      <span className="ticket-mode"><Icon name={modeIcon(t.mode)} size={20} /></span>
      <span className="ticket-main">
        <span className="ticket-label">{t.label}</span>
        <span className="ticket-times"><b>{t.dep}</b><i aria-hidden="true" /><b>{t.arr}</b>{t.arrDate && t.arrDate !== t.date ? <small>+1</small> : null}</span>
        <span className="ticket-st">{from?.name} → {to?.name}</span>
        {!compact && t.ops?.length ? <span className="ticket-ops">{t.ops.join(' · ')}</span> : null}
      </span>
      <span className="ticket-side">
        <span className={`status s-${t.status}`}>{STATUS[t.status] || t.status}</span>
        {t.priceQ ? <span className="ticket-price">{money(t.priceQ)}</span> : null}
        {!compact ? <span className="ticket-date">{fmtDate(t.date)}</span> : null}
      </span>
    </button>
  );
}

export default function Viaje({ query }) {
  useStore();
  const [tab, setTab] = useState(query.v || 'dias');
  const trip = get('trip') || {};
  const cities = all('city').sort((a, b) => a.order - b.order);
  const days = all('day').sort((a, b) => a.date.localeCompare(b.date));
  const transfers = all('transfer').sort((a, b) => (a.date + a.dep).localeCompare(b.date + b.dep));
  const scheds = useMemo(() => Object.fromEntries(days.map(d => [d.date, buildSchedule(d, { fetchRoutes: false })])), [days]);

  const markers = cities.map(c => ({ id: c.id, lat: c.lat, lng: c.lng, label: c.order, shape: 'city', color: c.color, title: `${c.name}` }));
  const lines = transfers.filter(t => t.from && t.to).map(t => {
    const { from, to } = transferEnds(t);
    const ca = get(t.from), cb = get(t.to);
    if (!from || !to) return null;
    return { coords: [[from.lat, from.lng], [to.lat, to.lng]], color: t.mode === 'plane' ? '#64748b' : (cb?.color || ca?.color || '#15233f'), weight: t.mode === 'plane' ? 2.5 : 4, dash: t.mode === 'plane' ? '3 8' : null };
  }).filter(Boolean);

  return (
    <div className="page viaje">
      <Header title={trip.name || 'Viaje'} sub={trip.start ? `${fmtDate(trip.start)} – ${fmtDate(trip.end)} · ${cities.length} ciudades` : ''} />
      <MapView markers={markers} lines={lines} fitKey={'europa' + cities.length} onMarker={mk => go(`/ciudad/${mk.id}`)} height="36vh" padding={30} />
      <div className="legend">
        <span><i className="lg train" /> tren</span><span><i className="lg plane" /> vuelo</span><span className="hint">Toca una ciudad para ver su catálogo</span>
      </div>
      <div className="seg sticky" role="tablist">
        {[['dias', 'Días'], ['traslados', 'Trenes y vuelos'], ['ciudades', 'Ciudades']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); history.replaceState(null, '', `#/viaje?v=${k}`); }}>{l}</button>)}
      </div>

      {tab === 'dias' && (
        <ol className="days">
          {days.map(d => {
            const s = scheds[d.date];
            const dc = (d.cities || []).map(id => get(id)).filter(Boolean);
            const dt = transfers.filter(t => t.date === d.date);
            const o = dateObj(d.date);
            const n = (d.items || []).filter(i => i.t === 'place' || i.t === 'custom').length;
            return (
              <li key={d.date} className="day-card" style={{ '--city': dc[0]?.color || '#64748b' }}>
                <button className="btn-plain day-card-main" onClick={() => go(`/dia/${d.date}`)}>
                  <span className="dc-date"><small>{DOW_SHORT[o.getDay()]}</small><b>{o.getDate()}</b></span>
                  <span className="dc-body">
                    <span className="dc-title">{d.title}</span>
                    <span className="dc-cities">{dc.map(c => <em key={c.name} style={{ '--c': c.color }}>{c.flag} {c.name}</em>)}</span>
                    <span className="dc-meta">{n ? `${n} ${n === 1 ? 'parada' : 'paradas'} · ` : ''}{d.start}–{fmt(s.end)}{s.walkKm > 0.5 ? ` · ${s.walkKm.toFixed(1)} km a pie` : ''}</span>
                  </span>
                  {s.alertCount ? <span className="dc-alert" title="Avisos de horario"><Icon name="warn" size={14} />{s.alertCount}</span> : null}
                </button>
                {dt.length ? <div className="dc-tickets">{dt.map(t => <Ticket key={t.id} t={t} compact onClick={() => go(`/traslado/${t.id}`)} />)}</div> : null}
              </li>
            );
          })}
        </ol>
      )}

      {tab === 'traslados' && (
        <div className="pad">
          <p className="hint">Los horarios son referencias del documento: confírmenlos cuando abran ventas para junio de 2027 y marquen cada uno como comprado.</p>
          <div className="stack">{transfers.map(t => <Ticket key={t.id} t={t} onClick={() => go(`/traslado/${t.id}`)} />)}</div>
        </div>
      )}

      {tab === 'ciudades' && (
        <ul className="city-list">
          {cities.map(c => {
            const ps = all('place').filter(p => p.cityId === c.id && p.cat !== 'transporte');
            const audios = ps.filter(p => p.audio).length;
            const L = c.lodging;
            return (
              <li key={c.id} style={{ '--city': c.color }}>
                <button className="btn-plain city-card" onClick={() => go(`/ciudad/${c.id}`)}>
                  <span className="cc-num">{c.order}</span>
                  <span className="cc-body">
                    <span className="cc-name">{c.flag} {c.name}</span>
                    <span className="cc-meta">{c.dayTrip ? `${fmtDate(c.arrive)} · de paso` : `${fmtDate(c.arrive)} – ${fmtDate(c.depart)} · ${c.nights} ${c.nights === 1 ? 'noche' : 'noches'}`}</span>
                    <span className="cc-meta">{ps.length} lugares{audios ? ` · ${audios} audioguías` : ''}</span>
                  </span>
                  <span className={`status ${L === null ? 's-na' : L && typeof L.lat === 'number' ? 's-comprado' : 's-pendiente'}`}>{L === null ? 'Sin noche' : L && typeof L.lat === 'number' ? (L.name || 'Alojamiento listo') : 'Sin alojamiento'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
