import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { MAP_ATTR, OSM_URL, OSM_ATTR, SAT_URL, SAT_LABELS, SAT_ATTR } from '../config.js';
import { loadStyle, webglOk } from '../lib/mapcache.js';
import Icon from './Icon.jsx';

const getLayerPref = () => { try { return localStorage.getItem('ve.layer') || 'mapa'; } catch { return 'mapa'; } };
const setLayerPref = v => { try { localStorage.setItem('ve.layer', v); } catch { /* */ } };

function streetLayer() {
  if (!webglOk()) return Promise.resolve(L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }));
  return loadStyle()
    .then(style => maplibreGL({ style, attributionControl: { customAttribution: MAP_ATTR } }))
    .catch(() => L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }));
}
function satLayer() {
  return L.layerGroup([
    L.tileLayer(SAT_URL, { attribution: SAT_ATTR, maxNativeZoom: 19, maxZoom: 20 }),
    ...SAT_LABELS.map(u => L.tileLayer(u, { maxNativeZoom: 19, maxZoom: 20, opacity: 0.95 }))
  ]);
}

// markers: [{lat,lng,label,color,shape:'num'|'dot'|'city',title,id}]
// lines: [{coords:[[lat,lng]...], color, dash, weight, opacity}]
export default function MapView({ markers = [], lines = [], fitKey, fitTo, onMarker, onPick, user, height = '38vh', className = '', padding = 28, focus, center, zoom = 14, controls = true }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const userLayer = useRef(null);
  const base = useRef(null);
  const cb = useRef({ onMarker, onPick });
  cb.current = { onMarker, onPick };
  const [kind, setKind] = useState(getLayerPref);
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, maxZoom: 20 });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    userLayer.current = L.layerGroup().addTo(m);
    m.on('click', e => cb.current.onPick && cb.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    if (center) m.setView([center.lat, center.lng], zoom); else m.setView([48, 6], 4);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // Capa base: calles (vectorial) o satélite
  useEffect(() => {
    let cancelled = false;
    const m = map.current;
    if (!m) return;
    const make = kind === 'sat' ? Promise.resolve(satLayer()) : streetLayer();
    make.then(l => {
      if (cancelled || !map.current) return;
      if (base.current) m.removeLayer(base.current);
      base.current = l.addTo(m);
      l.bringToBack?.();
    });
    return () => { cancelled = true; };
  }, [kind]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    for (const ln of lines) {
      if (!ln.coords || ln.coords.length < 2) continue;
      if (ln.halo) L.polyline(ln.coords, { color: '#fff', weight: (ln.weight || 4) + 4, opacity: 0.9, interactive: false }).addTo(g);
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
    if (pts.length === 1) m.setView(pts[0], 16);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [padding, controls ? 58 : padding], paddingBottomRight: [padding + (controls ? 20 : 0), padding], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lng], Math.max(map.current.getZoom(), 17), { animate: true });
  }, [focus]);

  const pos = user || me;
  useEffect(() => {
    const g = userLayer.current;
    if (!g) return;
    g.clearLayers();
    if (pos) {
      L.circle([pos.lat, pos.lng], { radius: Math.min(pos.acc || 30, 150), color: '#2563eb', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(g);
      L.circleMarker([pos.lat, pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(g);
    }
  }, [pos]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(p => {
      const u = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      setMe(u); setLocating(false);
      map.current?.setView([u.lat, u.lng], Math.max(map.current.getZoom(), 16), { animate: true });
    }, () => setLocating(false), { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  };
  const toggle = () => { const v = kind === 'sat' ? 'mapa' : 'sat'; setKind(v); setLayerPref(v); };

  return (
    <div className={`map-wrap ${className}`} style={{ height }}>
      <div ref={el} className="map" role="region" aria-label="Mapa" />
      {controls ? (
        <div className="map-ctl">
          <button type="button" className="map-btn" onClick={toggle} aria-label={kind === 'sat' ? 'Ver mapa de calles' : 'Ver satélite'}>
            <Icon name={kind === 'sat' ? 'map' : 'globe'} size={18} /><span>{kind === 'sat' ? 'Mapa' : 'Satélite'}</span>
          </button>
          <button type="button" className={`map-btn ${pos ? 'on' : ''}`} onClick={locate} aria-label="Mostrar dónde estoy" disabled={locating}>
            <Icon name="locate" size={18} /><span>{locating ? 'Buscando…' : 'Dónde estoy'}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
