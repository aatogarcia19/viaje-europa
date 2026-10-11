// Tarifas de transporte urbano por ciudad (precios de referencia 2026, por persona) y cálculo de abonos.
// Fuentes: CRTM/Metro de Madrid, TMB, RATP/IDFM, STIB, GVB, ZVV (precios desde 13-12-2026), ACTV, ATAC.

const r2 = n => Math.round(n * 100) / 100;
const AIR = /aeropuerto|aeroport|airport|a[ée]roport|orly|charles de gaulle|schiphol|flughafen|marco polo|fiumicino/i;

const name = l => `${l.from || ''} ${l.to || ''}`;

export const FARES = {
  'c-madrid': {
    cur: 'EUR',
    official: ['Consorcio de Transportes de Madrid', 'https://www.crtm.es/'],
    prices: [
      ['Metro, billete sencillo (zona A)', '1,50 € hasta 5 estaciones, +0,10 € por estación, máximo 2,00 €'],
      ['Suplemento aeropuerto en metro', '3,00 €'],
      ['Bus urbano EMT', '1,50 €'],
      ['Bono 10 viajes (metro, EMT, Metro Ligero 1)', '7,30 € + tarjeta Multi 2,50 €'],
      ['Bus Exprés Aeropuerto (24 h)', '5,00 €'],
      ['Abono Turístico zona A', '1 día 10,30 € · 2 días 17,50 € · 3 días 23,10 €']
    ],
    parts(rides) {
      const out = [];
      let run = null;
      const flush = () => {
        if (!run) return;
        out.push({ sys: 'metro', amt: r2(Math.min(2, 1.5 + Math.max(0, run.st - 5) * 0.1)), label: `Metro (${run.st} estaciones)` });
        if (run.air) out.push({ sys: 'airport', amt: 3, label: 'Suplemento aeropuerto' });
        run = null;
      };
      for (const l of rides) {
        if (l.mode === 'SUBWAY' || (l.mode === 'TRAM' && /ML\s?1/i.test(l.line))) {
          run = run || { st: 0, air: false };
          run.st += l.stops || 1;
          if (AIR.test(name(l))) run.air = true;
          continue;
        }
        flush();
        if (l.mode === 'BUS') {
          if (/(^|\s)203(\s|$)|expr[ée]s/i.test(`${l.line} ${l.head}`)) out.push({ sys: 'busair', amt: 5, label: 'Bus Exprés Aeropuerto' });
          else if (/consorcio|alsa|avanza|interurb/i.test(l.agency || '')) out.push({ sys: 'interbus', amt: 1.7, label: `Bus interurbano ${l.line}` });
          else out.push({ sys: 'bus', amt: 1.5, label: `Bus ${l.line}` });
        } else if (l.mode === 'REGIONAL_RAIL' || l.mode === 'SUBURBAN') {
          out.push({ sys: 'rail', amt: AIR.test(name(l)) ? 2.6 : 1.7, label: `Cercanías ${l.line}` });
        } else if (l.mode === 'TRAM') out.push({ sys: 'ml', amt: 2, label: `Metro Ligero ${l.line}` });
        else out.push({ sys: 'bus', amt: 1.5, label: l.line });
      }
      flush();
      return out;
    },
    manual: { metro: [['metro', 1.5, 'Metro']], bus: [['bus', 1.5, 'Bus EMT']], tram: [['ml', 2, 'Metro Ligero']], train: [['rail', 1.7, 'Cercanías']] },
    airport: [['metro', 2, 'Metro'], ['airport', 3, 'Suplemento aeropuerto']],
    passes: [
      { id: 'mad10', kind: 'multi', name: 'Bono 10 viajes', trips: 10, price: 7.3, card: 2.5, shared: true, covers: ['metro', 'bus', 'ml'], note: 'Una tarjeta Multi para los dos: pasen una vez cada uno. No incluye el suplemento del aeropuerto ni Cercanías.' },
      { id: 'madT1', kind: 'days', days: 1, name: 'Abono Turístico 1 día', price: 10.3, covers: ['metro', 'bus', 'ml', 'rail', 'airport', 'interbus'], note: 'Incluye el aeropuerto en metro y Cercanías.' },
      { id: 'madT2', kind: 'days', days: 2, name: 'Abono Turístico 2 días', price: 17.5, covers: ['metro', 'bus', 'ml', 'rail', 'airport', 'interbus'] },
      { id: 'madT3', kind: 'days', days: 3, name: 'Abono Turístico 3 días', price: 23.1, covers: ['metro', 'bus', 'ml', 'rail', 'airport', 'interbus'] }
    ],
    tips: [
      'Desde junio de 2026 se puede pagar directo en los tornos del metro con tarjeta o con el iPhone (una tarjeta por persona): cobra el billete sencillo.',
      'El bono de 10 viajes va en la tarjeta Multi (2,50 €, en las máquinas del metro) y la pueden compartir: pasen la tarjeta una vez por cada uno.',
      'Al aeropuerto en metro se paga un suplemento de 3 €, salvo con el Abono Turístico.',
      'El metro cierra de 1:30 a 6:00. El Bus Exprés Aeropuerto (5 €) funciona las 24 horas.'
    ]
  },
  'c-barcelona': {
    cur: 'EUR', verify: true,
    official: ['TMB', 'https://www.tmb.cat/es/tarifas-metro-bus-barcelona'],
    prices: [
      ['Billete sencillo (no permite transbordos)', '2,90 €'],
      ['T-casual (10 viajes, transbordos en 75 min, personal)', '13,00 €'],
      ['Billete aeropuerto (metro L9 Sud)', '5,90 €'],
      ['Hola Barcelona', '48 h 18,70 € · 72 h 27,30 €']
    ],
    parts(rides) {
      return rides.map(l => {
        if (l.mode === 'SUBWAY' && AIR.test(name(l))) return { sys: 'airport', amt: 5.9, label: 'Billete aeropuerto (L9 Sud)' };
        if (l.mode === 'REGIONAL_RAIL' || l.mode === 'SUBURBAN') return { sys: 'rail', amt: 2.9, label: `Rodalies ${l.line}` };
        return { sys: 'tmb', amt: 2.9, label: `${l.mode === 'BUS' ? 'Bus' : l.mode === 'TRAM' ? 'Tranvía' : 'Metro'} ${l.line}` };
      });
    },
    manual: { metro: [['tmb', 2.9, 'Metro']], bus: [['tmb', 2.9, 'Bus']], tram: [['tmb', 2.9, 'Tranvía']], train: [['rail', 2.9, 'Rodalies']] },
    airport: [['rail', 2.9, 'Tren R2 Nord (zona 1)']],
    passes: [
      { id: 'bcnTC', kind: 'multi', name: 'T-casual (10 viajes)', trips: 10, price: 13, shared: false, perJourney: true, covers: ['tmb', 'rail'], note: 'Es personal: necesitan una cada uno. Permite transbordos en 75 min.' },
      { id: 'bcnH2', kind: 'days', days: 2, name: 'Hola Barcelona 48 h', price: 18.7, covers: ['tmb', 'rail', 'airport'] }
    ],
    tips: [
      'El billete sencillo (2,90 €) no permite transbordos: si cambian de línea, se paga otro.',
      'Al aeropuerto: tren R2 Nord desde Sants o Passeig de Gràcia con billete normal; el metro L9 Sud necesita el billete aeropuerto (5,90 €).',
      'Es domingo: los trenes y el metro funcionan con horario de fin de semana.'
    ]
  },
  'c-paris': {
    cur: 'EUR',
    official: ['RATP (tarifas 2026)', 'https://www.bonjour-ratp.fr/en/titres-tarifs/'],
    prices: [
      ['Billete Metro-Tren-RER (2 h con transbordos dentro de la red)', '2,55 €'],
      ['Billete Bus-Tranvía (90 min)', '2,05 €'],
      ['Billete aeropuerto (Orly y CDG)', '14,00 €'],
      ['Navigo Jour (día, sin aeropuertos)', '12,30 €'],
      ['Navigo Semana (lunes a domingo, incluye aeropuertos)', '32,40 € + tarjeta 5 € con foto'],
      ['Paris Visite (incluye aeropuertos)', '1 día 30,60 € · 3 días 63,80 €']
    ],
    parts(rides) {
      const out = [];
      let group = null;
      const flush = () => { if (group) { out.push(group); group = null; } };
      for (const l of rides) {
        const air = AIR.test(name(l)) && l.mode !== 'BUS';
        const sys = air ? 'airport' : (l.mode === 'BUS' || l.mode === 'TRAM') ? 'bt' : 'mtr';
        if (group && group.sys === sys && sys !== 'bt') continue; // los transbordos dentro de la red usan el mismo billete
        if (group && group.sys === 'bt' && sys === 'bt') continue;
        flush();
        group = { sys, amt: sys === 'airport' ? 14 : sys === 'bt' ? 2.05 : 2.55, label: sys === 'airport' ? 'Billete aeropuerto' : sys === 'bt' ? 'Billete Bus-Tranvía' : 'Billete Metro-Tren-RER' };
      }
      flush();
      return out;
    },
    manual: { metro: [['mtr', 2.55, 'Metro']], train: [['mtr', 2.55, 'RER']], bus: [['bt', 2.05, 'Bus']], tram: [['bt', 2.05, 'Tranvía']] },
    airport: [['airport', 14, 'Billete aeropuerto']],
    passes: [
      { id: 'parNJ', kind: 'days', days: 1, name: 'Navigo Jour', price: 12.3, covers: ['mtr', 'bt'] },
      { id: 'parNS', kind: 'week', name: 'Navigo Semana', price: 32.4, card: 5, covers: ['mtr', 'bt', 'airport'], note: 'Vale de lunes a domingo; se compra desde el viernes anterior.' },
      { id: 'parPV1', kind: 'days', days: 1, name: 'Paris Visite 1 día', price: 30.6, covers: ['mtr', 'bt', 'airport'] },
      { id: 'parPV3', kind: 'days', days: 3, name: 'Paris Visite 3 días', price: 63.8, covers: ['mtr', 'bt', 'airport'] }
    ],
    tips: [
      'Compren los billetes en el iPhone: Wallet › + › Tarjeta de transporte › Navigo. Así no pagan la tarjeta Navigo Easy (2 €).',
      'Metro/RER y bus/tranvía usan billetes distintos: si combinan los dos, son dos billetes.',
      'En París no se paga con tarjeta bancaria en los tornos.'
    ]
  },
  'c-bruselas': {
    cur: 'EUR', verify: true,
    official: ['STIB-MIVB', 'https://www.stib-mivb.be/'],
    prices: [
      ['Viaje con tarjeta o celular sin contacto (transbordos incluidos)', '2,40 €'],
      ['Tope diario con tarjeta sin contacto', '8,50 €'],
      ['Tren SNCB dentro de Bruselas (Midi–Central)', '≈ 2,60 €']
    ],
    caps: [{ sys: ['stib'], cap: 8.5 }],
    parts(rides) {
      const out = [];
      let stib = false;
      for (const l of rides) {
        if (l.mode === 'REGIONAL_RAIL' || l.mode === 'SUBURBAN') { out.push({ sys: 'sncb', amt: 2.6, label: `Tren SNCB ${l.line}` }); stib = false; continue; }
        if (stib) continue;
        out.push({ sys: 'stib', amt: 2.4, label: 'Viaje STIB' });
        stib = true;
      }
      return out;
    },
    manual: { metro: [['stib', 2.4, 'STIB']], bus: [['stib', 2.4, 'STIB']], tram: [['stib', 2.4, 'STIB']], train: [['sncb', 2.6, 'Tren SNCB']] },
    passes: [],
    tips: [
      'Paguen con la tarjeta o el iPhone en el validador al subir, una vez por viaje: 2,40 € y nunca más de 8,50 € al día.',
      'El tren SNCB entre Midi y Central usa otro billete (no vale la tarjeta en el validador de STIB).'
    ]
  },
  'c-amsterdam': {
    cur: 'EUR',
    official: ['GVB', 'https://www.gvb.nl/en/travel-information/tickets-and-fares'],
    prices: [
      ['GVB con tarjeta sin contacto (OVpay)', '1,16 € + 0,22 € por km, tope 10,50 € al día'],
      ['GVB 1 hora', '3,40 €'],
      ['GVB 24 / 48 / 72 h', '10,00 € · 16,00 € · 21,50 €'],
      ['Amsterdam Travel Ticket (incluye tren a Schiphol)', '1 día 20 € · 2 días 27 €'],
      ['Tren NS Centraal–Schiphol', '≈ 6,20 €'],
      ['Ferris GVB detrás de Centraal', 'gratis']
    ],
    caps: [{ sys: ['gvb'], cap: 10.5 }],
    parts(rides) {
      return rides.map(l => {
        if (l.mode === 'FERRY' && /gvb/i.test(l.agency || 'GVB')) return { sys: 'gvb-ferry', amt: 0, label: 'Ferry GVB (gratis)' };
        if (l.mode === 'REGIONAL_RAIL' || l.mode === 'SUBURBAN') {
          if (AIR.test(name(l))) return { sys: 'ns-air', amt: 6.2, label: 'Tren NS a Schiphol' };
          return { sys: 'ns', amt: r2(2.6 + 0.18 * (l.km || 5)), label: `Tren NS ${l.line}` };
        }
        return { sys: 'gvb', amt: r2(1.16 + 0.217 * Math.max(1, l.km || 2)), label: `${l.mode === 'BUS' ? 'Bus' : l.mode === 'TRAM' ? 'Tranvía' : 'Metro'} ${l.line}` };
      });
    },
    manual: { metro: [['gvb', 2, 'GVB']], bus: [['gvb', 2, 'GVB']], tram: [['gvb', 2, 'GVB']], train: [['ns', 3, 'Tren NS']], vaporetto: [['gvb-ferry', 0, 'Ferry GVB']] },
    airport: [['ns-air', 6.2, 'Tren NS a Schiphol']],
    passes: [
      { id: 'ams24', kind: 'days', days: 1, name: 'GVB 24 h', price: 10, covers: ['gvb'] },
      { id: 'ams48', kind: 'days', days: 2, name: 'GVB 48 h', price: 16, covers: ['gvb'] },
      { id: 'amsATT', kind: 'days', days: 1, name: 'Amsterdam Travel Ticket 1 día', price: 20, covers: ['gvb', 'ns-air'] },
      { id: 'amsATT2', kind: 'days', days: 2, name: 'Amsterdam Travel Ticket 2 días', price: 27, covers: ['gvb', 'ns-air'] }
    ],
    tips: [
      'Paguen con tarjeta sin contacto o el iPhone y validen al SUBIR y al BAJAR; si olvidan validar al bajar, cobran 4 € extra.',
      'Los ferris detrás de la estación central (al norte) son gratis.',
      'Los carriles de bicicleta no son para caminar.'
    ]
  },
  'c-zurich': {
    cur: 'CHF',
    official: ['ZVV (precios desde el 13-12-2026)', 'https://www.zvv.ch/'],
    prices: [
      ['Trayecto corto (Kurzstrecke)', '2,80 CHF'],
      ['Ciudad, zona 110 (1 hora)', '4,80 CHF'],
      ['3 zonas (aeropuerto o Uetliberg)', '7,40 CHF'],
      ['24 h ciudad / 24 h 3 zonas', '9,60 CHF · 14,80 CHF']
    ],
    parts(rides) {
      if (!rides.length) return [];
      const all = rides.map(name).join(' ');
      const km = rides.reduce((s, l) => s + (l.km || 1), 0);
      if (AIR.test(all) || /uetliberg/i.test(all)) return [{ sys: 'zvv3', amt: 7.4, label: 'Billete 3 zonas' }];
      if (km < 2.5 && rides.length === 1) return [{ sys: 'zvvk', amt: 2.8, label: 'Trayecto corto' }];
      return [{ sys: 'zvv', amt: 4.8, label: 'Billete zona ciudad' }];
    },
    manual: { metro: [['zvv', 4.8, 'ZVV']], bus: [['zvv', 4.8, 'ZVV']], tram: [['zvv', 4.8, 'ZVV']], train: [['zvv', 4.8, 'ZVV']] },
    airport: [['zvv3', 7.4, 'Billete 3 zonas (aeropuerto)']],
    special: { 'z-uetliberg': [['zvv3', 7.4, 'Billete 3 zonas (Uetliberg)']] },
    passes: [
      { id: 'zrh24', kind: 'days', days: 1, name: '24 h zona ciudad', price: 9.6, covers: ['zvv', 'zvvk'] },
      { id: 'zrh24x3', kind: 'days', days: 1, name: '24 h 3 zonas (aeropuerto y Uetliberg)', price: 14.8, covers: ['zvv', 'zvvk', 'zvv3'] }
    ],
    tips: [
      'Moneda: francos suizos (CHF). Compren en las máquinas o en la app SBB Mobile; no hay torniquetes, pero hay controles.',
      'La ciudad (zona 110) cuenta doble: aeropuerto y Uetliberg necesitan billete de 3 zonas.',
      'Si van a Uetliberg y usan tranvías el mismo día, el pase 24 h de 3 zonas suele salir mejor.'
    ]
  },
  'c-venecia': {
    cur: 'EUR',
    official: ['ACTV', 'https://actv.avmspa.it/en'],
    prices: [
      ['Vaporetto, billete 75 minutos', '9,50 €'],
      ['Pase ACTV', '24 h 25 € · 48 h 35 € · 72 h 45 €'],
      ['Bus aeropuerto Marco Polo–Piazzale Roma', '≈ 10 € (no entra en los pases)']
    ],
    parts(rides) {
      const out = [];
      let ferry = false;
      for (const l of rides) {
        if (l.mode === 'FERRY') { if (!ferry) out.push({ sys: 'actv', amt: 9.5, label: 'Vaporetto 75 min' }); ferry = true; continue; }
        ferry = false;
        if (AIR.test(name(l))) out.push({ sys: 'air', amt: 10, label: 'Bus aeropuerto' });
        else out.push({ sys: 'bus', amt: 1.5, label: `Bus ${l.line}` });
      }
      return out;
    },
    manual: { vaporetto: [['actv', 9.5, 'Vaporetto 75 min']], bus: [['bus', 1.5, 'Bus']] },
    airport: [['air', 10, 'Bus aeropuerto']],
    passes: [
      { id: 'ven24', kind: 'days', days: 1, name: 'Pase ACTV 24 h', price: 25, covers: ['actv', 'bus'] },
      { id: 'ven48', kind: 'days', days: 2, name: 'Pase ACTV 48 h', price: 35, covers: ['actv', 'bus'] }
    ],
    tips: [
      'Validen el billete en la máquina del muelle antes de subir al vaporetto.',
      'El vaporetto es caro: con 3 viajes en 24 h ya conviene el pase de 25 €.',
      'Si alguno tiene entre 6 y 29 años, pregunten por Rolling Venice (descuento en el pase de 72 h).'
    ]
  },
  'c-roma': {
    cur: 'EUR', verify: true,
    official: ['ATAC', 'https://www.atac.roma.it/en/tickets-and-passes'],
    prices: [
      ['BIT 100 minutos (bus y tranvía ilimitados, una entrada al metro)', '1,50 €'],
      ['Roma 24 h / 48 h / 72 h', '8,50 € · 15 € · 22 €'],
      ['Leonardo Express a Fiumicino', '14 €'],
      ['Bus Termini–Fiumicino', '≈ 7 €']
    ],
    parts(rides) {
      const out = [];
      let atac = false;
      for (const l of rides) {
        if (AIR.test(name(l))) { out.push(l.mode === 'BUS' ? { sys: 'airbus', amt: 7, label: 'Bus a Fiumicino' } : { sys: 'air', amt: 14, label: 'Leonardo Express' }); atac = false; continue; }
        if (!atac) out.push({ sys: 'atac', amt: 1.5, label: 'BIT 100 min' });
        atac = true;
      }
      return out;
    },
    manual: { metro: [['atac', 1.5, 'BIT']], bus: [['atac', 1.5, 'BIT']], tram: [['atac', 1.5, 'BIT']], train: [['atac', 1.5, 'BIT']] },
    airport: [['airbus', 7, 'Bus a Fiumicino']],
    passes: [
      { id: 'rom24', kind: 'days', days: 1, name: 'Roma 24 h', price: 8.5, covers: ['atac'] },
      { id: 'rom48', kind: 'days', days: 2, name: 'Roma 48 h', price: 15, covers: ['atac'] }
    ],
    tips: [
      'El BIT (1,50 €) vale 100 minutos en bus y tranvía, pero solo una entrada al metro.',
      'Pueden pagar con tarjeta sin contacto o el iPhone en los tornos del metro y en los buses con lector (Tap&Go).',
      'Validen siempre al subir al bus: hay multas aunque tengan el billete.'
    ]
  }
};

