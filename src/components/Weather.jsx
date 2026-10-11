import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { daysBetween, todayISO } from '../lib/time.js';

const WMO = c => c == null ? '' : c === 0 ? 'Despejado' : c <= 2 ? 'Poco nuboso' : c === 3 ? 'Nublado' : c <= 48 ? 'Niebla' : c <= 57 ? 'Llovizna' : c <= 67 ? 'Lluvia' : c <= 77 ? 'Nieve' : c <= 82 ? 'Chubascos' : c <= 99 ? 'Tormenta' : '';

// Pronóstico de Open-Meteo (gratis, sin clave) cuando faltan 15 días o menos; si no, el clima típico de junio.
export default function Weather({ city, date, compact = true }) {
  const diff = daysBetween(todayISO(), date);
  const inRange = diff >= 0 && diff <= 15;
  const key = `ve.wx.${city.id}.${date}`;
  const [wx, setWx] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.at < 3 * 3600e3) return c; } catch { /* */ }
    return null;
  });
  useEffect(() => {
    if (!inRange || wx || !navigator.onLine) return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${date}&end_date=${date}`;
    fetch(url).then(r => r.json()).then(j => {
      const d = j.daily;
      if (!d) return;
      const v = { at: Date.now(), code: d.weather_code[0], max: Math.round(d.temperature_2m_max[0]), min: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max[0] };
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* */ }
      setWx(v);
    }).catch(() => {});
  }, [inRange, key]); // eslint-disable-line
  if (wx) return <div className="fact"><Icon name="sun" size={16} /><span><b>{wx.min}–{wx.max} °C</b> {WMO(wx.code)}{wx.rain != null ? `, lluvia ${wx.rain}%` : ''}</span></div>;
  if (compact) return null;
  return city.climate ? <p className="hint"><Icon name="sun" size={15} /> {city.climate}</p> : null;
}
