import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_URL, TILE_URL_DARK, TILE_ATTR } from '../config.js';

const dark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

// markers: [{lat,lng,label,color,shape:'num'|'dot'|'city',title,id}]
// lines: [{coords:[[lat,lng]...], color, dash, weight, opacity}]
export default function MapView({ markers = [], lines = [], fitKey, fitTo, onMarker, onPick, user, height = '38vh', className = '', padding = 28, focus, center, zoom = 14 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const userLayer = useRef(null);
  const cb = useRef({ onMarker, onPick });
  cb.current = { onMarker, onPick };

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, tap: true });
    L.tileLayer(dark() ? TILE_URL_DARK : TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, subdomains: 'abcd', crossOrigin: true }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    userLayer.current = L.layerGroup().addTo(m);
    m.on('click', e => cb.current.onPick && cb.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    if (center) m.setView([center.lat, center.lng], zoom); else m.setView([48, 6], 4);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const ln of lines) {
      if (!ln.coords || ln.coords.length < 2) continue;
      if (ln.halo) L.polyline(ln.coords, { color: '#fff', weight: (ln.weight || 4) + 4, opacity: 0.85, interactive: false }).addTo(g);
      L.polyline(ln.coords, { color: ln.color || '#15233f', weight: ln.weight || 4, opacity: ln.opacity ?? 0.95, dashArray: ln.dash || null, lineCap: 'round', interactive: false }).addTo(g);
    }
    for (const mk of markers) {
      const cls = mk.shape === 'city' ? 'mk-city' : mk.shape === 'dot' ? 'mk-dot' : 'mk-num';
      const html = `<span class="${cls}${mk.dim ? ' dim' : ''}${mk.active ? ' active' : ''}" style="--c:${mk.color || '#15233f'}">${mk.label ?? ''}</span>`;
      const size = mk.shape === 'city' ? [34, 34] : mk.shape === 'dot' ? [14, 14] : [28, 28];
      const icon = L.divIcon({ className: 'mk', html, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
      const marker = L.marker([mk.lat, mk.lng], { icon, title: mk.title || '', keyboard: true, zIndexOffset: mk.active ? 1000 : 0 }).addTo(g);
      if (mk.title) marker.bindTooltip(mk.title, { direction: 'top', offset: [0, -14] });
      marker.on('click', () => cb.current.onMarker && cb.current.onMarker(mk));
    }
  }, [markers, lines]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let pts;
    if (fitTo && fitTo.length) pts = fitTo;
    else {
      pts = markers.map(x => [x.lat, x.lng]);
      for (const ln of lines) if (ln.fit !== false) for (const c of ln.coords || []) pts.push(c);
    }
    if (pts.length === 1) m.setView(pts[0], 15);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [padding, padding], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lng], Math.max(map.current.getZoom(), 16), { animate: true });
  }, [focus]);

  useEffect(() => {
    const g = userLayer.current;
    if (!g) return;
    g.clearLayers();
    if (user) {
      L.circle([user.lat, user.lng], { radius: Math.min(user.acc || 30, 150), color: '#2563eb', weight: 1, fillOpacity: 0.12 }).addTo(g);
      L.circleMarker([user.lat, user.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(g);
    }
  }, [user]);

  return <div ref={el} className={`map ${className}`} style={{ height }} role="region" aria-label="Mapa" />;
}
