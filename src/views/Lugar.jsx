import { useState } from 'react';
import { get, all, update, useStore, newId } from '../lib/store.js';
import { hoursText, fmtDate, fmtDur, DOW, dow } from '../lib/time.js';
import { gmapsDir, appleDir } from '../lib/geo.js';
import { play, unlock, usePlayer, player, pause, resume, supported } from '../lib/tts.js';
import Icon from '../components/Icon.jsx';
import MapView from '../components/MapView.jsx';
import { Header, Field, back, go, Empty } from '../components/ui.jsx';

export const CAT = { plaza: 'Plaza', monumento: 'Monumento', museo: 'Museo', iglesia: 'Iglesia', parque: 'Parque', mirador: 'Mirador', barrio: 'Barrio', calle: 'Calle', comida: 'Comida', mercado: 'Mercado', estadio: 'Estadio', experiencia: 'Experiencia', transporte: 'Transporte', paseo: 'Paseo', tienda: 'Tienda', propio: 'Lugar propio' };
export const PRI = { 1: 'Imprescindible', 2: 'Recomendado', 3: 'Si hay tiempo' };
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function priceLabel(p) {
  if (!p.price) return 'Gratis';
  return p.currency === 'CHF' ? `${p.price} CHF` : `${String(p.price).replace('.', ',')} €`;
}

export default function Lugar({ id, query }) {
  useStore(); usePlayer();
  const p = get(id);
  const [notes, setNotes] = useState(null);
  const [addTo, setAddTo] = useState('');
  if (!p) return <><Header title="Lugar" onBack={() => back()} /><Empty title="Este lugar ya no existe" /></>;
  const city = get(p.cityId);
  const days = all('day').filter(d => (d.cities || []).includes(p.cityId)).sort((a, b) => a.date.localeCompare(b.date));
  const usedIn = all('day').filter(d => (d.items || []).some(i => i.t === 'place' && i.p === id)).sort((a, b) => a.date.localeCompare(b.date));
  const ctxDay = query.dia ? get('d-' + query.dia) : null;
  const wd = query.dia ? dow(query.dia) : null;
  const isPlaying = player.id === id;
  const add = () => {
    if (!addTo) return;
    update('d-' + addTo, d => { d.items.push({ id: newId('i'), t: 'place', p: id }); });
    go(`/dia/${addTo}`);
  };
  const removeFromDay = () => {
    update('d-' + query.dia, d => { d.items = d.items.filter(i => i.id !== query.item); });
    back();
  };

  return (
    <div className="page place" style={{ '--city': city?.color }}>
      <Header title={p.name} sub={`${city?.flag || ''} ${city?.name || ''}${p.area ? ` · ${p.area}` : ''}`} onBack={() => back(`/ciudad/${p.cityId}`)} />
      <MapView markers={[{ lat: p.lat, lng: p.lng, label: '●', color: city?.color, title: p.name }]} fitKey={id} height="26vh" />
      <div className="pad">
        <div className="tags">
          <span className="tag big">{CAT[p.cat] || p.cat}</span>
          {p.pri ? <span className={`tag big ${p.pri === 1 ? 'star' : ''}`}>{PRI[p.pri]}</span> : null}
          <span className="tag big">{priceLabel(p)}</span>
          <span className="tag big">{fmtDur(p.dur || 30)}</span>
          {p.verify ? <span className="tag big warn">Verificar datos 2027</span> : null}
        </div>
        {p.desc ? <p className="lead">{p.desc}</p> : null}

        <div className="actions-row">
          <a className="btn primary" href={gmapsDir(p, 'walk')} target="_blank" rel="noreferrer"><Icon name="nav" size={18} />Cómo llegar</a>
          <a className="btn" href={appleDir(p, 'walk')} target="_blank" rel="noreferrer">Apple Maps</a>
          {p.url ? <a className="btn" href={p.url} target="_blank" rel="noreferrer"><Icon name="ticket" size={18} />Entradas</a> : null}
        </div>

        <section className="block audio-block">
          <h2><Icon name="audio" size={18} /> Audioguía</h2>
          {p.audio ? (
            supported() ? (
              <div className="audio-ctl">
                {isPlaying && player.playing ? <button className="btn primary" onClick={pause}><Icon name="pause" size={18} />Pausa</button>
                  : isPlaying && player.paused ? <button className="btn primary" onClick={resume}><Icon name="play" size={18} />Seguir</button>
                    : <button className="btn primary" onClick={() => { unlock(); play(id, p.name, p.audio); }}><Icon name="play" size={18} />Escuchar ({Math.max(1, Math.round(p.audio.split(' ').length / 150))} min)</button>}
                <details><summary>Leer el texto</summary><p className="audio-text">{p.audio}</p></details>
              </div>
            ) : <p className="audio-text">{p.audio}</p>
          ) : <p className="hint">{p.pending ? 'La audioguía de este lugar llega cuando completemos esta ciudad.' : 'Este lugar no tiene audioguía.'}</p>}
        </section>

        <section className="block">
          <h2><Icon name="clock" size={18} /> Horario en junio</h2>
          {p.h ? (
            <table className="hours">
              <tbody>
                {ORDER.map(d => (
                  <tr key={d} className={d === wd ? 'today' : ''}><th>{DOW[d][0].toUpperCase() + DOW[d].slice(1)}</th><td>{hoursText(p.h, d)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p>Se puede visitar a cualquier hora (exterior).</p>}
          {p.lastEntry ? <p className="hint">Última entrada {p.lastEntry} minutos antes del cierre.</p> : null}
          {p.priceTxt ? <p><b>Precio:</b> {p.priceTxt}</p> : null}
          {p.res && p.res !== 'no' ? <p><b>Reserva:</b> {p.res === 'obligatoria' ? 'Obligatoria' : 'Recomendada'}</p> : null}
        </section>

        {p.tips && p.tips.length ? (
          <section className="block">
            <h2><Icon name="info" size={18} /> Consejos</h2>
            <ul className="tips">{p.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </section>
        ) : null}

        <section className="block">
          <h2><Icon name="calendar" size={18} /> En el itinerario</h2>
          {usedIn.length ? <ul className="links">{usedIn.map(d => <li key={d.date}><button className="btn-plain link" onClick={() => go(`/dia/${d.date}`)}>{fmtDate(d.date)}: {d.title}</button></li>)}</ul> : <p className="hint">Todavía no está en ningún día.</p>}
          {days.length ? (
            <div className="grid2">
              <select value={addTo} onChange={e => setAddTo(e.target.value)} aria-label="Elegir día">
                <option value="">Agregar a un día…</option>
                {days.map(d => <option key={d.date} value={d.date}>{fmtDate(d.date)}: {d.title}</option>)}
              </select>
              <button className="btn" onClick={add} disabled={!addTo}><Icon name="plus" size={18} />Agregar</button>
            </div>
          ) : null}
          {ctxDay && query.item ? <button className="btn danger wide" onClick={removeFromDay}><Icon name="trash" size={18} />Quitar del {fmtDate(query.dia)}</button> : null}
        </section>

        <section className="block">
          <h2><Icon name="edit" size={18} /> Nuestras notas</h2>
          <Field label="Notas compartidas entre los dos">
            <textarea rows={3} value={notes ?? (p.myNotes || '')} onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes !== null) update(id, d => { d.myNotes = notes; }); }} placeholder="Ej.: comprar la entrada combinada" />
          </Field>
        </section>
      </div>
    </div>
  );
}
