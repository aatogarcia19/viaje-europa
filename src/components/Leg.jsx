import { useState } from 'react';
import Icon, { modeIcon } from './Icon.jsx';
import { get, update } from '../lib/store.js';
import { fmtDur } from '../lib/time.js';
import { gmapsTransit } from '../lib/geo.js';
import { MODE_NAME, MODE_COLOR, MODE_ICON, optTitle, optIcon, DEFAULT_WALK_MAX, TRANSITOUS_SOURCES, useTransit, isAutoMove } from '../lib/transit.js';
import { optFare } from '../lib/fares.js';
import { MODE_LABEL } from '../lib/schedule.js';
import { money } from './ui.jsx';

// Guarda la elección de un tramo: 'auto' (lo sugerido), 'walk', 'manual' (lo anotado antes) o la firma de una ruta
export function chooseMove(dayId, i, c) {
  update(dayId, d => {
    const x = d.items[i];
    if (!x) return;
    const cur = x.move;
    if (c === 'manual') { if (x.moveManual) { x.move = x.moveManual; delete x.moveManual; } return; }
    if (cur && !isAutoMove(cur) && cur.m !== 'pt' && !(cur.m === 'walk' && !cur.min && !cur.txt)) x.moveManual = cur;
    if (c === 'auto') delete x.move;
    else if (c === 'walk') x.move = { m: 'walk' };
    else x.move = { m: 'pt', sig: c };
  });
}

