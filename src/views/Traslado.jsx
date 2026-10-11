import { useState } from 'react';
import { get, all, update, useStore } from '../lib/store.js';
import { transferEnds } from '../lib/schedule.js';
import { fmtDate } from '../lib/time.js';
import { gmapsDir } from '../lib/geo.js';
import Icon, { modeIcon } from '../components/Icon.jsx';
import MapView from '../components/MapView.jsx';
import { Header, Field, back, go, money, Empty } from '../components/ui.jsx';
import { STATUS } from './Viaje.jsx';

export default function Traslado({ id }) {
  useStore();
  const t = get(id);
  const [f, setF] = useState(null);
  if (!t) return <><Header title="Traslado" onBack={() => back()} /><Empty title="Este traslado ya no existe" /></>;
  const v = f || { dep: t.dep, arr: t.arr, status: t.status, booking: t.booking || '', paid: t.paid || '', notes: t.myNotes || '' };
  const set = (k, x) => setF({ ...v, [k]: x });
  const dirty = !!f;
  const save = () => { update(id, d => { d.dep = v.dep; d.arr = v.arr; d.status = v.status; d.booking = v.booking; d.paid = v.paid; d.myNotes = v.notes; }); setF(null); };
  const { from, to } = transferEnds(t);
  const day = all('day').find(d => d.date === t.date);
  const ca = t.from ? get(t.from) : null, cb = t.to ? get(t.to) : null;
  const pts = [from, to].filter(Boolean);
  const nearby = t.mode !== 'plane' || (from && to && Math.abs(from.lat - to.lat) < 20);

  return (
    <div className="page transfer">
      <Header title={t.label} sub={fmtDate(t.date, true)} onBack={() => back('/viaje?v=traslados')} />
      {nearby && pts.length === 2 ? <MapView markers={pts.map((p, i) => ({ lat: p.lat, lng: p.lng, label: i ? 'B' : 'A', color: (i ? cb : ca)?.color || '#15233f', title: p.name }))}
        lines={[{ coords: pts.map(p => [p.lat, p.lng]), color: '#64748b', dash: t.mode === 'plane' ? '3 8' : null, weight: 3 }]} fitKey={id} height="24vh" /> : null}
      <div className="pad">
        <div className="board">
          <div className="board-col"><small>Sale</small><b>{v.dep}</b><span>{from?.name}</span></div>
          <Icon name={modeIcon(t.mode)} size={26} />
          <div className="board-col"><small>Llega</small><b>{v.arr}{t.arrDate && t.arrDate !== t.date ? ' +1' : ''}</b><span>{to?.name}</span></div>
        </div>
        <p className="hint">{t.durTxt}{t.ops?.length ? ` · ${t.ops.join(', ')}` : ''}</p>
        {t.notes ? <p className="lead">{t.notes}</p> : null}
        {t.alt ? <div className="callout"><Icon name="shuffle" size={18} /><p>{t.alt}</p></div> : null}
        {t.buyWhen ? <p><b>Cuándo comprar:</b> {t.buyWhen}</p> : null}
        {t.priceQ ? <p><b>Cotización:</b> {money(t.priceQ)} por persona{t.priceNote ? ` (${t.priceNote})` : ''}</p> : null}

        <div className="actions-row">
          {from ? <a className="btn primary" href={gmapsDir(from, 'transit')} target="_blank" rel="noreferrer"><Icon name="nav" size={18} />Cómo llegar a {t.mode === 'plane' ? 'el aeropuerto' : 'la estación'}</a> : null}
          {day ? <button className="btn" onClick={() => go(`/dia/${t.date}`)}><Icon name="calendar" size={18} />Ver el día</button> : null}
        </div>

        <section className="block">
          <h2><Icon name="ext" size={18} /> Dónde ver horarios y comprar</h2>
          <div className="actions-row">{buyLinks(t).map(l => <a key={l.url} className="btn sm" href={l.url} target="_blank" rel="noreferrer">{l.name}</a>)}</div>
          <p className="hint">El número de tren o vuelo exacto lo eligen al comprar; después cambien aquí la hora y guarden el código de reserva.</p>
        </section>

        <section className="block">
          <h2><Icon name="ticket" size={18} /> Nuestro boleto</h2>
          <div className="seg">
            {Object.entries(STATUS).map(([k, l]) => <button key={k} className={v.status === k ? 'on' : ''} onClick={() => set('status', k)}>{l}</button>)}
          </div>
          <div className="grid2">
            <Field label="Sale"><input type="time" value={v.dep} onChange={e => set('dep', e.target.value)} /></Field>
            <Field label="Llega"><input type="time" value={v.arr} onChange={e => set('arr', e.target.value)} /></Field>
          </div>
          <Field label="Código de reserva / asiento"><input value={v.booking} onChange={e => set('booking', e.target.value)} placeholder="Ej.: ABC123, coche 5 asiento 12A" /></Field>
          <Field label="Precio pagado"><input value={v.paid} onChange={e => set('paid', e.target.value)} placeholder="Ej.: 39 € c/u" /></Field>
          <Field label="Notas"><textarea rows={2} value={v.notes} onChange={e => set('notes', e.target.value)} /></Field>
          <button className="btn primary wide" onClick={save} disabled={!dirty}>Guardar cambios</button>
          <p className="hint">Si cambian la hora, el día se recalcula solo.</p>
        </section>
      </div>
    </div>
  );
}

const OPS = [
  [/renfe/i, 'Renfe', 'https://www.renfe.com'], [/iryo/i, 'iryo', 'https://iryo.eu'], [/ouigo/i, 'Ouigo', 'https://www.ouigo.com/es'],
  [/eurostar/i, 'Eurostar', 'https://www.eurostar.com'], [/eurocity/i, 'NS International', 'https://www.nsinternational.com'],
  [/trenitalia|frecciarossa/i, 'Trenitalia', 'https://www.trenitalia.com'], [/italo/i, 'Italo', 'https://www.italotreno.com'],
  [/swiss/i, 'SWISS', 'https://www.swiss.com'], [/klm/i, 'KLM', 'https://www.klm.com'], [/vueling/i, 'Vueling', 'https://www.vueling.com'],
  [/air france/i, 'Air France', 'https://www.airfrance.com'], [/ita airways/i, 'ITA Airways', 'https://www.ita-airways.com'],
  [/iberia/i, 'Iberia', 'https://www.iberia.com'], [/ryanair/i, 'Ryanair', 'https://www.ryanair.com']
];
const IATA = { 'm-barajas': 'MAD', 'b-aeropuerto': 'BCN', 'p-orly': 'ORY', 'a-schiphol': 'AMS', 'z-airport': 'ZRH', 'v-airport': 'VCE', 'r-fco': 'FCO' };
function buyLinks(t) {
  const out = [];
  const text = (t.ops || []).join(' ') + ' ' + (t.alt || '');
  for (const [re, name, url] of OPS) if (re.test(text) && !out.some(o => o.name === name)) out.push({ name, url });
  if (/nightjet/i.test(text)) out.push({ name: 'Nightjet', url: 'https://www.nightjet.com' });
  if (t.mode === 'plane') {
    const a = IATA[t.fromId] || 'GUA', b = IATA[t.toId] || 'GUA';
    out.push({ name: 'Google Flights', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`vuelos de ${a} a ${b} el ${t.date} solo ida`)}&hl=es` });
  } else {
    out.push({ name: 'Trainline (comparar)', url: 'https://www.thetrainline.com/es' });
  }
  return out;
}
