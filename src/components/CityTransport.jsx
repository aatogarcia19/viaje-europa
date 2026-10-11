import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { get, put, remove, newId, me, useStore } from '../lib/store.js';
import { fmtDate } from '../lib/time.js';
import { FARES } from '../lib/fares.js';
import { cityTransport, computeRoutes } from '../lib/transport.js';
import { useTransit, queueSize, tstatus, TRANSITOUS_SOURCES } from '../lib/transit.js';
import { money } from './ui.jsx';

// Sección "Transporte y precios" de una ciudad: precios, viajes del plan, abono que conviene y consejos
export default function CityTransport({ city, cityId, setToast }) {
  const sv = useStore(); const tv = useTransit();
  const cid = cityId || city.id;
  const F = FARES[cid];
  const ct = useMemo(() => (F ? cityTransport(cid) : null), [cid, sv, tv]); // eslint-disable-line
  const [showPrices, setShowPrices] = useState(false);
  const [asked, setAsked] = useState(0);
  const busy = queueSize();
  const trip = get('trip') || {};
  const travelers = (trip.travelers || ['Viajero 1', 'Viajero 2']);

  if (!F) {
    return city.transport && city.transport.length ? (
      <section className="block">
        <h2><Icon name="metro" size={18} /> Moverse</h2>
        <ul className="tips">{city.transport.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </section>
    ) : null;
  }

  const cmp = ct.cmp;
  const dates = Object.keys(ct.byDate).sort();
  const best = cmp && cmp.best;
  const singles = cmp ? cmp.singles : 0;
  const saving = best && best.id !== 'singles' ? Math.round((singles - best.cost) * 100) / 100 : 0;

  const calc = () => {
    if (!navigator.onLine) { setToast && setToast({ msg: 'Sin conexión: las rutas se calculan cuando haya internet.' }); return; }
    const n = computeRoutes(cid);
    setAsked(n);
    setToast && setToast({ msg: n ? `Calculando ${n} ${n === 1 ? 'tramo' : 'tramos'} de ${city.name}…` : `Los tramos de ${city.name} ya están calculados.` });
  };

  const addExpense = () => {
    if (!best) return;
    const id = newId('g');
    const amount = Math.round(best.cost * travelers.length * 100) / 100;
    put(id, 'expense', {
      desc: `Transporte en ${city.name}: ${best.name}`, amount, currency: cmp.cur,
      paidBy: travelers.includes(me()) ? me() : travelers[0], split: 'mitad', cat: 'Transporte local',
      date: dates[0] || city.arrive, cityId: cid, ts: new Date().toISOString(), planned: true
    });
    setToast && setToast({ msg: `Anotado en Gastos: ${money(amount, cmp.cur)} (los dos).`, undo: () => remove(id) });
  };

  return (
    <section className="block ctr" id="transporte">
      <h2><Icon name="metro" size={18} /> Transporte y precios</h2>

      {ct.trips.length ? (
        <div className="ctr-card">
          <div className="ctr-head">
            <span><small>Con el plan actual</small><b>{ct.trips.length} {ct.trips.length === 1 ? 'viaje' : 'viajes'} en transporte</b></span>
            <span className="ctr-total"><small>por persona</small><b>{ct.est ? '≈ ' : ''}{money(best.cost, cmp.cur)}</b></span>
          </div>
          {best.id !== 'singles' && saving > 0.2 ? (
            <p className="ctr-rec"><Icon name="check" size={16} /><span>Les conviene <b>{best.name}</b>: ahorran {money(saving, cmp.cur)} cada uno frente a {cmp.results.find(r => r.id === 'singles')?.name.toLowerCase()} ({money(singles, cmp.cur)}).</span></p>
          ) : (
            <p className="ctr-rec"><Icon name="check" size={16} /><span>Les conviene <b>{best.name.toLowerCase()}</b>: con estos viajes ningún abono sale más barato.</span></p>
          )}
          <ul className="ctr-opts">
            {cmp.results.map(r => (
              <li key={r.id} className={r.id === best.id ? 'on' : ''}>
                <span>{r.name}{r.note ? <small>{r.note}</small> : null}</span>
                <b>{money(r.cost, cmp.cur)}</b>
              </li>
            ))}
          </ul>
          {dates.length > 1 ? (
            <ul className="ctr-days">
              {dates.map(d => <li key={d}><a href={`#/dia/${d}`}>{fmtDate(d)}</a><span>{ct.byDate[d].n} {ct.byDate[d].n === 1 ? 'viaje' : 'viajes'}</span><b>{money(Math.round(ct.byDate[d].amt * 100) / 100, cmp.cur)}</b></li>)}
            </ul>
          ) : null}
          {ct.est ? <p className="hint">Algunos tramos todavía tienen precio aproximado porque falta calcular sus líneas.</p> : null}
          <p className="hint">Precios por persona según lo que hoy tienen elegido en cada día. Si cambian un tramo a pie o en bus, esto se recalcula solo.</p>
          <div className="actions-row">
            <button className="btn sm" onClick={calc} disabled={busy > 0}><Icon name="route" size={15} />{busy > 0 ? `Calculando… (${busy})` : `Calcular rutas de ${city.name}`}</button>
            <button className="btn sm" onClick={addExpense}><Icon name="wallet" size={15} />Anotar en gastos</button>
          </div>
          {asked && !busy && tstatus.failed ? <p className="hint warn">{tstatus.failed} {tstatus.failed === 1 ? 'tramo no se pudo' : 'tramos no se pudieron'} calcular{tstatus.offline ? ' (sin conexión)' : ''}. Pueden volver a intentarlo.</p> : null}
        </div>
      ) : (
        <div className="ctr-card">
          <p>Con el plan actual van a todas partes a pie o aún no hay tramos largos. Si agregan lugares lejanos, aquí aparece cuánto gastarán y qué abono conviene.</p>
          <div className="actions-row"><button className="btn sm" onClick={calc} disabled={busy > 0}><Icon name="route" size={15} />{busy > 0 ? `Calculando… (${busy})` : `Calcular rutas de ${city.name}`}</button></div>
        </div>
      )}

      <h3 className="ctr-sub">Consejos</h3>
      <ul className="tips">
        {F.tips.map((t, i) => <li key={'f' + i}>{t}</li>)}
        {(city.transport || []).map((t, i) => <li key={'c' + i}>{t}</li>)}
      </ul>

      <button className="btn-plain ctr-toggle" onClick={() => setShowPrices(!showPrices)} aria-expanded={showPrices}>
        <Icon name={showPrices ? 'up' : 'down'} size={15} /> Precios de billetes y abonos
      </button>
      {showPrices ? (
        <dl className="ctr-prices">
          {F.prices.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : null}
      <p className="leg-attr">
        {F.verify ? 'Algunas tarifas cambian a inicios de año: confírmenlas antes de viajar. ' : 'Tarifas de referencia: confírmenlas antes de viajar. '}
        Fuente oficial: <a href={F.official[1]} target="_blank" rel="noreferrer">{F.official[0]}</a>. Rutas: <a href={TRANSITOUS_SOURCES} target="_blank" rel="noreferrer">Transitous</a>.
      </p>
    </section>
  );
}
