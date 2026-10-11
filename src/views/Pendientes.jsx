import { useState } from 'react';
import { all, put, update, remove, useStore, newId } from '../lib/store.js';
import Icon from '../components/Icon.jsx';
import { Header } from '../components/ui.jsx';

export default function Pendientes() {
  useStore();
  const items = all('check').sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const groups = [...new Set(items.map(i => i.group))];
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [group, setGroup] = useState(groups[0] || 'Reservas');
  const done = items.filter(i => i.done).length;
  const add = () => {
    if (!text.trim()) return;
    put(newId('k'), 'check', { group, text: text.trim(), done: false, order: items.length + 1 });
    setText('');
  };
  return (
    <div className="page pendientes">
      <Header title="Pendientes" sub={`${done} de ${items.length} listos`}
        right={<button className={`icon-btn ${edit ? 'on' : ''}`} onClick={() => setEdit(!edit)} aria-pressed={edit} aria-label="Editar lista"><Icon name="edit" /></button>} />
      <div className="pad">
        {groups.map(g => {
          const gi = items.filter(i => i.group === g);
          return (
            <section className="block" key={g}>
              <h2>{g} <small>{gi.filter(i => i.done).length}/{gi.length}</small></h2>
              <ul className="checks">
                {gi.map(i => (
                  <li key={i.id} className={i.done ? 'done' : ''}>
                    <label>
                      <input type="checkbox" checked={!!i.done} onChange={() => update(i.id, d => { d.done = !d.done; })} />
                      <span className="box" aria-hidden="true"><Icon name="check" size={14} /></span>
                      <span>{i.text}</span>
                    </label>
                    {edit ? <button className="icon-btn sm" onClick={() => remove(i.id)} aria-label={`Borrar ${i.text}`}><Icon name="trash" size={16} /></button> : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <section className="block">
          <h2>Agregar</h2>
          <div className="stack">
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Ej.: Comprar eSIM" onKeyDown={e => e.key === 'Enter' && add()} aria-label="Nuevo pendiente" />
            <div className="grid2 tight">
              <select value={group} onChange={e => setGroup(e.target.value)} aria-label="Grupo">{[...new Set([...groups, 'Otros'])].map(g => <option key={g}>{g}</option>)}</select>
              <button className="btn primary" onClick={add} disabled={!text.trim()}><Icon name="plus" size={18} />Agregar</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
