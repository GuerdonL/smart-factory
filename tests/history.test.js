/* history.js: undo and redo, as a tap on the bus. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../bus.js';
import { createHistory } from '../history.js';

/* a project that is one number, a bus that changes it, and a history watching */
function setup(options = {}){
  const bus = createBus(), project = { n: 0 }, snaps = { count: 0 };
  bus.on('add', ({ by = 1 }) => { project.n += by; }, { changes: true });
  bus.on('add.twice', () => { bus.send('add'); bus.send('add'); }, { changes: true });
  bus.on('nothing', () => {}, { changes: true });      /* could change the project, but does not */
  bus.on('look', () => {});
  bus.on('look.then.add', () => { bus.send('add'); });      /* changes nothing itself; sends something that does */
  bus.on('set', ({ n }) => { project.n = n; }, { changes: true });
  const history = createHistory(bus, { snap: () => { snaps.count++; return { n: project.n }; }, same: (a, b) => a.n === b.n,
    restore: s => bus.send('set', { n: s.n }), ...options });      /* restore goes through the bus, as it may in the page */
  return { bus, project, history, snaps };
}
const turn = () => new Promise(done => setImmediate(done));      /* the turn of events ends: steps are settled */

test('with nothing done there is nothing to undo or redo', () => {
  const { history } = setup();
  assert.equal(history.canUndo(), false); assert.equal(history.canRedo(), false);
  assert.equal(history.undo(), null); assert.equal(history.redo(), null);
});

test('an action that changed the project is a step: undo puts it back, redo does it again', async () => {
  const { bus, project, history } = setup();
  bus.send('add', { by: 5 }); await turn();
  assert.equal(history.canUndo(), true); assert.equal(history.canRedo(), false);
  assert.equal(history.undo(), 'add'); assert.equal(project.n, 0);
  assert.equal(history.canUndo(), false); assert.equal(history.canRedo(), true);
  assert.equal(history.redo(), 'add'); assert.equal(project.n, 5);
  assert.equal(history.canUndo(), true); assert.equal(history.canRedo(), false);
});

test('steps are undone last first, and redone in the order they were made', async () => {
  const { bus, project, history } = setup();
  for (const by of [1, 10, 100]){ bus.send('add', { by }); await turn(); }
  history.undo(); assert.equal(project.n, 11); history.undo(); assert.equal(project.n, 1); history.undo(); assert.equal(project.n, 0);
  assert.equal(history.undo(), null);
  history.redo(); assert.equal(project.n, 1); history.redo(); assert.equal(project.n, 11); history.redo(); assert.equal(project.n, 111);
  assert.equal(history.redo(), null);
});

test('everything sent in one turn of events is one step, named for the first message', async () => {
  const { bus, project, history } = setup();
  bus.send('add.twice'); bus.send('add', { by: 10 }); await turn();
  assert.equal(project.n, 12);
  assert.equal(history.undo(), 'add.twice'); assert.equal(project.n, 0); assert.equal(history.canUndo(), false);
});

test('a message that turned out to change nothing is no step', async () => {
  const { bus, history } = setup();
  bus.send('nothing'); await turn();
  bus.send('add', { by: 2 }); bus.send('add', { by: -2 }); await turn();      /* there and back again */
  assert.equal(history.canUndo(), false);
});

test('a message that cannot change the project is not looked at', async () => {
  const { bus, history, snaps } = setup();
  bus.send('look'); await turn();
  assert.equal(snaps.count, 0); assert.equal(history.canUndo(), false);
});

test('only a message the user caused opens a step, not one a handler sent', async () => {
  const { bus, project, history } = setup();
  bus.send('look.then.add'); await turn();
  assert.equal(project.n, 1); assert.equal(history.canUndo(), false);
});

test('undoing and redoing are not themselves steps', async () => {
  const { bus, project, history } = setup();
  bus.send('add'); await turn();
  history.undo(); await turn();
  assert.equal(history.canUndo(), false); assert.equal(history.canRedo(), true);
  history.redo(); await turn();
  assert.equal(project.n, 1); assert.equal(history.canRedo(), false);
  assert.equal(history.undo(), 'add'); assert.equal(history.undo(), null);
});

test('a new step ends what could have been redone', async () => {
  const { bus, project, history } = setup();
  bus.send('add', { by: 1 }); await turn(); bus.send('add', { by: 10 }); await turn();
  history.undo(); assert.equal(history.canRedo(), true);
  bus.send('add', { by: 100 }); await turn();
  assert.equal(history.canRedo(), false); assert.equal(history.redo(), null); assert.equal(project.n, 101);
  history.undo(); history.undo(); assert.equal(project.n, 0);
});

test('a message that changed nothing does not end what could be redone', async () => {
  const { bus, history } = setup();
  bus.send('add'); await turn(); history.undo();
  bus.send('nothing'); await turn();
  assert.equal(history.canRedo(), true);
});

test('only the last steps are kept, up to the limit', async () => {
  const { bus, project, history } = setup({ limit: 3 });
  for (let i = 0; i < 5; i++){ bus.send('add'); await turn(); }
  assert.equal(history.undo(), 'add'); history.undo(); history.undo();
  assert.equal(history.undo(), null); assert.equal(project.n, 2);
});

test('clear forgets every step, and the one being taken', async () => {
  const { bus, history } = setup();
  bus.send('add'); await turn(); bus.send('add'); await turn(); history.undo();
  bus.send('add');      /* a step is open: its turn is not over */
  history.clear(); await turn();
  assert.equal(history.canUndo(), false); assert.equal(history.canRedo(), false);
  bus.send('add'); await turn();
  assert.equal(history.canUndo(), true);      /* and it goes on working afterwards */
});

test('if restoring fails, the error comes out and history goes on listening', async () => {
  let fail = false; const bus = createBus(), project = { n: 0 };
  bus.on('add', () => { project.n++; }, { changes: true });
  const history = createHistory(bus, { snap: () => project.n, same: (a, b) => a === b, restore: n => { if (fail) throw new Error('cannot restore'); project.n = n; } });
  bus.send('add'); await turn();
  fail = true; assert.throws(() => history.undo(), /cannot restore/); fail = false;
  bus.send('add'); await turn();
  assert.equal(history.undo(), 'add'); assert.equal(project.n, 1);
});

test('states gives every state a step back or forward can still put back, and no others', async () => {
  const { bus, history } = setup({ limit: 2 }), ns = () => [...new Set(history.states().map(s => s.n))].sort((a, b) => a - b);
  assert.deepEqual(history.states(), []);
  bus.send('add'); await turn();
  assert.deepEqual(ns(), [0, 1]);      /* the one step: where it came from and where it went */
  bus.send('add'); await turn(); history.undo();
  assert.deepEqual(ns(), [0, 1, 2]);      /* an undone step can be redone: its states are still to come back to */
  bus.send('add', { by: 10 }); await turn();
  assert.deepEqual(ns(), [0, 1, 11]);      /* a new step ends what could be redone: 2 cannot be come back to */
  bus.send('add'); await turn();
  assert.deepEqual(ns(), [1, 11, 12]);      /* past the limit the oldest step is let go, and its state with it */
  bus.send('nothing'); await turn(); assert.equal(history.states().length, 4);      /* a message that changed nothing adds none */
  history.clear(); assert.deepEqual(history.states(), []);
});
