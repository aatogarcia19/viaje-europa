// Datos públicos de conexión. El acceso real lo protege el código del viaje (no está en el repo).
export const SUPABASE_URL = 'https://jhjmdmcndgjgsbnsjekg.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impoam1kbWNuZGdqZ3NibnNqZWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NzMzOTMsImV4cCI6MjEwNzI0OTM5M30.4jowYby9R11hKLRhOyEBgCw5Xtidq8H-1C1DDgdW9HY';
export const TRIP_ID = 'europa2027';

// Mapa de calles: OpenFreeMap (vectorial, gratis, sin clave)
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
// Respaldo si el teléfono no puede dibujar mapas vectoriales
export const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
// Vista satelital: Esri World Imagery + capas de calles y nombres
export const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const SAT_LABELS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
];
export const SAT_ATTR = 'Imágenes © Esri, Maxar, Earthstar Geographics';

export const ROUTER_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
