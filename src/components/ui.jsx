import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { status, pendingCount, useStore } from '../lib/store.js';
import { usePlayer, player, pause, resume, stop, skip } from '../lib/tts.js';

export function go(path) { window.location.hash = path; }
let navCount = 0;
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { navCount++; });
export function back(fallback = '/viaje') {
  if (navCount > 0) window.history.back();
  else go(fallback);
}

export function useRoute() {
  const parse = () => {
    const h = window.location.hash.replace(/^#/, '') || '/hoy';
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    return { parts, query: Object.fromEntries(new URLSearchParams(qs || '')), path };
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => { setR(parse()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function SyncDot() {
  useStore();
  const n = pendingCount();
  let cls = 'ok', label = 'Sincronizado';
  if (!navigator.onLine) { cls = 'off'; label = n ? `Sin conexión · ${n} cambios por subir` : 'Sin conexión (funciona igual)'; }
  else if (status.error === 'codigo') { cls = 'bad'; label = 'Código inválido'; }
  else if (status.error) { cls = 'off'; label = 'No se pudo sincronizar'; }
  else if (status.syncing || n) { cls = 'busy'; label = 'Sincronizando'; }
  return <span className={`sync-dot ${cls}`} title={label} aria-label={label} role="status" />;
}

export function Header({ title, sub, onBack, right, color }) {
  return (
    <header className="top" style={color ? { '--city': color } : undefined}>
      {onBack ? <button className="icon-btn" onClick={onBack} aria-label="Volver"><Icon name="back" /></button> : <span className="top-spacer" />}
      <div className="top-title">
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      <div className="top-right">{right}<SyncDot /></div>
    </header>
  );
}

export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('noscroll');
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('noscroll'); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Alert({ a }) {
  const icon = a.level === 'danger' || a.level === 'warn' ? 'warn' : a.level === 'ok' ? 'check' : 'info';
  return <div className={`alert ${a.level}`}><Icon name={icon} size={15} /><span>{a.text}</span></div>;
}

export function AudioBar() {
  usePlayer();
  if (!player.id) return null;
  return (
    <div className="audiobar" role="region" aria-label="Audioguía">
      <div className="audiobar-txt">
        <strong>{player.title}</strong>
        <span>{player.paused ? 'En pausa' : 'Reproduciendo'} · parte {Math.min(player.idx + 1, player.total)} de {player.total}</span>
        <div className="audiobar-prog"><i style={{ width: `${(player.idx / Math.max(1, player.total)) * 100}%` }} /></div>
      </div>
      <button className="icon-btn" onClick={() => skip(-1)} aria-label="Atrás"><Icon name="back" /></button>
      {player.playing
        ? <button className="icon-btn strong" onClick={pause} aria-label="Pausa"><Icon name="pause" /></button>
        : <button className="icon-btn strong" onClick={resume} aria-label="Seguir"><Icon name="play" /></button>}
      <button className="icon-btn" onClick={() => skip(1)} aria-label="Adelante"><Icon name="next" /></button>
      <button className="icon-btn" onClick={stop} aria-label="Detener"><Icon name="x" /></button>
    </div>
  );
}

export function Empty({ icon = 'info', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export const money = (n, cur = 'GTQ') => {
  const v = Number(n) || 0;
  const s = v.toLocaleString('es-GT', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return cur === 'GTQ' ? `Q${s}` : cur === 'EUR' ? `${s} €` : `${s} ${cur}`;
};

export function Toast({ msg, undo, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 7000); return () => clearTimeout(t); }, [msg]); // eslint-disable-line
  return (
    <div className="toast" role="status">
      <span>{msg}</span>
      {undo ? <button className="btn-plain" onClick={() => { undo(); onDone(); }}>Deshacer</button> : null}
    </div>
  );
}