export const dist = km => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`);
const fareTxt = f => (f && f.amt > 0 ? `${f.est || f.verify ? '≈ ' : ''}${money(f.amt, f.cur)}` : f && f.amt === 0 ? 'gratis' : '');

function contrast(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#111827' : '#ffffff';
}
export function LineBadge({ leg }) {
  const bg = leg.color || MODE_COLOR[leg.mode] || '#15233f';
  const fg = leg.text || contrast(bg);
  return <span className="lb" style={{ '--lc': bg, '--lt': fg }} title={`${MODE_NAME[leg.mode] || leg.mode} ${leg.line}`}>{leg.line || (MODE_NAME[leg.mode] || '').slice(0, 1)}</span>;
}
export function Badges({ opt }) {
  const rides = opt.legs.filter(l => l.mode !== 'WALK');
  return <span className="lbs">{rides.map((l, i) => <span key={i} className="lb-wrap">{i ? <Icon name="next" size={11} /> : null}<LineBadge leg={l} /></span>)}</span>;
}

export function Steps({ opt }) {
  const rides = opt.legs.filter(l => l.mode !== 'WALK');
  const lastRide = rides[rides.length - 1];
  const items = [];
  opt.legs.forEach((l, i) => {
    const prevRide = opt.legs.slice(0, i).reverse().find(x => x.mode !== 'WALK');
    if (l.mode === 'WALK') {
      const end = i === opt.legs.length - 1;
      items.push(<li key={i} className="st-walk"><Icon name="walk" size={15} /><span>Camina {fmtDur(l.min)}{l.m ? ` (${dist(l.m / 1000)})` : ''}{end ? ' hasta el destino' : l.to ? ` hasta ${l.to}` : ''}{l.transfer ? ' para el transbordo' : ''}</span></li>);
      return;
    }
    if (prevRide && opt.legs[i - 1] && opt.legs[i - 1].mode !== 'WALK') {
      items.push(<li key={i + 'x'} className="st-change"><Icon name="shuffle" size={15} /><span>Cambia a {MODE_NAME[l.mode] ? `${MODE_NAME[l.mode].toLowerCase()} ` : ''}{l.line} en {l.from}</span></li>);
    }
    items.push(
      <li key={i} className="st-ride">
        <LineBadge leg={l} />
        <span>
          <b>{MODE_NAME[l.mode] || l.mode} {l.line}</b>{l.head ? ` dirección ${l.head}` : ''}
          <small>Sube en {l.from} · {l.stops} {l.stops === 1 ? 'parada' : 'paradas'} · baja en {l.to}{l === lastRide ? '' : ''} · {fmtDur(l.min)}</small>
        </span>
      </li>
    );
  });
  return <ol className="leg-steps">{items}</ol>;
}

/**
 * Tramo entre dos paradas: lo elegido, alternativas y paso a paso.
 * onChoose('auto' | 'walk' | 'manual' | sig)
 */
export default function Leg({ row, onChoose, editable = true }) {
  useTransit();
  const [open, setOpen] = useState(false);
  const mv = row.move;
  if (!mv && !(row.wait > 4)) return null;
  const walkMax = (get('trip') || {}).walkMax || DEFAULT_WALK_MAX;
  const opts = (mv && mv.opts) || [];
  const fares = Object.fromEntries(opts.map(o => [o.sig, optFare(o, mv.cityId)]));
  const sel = !mv ? null : mv.mode === 'walk' ? 'walk' : mv.mode === 'pt' ? mv.opt.sig : mv.manual ? 'manual' : 'pt-est';
  const best = opts[0];
  const rec = !mv ? null : (mv.km * 1000 <= walkMax || !best || best.min >= mv.walkMin) ? 'walk' : best.sig;
  const pending = mv && (mv.tstatus === 'pending' || mv.tstatus === 'missing');
  const cls = !mv ? 'wait' : mv.mode === 'pt' || mv.mode === 'pt-est' ? 'pt' : mv.mode;
  const hasOsm = opts.some(o => o.src === 'osm');
  const canExpand = mv && mv.from && mv.to && (opts.length || mv.km >= 0.6 || mv.manual);

  let main = null, alt = null;
  if (mv) {
    if (mv.mode === 'walk') {
      main = <><Icon name="walk" size={16} /><span><b>{fmtDur(mv.min)} a pie</b> · {dist(mv.km)}{mv.est ? ' (aprox.)' : ''}</span></>;
      const cand = mv.suggest || best;
      const s = cand && cand.min < mv.walkMin ? cand : null; // solo si en transporte se llega antes
      if (s) alt = <>o <Badges opt={s} /> {optTitle(s).toLowerCase()} · {fmtDur(s.min)}{fares[s.sig] ? ` · ${fareTxt(fares[s.sig])}` : ''}</>;
      else if (pending && mv.km >= 0.6) alt = <>Buscando transporte…</>;
      else if (cand) alt = <>En transporte no se llega antes ({fmtDur(cand.min)})</>;
    } else if (mv.mode === 'pt') {
      main = <><Badges opt={mv.opt} /><span><b>{optTitle(mv.opt)}</b> · {fmtDur(mv.min)}{mv.fare ? ` · ${fareTxt(mv.fare)}` : ''}</span></>;
      alt = <>a pie serían {fmtDur(mv.walkMin)} · {dist(mv.km)}</>;
    } else if (mv.mode === 'pt-est') {
      main = <><Icon name="metro" size={16} /><span><b>Transporte</b> · ≈ {fmtDur(mv.min)}{mv.fare ? ` · ${fareTxt(mv.fare)}` : ''}</span></>;
      alt = <>{navigator.onLine ? 'Calculando la mejor línea…' : 'Sin conexión: tiempo aproximado'} · a pie {fmtDur(mv.walkMin)} · {dist(mv.km)}</>;
    } else {
      main = <><Icon name={modeIcon(mv.mode)} size={16} /><span><b>{(MODE_LABEL[mv.mode] || mv.mode).replace(/^./, c => c.toUpperCase())}</b> · {fmtDur(mv.min)}{mv.fare ? ` · ${fareTxt(mv.fare)}` : ''}</span></>;
      if (opts.length) alt = <>Hay {opts.length} {opts.length === 1 ? 'ruta calculada' : 'rutas calculadas'}: toca para verlas</>;
    }
  }

  return (
    <div className={`leg m-${cls}`}>
      <div className="leg-body">
        {mv ? (
          <button type="button" className="leg-main btn-plain" onClick={() => canExpand && setOpen(!open)} aria-expanded={open} disabled={!canExpand}>
            <span className="leg-line">{main}{canExpand ? <span className="leg-more"><Icon name={open ? 'up' : 'down'} size={14} />{open ? '' : 'Opciones'}</span> : null}</span>
            {alt ? <span className="leg-alt">{alt}</span> : null}
            {mv.txt ? <span className="leg-note">{mv.txt}</span> : null}
          </button>
        ) : null}
        {open && mv ? (
          <div className="leg-panel">
            <div className="leg-opts" role="radiogroup" aria-label="Cómo hacer este tramo">
              <button type="button" role="radio" aria-checked={sel === 'walk'} className={`leg-opt ${sel === 'walk' ? 'on' : ''}`} onClick={() => editable && onChoose(rec === 'walk' ? 'auto' : 'walk')}>
                <Icon name="walk" size={18} />
                <span className="lo-main"><b>A pie</b><small>{dist(mv.km)} · {fmtDur(mv.walkMin)} · gratis</small></span>
                {rec === 'walk' ? <em className="tag">sugerido</em> : null}
              </button>
              {opts.map(o => (
                <button type="button" key={o.sig} role="radio" aria-checked={sel === o.sig} className={`leg-opt ${sel === o.sig ? 'on' : ''}`} onClick={() => editable && onChoose(rec === o.sig ? 'auto' : o.sig)}>
                  <Icon name={optIcon(o)} size={18} />
                  <span className="lo-main">
                    <b><Badges opt={o} /> {optTitle(o)}</b>
                    <small>{fmtDur(o.min)}{fares[o.sig] ? ` · ${fareTxt(fares[o.sig])}` : ''} · {o.transfers ? `${o.transfers} ${o.transfers === 1 ? 'transbordo' : 'transbordos'}` : 'directo'} · {fmtDur(o.walkMin)} a pie</small>
                  </span>
                  {rec === o.sig ? <em className="tag">sugerido</em> : null}
                </button>
              ))}
              {mv.manual ? (
                <button type="button" role="radio" aria-checked={sel === 'manual'} className={`leg-opt ${sel === 'manual' ? 'on' : ''}`} onClick={() => editable && onChoose('manual')}>
                  <Icon name={modeIcon(mv.mode)} size={18} />
                  <span className="lo-main"><b>Lo que anotaron</b><small>{MODE_LABEL[mv.mode] || mv.mode} · {fmtDur(mv.min)}{mv.fare ? ` · ${fareTxt(mv.fare)}` : ''}</small></span>
                </button>
              ) : row.item.moveManual ? (
                <button type="button" role="radio" aria-checked={false} className="leg-opt" onClick={() => editable && onChoose('manual')}>
                  <Icon name={modeIcon(row.item.moveManual.m)} size={18} />
                  <span className="lo-main"><b>Lo que anotaron antes</b><small>{MODE_LABEL[row.item.moveManual.m] || row.item.moveManual.m}{typeof row.item.moveManual.min === 'number' ? ` · ${fmtDur(row.item.moveManual.min)}` : ''}</small></span>
                </button>
              ) : null}
              {pending && !opts.length ? <p className="hint">{navigator.onLine ? 'Buscando líneas de bus, metro y tren…' : 'Sin conexión: las líneas se calculan cuando vuelva internet.'}</p> : null}
              {mv.tstatus === 'none' && !opts.length ? <p className="hint">No encontré transporte público útil para este tramo.</p> : null}
            </div>
            {mv.mode === 'pt' ? <Steps opt={mv.opt} /> : null}
            {mv.fare && mv.fare.parts && mv.fare.parts.length > 1 ? <p className="hint">Precio por persona: {mv.fare.parts.map(p => `${p.label} ${money(p.amt, mv.fare.cur)}`).join(' + ')}</p> : null}
            <div className="leg-actions">
              <a className="btn sm" href={gmapsTransit(mv.from, mv.to)} target="_blank" rel="noreferrer"><Icon name="ext" size={14} />Google Maps</a>
              {!mv.auto && editable ? <button type="button" className="btn sm ghost" onClick={() => onChoose('auto')}>Volver a lo sugerido</button> : null}
            </div>
            <p className="leg-attr">
              Precios por persona, aproximados. Rutas: <a href={TRANSITOUS_SOURCES} target="_blank" rel="noreferrer">Transitous</a>
              {hasOsm ? <> · Metro: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> (tiempos aproximados)</> : null}. Horarios de referencia: los de 2027 aún no existen.
            </p>
          </div>
        ) : null}
        {row.wait > 4 ? <div className="leg-wait"><Icon name="clock" size={14} /> Espera {fmtDur(row.wait)}</div> : null}
      </div>
    </div>
  );
}

export { MODE_ICON };
