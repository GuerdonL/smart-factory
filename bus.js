/* The message bus: everything the user does reaches the page as a named message sent through here.

   createBus() -> { on(type, handler, { changes }), has(type), send(type, ...args), tap(listener), log, types() }
     on      says what a kind of message does. One handler to a type. changes: true marks messages that can alter the
             project (what is saved: shapes, names, entries, groups), as against ones that only look at it, move
             the camera or change the selection.
     send    delivers a message to its handler and gives back whatever the handler returns. A message with no
             handler is an error: nothing happens off the bus by accident.
     tap     listener(phase, message) is called with 'before' and then 'after' for every message, in the order sent.
             message: { type, args, changes, depth, at }. depth is 0 for a message the user caused directly and
             higher for one a handler sent while handling another; at is the time.
     log     the last 500 messages, oldest first
     types   every type that has a handler

   History, when it comes, is a tap: the project as it stood 'before' each depth-0 message that changes, kept if it
   stands differently 'after'. Two things to know for that. A drag is two messages, 'pointer.drag' when it begins and
   'pointer.drop' when it ends, with the shapes moving in between, so the state to keep is the one before
   'pointer.drag'. And something typed (a name, an entry, a length) arrives as its own message when the typing is
   finished, some time after the click that began it. */
export function createBus(){
  const handlers = new Map(), taps = new Set(), log = []; let depth = 0;
  return { log,
    on(type, handler, { changes = false } = {}){ handlers.set(type, { handler, changes }); },
    has: type => handlers.has(type),
    types: () => [...handlers.keys()],
    tap(listener){ taps.add(listener); return () => taps.delete(listener); },
    send(type, ...args){
      const h = handlers.get(type); if (!h) throw new Error('no handler for the message "' + type + '"');
      const message = { type, args, changes: h.changes, depth, at: Date.now() };
      log.push(message); if (log.length > 500) log.shift();
      for (const t of taps) t('before', message);
      depth++;
      try { return h.handler(...args); } finally { depth--; for (const t of taps) t('after', message); }
    } };
}
