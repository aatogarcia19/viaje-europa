import { useMemo, useState } from 'react';
import { get, all, update, useStore, me, setMe, status, pendingCount, sync, setCode, exportBackup, resetLocal } from '../lib/store.js';
import { voices, play, unlock, rate } from '../lib/tts.js';
import { offlineUrls, cachedFetch } from '../lib/mapcache.js';
import Icon from '../components/Icon.jsx';
import { Header, Field, money, go } from '../components/ui.jsx';
import { DEFAULT_WALK_MAX, TRANSITOUS_SOURCES, useTransit, queueSize, tstatus } from '../lib/transit.js';
import { tripTransport, computeRoutes } from '../lib/transport.js';
import { ASSISTANT_URL } from '../config.js';

const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* */ } } };

export default function Ajustes() {
  useStore();
  const trip = get('trip') || {};
  const [names, setNames] = useState(trip.travelers || ['', '']);
  const [rates, setRates] = useState(trip.rates || { EUR: 8.8, CHF: 9.5, GTQ: 1 });
  const [voice, setVoice] = useState(ls.get('ve.voice'));
  const [spd, setSpd] = useState(String(rate()));
  const [sim, setSim] = useState(ls.get('ve.simDate'));
  const [simT, setSimT] = useState(ls.get('ve.simTime'));
  const [tiles, setTiles] = useState(null);
  const vs = voices();

  const saveNames = () => {
    const old = trip.travelers || [];
    update('trip', d => { d.travelers = names.map(n => n.trim() || 'Viajero'); });
    all('expense').forEach(e => { const i = old.indexOf(e.paidBy); if (i >= 0 && old[i] !== names[i]) update(e.id, x => { x.paidBy = names[i]; }); });
    const i = old.indexOf(me()); if (i >= 0) setMe(names[i]);
  };
  const saveRates = () => update('trip', d => { d.rates = { EUR: Number(rates.EUR) || 8.8, CHF: Number(rates.CHF) || 9.5, GTQ: 1 }; });

  const saveMaps = async () => {
    const boxes = [];
    for (const c of all('city')) {
      const pts = all('place').filter(p => p.cityId === c.id && p.cat !== 'transporte').map(p => [p.lat, p.lng]);
      if (c.lodging && typeof c.lodging.lat === 'number') pts.push([c.lodging.lat, c.lodging.lng]);
      if (c.ref) pts.push([c.ref.lat, c.ref.lng]);
      if (!pts.length) continue;
      const pad = 0.008;
      boxes.push({ n: Math.max(...pts.map(p => p[0])) + pad, s: Math.min(...pts.map(p => p[0])) - pad, e: Math.max(...pts.map(p => p[1])) + pad, w: Math.min(...pts.map(p => p[1])) - pad });
    }
    setTiles({ done: 0, total: 1, fail: 0 });
    let list;
    try { list = await offlineUrls(boxes); } catch { setTiles({ done: 0, total: 0, fail: 1, finished: true, error: true }); return; }
    setTiles({ done: 0, total: list.length, fail: 0 });
    let done = 0, fail = 0;
    const worker = async () => {
      while (list.length) {
        const u = list.shift();
        try { const r = await cachedFetch(u); if (!r.ok) fail++; } catch { fail++; }
        done++;
        if (done % 10 === 0 || !list.length) setTiles({ done, total: done + list.length, fail });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setTiles({ done, total: done, fail, finished: true });
  };

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `viaje-europa-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="page ajustes">
      <Header title="Ajustes" />
      <div className="pad">
        <section className="block">
          <h2><Icon name="info" size={18} /> ¿Quién usa este teléfono?</h2>
          <div className="seg">{(trip.travelers || []).map(t => <button key={t} className={me() === t ? 'on' : ''} onClick={() => setMe(t)}>{t}</button>)}</div>
          <p className="hint">Sirve para saber quién hizo cada cambio y quién pagó por defecto.</p>
        </section>

        <section className="block">
          <h2><Icon name="wand" size={18} /> Asistente de Claude</h2>
          <p className="hint">Pregúntenle a Claude sobre el plan o pídanle cambios: lee el viaje y deja propuestas que ustedes aplican con un toque. Se abre en Claude con la cuenta de Ademir y necesita internet.</p>
          <a className="btn wide" href={ASSISTANT_URL} target="_blank" rel="noreferrer"><Icon name="ext" size={18} />Abrir el asistente</a>
        </section>

        <TransportSettings trip={trip} />

        <section className="block">
          <h2>Nombres de los viajeros</h2>
          <div className="grid2">
            <input value={names[0]} onChange={e => setNames([e.target.value, names[1]])} aria-label="Viajero 1" />
            <input value={names[1]} onChange={e => setNames([names[0], e.target.value])} aria-label="Viajero 2" />
          </div>
          <button className="btn" onClick={saveNames}>Guardar nombres</button>
        </section>

        <section className="block">
          <h2><Icon name="audio" size={18} /> Audioguía</h2>
          <Field label="Voz" hint="En iPhone, para una voz más natural: Ajustes › Accesibilidad › Contenido leído › Voces › Español, y descarga una voz «mejorada».">
            <select value={voice} onChange={e => { setVoice(e.target.value); ls.set('ve.voice', e.target.value); }}>
              <option value="">Automática</option>
              {vs.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
          </Field>
          <Field label="Velocidad">
            <div className="seg">{['0.9', '1', '1.1', '1.2'].map(s => <button key={s} className={spd === s ? 'on' : ''} onClick={() => { setSpd(s); ls.set('ve.rate', s); }}>{s}×</button>)}</div>
          </Field>
          <button className="btn" onClick={() => { unlock(); play('_test', 'Prueba de voz', 'Hola. Así suena la audioguía de su viaje por Europa. Si la voz suena robótica, descarguen una voz mejorada en los ajustes del iPhone.'); }}><Icon name="play" size={18} />Probar voz</button>
        </section>

        <section className="block">
          <h2><Icon name="map" size={18} /> Mapas sin conexión</h2>
          <p className="hint">Descarga el mapa de calles de las 8 ciudades para verlo sin datos (hazlo con wifi). La vista satelital solo queda guardada en las zonas que ya hayan abierto.</p>
          <button className="btn" onClick={saveMaps} disabled={tiles && !tiles.finished}><Icon name="download" size={18} />{tiles && !tiles.finished ? `Guardando ${tiles.done} de ${tiles.total}…` : 'Guardar mapas del viaje'}</button>
          {tiles?.finished ? <p className="hint">{tiles.error ? 'No se pudo conectar con el servidor de mapas. Prueba de nuevo con wifi.' : `Listo: ${tiles.done - tiles.fail} partes de mapa guardadas${tiles.fail ? ` (${tiles.fail} fallaron; vuelve a intentarlo)` : ''}.`}</p> : null}
        </section>

        <section className="block">
          <h2><Icon name="wallet" size={18} /> Tipo de cambio</h2>
          <div className="grid2">
            <Field label="1 € en quetzales"><input type="number" step="0.01" inputMode="decimal" value={rates.EUR} onChange={e => setRates({ ...rates, EUR: e.target.value })} /></Field>
            <Field label="1 CHF en quetzales"><input type="number" step="0.01" inputMode="decimal" value={rates.CHF} onChange={e => setRates({ ...rates, CHF: e.target.value })} /></Field>
          </div>
          <button className="btn" onClick={saveRates}>Guardar tipo de cambio</button>
        </section>

        <section className="block">
          <h2><Icon name="sync" size={18} /> Sincronización</h2>
          <p>{!navigator.onLine ? 'Sin conexión: los cambios se guardan en el teléfono y se suben solos al volver la señal.' : status.error === 'codigo' ? 'El código del viaje no es válido.' : status.error ? 'No se pudo conectar con la base de datos.' : 'Conectado.'}
            {pendingCount() ? ` ${pendingCount()} cambios por subir.` : ''}</p>
          {status.lastOk ? <p className="hint">Última sincronización: {new Date(status.lastOk).toLocaleString('es-GT')}</p> : null}
          <div className="actions-row">
            <button className="btn" onClick={() => sync()}><Icon name="sync" size={18} />Sincronizar ahora</button>
            <button className="btn" onClick={() => sync({ full: true })}>Descargar todo de nuevo</button>
          </div>
          <button className="btn" onClick={download}><Icon name="download" size={18} />Descargar respaldo (JSON)</button>
        </section>

        <section className="block">
          <h2><Icon name="calendar" size={18} /> Probar el modo viaje</h2>
          <p className="hint">Simula una fecha y hora para ver cómo se comporta la pantalla «Hoy» durante el viaje.</p>
          <div className="grid2">
            <input type="date" value={sim} onChange={e => { setSim(e.target.value); ls.set('ve.simDate', e.target.value); }} aria-label="Fecha simulada" />
            <input type="time" value={simT} onChange={e => { setSimT(e.target.value); ls.set('ve.simTime', e.target.value); }} aria-label="Hora simulada" />
          </div>
          {sim || simT ? <button className="btn" onClick={() => { setSim(''); setSimT(''); ls.set('ve.simDate', ''); ls.set('ve.simTime', ''); }}>Usar fecha real</button> : null}
        </section>

        <section className="block">
          <h2>Sesión</h2>
          <button className="btn danger" onClick={() => { if (confirm('¿Salir? Los datos se vuelven a descargar al entrar con el código.')) { resetLocal(); setCode(''); } }}>Salir y borrar datos de este teléfono</button>
          <p className="hint">Versión {__APP_VERSION__}</p>
        </section>
      </div>
    </div>
  );
}

const WALK_OPTS = [1000, 1500, 2000, 2500, 3000];
const km = m => `${(m / 1000).toLocaleString('es-GT', { maximumFractionDigits: 1 })} km`;

function TransportSettings({ trip }) {
  const sv = useStore(); const tv = useTransit();
  const walkMax = trip.walkMax || DEFAULT_WALK_MAX;
  const est = useMemo(() => tripTransport(), [sv, tv]); // eslint-disable-line
  const [asked, setAsked] = useState(null);
  const busy = queueSize();
  const budget = (trip.budget || {})['Transporte local'];
  const calc = () => {
    if (!navigator.onLine) { setAsked({ n: 0, offline: true }); return; }
    const before = tstatus.done;
    setAsked({ n: computeRoutes(), before });
  };
  return (
    <section className="block">
      <h2><Icon name="metro" size={18} /> Transporte en las ciudades</h2>
      <Field label="Sugerir caminar en tramos de hasta" hint="En cada tramo siempre verán cuánto es a pie (distancia y tiempo) y las opciones en metro, bus o tren con su precio. Ustedes deciden; esto solo cambia lo que la app sugiere.">
        <div className="seg">{WALK_OPTS.map(m => <button key={m} className={walkMax === m ? 'on' : ''} onClick={() => update('trip', d => { d.walkMax = m; })}>{km(m)}</button>)}</div>
      </Field>

      <div className="ctr-card">
        <div className="ctr-head">
          <span><small>Transporte local estimado</small><b>según el plan de hoy</b></span>
          <span className="ctr-total"><small>por persona</small><b>{money(est.totalQ)}</b></span>
        </div>
        <ul className="ctr-days">
          {est.cities.map(c => (
            <li key={c.city.id}>
              <a href={`#/ciudad/${c.city.id}`} onClick={e => { e.preventDefault(); go(`/ciudad/${c.city.id}`); setTimeout(() => document.getElementById('transporte')?.scrollIntoView(), 300); }}>{c.city.flag} {c.city.name}</a>
              <span>{c.trips.length ? `${c.trips.length} ${c.trips.length === 1 ? 'viaje' : 'viajes'}${c.cmp && c.cmp.best.id !== 'singles' ? ` · ${c.cmp.best.name}` : ''}` : 'a pie'}</span>
              <b>{c.best ? `${c.est ? '≈ ' : ''}${money(c.best, c.cmp.cur)}` : '—'}</b>
            </li>
          ))}
        </ul>
        {budget ? <p className={`hint ${est.totalQ > budget ? 'warn' : ''}`}>Presupuesto del documento: {money(budget)} por persona{est.totalQ > budget ? ' (el plan actual lo pasa)' : ''}.</p> : null}
        <div className="actions-row">
          <button className="btn" onClick={calc} disabled={busy > 0}><Icon name="route" size={18} />{busy > 0 ? `Calculando… faltan ${busy}` : 'Calcular rutas de todo el viaje'}</button>
        </div>
        {asked && !busy ? <p className="hint">{asked.offline ? 'Sin conexión: inténtenlo con wifi.' : asked.n === 0 ? 'Todos los tramos ya estaban calculados.' : `Listo: ${tstatus.done - (asked.before || 0)} tramos calculados${tstatus.failed ? `, ${tstatus.failed} fallaron (vuelvan a intentarlo)` : ''}. Quedan guardados para usarlos sin conexión y en el otro teléfono.`}</p> : null}
        <p className="hint">Háganlo con wifi después de cambiar el plan: así cada tramo tiene sus líneas, paradas y precios aunque no haya señal.</p>
      </div>
      <p className="leg-attr">Rutas de transporte: <a href={TRANSITOUS_SOURCES} target="_blank" rel="noreferrer">Transitous</a> (datos abiertos de cada operador). Metro de Madrid: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>. Los horarios de 2027 aún no existen: se usan los de la misma semana de este año como referencia.</p>
    </section>
  );
}