export const AIRPORT_PLACES = new Set(['m-barajas', 'b-aeropuerto', 'p-orly', 'a-schiphol', 'z-airport', 'v-airport', 'r-fco']);
export const curOf = cityId => (FARES[cityId] && FARES[cityId].cur) || 'EUR';

// Precio de una opción de transporte calculada
export function optFare(opt, cityId) {
  const F = FARES[cityId];
  if (!F || !opt) return null;
  const rides = opt.legs.filter(l => l.mode !== 'WALK');
  const parts = F.parts(rides);
  return { amt: r2(parts.reduce((s, p) => s + p.amt, 0)), cur: F.cur, parts, verify: !!F.verify };
}

// Precio de un tramo anotado a mano (metro, bus, tren…) o estimado
export function manualFare(cityId, mode, fromPlace, toPlace) {
  const F = FARES[cityId];
  if (!F || !mode || mode === 'walk' || mode === 'taxi') return null;
  let spec = null;
  if (F.special) spec = F.special[toPlace] || F.special[fromPlace] || null;
  if (!spec && F.airport && (AIRPORT_PLACES.has(fromPlace) || AIRPORT_PLACES.has(toPlace))) spec = F.airport;
  if (!spec) spec = F.manual[mode] || F.manual.metro || Object.values(F.manual)[0];
  if (!spec) return null;
  const parts = spec.map(([sys, amt, label]) => ({ sys, amt, label }));
  return { amt: r2(parts.reduce((s, p) => s + p.amt, 0)), cur: F.cur, parts, est: true, verify: !!F.verify };
}

