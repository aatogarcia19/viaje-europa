import { useState } from 'react';
import { get, all, update, useStore, me, setMe, status, pendingCount, sync, setCode, exportBackup, resetLocal } from '../lib/store.js';
import { voices, play, unlock, rate } from '../lib/tts.js';
import { tilesFor } from '../lib/geo.js';
import Icon from '../components/Icon.jsx';
import { Header, Field } from '../components/ui.jsx';

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
    const cities = all('city');
    const list = [];
    const r = window.devicePixelRatio > 1 ? '@2x' : '';
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    for (const c of cities) {
      const ps = all('place').filter(p => p.cityId === c.id && p.cat !== 'transporte');
      if (!ps.length) continue;
      const lats = ps.map(p => p.lat), lngs = ps.map(p => p.lng);
      const pad = 0.006;
      const b = { n: Math.max(...lats) + pad, s: Math.min(...lats) - pad, e: Math.max(...lngs) + pad, w: Math.min(...lngs) - pad };
      for (const [z, x, y] of tilesFor(b, 12, 16)) list.push(`https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'rastertiles/voyager'}/${z}/${x}/${y}${r}.png`);
    }
    setTiles({ done: 0, total: list.length, fail: 0 });
    let done = 0, fail = 0;
    const worker = async () => {
      while (list.length) {
        const u = list.shift();
        try { await fetch(u, { mode: 'no-cors' }); } catch { fail++; }
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
          <p className="hint">Descarga los mapas de las 8 ciudades para verlos sin datos. Hazlo con wifi; son unos cuantos MB.</p>
          <button className="btn" onClick={saveMaps} disabled={tiles && !tiles.finished}><Icon name="download" size={18} />{tiles && !tiles.finished ? `Guardando ${tiles.done} de ${tiles.total}…` : 'Guardar mapas del viaje'}</button>
          {tiles?.finished ? <p className="hint">Listo: {tiles.done - tiles.fail} partes de mapa guardadas.</p> : null}
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
