/* The settings button, top-right: a gear.

   createSettingsButton({ onPress() }) -> { el, active(on) }
     onPress   called when it is pressed
     active    shows it as on (the settings are what is open) or off */
import { html, style } from './dom.js';

style('settings', `
.settings-button { position: fixed; z-index: 10; display: grid; place-items: center; width: 32px; height: 32px; padding: 0; cursor: pointer;
  right: max(16px, env(safe-area-inset-right, 0px)); top: calc(12px + env(safe-area-inset-top, 0px));
  color: var(--muted); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
.settings-button:hover { background: var(--hover); color: var(--fg); }
.settings-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.settings-button.active { color: var(--select); border-color: var(--select); }
.settings-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
`);

export function createSettingsButton({ onPress = () => {} } = {}){
  const el = html`<button class="settings-button" type="button" title="Settings" aria-label="Settings" aria-pressed="false"><svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3.2"/>
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>
    <circle cx="12" cy="12" r="6.8"/></svg></button>`;
  el.addEventListener('click', onPress);
  el.addEventListener('contextmenu', e => e.preventDefault());
  return { el, active(on){ el.classList.toggle('active', on); el.setAttribute('aria-pressed', String(on)); } };
}