const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
const isoWeek = iso => { const d = new Date(iso + 'T12:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); };

// trips: [{ date, parts:[{sys, amt}], j }] — por persona. Devuelve la comparación de opciones ordenada.
export function comparePasses(cityId, trips, travelers = 2) {
  const F = FARES[cityId];
  if (!F) return null;
  const allParts = trips.flatMap(t => t.parts.map(p => ({ ...p, date: t.date, j: t.j })));
  const capFor = sys => (F.caps || []).find(c => c.sys.includes(sys));
  const singlesFor = parts => {
    const byDate = {};
    let s = 0;
    for (const p of parts) {
      const c = capFor(p.sys);
      if (c) { const k = p.date + '|' + c.sys.join(); byDate[k] = byDate[k] || { cap: c.cap, sum: 0 }; byDate[k].sum += p.amt; }
      else s += p.amt;
    }
    for (const v of Object.values(byDate)) s += Math.min(v.cap, v.sum);
    return s;
  };
  const singles = r2(singlesFor(allParts));
  const results = [{ id: 'singles', name: (F.caps || []).length ? 'Pagar cada viaje con tarjeta' : 'Billetes sueltos', cost: singles, note: `${trips.length} ${trips.length === 1 ? 'viaje' : 'viajes'}` }];
  for (const p of F.passes || []) {
    const cov = allParts.filter(x => p.covers.includes(x.sys));
    if (!cov.length) continue;
    const rest = singlesFor(allParts.filter(x => !p.covers.includes(x.sys)));
    let cost;
    if (p.kind === 'multi') {
      const n = p.perJourney ? new Set(cov.map(x => x.j)).size : cov.length;
      if (p.shared) { const packs = Math.ceil((n * travelers) / p.trips); cost = (packs * p.price + (p.card || 0)) / travelers; }
      else cost = Math.ceil(n / p.trips) * p.price + (p.card || 0);
      cost += rest;
    } else if (p.kind === 'week') {
      const weeks = new Set(cov.map(x => isoWeek(x.date))).size;
      cost = weeks * p.price + (p.card || 0) + rest;
    } else if (p.days === 1) {
      const byDate = {};
      for (const x of cov) byDate[x.date] = (byDate[x.date] || 0) + x.amt;
      cost = Object.values(byDate).reduce((s, v) => s + Math.min(v, p.price), 0) + rest;
      const daysUsed = Object.values(byDate).filter(v => v > p.price).length;
      if (!daysUsed) continue; // nunca conviene; no se muestra
    } else {
      const ds = [...new Set(cov.map(x => x.date))].sort();
      const span = dayDiff(ds[0], ds[ds.length - 1]) + 1;
      cost = Math.ceil(span / p.days) * p.price + rest;
    }
    results.push({ id: p.id, name: p.name, cost: r2(cost), note: p.note || '', price: p.price });
  }
  results.sort((a, b) => a.cost - b.cost || (a.id === 'singles' ? -1 : 1));
  return { cur: F.cur, singles, best: results[0], results };
}
