// Íconos de línea simples (24×24, trazo).
const P = {
  walk: <><circle cx="13" cy="4" r="2" /><path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 2 4 3 1M10 8l-1 5 3 2" /></>,
  metro: <><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M8 21l2-4M16 21l-2-4" /><circle cx="9" cy="14" r=".8" /><circle cx="15" cy="14" r=".8" /></>,
  train: <><rect x="6" y="3" width="12" height="14" rx="4" /><path d="M6 10h12M9 21l1.5-4M15 21l-1.5-4M9 13.5h.01M15 13.5h.01" /></>,
  tram: <><rect x="6" y="6" width="12" height="11" rx="2" /><path d="M9 3h6M12 3v3M6 12h12M9 21l1-4M15 21l-1-4" /></>,
  bus: <><rect x="5" y="4" width="14" height="13" rx="2" /><path d="M5 11h14M8 20v-3M16 20v-3M8 14h.01M16 14h.01" /></>,
  plane: <path d="M10.5 21l1.5-1 1.5 1v-3.5l-1.5-1 1-6 7 2.5v-2l-7-4.5V4a1 1 0 0 0-2 0v2.5L4 11v2l7-2.5 1 6-1.5 1z" />,
  vaporetto: <><path d="M3 15l2 4h14l2-4H3zM6 15V10h12v5M9 10V7h6v3" /><path d="M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1" /></>,
  taxi: <><path d="M5 16V12l2-5h10l2 5v4M5 16h14M7 19v-3M17 19v-3M9 4h6" /></>,
  meal: <><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1-3 4-3 7h3" /></>,
  bed: <><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" /><circle cx="7" cy="11" r="1.6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  play: <path d="M8 5l11 7-11 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  trash: <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" />,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></>,
  nav: <path d="M12 3l7 18-7-4-7 4z" />,
  audio: <><path d="M4 10v4h4l5 4V6L8 10H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></>,
  sunset: <><path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 4v5M9 7l3 3 3-3M5 13l1 1M19 13l-1 1" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14.5h2" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>,
  today: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /><circle cx="12" cy="15" r="1.6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  sync: <path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v3h3M4 13a8 8 0 0 0 14.5 4.5M20 20v-3h-3" />,
  ticket: <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7zM14 7v10" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  wand: <path d="M4 20L15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M18 14v2M20 15h-4M9 4v2M10 5H8" />,
  locate: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  warn: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4.5M12 17.5v.5" /></>,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z" />,
  euro: <path d="M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10.5h9M4 13.5h9" />,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  rest: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
  shuffle: <path d="M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M18 4l2 3-2 3M18 14l2 3-2 3" />
};

export default function Icon({ name, size = 20, className = '', title }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {P[name] || P.pin}
    </svg>
  );
}

export const modeIcon = m => ({ walk: 'walk', metro: 'metro', train: 'train', tram: 'tram', bus: 'bus', plane: 'plane', vaporetto: 'vaporetto', taxi: 'taxi' }[m] || 'walk');
