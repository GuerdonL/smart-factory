/* Undo and redo, as a tap on the message bus.

   createHistory(bus, { snap, same, restore, limit }) -> { undo(), redo(), canUndo(), canRedo(), clear() }
     snap     gives the project as it stands now, as something restore can put back
     same     (a, b) -> whether two of those are the same project
     restore  puts one back
     limit    how many steps are kept (200)
     undo, redo   step back and forward; each gives the type of the message it undid or redid, or null if there was
                  nothing to do
     clear    forgets every step, and the one being taken: for when a different project is opened

   Before the first message that can change the project in any one turn of events, the project is kept; when the turn
   is over it is looked at again, and if it now stands differently the pair is one step. So everything one action
   sends (a drag's 'place' and the 'frame.enter' that follows it, say) is undone together, and a message that turned
   out to change nothing is no step at all. Undoing and redoing are not themselves steps. A new step ends what could
   have been redone. */
export function createHistory(bus, { snap, same, restore, limit = 200 }){
  const done = [], undone = []; let open = null, quiet = false;
  bus.tap((phase, message) => {
    if (quiet || open || phase !== 'before' || !message.changes || message.depth) return;
    open = { before: snap(), type: message.type };
    queueMicrotask(() => { const step = open; open = null; if (!step) return;
      step.after = snap(); if (same(step.before, step.after)) return;
      done.push(step); if (done.length > limit) done.shift(); undone.length = 0; });
  });
  const go = (from, to, which) => { const step = from.pop(); if (!step) return null;
    quiet = true; try { restore(step[which]); } finally { quiet = false; }
    to.push(step); return step.type; };
  return { undo: () => go(done, undone, 'before'), redo: () => go(undone, done, 'after'),
    canUndo: () => done.length > 0, canRedo: () => undone.length > 0,
    clear(){ done.length = undone.length = 0; open = null; } };
}
