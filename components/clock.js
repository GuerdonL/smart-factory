/* The project's clock, top-centre (clear of the readout, which grows along the bottom): the tick, a way to type it, a way to step it by one, and Play / Stop when a backend that can play is running.

   createClock({ onSet(text), onStep(by), onPlay(), onStop() }) -> { el, show(tick), state({ playable, playing }) }
     show     takes the tick, a whole number from 0, and writes it in the field (unless it is being typed in)
     state    playable: whether Play is offered; playing: whether a run is playing (toggles Play vs Stop, disables typing/stepping while playing)
     onSet    called with what was typed when Enter is pressed or the field is left with something else in it;
              whoever is told decides whether that is a tick, and calls show with the tick that then stands
     onStep   called with -1 or 1 when a button is pressed
     onPlay   called when Play is pressed
     onStop   called when Stop is pressed */
import { html, style } from './dom.js';

style('clock', `
.clock { position: fixed; z-index: 10; display: flex; gap: 6px; align-items: center; color: var(--muted); font-variant-numeric: tabular-nums;
  left: 50%; transform: translateX(-50%); top: calc(12px + env(safe-area-inset-top, 0px));
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px 4px 10px; }
.clock button { font: inherit; color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 4px; padding: 2px 8px; cursor: pointer; }
.clock button:hover:not(:disabled) { background: var(--hover); }
.clock button:disabled, .clock input:disabled { opacity: 0.45; cursor: default; }
.clock button[hidden] { display: none; }
.clock button:focus-visible, .clock input:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.clock input { font: inherit; color: var(--fg); background: none; border: 1px solid var(--line); border-radius: 4px; padding: 2px 6px; width: 9ch; text-align: right; }
`);

export function createClock({ onSet = () => {}, onStep = () => {}, onPlay = () => {}, onStop = () => {} } = {}){
  const el = html`<div class="clock" aria-label="The tick"><span>tick</span><button type="button" data-step="-1" aria-label="One tick back">−</button><input type="text" inputmode="numeric" aria-label="The tick" value="0"><button type="button" data-step="1" aria-label="One tick on">+</button><button type="button" data-play hidden aria-label="Play">Play</button><button type="button" data-stop hidden aria-label="Stop">Stop</button></div>`;
  const [, back, field, on, playBtn, stopBtn] = el.children; let shown = '0', playing = false;
  back.addEventListener('click', () => { if (!playing) onStep(-1); });
  on.addEventListener('click', () => { if (!playing) onStep(1); });
  playBtn.addEventListener('click', () => onPlay());
  stopBtn.addEventListener('click', () => onStop());
  const give = () => { if (!playing && field.value.trim() !== shown) onSet(field.value); };
  field.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter'){ give(); field.blur(); } if (e.key === 'Escape'){ field.value = shown; field.blur(); } });
  field.addEventListener('blur', give);
  for (const type of ['keyup', 'keypress', 'pointerdown', 'mousedown', 'wheel', 'paste', 'copy', 'cut']) el.addEventListener(type, e => e.stopPropagation());
  el.addEventListener('contextmenu', e => e.preventDefault());
  return {
    el,
    show(tick){ shown = String(tick); if (document.activeElement !== field) field.value = shown; },
    state({ playable = false, playing: isPlaying = false } = {}){
      playing = !!isPlaying;
      playBtn.hidden = !playable || playing;
      stopBtn.hidden = !playing;
      back.disabled = playing;
      on.disabled = playing;
      field.disabled = playing;
    },
  };
}
