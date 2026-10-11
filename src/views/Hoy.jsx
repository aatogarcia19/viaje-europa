import { useMemo } from 'react';
import { get, all, useStore } from '../lib/store.js';
import { buildSchedule } from '../lib/schedule.js';
import { fmt, fmtDate, fmtDur, todayISO, nowMin, daysBetween, sunset } from '../lib/time.js';
import { gmapsDir, useRoutes } from '../lib/geo.js';
import { play, unlock } from '../lib/tts.js';
import Icon, { modeIcon } from '../components/Icon.jsx';
import { Header, go } from '../components/ui.jsx';
import { Ticket } from './Viaje.jsx';
import Weather from '../components/Weather.jsx';
import Leg, { chooseMove } from '../components/Leg.jsx';
import { useTransit } from '../lib/transit.js';

export default function Hoy() {
  useStore(); const rv = useRoutes(); const tv = useTransit();
  const trip = get('trip') || {};
  const today = todayISO();
  const days = all('day').sort((a, b) => a.date.localeCompare(b.date));
  const day = days.find(d => d.date === today);
  const sched = useMemo(() => day ? buildSchedule(day) : null, [day, rv, tv]); // eslint-disable-line

  if (!trip.start) return <><Header title="Hoy" /><p className="pad hint">Cargando el viaje…</p></>;

  if (today < trip.start) {
    const left = daysBetween(today, trip.start);
    const checks = all('check');
    const pend = checks.filter(c => !c.done);
    const transfers = all('transfer').filter(t => t.status !== 'comprado').sort((a, b) => a.date.localeCompare(b.date));
    const noLodging = all('city').filter(c => c.lodging && typeof c.lodging.lat !== 'number').sort((a, b) => a.order - b.order);
    const groups = ['Reservas', 'Entradas', 'Hospedaje', 'Documentos'];
    return (
      <div className="page hoy">
        <Header title={trip.name} sub={`${fmtDate(trip.start, true)} – ${fmtDate(trip.end, true)}`} />
        <div className="pad">
          <div className="flap" aria-label={`Faltan ${left} días`}>
            <div className="flap-digits">{String(left).split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            <p>días para salir de Guatemala</p>
          </div>
          <section className="block">
            <h2><Icon name="list" size={18} /> Lo que falta</h2>
            <div className="progress-list">
              {groups.map(g => {
                const items = checks.filter(c => c.group === g);
                if (!items.length) return null;
                const done = items.filter(c => c.done).length;
                return (
                  <button key={g} className="btn-plain prog" onClick={() => go('/pendientes')}>
                    <span>{g}</span><span className="bar"><i style={{ width: `${(done / items.length) * 100}%` }} /></span><b>{done}/{items.length}</b>
                  </button>
                );
              })}
            </div>
            {pend.length ? <p className="hint">Siguiente: {pend.sort((a, b) => a.order - b.order)[0].text}</p> : null}
          </section>
          {noLodging.length ? (
            <section className="block">
              <h2><Icon name="bed" size={18} /> Alojamientos por definir</h2>
              <div className="chips wrap">{noLodging.map(c => <button key={c.id} className="chip cdot" style={{ '--c': c.color }} onClick={() => go(`/ciudad/${c.id}?aloj=1`)}>{c.flag} {c.name}</button>)}</div>
            </section>
          ) : null}
          <section className="block">
            <h2><Icon name="ticket" size={18} /> Trenes y vuelos por comprar ({transfers.length})</h2>
            <div className="stack">{transfers.slice(0, 3).map(t => <Ticket key={t.id} t={t} compact onClick={() => go(`/traslado/${t.id}`)} />)}</div>
            {transfers.length > 3 ? <button className="btn wide" onClick={() => go('/viaje?v=traslados')}>Ver los {transfers.length}</button> : null}
          </section>
          <section className="block">
            <h2><Icon name="calendar" size={18} /> Empezar a planear</h2>
            <div className="stack">
              <button className="btn wide" onClick={() => go('/dia/2027-06-04')}><Icon name="route" size={18} />Ver el primer día en Madrid</button>
              <button className="btn wide" onClick={() => go('/ciudad/c-madrid')}><Icon name="star" size={18} />Catálogo de Madrid con audioguías</button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (today > trip.end || !day) {
    return (
      <div className="page hoy">
        <Header title={trip.name} />
        <div className="pad">
          <div className="flap"><p>{today > trip.end ? 'El viaje terminó. ¡Bienvenidos de vuelta!' : 'Hoy no hay día planeado.'}</p></div>
          <button className="btn wide" onClick={() => go('/gastos')}><Icon name="wallet" size={18} />Ver el resumen de gastos</button>
        </div>
      </div>
    );
  }

  const now = nowMin();
  const rows = sched.rows;
  const curIdx = rows.findIndex(r => r.start <= now && now < r.end);
  const nextIdx = rows.findIndex(r => r.start > now);
  const cur = rows[curIdx];
  const nxt = rows[nextIdx];
  const city = get((day.cities || [])[0]);
  const sun = city ? sunset(city.lat, city.lng, today) : null;
  const target = nxt || cur;

  return (
    <div className="page hoy" style={{ '--city': city?.color }}>
      <Header title={`${city?.flag || ''} ${city?.name || 'Hoy'}`} sub={fmtDate(today, true)} />
      <div className="pad">
        <div className="board now">
          {cur ? <div className="board-line"><small>Ahora</small><b>{cur.name}</b><span>hasta las {fmt(cur.end)}</span></div> : null}
          {nxt ? (
            <div className="board-line next">
              <small>Siguiente</small>
              <b>{fmt(nxt.start)} {nxt.name}</b>
              <span>{nxt.move ? <><Icon name={modeIcon(nxt.move.mode)} size={14} /> {fmtDur(nxt.move.min)} · </> : null}{nxt.start - now > 0 ? `en ${fmtDur(nxt.start - now)}` : 'ya'}</span>
            </div>
          ) : <div className="board-line"><small>Fin del día</small><b>No hay más paradas</b></div>}
          {target?.alerts?.length ? <div className={`board-alert ${target.alerts[0].level}`}>{target.alerts[0].text}</div> : null}
        </div>
        {nxt?.move ? <div className="hoy-leg"><Leg row={nxt} onChoose={c => chooseMove('d-' + today, nextIdx, c)} /></div> : null}
        <div className="actions-row">
          {target?.loc ? <a className="btn primary" href={gmapsDir(target.loc, target.move?.mode || 'walk')} target="_blank" rel="noreferrer"><Icon name="nav" size={18} />Cómo llegar</a> : null}
          {target?.place?.audio ? <button className="btn" onClick={() => { unlock(); play(target.item.p, target.place.name, target.place.audio); }}><Icon name="play" size={18} />Escuchar</button> : null}
          <button className="btn" onClick={() => go(`/dia/${today}`)}><Icon name="route" size={18} />Día completo</button>
        </div>
        <div className="day-facts">
          {city ? <Weather city={city} date={today} /> : null}
          {sun ? <div className="fact"><Icon name="sunset" size={16} /><span>Atardecer <b>{fmt(sun)}</b></span></div> : null}
          <div className="fact"><Icon name="walk" size={16} /><span><b>{sched.walkKm.toFixed(1)} km</b> hoy</span></div>
        </div>
        <ol className="mini-line">
          {rows.map((r, i) => (
            <li key={r.item.id} className={`${i < (curIdx >= 0 ? curIdx : nextIdx) ? 'past' : ''} ${i === curIdx ? 'cur' : ''}`}>
              <b>{fmt(r.start)}</b><span>{r.name}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
