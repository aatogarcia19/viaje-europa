// Audioguías con la voz del teléfono (funciona sin internet en iPhone si la voz está descargada).
import { useSyncExternalStore } from 'react';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const listeners = new Set();
let version = 0;
export const player = { id: null, title: '', idx: 0, total: 0, playing: false, paused: false };
let parts = [];
let stopFlag = false;

function emit() { version++; for (const l of listeners) l(); }
export function usePlayer() { return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => version); }
export const supported = () => !!synth;

export function voices() {
  if (!synth) return [];
  return synth.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('es'));
}
if (synth) synth.addEventListener?.('voiceschanged', emit);

function pickVoice() {
  const vs = voices();
  let saved = null;
  try { saved = localStorage.getItem('ve.voice'); } catch { /* */ }
  if (saved) { const v = vs.find(x => x.name === saved); if (v) return v; }
  const score = v => (/(premium|mejorad|enhanced)/i.test(v.name) ? 4 : 0) + (v.lang === 'es-ES' ? 2 : 0) + (v.lang === 'es-MX' || v.lang === 'es-US' ? 1 : 0) + (v.localService ? 1 : 0);
  return vs.sort((a, b) => score(b) - score(a))[0] || null;
}
export function rate() { try { return Number(localStorage.getItem('ve.rate') || '1'); } catch { return 1; } }

function split(text) {
  const out = [];
  for (const s of text.replace(/\s+/g, ' ').split(/(?<=[.!?;:])\s+/)) {
    if (s.length <= 220) { if (s.trim()) out.push(s.trim()); continue; }
    let buf = '';
    for (const w of s.split(/(?<=,)\s+/)) { if ((buf + ' ' + w).length > 220 && buf) { out.push(buf.trim()); buf = w; } else buf += ' ' + w; }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

function speakPart() {
  if (!synth) return;
  if (player.idx >= parts.length) { player.playing = false; player.paused = false; emit(); return; }
  const u = new SpeechSynthesisUtterance(parts[player.idx]);
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-ES';
  u.rate = rate();
  u.onend = () => { if (stopFlag) return; player.idx++; emit(); speakPart(); };
  u.onerror = () => { if (stopFlag) return; player.idx++; speakPart(); };
  synth.speak(u);
}

export function play(id, title, text) {
  if (!synth || !text) return;
  stopFlag = true; synth.cancel();
  parts = split(text);
  Object.assign(player, { id, title, idx: 0, total: parts.length, playing: true, paused: false });
  stopFlag = false;
  emit();
  setTimeout(speakPart, 60);
}
export function pause() {
  if (!synth || !player.playing) return;
  stopFlag = true; synth.cancel();
  player.paused = true; player.playing = false; emit();
}
export function resume() {
  if (!synth || !player.paused) return;
  stopFlag = false; player.paused = false; player.playing = true; emit();
  speakPart();
}
export function stop() {
  if (!synth) return;
  stopFlag = true; synth.cancel();
  Object.assign(player, { id: null, title: '', idx: 0, total: 0, playing: false, paused: false });
  emit();
}
export function skip(delta) {
  if (!synth || !player.id) return;
  stopFlag = true; synth.cancel();
  player.idx = Math.max(0, Math.min(parts.length - 1, player.idx + delta));
  stopFlag = false; player.playing = true; player.paused = false; emit();
  setTimeout(speakPart, 60);
}
// iOS necesita que la primera voz se dispare con un toque del usuario
export function unlock() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}
