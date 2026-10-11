import { useEffect, useState } from 'react';
import { get, all, update, put, useStore, newId } from '../lib/store.js';
import { fmtDate, fmtDur } from '../lib/time.js';
import { geocode, gmapsDir } from '../lib/geo.js';
import Icon from '../components/Icon.jsx';
import MapView from '../components/MapView.jsx';
import { Header, Sheet, Field, back, go, Empty, Toast } from '../components/ui.jsx';
import { planCity } from '../lib/planner.js';
import { PlannerOptions } from './Dia.jsx';
import { CAT, PRI, priceLabel } from './Lugar.jsx';

export default function Ciudad({ id, query = {} }) {
  useStore();
  const c = get(id);
  const [filter, setFilter] = useState('todo');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [editLodging, setEditLodging] = useState(false);
  const [addPlace, setAddPlace] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [plan, setPlan] = useState(false);
  const [toast, setToast] = useState(null);
  useEffect(() => { if (query.aloj) setEditLodging(true); }, [query.aloj]);
  if (!c) return <><Header title="Ciudad" onBack={() => back()} /><Empty title="Esta ciudad no existe" /></>;

  const places = all('place').filter(p => p.cityId === id);
  const days = all('day').filter(d => (d.cities || []).includes(id)).sort((a, b) => a.date.localeCompare(b.date));
  const planned = new Map();
  for (const d of days) for (const it of d.items || []) if (it.t === 'place') { if (!planned.has(it.p)) planned.set(it.p, []); planned.get(it.p).push(d.date); }
  const cats = [...new Set(places.map(p => p.cat))].filter(x => x !== 'transporte');
  const shown = places.filter(p => p.cat !== 'transporte' || filter === 'todo' && cat === 'transporte')
    .filter(p => filter === 'todo' || (filter === 'imp' && p.pri === 1) || (filter === 'gratis' && !p.price) || (filter === 'pago' && p.price) || (filter === 'fuera' && !planned.has(p.id)))
    .filter(p => !cat || p.cat === cat)
    .filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.pri || 3) - (b.pri || 3) || a.name.localeCompare(b.name));
  const L = c.lodging;
  const hasLodging = L && typeof L.lat === 'number';
  const dates = c.dayTrip ? fmtDate(c.arrive) : `${fmtDate(c.arrive)} – ${fmtDate(c.depart)}`;

  return (
    <div className="page city" style={{ '--city': c.color }}>
      <Header title={`${c.flag} ${c.name}`} sub={`${dates} · ${c.dayTrip ? 'visita de un día' : `${c.nights} ${c.nights === 1 ? 'noche' : 'noches'}`}`} onBack={() => back('/viaje')}
        right={<button className={`icon-btn ${showMap ? 'on' : ''}`} onClick={() => setShowMap(!showMap)} aria-label="Ver catálogo en el mapa"><Icon name="map" /></button>} />
      {showMap ? <MapView markers={shown.map(p => ({ id: p.id, lat: p.lat, lng: p.lng, label: '', shape: 'dot', color: planned.has(p.id) ? c.color : '#94a3b8', title: p.name }))} fitKey={id + filter + cat + shown.length} onMarker={mk => go(`/lugar/${mk.id}`)} height="40vh" /> : null}
      <div className="pad">
        {c.summary ? <p className="lead">{c.summary}</p> : null}
        {c.climate ? <p className="hint"><Icon name="sun" size={15} /> {c.climate}</p> : null}

        <section className="block" id="alojamiento">
          <h2><Icon name="bed" size={18} /> Alojamiento</h2>
          {c.lodging === null ? <p className="hint">Visita de un día: no hay noche aquí.</p> : hasLodging ? (
            <div className="lodging">
              <strong>{L.name || 'Alojamiento'}</strong>
              {L.address ? <span>{L.address}</span> : null}
              <span className="hint">{L.checkin ? `Check-in ${L.checkin}` : ''}{L.checkin && L.checkout ? ' · ' : ''}{L.checkout ? `Check-out ${L.checkout}` : ''}{L.price ? ` · ${L.price}` : ''}</span>
              {L.notes ? <span className="note">{L.notes}</span> : null}
              <div className="actions-row">
                <a className="btn sm" href={gmapsDir(L, 'walk')} target="_blank" rel="noreferrer"><Icon name="nav" size={15} />Cómo llegar</a>
                {L.link ? <a className="btn sm" href={L.link} target="_blank" rel="noreferrer"><Icon name="ext" size={15} />Reserva</a> : null}
                <button className="btn sm" onClick={() => setEditLodging(true)}><Icon name="edit" size={15} />Editar</button>
              </div>
            </div>
          ) : (
            <div className="lodging empty-lodging">
              <span>Todavía no hay alojamiento. Mientras tanto, las rutas parten de <b>{c.ref?.name}</b>.</span>
              <button className="btn primary" onClick={() => setEditLodging(true)}><Icon name="plus" size={18} />Agregar alojamiento</button>
            </div>
          )}
        </section>

        <section className="block">
          <h2><Icon name="calendar" size={18} /> Días aquí</h2>
          <ul className="links">
            {days.map(d => <li key={d.date}><button className="btn-plain link" onClick={() => go(`/dia/${d.date}`)}><b>{fmtDate(d.date)}</b> {d.title}</button></li>)}
          </ul>
          <button className="btn wide" onClick={() => setPlan(true)}><Icon name="wand" size={18} />Armar los días de {c.name} por mí</button>
        </section>

        {c.transport && c.transport.length ? (
          <section className="block">
            <h2><Icon name="metro" size={18} /> Moverse</h2>
            <ul className="tips">{c.transport.map((t, i) => <li key={i}>{t}</li>)}</ul>
            {c.tips && c.tips.length ? <ul className="tips">{c.tips.map((t, i) => <li key={i}>{t}</li>)}</ul> : null}
          </section>
        ) : null}

        <section className="block">
          <div className="block-head">
            <h2><Icon name="star" size={18} /> Qué hacer ({places.filter(p => p.cat !== 'transporte').length})</h2>
            <button className="btn sm" onClick={() => setAddPlace(true)}><Icon name="plus" size={15} />Lugar propio</button>
          </div>
          {places.some(p => p.pending) ? <p className="hint">Esta ciudad tiene por ahora solo los lugares del plan base. El catálogo completo con audioguías llega en la siguiente etapa.</p> : null}
          <input className="search" placeholder="Buscar en el catálogo" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar en el catálogo" />
          <div className="chips scroll">
            {[['todo', 'Todo'], ['imp', 'Imprescindibles'], ['gratis', 'Gratis'], ['pago', 'De pago'], ['fuera', 'Fuera del plan']].map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <div className="chips scroll">
            <button className={`chip sm ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Todas</button>
            {cats.map(k => <button key={k} className={`chip sm ${cat === k ? 'on' : ''}`} onClick={() => setCat(cat === k ? '' : k)}>{CAT[k] || k}</button>)}
          </div>
          <ul className="catalog">
            {shown.map(p => (
              <li key={p.id}>
                <button className="btn-plain cat-item" onClick={() => go(`/lugar/${p.id}`)}>
                  <span className="cat-name">{p.name}</span>
                  <span className="cat-meta">
                    {p.pri === 1 ? <em className="tag star">{PRI[1]}</em> : null}
                    <span>{CAT[p.cat] || p.cat}</span><span>{priceLabel(p)}</span><span>{fmtDur(p.dur || 30)}</span>
                    {p.audio ? <span className="has-audio"><Icon name="audio" size={13} /> audio</span> : null}
                  </span>
                  {planned.has(p.id) ? <span className="in-plan">En el plan: {planned.get(p.id).map(d => fmtDate(d)).join(', ')}</span> : null}
                </button>
              </li>
            ))}
            {!shown.length ? <li className="hint">Nada con este filtro.</li> : null}
          </ul>
        </section>
      </div>
      {editLodging && c.lodging !== null && <LodgingSheet city={c} id={id} onClose={() => setEditLodging(false)} />}
      {addPlace && <NewPlaceSheet city={c} id={id} onClose={() => setAddPlace(false)} />}
      {plan && <CityPlanSheet city={c} id={id} onClose={() => setPlan(false)} setToast={setToast} />}
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function LodgingSheet({ city, id, onClose }) {
  const L0 = city.lodging || {};
  const [f, setF] = useState({ name: L0.name || '', address: L0.address || '', checkin: L0.checkin || '', checkout: L0.checkout || '', link: L0.link || '', price: L0.price || '', notes: L0.notes || '' });
  const [pos, setPos] = useState(typeof L0.lat === 'number' ? { lat: L0.lat, lng: L0.lng } : null);
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const search = async () => {
    setBusy(true); setErr('');
    try { const r = await geocode(f.address, { lat: city.lat, lng: city.lng }); setRes(r); if (!r.length) setErr('No encontré esa dirección. Prueba con calle y número, o marca el punto en el mapa.'); }
    catch { setErr('Sin conexión para buscar. Marca el punto en el mapa o usa tu ubicación.'); }
    setBusy(false);
  };
  const here = () => navigator.geolocation?.getCurrentPosition(p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setErr('No se pudo obtener tu ubicación.'));
  const save = () => { update(id, d => { d.lodging = { ...d.lodging, ...f, lat: pos ? pos.lat : null, lng: pos ? pos.lng : null }; }); onClose(); };
  const clear = () => { update(id, d => { d.lodging = { name: '', address: '', lat: null, lng: null, checkin: '', checkout: '', link: '', price: '', notes: '' }; }); onClose(); };
  return (
    <Sheet open title={`Alojamiento en ${city.name}`} onClose={onClose}
      footer={<>{L0.name || typeof L0.lat === 'number' ? <button className="btn danger" onClick={clear}>Borrar</button> : null}<button className="btn primary" onClick={save}>Guardar</button></>}>
      <Field label="Nombre del Airbnb"><input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ej.: Apartamento Lavapiés" /></Field>
      <Field label="Dirección">
        <div className="grid2 tight"><input value={f.address} onChange={e => set('address', e.target.value)} placeholder="Calle, número, ciudad" /><button className="btn" onClick={search} disabled={!f.address || busy}>{busy ? 'Buscando…' : 'Ubicar'}</button></div>
      </Field>
      {err ? <p className="hint warn">{err}</p> : null}
      {res.length ? <ul className="pick-list">{res.map((r, k) => <li key={k}><button className="btn-plain pick" onClick={() => { setPos({ lat: r.lat, lng: r.lng }); setRes([]); }}><span className="pick-meta">{r.name}</span></button></li>)}</ul> : null}
      <p className="hint">Toca el mapa para ajustar el punto exacto.</p>
      <MapView markers={pos ? [{ lat: pos.lat, lng: pos.lng, label: '⌂', color: city.color }] : []} fitKey={pos ? `${pos.lat},${pos.lng}` : 'none'} onPick={setPos} height="220px" center={{ lat: city.lat, lng: city.lng }} />
      <button className="btn sm" onClick={here}><Icon name="locate" size={15} />Estoy en el alojamiento: usar mi ubicación</button>
      <div className="grid2">
        <Field label="Check-in"><input type="time" value={f.checkin} onChange={e => set('checkin', e.target.value)} /></Field>
        <Field label="Check-out"><input type="time" value={f.checkout} onChange={e => set('checkout', e.target.value)} /></Field>
      </div>
      <Field label="Link de la reserva"><input type="url" value={f.link} onChange={e => set('link', e.target.value)} placeholder="https://" /></Field>
      <Field label="Precio total"><input value={f.price} onChange={e => set('price', e.target.value)} placeholder="Ej.: 140 € las 2 noches" /></Field>
      <Field label="Notas (código de la puerta, contacto…)"><textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
    </Sheet>
  );
}

function NewPlaceSheet({ city, id, onClose }) {
  const [f, setF] = useState({ name: '', desc: '', price: '', dur: 45 });
  const [pos, setPos] = useState(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const search = async () => { try { setRes(await geocode(q, { lat: city.lat, lng: city.lng })); } catch { setRes([]); } };
  const save = () => {
    const pid = newId('u');
    put(pid, 'place', { cityId: id, name: f.name, cat: 'propio', lat: pos.lat, lng: pos.lng, h: null, price: Number(f.price) || 0, dur: Number(f.dur) || 45, pri: 2, desc: f.desc, tips: [], audio: '', currency: city.currency });
    onClose();
    go(`/lugar/${pid}`);
  };
  return (
    <Sheet open title={`Nuevo lugar en ${city.name}`} onClose={onClose} footer={<button className="btn primary wide" disabled={!f.name || !pos} onClick={save}>Guardar lugar</button>}>
      <Field label="Nombre"><input value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Buscar ubicación"><div className="grid2 tight"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o dirección" /><button className="btn" onClick={search} disabled={!q}>Buscar</button></div></Field>
      {res.length ? <ul className="pick-list">{res.map((r, k) => <li key={k}><button className="btn-plain pick" onClick={() => { setPos(r); if (!f.name) set('name', r.name.split(',')[0]); setRes([]); }}><span className="pick-meta">{r.name}</span></button></li>)}</ul> : null}
      <MapView markers={pos ? [{ lat: pos.lat, lng: pos.lng, label: '★', color: city.color }] : []} fitKey={pos ? `${pos.lat}` : 'n'} onPick={setPos} height="200px" center={{ lat: city.lat, lng: city.lng }} />
      <div className="grid2">
        <Field label={`Precio (${city.currency === 'CHF' ? 'CHF' : '€'})`}><input type="number" inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value)} placeholder="0 = gratis" /></Field>
        <Field label="Duración (min)"><input type="number" inputMode="numeric" value={f.dur} onChange={e => set('dur', e.target.value)} /></Field>
      </div>
      <Field label="Descripción"><textarea rows={2} value={f.desc} onChange={e => set('desc', e.target.value)} /></Field>
    </Sheet>
  );
}

function CityPlanSheet({ city, id, onClose, setToast }) {
  const [o, setO] = useState({ pace: 'normal', tickets: 'imprescindibles', end: '22:30', meals: true });
  const run = () => {
    const res = planCity(id, o);
    const before = {};
    let added = 0;
    for (const [dayId, r] of Object.entries(res)) {
      before[dayId] = get(dayId).items;
      update(dayId, d => { d.items = r.items; });
      added += r.added;
    }
    setToast({ msg: `Listo: ${added} lugares repartidos en ${Object.keys(res).length} días.`, undo: () => { for (const [dayId, items] of Object.entries(before)) update(dayId, d => { d.items = items; }); } });
    onClose();
  };
  return (
    <Sheet open title={`Armar ${city.name} por mí`} onClose={onClose} footer={<button className="btn primary wide" onClick={run}><Icon name="wand" size={18} />Armar los días</button>}>
      <p className="hint">Reparte lo mejor del catálogo entre los días que pasan en {city.name}, sin repetir lugares, agrupando lo que queda cerca y respetando horarios. Se quedan los trenes, vuelos, alojamiento y lo que tenga hora fija. Las partes de otros días que sean de otra ciudad no se tocan. Lo puedes deshacer.</p>
      <PlannerOptions o={o} setO={setO} />
    </Sheet>
  );
}
