import { useState } from 'react';
import { get, all, put, remove, useStore, newId, me } from '../lib/store.js';
import { fmtDate, todayISO } from '../lib/time.js';
import Icon from '../components/Icon.jsx';
import { Header, Sheet, Field, money, Empty } from '../components/ui.jsx';

const SPLIT = { mitad: 'Mitad y mitad', pagador: 'Solo para quien pagó', otro: 'Todo para el otro' };

export function toQ(e, rates) { return (Number(e.amount) || 0) * (rates[e.currency] || 1); }

export default function Gastos() {
  useStore();
  const trip = get('trip') || {};
  const rates = trip.rates || { EUR: 8.8, CHF: 9.5, GTQ: 1 };
  const [A, B] = trip.travelers || ['Viajero 1', 'Viajero 2'];
  const exps = all('expense').sort((a, b) => (b.date + (b.ts || '')).localeCompare(a.date + (a.ts || '')));
  const [sheet, setSheet] = useState(null);
  const cats = [...Object.keys(trip.budget || {}), 'Otros'];

  let total = 0; const share = { [A]: 0, [B]: 0 }; let net = 0; // net > 0: B le debe a A
  const byCat = {};
  for (const e of exps) {
    const v = toQ(e, rates);
    total += v;
    const payer = e.paidBy === B ? B : A;
    const other = payer === A ? B : A;
    let sp = 0, so = 0;
    if (e.split === 'pagador') sp = v; else if (e.split === 'otro') so = v; else { sp = v / 2; so = v / 2; }
    share[payer] += sp; share[other] += so;
    const debt = so; // lo que el otro le debe al que pagó
    net += payer === A ? debt : -debt;
    byCat[e.cat || 'Otros'] = (byCat[e.cat || 'Otros'] || 0) + v;
  }
  const budgetPP = Object.values(trip.budget || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="page gastos">
      <Header title="Gastos" sub="Todo convertido a quetzales" right={<button className="icon-btn strong" onClick={() => setSheet({})} aria-label="Agregar gasto"><Icon name="plus" /></button>} />
      <div className="pad">
        <div className="summary">
          <div><small>Total gastado</small><b>{money(Math.round(total))}</b></div>
          <div><small>{A}</small><b>{money(Math.round(share[A]))}</b></div>
          <div><small>{B}</small><b>{money(Math.round(share[B]))}</b></div>
        </div>
        <div className={`balance ${Math.abs(net) < 1 ? 'even' : ''}`}>
          {Math.abs(net) < 1 ? 'Están a mano.' : net > 0 ? <><b>{B}</b> le debe <b>{money(Math.round(net))}</b> a <b>{A}</b></> : <><b>{A}</b> le debe <b>{money(Math.round(-net))}</b> a <b>{B}</b></>}
        </div>

        <section className="block">
          <h2><Icon name="wallet" size={18} /> Presupuesto por persona</h2>
          <ul className="budget">
            {Object.entries(trip.budget || {}).map(([k, b]) => {
              const spentPP = (byCat[k] || 0) / 2;
              const pct = Math.min(100, (spentPP / b) * 100);
              return (
                <li key={k}>
                  <span className="b-name">{k}</span>
                  <span className={`bar ${spentPP > b ? 'over' : ''}`}><i style={{ width: `${pct}%` }} /></span>
                  <span className="b-num">{money(Math.round(spentPP))} / {money(b)}</span>
                </li>
              );
            })}
            {byCat.Otros ? <li><span className="b-name">Otros</span><span className="bar"><i style={{ width: '0%' }} /></span><span className="b-num">{money(Math.round(byCat.Otros / 2))}</span></li> : null}
          </ul>
          <p className="hint">Presupuesto del documento: {money(budgetPP)} por persona. Tipo de cambio: 1 € = Q{rates.EUR}, 1 CHF = Q{rates.CHF} (se cambia en Ajustes).</p>
        </section>

        <section className="block">
          <h2><Icon name="list" size={18} /> Movimientos</h2>
          {exps.length ? (
            <ul className="exp-list">
              {exps.map(e => (
                <li key={e.id}>
                  <button className="btn-plain exp" onClick={() => setSheet(e)}>
                    <span className="exp-main"><b>{e.desc}</b><small>{fmtDate(e.date)} · {e.cat} · pagó {e.paidBy} · {SPLIT[e.split] || ''}</small></span>
                    <span className="exp-amt"><b>{money(e.amount, e.currency)}</b>{e.currency !== 'GTQ' ? <small>{money(Math.round(toQ(e, rates)))}</small> : null}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Empty icon="wallet" title="Sin gastos todavía"><p>Agrega cada compra (vuelos, Airbnb, entradas, comidas) y la app lleva la cuenta de quién le debe a quién.</p><button className="btn primary" onClick={() => setSheet({})}><Icon name="plus" size={18} />Agregar el primero</button></Empty>}
        </section>
      </div>
      {sheet && <ExpenseSheet e={sheet} cats={cats} travelers={[A, B]} onClose={() => setSheet(null)} />}
    </div>
  );
}

function ExpenseSheet({ e, cats, travelers, onClose }) {
  const today = todayISO();
  const trip = get('trip') || {};
  const day = all('day').find(d => d.date === today);
  const cityId = e.cityId || (day && day.cities && day.cities[0]) || '';
  const city = cityId ? get(cityId) : null;
  const [f, setF] = useState({
    desc: e.desc || '', amount: e.amount ?? '', currency: e.currency || (city ? city.currency : (today >= trip.start && today <= trip.end ? 'EUR' : 'GTQ')),
    paidBy: e.paidBy || (travelers.includes(me()) ? me() : travelers[0]), split: e.split || 'mitad', cat: e.cat || 'Comida', date: e.date || today, cityId
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = () => {
    const id = e.id || newId('g');
    put(id, 'expense', { ...f, amount: Number(String(f.amount).replace(',', '.')) || 0, ts: e.ts || new Date().toISOString() });
    onClose();
  };
  return (
    <Sheet open title={e.id ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}
      footer={<>{e.id ? <button className="btn danger" onClick={() => { remove(e.id); onClose(); }}><Icon name="trash" size={18} />Borrar</button> : null}<button className="btn primary" onClick={save} disabled={!f.desc || !f.amount}>Guardar</button></>}>
      <Field label="Concepto"><input value={f.desc} onChange={x => set('desc', x.target.value)} placeholder="Ej.: Cena en Trastevere" /></Field>
      <div className="grid2">
        <Field label="Monto"><input type="text" inputMode="decimal" value={f.amount} onChange={x => set('amount', x.target.value)} /></Field>
        <Field label="Moneda">
          <div className="seg">{['EUR', 'CHF', 'GTQ'].map(c => <button key={c} className={f.currency === c ? 'on' : ''} onClick={() => set('currency', c)}>{c === 'EUR' ? '€' : c === 'GTQ' ? 'Q' : 'CHF'}</button>)}</div>
        </Field>
      </div>
      <Field label="Pagó">
        <div className="seg">{travelers.map(t => <button key={t} className={f.paidBy === t ? 'on' : ''} onClick={() => set('paidBy', t)}>{t}</button>)}</div>
      </Field>
      <Field label="Se divide">
        <div className="seg wrap">{Object.entries(SPLIT).map(([k, l]) => <button key={k} className={f.split === k ? 'on' : ''} onClick={() => set('split', k)}>{l}</button>)}</div>
      </Field>
      <div className="grid2">
        <Field label="Categoría"><select value={f.cat} onChange={x => set('cat', x.target.value)}>{cats.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Fecha"><input type="date" value={f.date} onChange={x => set('date', x.target.value)} /></Field>
      </div>
    </Sheet>
  );
}
