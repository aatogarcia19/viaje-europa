import { useEffect } from 'react';
import { getCode, me, useStore, startAutoSync, hasData } from './lib/store.js';
import Icon from './components/Icon.jsx';
import { useRoute, go, AudioBar } from './components/ui.jsx';
import Hoy from './views/Hoy.jsx';
import Viaje from './views/Viaje.jsx';
import Dia from './views/Dia.jsx';
import Ciudad from './views/Ciudad.jsx';
import Lugar from './views/Lugar.jsx';
import Traslado from './views/Traslado.jsx';
import Gastos from './views/Gastos.jsx';
import Pendientes from './views/Pendientes.jsx';
import Ajustes from './views/Ajustes.jsx';
import { Login, WhoAmI } from './views/Login.jsx';

const TABS = [
  ['hoy', 'Hoy', 'today'],
  ['viaje', 'Viaje', 'route'],
  ['gastos', 'Gastos', 'wallet'],
  ['pendientes', 'Pendientes', 'list'],
  ['ajustes', 'Ajustes', 'gear']
];

let started = false;

export default function App() {
  useStore();
  const { parts, query, path } = useRoute();
  const code = getCode();
  useEffect(() => { if (code && !started) { started = true; startAutoSync(); } }, [code]);
  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  if (!code) return <Login />;
  if (!hasData()) return <WhoAmI />;
  if (!me()) return <WhoAmI />;

  const [a, b] = parts;
  let view;
  switch (a) {
    case 'viaje': view = <Viaje query={query} />; break;
    case 'dia': view = <Dia key={b} date={b} />; break;
    case 'ciudad': view = <Ciudad key={b} id={b} query={query} />; break;
    case 'lugar': view = <Lugar key={b} id={b} query={query} />; break;
    case 'traslado': view = <Traslado key={b} id={b} />; break;
    case 'gastos': view = <Gastos />; break;
    case 'pendientes': view = <Pendientes />; break;
    case 'ajustes': view = <Ajustes />; break;
    default: view = <Hoy />;
  }
  const active = { dia: 'viaje', ciudad: 'viaje', lugar: 'viaje', traslado: 'viaje' }[a] || a || 'hoy';

  return (
    <div className="app">
      <main>{view}</main>
      <AudioBar />
      <nav className="tabs" aria-label="Secciones">
        {TABS.map(([k, l, ic]) => (
          <button key={k} className={active === k ? 'on' : ''} aria-current={active === k ? 'page' : undefined} onClick={() => go('/' + k)}>
            <Icon name={ic} size={22} /><span>{l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
