/* The message bus: everything the user does takes effect as a named message sent through here.

   A message is a type and one payload of plain data: numbers, strings, and the ids of blocks, never an element, a
   block or a function. So a message says what was done in full, can be written down, and can be sent again.
   (What reads the pointer and the keys, working out which message a click or a drag amounts to, is not on the bus;
   what it decides on is.)

   createBus() -> { on(type, handler, { changes }), has(type), send(type, payload), tap(listener), log, types() }
     on      says what a kind of message does. One handler to a type. changes: true marks messages that can alter the
             project (what is saved: shapes, names, entries, groups), as against ones that only look at it, move
             the camera or change the selection.
     send    delivers a message to its handler and gives back whatever the handler returns. A message with no
             handler is an error: nothing happens off the bus by accident.
     tap     listener(phase, message) is called with 'before' and then 'after' for every message, in the order sent.
             message: { type, payload, changes, depth, at }. depth is 0 for a message the user caused directly and
             higher for one a handler sent while handling another; at is the time.
     log     the last 500 messages, oldest first
     types   every type that has a handler

   History, when it comes, is a tap: the project as it stood 'before' each depth-0 message that changes, kept if it
   stands differently 'after'. A drag is one message, 'place', sent when it ends: while it lasts the shapes follow the
   pointer, and at the end they are put back and the message moves them, so 'before' is truly before. Something typed
   (a name, an entry, a length) is one message, sent when the typing is finished. */
export function createBus(){
  const handlers = new Map(), taps = new Set(), log = []; let depth = 0;
  return { log,
    on(type, handler, { changes = false } = {}){ handlers.set(type, { handler, changes }); },
    has: type => handlers.has(type),
    types: () => [...handlers.keys()],
    tap(listener){ taps.add(listener); return () => taps.delete(listener); },
    send(type, payload = {}){
      const h = handlers.get(type); if (!h) throw new Error('no handler for the message "' + type + '"');
      const message = { type, payload, changes: h.changes, depth, at: Date.now() };
      log.push(message); if (log.length > 500) log.shift();
      for (const t of taps) t('before', message);
      depth++;
      try { return h.handler(payload); } finally { depth--; for (const t of taps) t('after', message); }
    } };
}
