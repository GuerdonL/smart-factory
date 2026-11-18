/* The page's side of the backend: when it is asked, for what, and which answers are kept. No drawing here; the
   network and the clock are handed in, so this is tested without either.

   createBackend({ fetch, later, cancel, delay = 500, changed, project }) -> { health(), absent(), available(), ask(graph, node, binding, cells), problem(graph, node, binding), pending() }
     fetch      (path, options) -> a promise of a Response, as the browser's: asked for 'api/backend/health' and 'api/backend/run'
     later, cancel   setTimeout and clearTimeout
     delay      how long after the last change the backend is asked: half a second
     changed    called when answers have come that the page has not drawn yet
     project    () -> the name of the project that is open, or null: sent with a run, for its data files

     health()   asks whether there is a backend: a promise of true or false. Asked once, when the page loads.
     absent()   says there is none without asking (the page is not served by a server that could pass anything on)
     available() true, false, or null while that is not known yet
     ask(graph, node, binding, cells)
                says that a node's numbers are wanted for this graph (graph.js: build; the same object for as long as
                the project stands as it does), looked at from binding (evaluate.js; null for none), at those entries
                ([[column, row], …]). Gives what is known now:
                    null                           nothing yet (or there is no backend)
                    { result, stale: false }       the backend's answer for this graph: { cols, rows, cells, min, max, mean }
                    { result, stale: true }        its answer for an older graph, while the new one is waited for
                Asking is what makes the request: half a second after the last thing was asked for a new graph, or
                newly asked of this one, everything wanted and not yet answered is sent in one run. While that is
                waited for the older answers are given, marked stale. An answer that comes back for a graph that is
                no longer the one being asked about is dropped. Nothing here waits: ask returns at once, always.
     problem(graph, node, binding)   why the backend gave no numbers for it ("unknown entries in Keys"), or null
     pending()  how many nodes are wanted and not yet answered

   Nothing is kept beyond the answers of the graph being drawn and, for dimming, the ones before it. */
export const DELAY = 500;
export const keyFor = (node, binding) => binding ? node + '\n' + JSON.stringify(binding) : node;

export function createBackend({ fetch, later = setTimeout, cancel = clearTimeout, delay = DELAY, changed = () => {}, project = () => null }){
  let there = null, now = null, before = new Map(), timer = null;
  /* now: { graph, wants: key -> { node, binding, cells }, results: key -> result, errors: key -> why, asked: the keys sent }. before: the last answers, by key, for dimming */
  const said = r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error((j && (j.error || (j.errors && j.errors['*']))) || 'the backend answered ' + r.status)), () => Promise.reject(new Error('the backend answered ' + r.status)));
  function send(){
    timer = null; const at = now; if (!at || !there) return;
    const want = [...at.wants].filter(([key]) => !at.asked.has(key)); if (!want.length) return;
    for (const [key] of want) at.asked.add(key);
    const name = project();
    Promise.resolve().then(() => fetch('api/backend/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph: at.graph, want: want.map(([key, w]) => ({ node: w.node, as: key, cells: w.cells, ...(w.binding ? { binding: w.binding } : {}) })), tick: 0, ...(name ? { project: name } : {}) }) })).then(said)
      .then(answer => { if (now !== at) return;      /* an answer for an older graph: dropped */
        const whole = answer && answer.errors && answer.errors['*'];
        for (const [key] of want){ const r = answer && answer.results && answer.results[key];
          if (r && typeof r === 'object') at.results.set(key, r); else at.errors.set(key, (answer && answer.errors && answer.errors[key]) || whole || 'the backend gave no answer for it'); }
        changed(); },
      e => { if (now !== at) return; for (const [key] of want) at.errors.set(key, 'the backend could not be asked: ' + (e && e.message ? e.message : e)); changed(); });
  }
  const soon = () => { if (timer !== null) cancel(timer); timer = later(send, delay); };
  function at(graph){
    if (now && now.graph === graph) return now;
    if (now){ const kept = new Map(); for (const [key, r] of before) if (now.wants.has(key)) kept.set(key, r); for (const [key, r] of now.results) kept.set(key, r); before = kept; }      /* what was last known of what was last drawn, for dimming */
    now = { graph, wants: new Map(), results: new Map(), errors: new Map(), asked: new Set() };
    return now;
  }
  return {
    health(){ return Promise.resolve().then(() => fetch('api/backend/health')).then(r => r.ok ? r.json() : null).then(j => !!(j && j.ok === true), () => false).then(ok => { const was = there; there = ok; if (ok && now) soon(); if (was !== ok) changed(); return ok; }); },
    absent(){ const was = there; there = false; if (was !== false) changed(); },
    available: () => there,
    ask(graph, node, binding, cells){
      if (there === false) return null;
      const a = at(graph), key = keyFor(node, binding);
      if (!a.wants.has(key)){ a.wants.set(key, { node, binding: binding || null, cells });
        if (there) soon(); }
      if (a.results.has(key)) return { result: a.results.get(key), stale: false };
      if (a.errors.has(key)) return null;
      return before.has(key) ? { result: before.get(key), stale: true } : null;
    },
    problem(graph, node, binding){ return now && now.graph === graph ? now.errors.get(keyFor(node, binding)) || null : null; },
    pending: () => now ? [...now.wants.keys()].filter(k => !now.results.has(k) && !now.errors.has(k)).length : 0,
  };
}
