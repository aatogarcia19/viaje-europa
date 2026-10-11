import { useEffect, useMemo, useRef, useState } from 'react';
import { get, all, update, useStore, newId } from '../lib/store.js';
import { buildSchedule, mapPoints, MODE_LABEL } from '../lib/schedule.js';
import { useRoutes, getRoute, decodePolyline, gmapsDir, bestOrder, haversine, geocode } from '../lib/geo.js';
import { useTransit, isAutoMove, MODE_COLOR } from '../lib/transit.js';
import { bestInsertIndex, mealInsertIndex } from '../lib/planner.js';
import Leg, { chooseMove } from '../components/Leg.jsx';
import { fmt, fmtDur, fmtDate, sunset, toMin, todayISO, nowMin } from '../lib/time.js';
import { play, unlock, player, usePlayer } from '../lib/tts.js';
import Icon, { modeIcon } from '../components/Icon.jsx';
import MapView from '../components/MapView.jsx';
import { Header, Sheet, Field, Alert, go, back, Empty, Toast, money } from '../components/ui.jsx';
import { planDay, usedPlaces, PACE } from '../lib/planner.js';
import Weather from '../components/Weather.jsx';

const CAT_ICON = { meal: 'meal', lodging: 'bed', transfer: 'ticket' };

export default function Dia({ date }) {
  const sv = useStore(); const rv = useRoutes(); const tv = useTransit(); usePlayer();
  const dayId = 'd-' + date;
  const day = get(dayId);
  const days = all('day').sort((a, b) => a.date.localeCompare(b.date));
  const [edit, setEdit] = useState(false);
  const [sheet, setSheet] = useState(null); // {type:'item', index} | {type:'add'} | {type:'start'}
  const [cityFilter, setCityFilter] = useState('');
  const [focus, setFocus] = useState(null);
  const [guide, setGuide] = useState(false);
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState(null);
  const played = useRef(new Set());
  const rowRefs = useRef({});

  const sched = useMemo(() => day ? buildSchedule(day) : null, [day, sv, rv, tv]); // eslint-disable-line
  const cities = (day?.cities || []).map(id => ({ id, ...get(id) })).filter(c => c.name);
  const mainCity = cities[0];
  const color = (cities.find(c => c.id === cityFilter) || mainCity)?.color || '#15233f';

  // Modo guía: ubicación + audio automático al acercarse
  useEffect(() => {
    if (!guide || !navigator.geolocation) return;
    let lock = null;
    navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    const id = navigator.geolocation.watchPosition(pos => {
      const u = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
      setUser(u);
      if (!sched) return;
      for (const r of sched.rows) {
        if (!r.place || !r.place.audio || !r.loc) continue;
        if (played.current.has(r.item.id)) continue;
        if (haversine(u, r.loc) < 70) {
          played.current.add(r.item.id);
          if (!player.playing) play(r.item.p, r.place.name, r.place.audio);
          break;
        }
      }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
    return () => { navigator.geolocation.clearWatch(id); lock?.release?.(); };
  }, [guide, sched]);

  if (!day) return <><Header title="Día no encontrado" onBack={() => back()} /><Empty title="Este día no existe">Puede que se haya borrado.</Empty></>;

  const idx = days.findIndex(d => d.date === date);
  const prev = days[idx - 1], next = days[idx + 1];
  const pts = mapPoints(sched);
  const rowCity = r => r.place?.cityId || r.cityId || r.transfer?.to || '';
  const isToday = todayISO() === date;
  const now = isToday ? nowMin() : null;

  const markers = pts.map(({ n, row }) => ({
    id: row.item.id, lat: row.loc.lat, lng: row.loc.lng, label: row.kind === 'lodging' ? '⌂' : (n ?? ''), shape: row.kind === 'transfer' ? 'dot' : 'num',
    color: get(rowCity(row))?.color || color, title: row.name,
    dim: cityFilter && rowCity(row) !== cityFilter, active: focus && focus.id === row.item.id
  }));
  const lines = [];
  for (const r of sched.rows) {
    if (r.move && r.move.from && r.move.to) {
      const c = get(rowCity(r))?.color || color;
      if (r.move.mode === 'pt' && r.move.opt) {
        for (const l of r.move.opt.legs) {
          if (l.mode === 'WALK') { if (l.a && l.b) lines.push({ coords: [l.a, l.b], color: c, weight: 3, dash: '2 7' }); }
          else lines.push({ coords: decodePolyline(l.g), color: l.color || MODE_COLOR[l.mode] || c, weight: 5, halo: true });
        }
      } else if (r.move.mode === 'walk') {
        const rt = getRoute(r.move.from, r.move.to);
        lines.push(rt ? { coords: decodePolyline(rt.g), color: c, weight: 4, halo: true } : { coords: [[r.move.from.lat, r.move.from.lng], [r.move.to.lat, r.move.to.lng]], color: c, weight: 3, dash: '2 7' });
      } else lines.push({ coords: [[r.move.from.lat, r.move.from.lng], [r.move.to.lat, r.move.to.lng]], color: c, weight: 3, dash: '10 8', opacity: 0.7 });
    }
    if (r.kind === 'transfer' && r.loc && r.endLoc) lines.push({ coords: [[r.loc.lat, r.loc.lng], [r.endLoc.lat, r.endLoc.lng]], color: '#6b7280', weight: 2, dash: r.transfer.mode === 'plane' ? '4 8' : '12 6', opacity: 0.6, fit: !cityFilter });
  }
  const fitMarkers = cityFilter ? markers.filter(m => !m.dim) : markers;

  const setItems = (fn, msg) => {
    const before = day.items;
    update(dayId, d => { d.items = fn(d.items.slice()); });
    if (msg) setToast({ msg, undo: () => update(dayId, d => { d.items = before; }) });
  };
  const chooseLeg = (i, c) => chooseMove(dayId, i, c);
  const move = (i, delta) => setItems(items => { const j = i + delta; if (j < 0 || j >= items.length) return items; [items[i], items[j]] = [items[j], items[i]]; return items; });

  const optimize = () => {
    const items = day.items.slice();
    const rows = sched.rows;
    const movable = i => (items[i].t === 'place' || items[i].t === 'custom') && !items[i].fixed && rows[i].loc;
    let i = 0, saved = 0;
    while (i < items.length) {
      if (!movable(i)) { i++; continue; }
      let j = i;
      while (j + 1 < items.length && movable(j + 1)) j++;
      if (j > i) {
        let start = null;
        for (let k = i - 1; k >= 0; k--) { const r = rows[k]; const l = r.kind === 'transfer' ? r.endLoc : r.loc; if (l) { start = l; break; } }
        const endRow = rows[j + 1];
        const end = endRow && endRow.loc && endRow.kind !== 'meal' ? endRow.loc : null;
        const run = items.slice(i, j + 1);
        const pointsRun = rows.slice(i, j + 1).map(r => r.loc);
        const dist = ord => { let d = start ? haversine(start, pointsRun[ord[0]]) : 0; for (let q = 0; q < ord.length - 1; q++) d += haversine(pointsRun[ord[q]], pointsRun[ord[q + 1]]); if (end) d += haversine(pointsRun[ord[ord.length - 1]], end); return d; };
        const ord = bestOrder(pointsRun, start, end);
        saved += dist(run.map((_, q) => q)) - dist(ord);
        const reordered = ord.map(q => run[q]);
        items.splice(i, run.length, ...reordered);
      }
      i = j + 1;
    }
    if (saved < 20) { setToast({ msg: 'El orden ya era el más corto.' }); return; }
    setItems(() => items, `Orden optimizado: ${(saved * 1.3 / 1000).toFixed(1)} km menos a pie`);
  };

  const scrollTo = id => { const el = rowRefs.current[id]; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const sun = mainCity ? sunset(mainCity.lat, mainCity.lng, date) : null;

  return (
    <div className="page day" style={{ '--city': color }}>
      <Header title={fmtDate(date, true)} sub={day.title} onBack={() => back('/viaje')}
        right={<button className={`icon-btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} aria-pressed={edit} aria-label="Editar día"><Icon name="edit" /></button>} />

      {cities.length > 1 && (
        <div className="chips scroll" role="tablist" aria-label="Ciudad del mapa">
          <button className={`chip ${!cityFilter ? 'on' : ''}`} onClick={() => setCityFilter('')}>Todo el día</button>
          {cities.map(c => <button key={c.id} className={`chip cdot ${cityFilter === c.id ? 'on' : ''}`} style={{ '--c': c.color }} onClick={() => setCityFilter(c.id)}>{c.flag} {c.name}</button>)}
        </div>
      )}

      <MapView markers={markers} lines={lines} fitKey={dayId + cityFilter + markers.length + (cityFilter ? 'f' : '')}
        user={user} focus={focus}
        onMarker={mk => { setFocus({ id: mk.id, lat: mk.lat, lng: mk.lng }); scrollTo(mk.id); }}
        height="40vh" padding={36} fitTo={fitMarkers.map(m => [m.lat, m.lng])} />

      <div className="day-facts">
        <button className="fact btn-plain" onClick={() => setSheet({ type: 'start' })}><Icon name="clock" size={16} /><span>Inicio <b>{day.start}</b></span></button>
        <div className="fact"><Icon name="today" size={16} /><span>Termina <b>{fmt(sched.end)}</b></span></div>
        <div className="fact"><Icon name="walk" size={16} /><span><b>{sched.walkKm.toFixed(1)} km</b> a pie</span></div>
        {sched.transport.count ? <div className="fact"><Icon name="metro" size={16} /><span><b>{sched.transport.count}</b> {sched.transport.count === 1 ? 'viaje' : 'viajes'} · <b>≈ {Object.entries(sched.transport.totals).map(([cur, v]) => money(v, cur)).join(' + ')}</b> c/u</span></div> : null}
        {sun ? <div className="fact"><Icon name="sunset" size={16} /><span>Atardecer <b>{fmt(sun)}</b></span></div> : null}
        {mainCity ? <Weather city={mainCity} date={date} /> : null}
      </div>

      <div className="day-actions">
        <button className={`btn ${guide ? 'primary' : ''}`} onClick={() => { unlock(); setGuide(!guide); }} aria-pressed={guide}>
          <Icon name="audio" size={18} />{guide ? 'Modo guía activo' : 'Modo guía'}
        </button>
        <button className="btn" onClick={() => setSheet({ type: 'plan' })}><Icon name="wand" size={18} />Armar el día por mí</button>
        {edit ? <button className="btn" onClick={optimize}><Icon name="route" size={18} />Optimizar orden</button> : null}
        <button className="btn" onClick={() => setSheet({ type: 'add' })}><Icon name="plus" size={18} />Agregar parada</button>
      </div>
      {guide ? <p className="hint">Con la app abierta, la audioguía suena sola al llegar a cada lugar. Mantén la pantalla encendida.</p> : null}
      {sched.alertCount ? <p className="hint warn"><Icon name="warn" size={15} /> {sched.alertCount} {sched.alertCount === 1 ? 'aviso' : 'avisos'} de horario en este día.</p> : null}

      <ol className="line" aria-label="Recorrido del día">
        {sched.rows.map((r, i) => {
          const num = pts.find(p => p.row === r)?.n;
          const c = get(rowCity(r))?.color || color;
          const current = now != null && r.start <= now && now < r.end;
          const done = r.item.done;
          return (
            <li key={r.item.id} ref={el => { rowRefs.current[r.item.id] = el; }} className={`stop k-${r.kind} ${done ? 'done' : ''} ${current ? 'current' : ''} ${r.item.opt ? 'opt' : ''}`} style={{ '--c': c }}>
              {(r.move || r.wait > 4) ? <Leg row={r} onChoose={c => chooseLeg(i, c)} /> : null}
              <div className="stop-row">
                <div className="t">
                  <b>{fmt(r.start)}</b>
                  {r.kind === 'transfer' ? <small>llega {r.overnight ? `${r.transfer.arr} (+1)` : fmt(r.end)}</small> : r.end > r.start ? <small>{fmt(r.end)}</small> : null}
                  {r.item.fixed || r.kind === 'transfer' ? <span className="fixed" title="Hora fija"><Icon name="lock" size={12} /></span> : null}
                </div>
                <div className="st" aria-hidden="true">
                  <span className={`st-dot ${r.loc ? '' : 'nl'}`}>{num ? num : <Icon name={r.kind === 'transfer' ? modeIcon(r.transfer.mode) : (CAT_ICON[r.kind] || 'pin')} size={14} />}</span>
                </div>
                <div className="body">
                  <button className="body-main btn-plain" onClick={() => {
                    if (edit) setSheet({ type: 'item', index: i });
                    else if (r.kind === 'place') go(`/lugar/${r.item.p}?dia=${date}&item=${r.item.id}`);
                    else if (r.kind === 'transfer') go(`/traslado/${r.item.tr}`);
                    else if (r.kind === 'lodging') go(`/ciudad/${r.cityId}?aloj=1`);
                    else setSheet({ type: 'item', index: i });
                  }}>
                    <span className="name">{r.name}{r.item.opt ? <em className="tag">opcional</em> : null}{r.item.ext ? <em className="tag">por fuera</em> : null}{r.booked ? <em className="tag ok">reservado</em> : null}</span>
                    <span className="meta">
                      {r.kind === 'transfer' ? `${r.fromName || ''} → ${r.toName || ''}` :
                        r.kind === 'lodging' ? (r.lodgingReal ? r.lodgingName : 'Alojamiento sin definir: toca para agregarlo') :
                          r.dur ? fmtDur(r.dur) : ''}
                      {r.place && r.place.priceTxt && !r.item.ext ? ` · ${r.place.price ? (r.place.currency === 'CHF' ? `${r.place.price} CHF` : `${r.place.price} €`) : 'Gratis'}` : ''}
                      {r.place && r.place.audio ? <span className="has-audio"><Icon name="audio" size={13} /></span> : null}
                    </span>
                    {r.item.note ? <span className="note">{r.item.note}</span> : null}
                  </button>
                  {r.alerts.length ? <div className="alerts">{r.alerts.map((a, k) => <Alert key={k} a={a} />)}</div> : null}
                  {!edit && r.loc && r.kind !== 'meal' && !(r.kind === 'lodging' && !r.lodgingReal) ? (
                    <div className="row-actions">
                      <a className="btn sm" href={gmapsDir(r.loc, r.move?.mode || 'walk')} target="_blank" rel="noreferrer"><Icon name="nav" size={15} />Cómo llegar</a>
                      {r.place && r.place.audio ? <button className="btn sm" onClick={() => { unlock(); play(r.item.p, r.place.name, r.place.audio); }}><Icon name="play" size={15} />Audio</button> : null}
                      {r.kind === 'place' || r.kind === 'custom' ? <button className={`btn sm ghost round ${done ? 'on' : ''}`} onClick={() => update(dayId, d => { d.items[i].done = !d.items[i].done; })} aria-pressed={!!done} aria-label={done ? 'Visitado' : 'Marcar como visitado'} title={done ? 'Visitado' : 'Marcar como visitado'}><Icon name="check" size={16} /></button> : null}
                    </div>
                  ) : null}
                </div>
                {edit ? (
                  <div className="edit-col">
                    <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir"><Icon name="up" size={18} /></button>
                    <button className="icon-btn sm" onClick={() => setSheet({ type: 'item', index: i })} aria-label="Editar"><Icon name="more" size={18} /></button>
                    <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === sched.rows.length - 1} aria-label="Bajar"><Icon name="down" size={18} /></button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {day.notes ? <p className="day-notes"><Icon name="info" size={16} /> {day.notes}</p> : null}

      <nav className="day-nav">
        {prev ? <button className="btn" onClick={() => go(`/dia/${prev.date}`)}><Icon name="back" size={18} />{fmtDate(prev.date)}</button> : <span />}
        {next ? <button className="btn" onClick={() => go(`/dia/${next.date}`)}>{fmtDate(next.date)}<Icon name="next" size={18} /></button> : <span />}
      </nav>

      {sheet?.type === 'item' && <ItemSheet day={day} dayId={dayId} index={sheet.index} row={sched.rows[sheet.index]} days={days} onClose={() => setSheet(null)} setToast={setToast} />}
      {sheet?.type === 'add' && <AddSheet day={day} dayId={dayId} cities={cities} onClose={() => setSheet(null)} setToast={setToast} />}
      {sheet?.type === 'start' && <StartSheet day={day} dayId={dayId} onClose={() => setSheet(null)} />}
      {sheet?.type === 'plan' && <PlannerSheet day={day} dayId={dayId} cities={cities} onClose={() => setSheet(null)} setToast={setToast} />}
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

function StartSheet({ day, dayId, onClose }) {
  const [v, setV] = useState(day.start);
  return (
    <Sheet open title="Hora de inicio del día" onClose={onClose}
      footer={<button className="btn primary wide" onClick={() => { if (toMin(v) != null) update(dayId, d => { d.start = v; }); onClose(); }}>Guardar</button>}>
      <Field label="Salen a las"><input type="time" value={v} onChange={e => setV(e.target.value)} /></Field>
      <p className="hint">Todas las horas del día se recalculan a partir de aquí.</p>
    </Sheet>
  );
}

function ItemSheet({ day, dayId, index, row, days, onClose, setToast }) {
  const it = day.items[index];
  const [f, setF] = useState({
    name: it.name || '', dur: row?.dur ?? it.dur ?? 30, fixed: it.fixed || '', note: it.note || '',
    booked: !!it.booked, ext: !!it.ext, opt: !!it.opt,
    mode: isAutoMove(it.move) ? 'auto' : it.move.m, min: it.move?.min ?? '', txt: it.move?.txt || ''
  });
  const [target, setTarget] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const isTransfer = it.t === 'transfer';
  const save = () => {
    update(dayId, d => {
      const x = d.items[index];
      if (it.t !== 'place' && it.t !== 'transfer') x.name = f.name;
      else if (f.name && f.name !== row?.place?.name) x.name = f.name; else if (it.t === 'place' && !f.name) delete x.name;
      if (!isTransfer) { x.dur = Number(f.dur) || 0; x.fixed = f.fixed || undefined; if (!x.fixed) delete x.fixed; }
      x.note = f.note || undefined; if (!x.note) delete x.note;
      x.booked = f.booked || undefined; if (!x.booked) delete x.booked;
      x.ext = f.ext || undefined; if (!x.ext) delete x.ext;
      x.opt = f.opt || undefined; if (!x.opt) delete x.opt;
      if (f.mode === 'auto') delete x.move;
      else if (f.mode === 'pt') { /* se mantiene la línea elegida en el tramo */ }
      else x.move = { m: f.mode, ...(f.min !== '' && f.mode !== 'walk' ? { min: Number(f.min) } : {}), ...(f.txt ? { txt: f.txt } : {}) };
    });
    onClose();
  };
  const del = () => {
    const before = day.items;
    update(dayId, d => { d.items.splice(index, 1); });
    setToast({ msg: `Se quitó "${row?.name || 'la parada'}"`, undo: () => update(dayId, d => { d.items = before; }) });
    onClose();
  };
  const moveTo = () => {
    if (!target) return;
    const item = structuredClone(it);
    update(dayId, d => { d.items.splice(index, 1); });
    update('d-' + target, d => { d.items.push(item); });
    setToast({ msg: `Movido al ${fmtDate(target)}` });
    onClose();
  };
  return (
    <Sheet open title={row?.name || 'Editar parada'} onClose={onClose}
      footer={<><button className="btn danger" onClick={del}><Icon name="trash" size={18} />Quitar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      {it.t !== 'transfer' && <Field label="Nombre" hint={it.t === 'place' ? 'Déjalo vacío para usar el nombre del lugar.' : ''}><input value={f.name} placeholder={row?.place?.name || ''} onChange={e => set('name', e.target.value)} /></Field>}
      {!isTransfer && (
        <div className="grid2">
          <Field label="Duración (min)">
            <div className="stepper">
              <button className="icon-btn sm" onClick={() => set('dur', Math.max(0, Number(f.dur) - 15))} aria-label="Menos 15 minutos"><Icon name="minus" size={16} /></button>
              <input type="number" inputMode="numeric" value={f.dur} onChange={e => set('dur', e.target.value)} />
              <button className="icon-btn sm" onClick={() => set('dur', Number(f.dur) + 15)} aria-label="Más 15 minutos"><Icon name="plus" size={16} /></button>
            </div>
          </Field>
          <Field label="Hora fija" hint="Entrada con hora, tren…"><input type="time" value={f.fixed} onChange={e => set('fixed', e.target.value)} /></Field>
        </div>
      )}
      <fieldset className="field">
        <span className="field-label">Cómo llegar desde la parada anterior</span>
        <div className="seg wrap">
          {[...(f.mode === 'pt' ? ['pt'] : []), 'auto', 'walk', 'metro', 'bus', 'tram', 'train', 'vaporetto', 'taxi'].map(m => (
            <button key={m} className={f.mode === m ? 'on' : ''} onClick={() => set('mode', m)}><Icon name={m === 'auto' ? 'wand' : m === 'pt' ? 'metro' : modeIcon(m)} size={16} />{m === 'auto' ? 'automático' : m === 'pt' ? 'línea elegida' : MODE_LABEL[m]}</button>
          ))}
        </div>
        {f.mode === 'auto' ? <p className="hint">La app propone a pie o transporte según la distancia; en el tramo pueden ver y elegir las líneas.</p> : f.mode === 'pt' ? <p className="hint">Usan la línea que eligieron en el tramo. Para cambiarla, toquen el tramo en el día.</p> : (
          <div className="grid2">
            <input type="number" inputMode="numeric" placeholder={f.mode === 'walk' ? 'Calculado' : 'Minutos'} value={f.mode === 'walk' ? '' : f.min} disabled={f.mode === 'walk'} onChange={e => set('min', e.target.value)} aria-label="Minutos de traslado" />
            <input placeholder="Línea / indicación" value={f.txt} onChange={e => set('txt', e.target.value)} aria-label="Indicación" />
          </div>
        )}
      </fieldset>
      {it.t === 'place' && (
        <div className="toggles">
          <label className="tgl"><input type="checkbox" checked={f.booked} onChange={e => set('booked', e.target.checked)} /> Ya tenemos la entrada</label>
          <label className="tgl"><input type="checkbox" checked={f.ext} onChange={e => set('ext', e.target.checked)} /> Solo por fuera (sin entrar)</label>
          <label className="tgl"><input type="checkbox" checked={f.opt} onChange={e => set('opt', e.target.checked)} /> Opcional</label>
        </div>
      )}
      <Field label="Nota"><textarea rows={2} value={f.note} onChange={e => set('note', e.target.value)} /></Field>
      <Field label="Mover a otro día">
        <div className="grid2">
          <select value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Elegir día…</option>
            {days.filter(d => d.date !== day.date).map(d => <option key={d.date} value={d.date}>{fmtDate(d.date)}: {d.title}</option>)}
          </select>
          <button className="btn" onClick={moveTo} disabled={!target}>Mover</button>
        </div>
      </Field>
    </Sheet>
  );
}

function AddSheet({ day, dayId, cities, onClose, setToast }) {
  const [tab, setTab] = useState('catalogo');
  const [q, setQ] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  const cityIds = cities.map(c => c.id);
  const inDay = new Set(day.items.filter(i => i.t === 'place').map(i => i.p));
  const places = all('place').filter(p => cityIds.includes(p.cityId) && p.cat !== 'transporte')
    .filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .filter(p => !onlyFree || !p.price)
    .sort((a, b) => (a.pri || 3) - (b.pri || 3) || a.name.localeCompare(b.name));
  // Inserta en el mejor punto del día y avisa a qué hora quedó (con deshacer)
  const insertAt = (item, i) => {
    const before = [...day.items];
    const idx = Math.max(0, Math.min(i, before.length));
    update(dayId, d => { d.items.splice(idx, 0, item); });
    const s = buildSchedule({ ...day, items: [...before.slice(0, idx), item, ...before.slice(idx)] }, { fetchRoutes: false });
    const r = s.rows[idx];
    const pos = idx >= before.length ? 'al final del día' : idx === 0 ? 'al inicio del día' : `después de ${s.rows[idx - 1]?.name || 'la parada anterior'}`;
    setToast && setToast({ msg: `Agregado a las ${r ? fmt(r.start) : '?'}, ${pos}.`, undo: () => update(dayId, d => { d.items = before; }) });
    onClose();
  };
  const addPlace = p => { const it = { id: newId('i'), t: 'place', p: p.id }; insertAt(it, bestInsertIndex(day, it).i); };
  const addMeal = name => insertAt({ id: newId('i'), t: 'meal', name, dur: name === 'Descanso' ? 45 : 60 }, mealInsertIndex(day, name));

  const [cName, setCName] = useState('');
  const [cQ, setCQ] = useState('');
  const [res, setRes] = useState([]);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const center = cities[0] ? { lat: cities[0].lat, lng: cities[0].lng } : null;
  const search = async () => { setBusy(true); try { setRes(await geocode(cQ, center)); } catch { setRes([]); } setBusy(false); };
  const addCustom = () => {
    if (!cName || !pick) return;
    const it = { id: newId('i'), t: 'custom', name: cName, lat: pick.lat, lng: pick.lng, dur: 30 };
    insertAt(it, bestInsertIndex(day, it).i);
  };

  return (
    <Sheet open title="Agregar al día" onClose={onClose}>
      <div className="seg">
        <button className={tab === 'catalogo' ? 'on' : ''} onClick={() => setTab('catalogo')}>Del catálogo</button>
        <button className={tab === 'comida' ? 'on' : ''} onClick={() => setTab('comida')}>Comida o pausa</button>
        <button className={tab === 'propio' ? 'on' : ''} onClick={() => setTab('propio')}>Punto propio</button>
      </div>
      {tab === 'catalogo' && <>
        <div className="grid2 tight">
          <input placeholder="Buscar lugar" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar lugar" />
          <label className="tgl"><input type="checkbox" checked={onlyFree} onChange={e => setOnlyFree(e.target.checked)} /> Solo gratis</label>
        </div>
        <p className="hint">Se agrega donde menos tiempo le suma al día.</p>
        <ul className="pick-list">
          {places.map(p => (
            <li key={p.id}>
              <button className="btn-plain pick" onClick={() => addPlace(p)}>
                <span className="pick-name">{p.name}{p.pri === 1 ? <em className="tag star">imprescindible</em> : null}</span>
                <span className="pick-meta">{get(p.cityId)?.name} · {p.price ? `${p.price} ${p.currency === 'CHF' ? 'CHF' : '€'}` : 'Gratis'} · {fmtDur(p.dur || 30)}{inDay.has(p.id) ? ' · ya está en el día' : ''}</span>
              </button>
            </li>
          ))}
          {!places.length && <li className="hint">No hay lugares con ese filtro.</li>}
        </ul>
      </>}
      {tab === 'comida' && (
        <div className="stack">
          {['Desayuno', 'Almuerzo', 'Cena', 'Café / merienda', 'Descanso'].map(n => <button key={n} className="btn wide" onClick={() => addMeal(n)}><Icon name={n === 'Descanso' ? 'rest' : 'meal'} size={18} />{n}</button>)}
          <p className="hint">Se acomoda sola en la hora típica del país (en España se come y se cena más tarde). Pueden moverla con las flechas en modo edición.</p>
        </div>
      )}
      {tab === 'propio' && (
        <div className="stack">
          <Field label="Nombre"><input value={cName} onChange={e => setCName(e.target.value)} placeholder="Ej.: Tienda de recuerdos" /></Field>
          <Field label="Buscar dirección o lugar">
            <div className="grid2 tight"><input value={cQ} onChange={e => setCQ(e.target.value)} placeholder="Dirección" /><button className="btn" onClick={search} disabled={!cQ || busy}>{busy ? 'Buscando…' : 'Buscar'}</button></div>
          </Field>
          {res.length ? <ul className="pick-list">{res.map((r, k) => <li key={k}><button className={`btn-plain pick ${pick === r ? 'on' : ''}`} onClick={() => { setPick(r); if (!cName) setCName(r.name.split(',')[0]); }}><span className="pick-meta">{r.name}</span></button></li>)}</ul> : null}
          <p className="hint">O toca el mapa para marcar el punto:</p>
          <MapView markers={pick ? [{ lat: pick.lat, lng: pick.lng, label: '★', color: '#15233f' }] : []} fitKey={pick ? `${pick.lat}` : 'c'} onPick={setPick} height="220px" center={center} />
          <button className="btn primary wide" onClick={addCustom} disabled={!cName || !pick}>Agregar punto</button>
        </div>
      )}
    </Sheet>
  );
}

export function PlannerOptions({ o, setO }) {
  const set = (k, v) => setO(x => ({ ...x, [k]: v }));
  return (
    <>
      <Field label="Ritmo">
        <div className="seg">{Object.entries(PACE).map(([k, v]) => <button key={k} className={o.pace === k ? 'on' : ''} onClick={() => set('pace', k)}>{v.label}</button>)}</div>
      </Field>
      <Field label="Entradas">
        <div className="seg wrap">
          {[['gratis', 'Solo gratis'], ['imprescindibles', 'Gratis + imprescindibles'], ['todo', 'Todo']].map(([k, l]) => <button key={k} className={o.tickets === k ? 'on' : ''} onClick={() => set('tickets', k)}>{l}</button>)}
        </div>
      </Field>
      <div className="grid2">
        <Field label="Terminar a las"><input type="time" value={o.end} onChange={e => set('end', e.target.value)} /></Field>
        <label className="tgl"><input type="checkbox" checked={o.meals} onChange={e => set('meals', e.target.checked)} /> Incluir almuerzo y cena</label>
      </div>
    </>
  );
}

function PlannerSheet({ day, dayId, onClose, setToast }) {
  const [o, setO] = useState({ pace: 'normal', tickets: 'imprescindibles', end: '22:30', meals: true, repeat: false });
  const run = () => {
    const used = o.repeat ? new Set() : usedPlaces([dayId]);
    const res = planDay(day, o, used);
    const before = day.items;
    update(dayId, d => { d.items = res.items; });
    setToast({ msg: res.added ? `Día armado con ${res.added} lugares.` : 'No encontré lugares que quepan en el tiempo libre de este día.', undo: () => update(dayId, d => { d.items = before; }) });
    onClose();
  };
  return (
    <Sheet open title="Armar el día por mí" onClose={onClose} footer={<button className="btn primary wide" onClick={run}><Icon name="wand" size={18} />Armar el día</button>}>
      <p className="hint">Elige los mejores lugares del catálogo que caben en el tiempo libre, respetando horarios de apertura y las horas de comida del país, y los ordena para caminar lo menos posible. Se quedan los trenes, vuelos, el alojamiento y todo lo que tenga hora fija. Lo puedes deshacer.</p>
      <PlannerOptions o={o} setO={setO} />
      <label className="tgl"><input type="checkbox" checked={o.repeat} onChange={e => setO(x => ({ ...x, repeat: e.target.checked }))} /> Permitir lugares que ya están en otros días</label>
    </Sheet>
  );
}
