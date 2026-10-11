import { useState } from 'react';
import { checkCode, setCode, sync, get, setMe, useStore } from '../lib/store.js';
import Icon from '../components/Icon.jsx';

export function Login() {
  const [code, setC] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await checkCode(code.trim().toLowerCase());
    if (r === 'ok') { setCode(code.trim().toLowerCase()); await sync({ full: true }); }
    else setErr(r === 'codigo' ? 'Ese código no es el del viaje. Revísalo con tu compañero de viaje.' : 'No hay conexión con la base de datos. Revisa el internet y vuelve a intentar.');
    setBusy(false);
  };
  return (
    <div className="login">
      <div className="login-route" aria-hidden="true">
        {['Madrid', 'Barcelona', 'París', 'Bruselas', 'Ámsterdam', 'Zúrich', 'Venecia', 'Roma'].map((c, i) => <span key={c} style={{ '--i': i }}><i />{c}</span>)}
      </div>
      <form className="login-card" onSubmit={submit}>
        <h1>Europa 2027</h1>
        <p>Escribe el código del viaje para entrar.</p>
        <input value={code} onChange={e => setC(e.target.value)} placeholder="código-del-viaje" autoCapitalize="none" autoCorrect="off" spellCheck="false" aria-label="Código del viaje" />
        {err ? <p className="err">{err}</p> : null}
        <button className="btn primary wide" disabled={!code.trim() || busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

export function WhoAmI() {
  useStore();
  const trip = get('trip');
  if (!trip) return <div className="login"><div className="login-card"><p>Descargando el viaje…</p></div></div>;
  return (
    <div className="login">
      <div className="login-card">
        <h1>¿Quién eres?</h1>
        <p>Así la app sabe quién pagó y quién hizo cada cambio. Se puede cambiar en Ajustes.</p>
        <div className="stack">
          {(trip.travelers || []).map(t => <button key={t} className="btn wide" onClick={() => setMe(t)}><Icon name="check" size={18} />{t}</button>)}
        </div>
      </div>
    </div>
  );
}
