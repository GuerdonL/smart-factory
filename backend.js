/* The page's side of the backend: when it is asked, for what, and which answers are kept. No drawing here; the
   network and the clock are handed in, so this is tested without either.

   createBackend({ fetch, later, cancel, delay = 500, every = 15000, changed, told, project }) -> { health(), absent(), available(), ask(graph, node, binding, cells, slot), problem(graph, node, binding), pending() }
     fetch      (path, options) -> a promise of a Response, as the browser's: asked for 'api/backend/health' and 'api/backend/run'
     later, cancel   setTimeout and clearTimeout
     delay      how long after the last change the backend is asked: half a second
     every      how long after one answer about its health the backend is asked for the next
     changed    called when answers have come that the page has not drawn yet
     told       called with why ([sentence, …], each once) when the backend gives no numbers for something asked of
                it, as the reasons arrive, and when a backend that was answering no longer is
     project    () -> the name of the project that is open, or null: sent with a run, for its data files

     health()   asks whether there is a backend: a promise of true or false. Asked when the page loads, again every
                `every` after that, and at once after a run that could not be asked or was refused whole, so that a
                backend started or stopped after the page loaded is noticed without the page being loaded again.
                When one that was gone answers again, everything wanted is asked for afresh; what could not be
                asked for (the network failed) while it says it is there is tried again at each regular asking.
     absent()   says there is none without asking, and stops asking (the page is not served by a server that could
                pass anything on)
     available() true, false, or null while that is not known yet
     ask(graph, node, binding, cells, slot)
                says that a node's numbers are wanted for this graph (graph.js: build; the same object for as long as
                the project stands as it does), looked at from binding (evaluate.js; null for none), at those entries
                ([[column, row], …]). slot says what on the screen they are drawn as (a block, a piece, an arrow's
                output: any text; left out, the node and binding themselves): a node's id changes with what it is
                made of (a noise block's with its seed), and what is drawn in its place is still the same thing.
                Gives what is known now:
                    null                           nothing yet (or there is no backend)
                    { result, stale: false }       the backend's answer for this graph: { cols, rows, cells, min, max, mean }
                    { result, stale: true }        its answer for what was in that slot in an older graph, while
                                                   the new one is waited for
                Asking is what makes the request: half a second after the last thing was asked for a new graph, or
                newly asked of this one, everything wanted and not yet answered is sent in one run. While that is
                waited for the older answers are given, marked stale. An answer that comes back for a graph that is
                no longer the one being asked about is dropped, and so is a failure. Nothing here waits: ask returns
                at once, always.
     problem(graph, node, binding)   why the backend gave no numbers for it ("unknown entries in Keys"), or null
     pending()  how many nodes are wanted and not yet answered

   Nothing is kept beyond the answers of the graph being drawn and, for dimming, the ones before it. */
export const DELAY = 500, EVERY = 15000;
export const keyFor = (node, binding) => binding ? node + '\n' + JSON.stringify(binding) : node;

export function createBackend({ fetch, later = setTimeout, cancel = clearTimeout, delay = DELAY, every = EVERY, changed = () => {}, told = () => {}, project = () => null }){
  let there = null, now = null, before = new Map(), timer = null, beat = null, asking = null, gone = false, due = false;      /* due: this asking of its health is the regular one, at which what could not be asked for is tried again */
  /* now: { graph, wants: key -> { node, binding, cells, slot }, results: key -> result, errors: key -> why, asked: the keys sent, lost: the keys that could not be asked for }. before: the last answers, by slot, for dimming */
  const said = r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error((j && (j.error || (j.errors && j.errors['*']))) || 'the backend answered ' + r.status)), () => Promise.reject(new Error('the backend answered ' + r.status)));
  const afresh = keys => { if (!now) return false; let any = false; for (const key of [...keys]) if (now.errors.has(key)){ now.errors.delete(key); now.asked.delete(key); now.lost.delete(key); any = true; } return any; };
  function send(){
    timer = null; const at = now; if (!at || !there) return;
    const want = [...at.wants].filter(([key]) => !at.asked.has(key)); if (!want.length) return;
    for (const [key] of want) at.asked.add(key);
    const name = project();
    Promise.resolve().then(() => fetch('api/backend/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph: at.graph, want: want.map(([key, w]) => ({ node: w.node, as: key, cells: w.cells, ...(w.binding ? { binding: w.binding } : {}) })), tick: 0, ...(name ? { project: name } : {}) }) })).then(said)
      .then(answer => { if (now !== at) return;      /* an answer for an older graph: dropped */
        const whole = answer && answer.errors && answer.errors['*'], why = new Set();
        for (const [key] of want){ const r = answer && answer.results && answer.results[key];
          if (r && typeof r === 'object') at.results.set(key, r); else { const e = (answer && answer.errors && answer.errors[key]) || whole || 'the backend gave no answer for it'; at.errors.set(key, e); why.add(e); } }
        if (why.size) told([...why]); changed(); if (whole) self.health(); },      /* refused whole: it may be that the backend is gone, and the server said so */
      e => { if (now !== at) return;      /* a failure of a run for an older graph: dropped */
        const why = 'the backend could not be asked: ' + (e && e.message ? e.message : e);
        for (const [key] of want){ at.errors.set(key, why); at.lost.add(key); } told([why]); changed(); self.health(); });
  }
  const soon = () => { if (timer !== null) cancel(timer); timer = later(send, delay); };
  function at(graph){
    if (now && now.graph === graph) return now;
    if (now){ const kept = new Map(); for (const [key, w] of now.wants){ const r = now.results.get(key) || before.get(w.slot); if (r) kept.set(w.slot, r); } before = kept; }      /* what was last known of what was last drawn, for dimming */
    now = { graph, wants: new Map(), results: new Map(), errors: new Map(), asked: new Set(), lost: new Set() };
    return now;
  }
  const heard = ok => { const was = there; there = ok; asking = null;
    if (beat !== null) cancel(beat); beat = gone ? null : later(() => { beat = null; due = true; self.health(); }, every);
    const regular = due; due = false;
    const again = !!(ok && now) && (was === false ? afresh(now.errors.keys()) : regular && afresh(now.lost));      /* back, or there after all: what it gave no numbers for, or could not be asked for, is asked for again */
    if (ok && now && (was !== true || again)) soon();
    if (was === true && !ok) told(['the backend has stopped answering']);
    if (was !== ok || again) changed();
    return ok; };
  const self = {
    health(){ if (gone) return Promise.resolve(false);
      return asking ||= Promise.resolve().then(() => fetch('api/backend/health')).then(r => r.ok ? r.json() : null).then(j => !!(j && j.ok === true), () => false).then(heard); },
    absent(){ const was = there; there = false; gone = true; if (beat !== null){ cancel(beat); beat = null; } if (was !== false) changed(); },
    available: () => there,
    ask(graph, node, binding, cells, slot = null){
      if (there === false) return null;
      const a = at(graph), key = keyFor(node, binding); slot = slot === null ? key : slot;
      if (!a.wants.has(key)){ a.wants.set(key, { node, binding: binding || null, cells, slot });
        if (there) soon(); }
      if (a.results.has(key)) return { result: a.results.get(key), stale: false };
      if (a.errors.has(key)) return null;
      return before.has(slot) ? { result: before.get(slot), stale: true } : null;
    },
    problem(graph, node, binding){ return now && now.graph === graph ? now.errors.get(keyFor(node, binding)) || null : null; },
    pending: () => now ? [...now.wants.keys()].filter(k => !now.results.has(k) && !now.errors.has(k)).length : 0,
  };
  return self;
}
