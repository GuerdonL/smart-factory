/* bus.js: the message bus. Run with: node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../bus.js';

test('a message goes to its handler, and send gives back what the handler returns', () => {
  const bus = createBus(), got = [];
  bus.on('place', payload => { got.push(payload); return 'placed'; });
  assert.equal(bus.send('place', { id: 'b1', x: 3 }), 'placed');
  assert.deepEqual(got, [{ id: 'b1', x: 3 }]);
});

test('a message with no payload is given an empty one', () => {
  const bus = createBus(); let got;
  bus.on('look', payload => { got = payload; });
  bus.send('look');
  assert.deepEqual(got, {});
});

test('a message with no handler is an error, and is not logged', () => {
  const bus = createBus();
  assert.throws(() => bus.send('nothing'), /no handler for the message "nothing"/);
  assert.equal(bus.log.length, 0);
});

test('there is one handler to a type: the last one given', () => {
  const bus = createBus();
  bus.on('name', () => 'first'); bus.on('name', () => 'second');
  assert.equal(bus.send('name'), 'second');
});

test('has and types say which messages have handlers', () => {
  const bus = createBus();
  bus.on('place', () => {}); bus.on('name', () => {});
  assert.equal(bus.has('place'), true); assert.equal(bus.has('delete'), false);
  assert.deepEqual(bus.types(), ['place', 'name']);
});

test('a tap hears before and then after every message, with what the message is', () => {
  const bus = createBus(), heard = [];
  bus.on('place', () => { heard.push('handled'); }, { changes: true });
  bus.on('look', () => {});
  bus.tap((phase, m) => heard.push([phase, m.type, m.changes, m.depth]));
  bus.send('place', { id: 'b1' }); bus.send('look');
  assert.deepEqual(heard, [['before', 'place', true, 0], 'handled', ['after', 'place', true, 0], ['before', 'look', false, 0], ['after', 'look', false, 0]]);
});

test('before and after are given the same message, with its payload and the time', () => {
  const bus = createBus(), seen = [], start = Date.now();
  bus.on('place', () => {});
  bus.tap((phase, m) => seen.push(m));
  bus.send('place', { id: 'b1' });
  assert.equal(seen[0], seen[1]); assert.equal(seen[0], bus.log[0]);
  assert.deepEqual(seen[0].payload, { id: 'b1' }); assert.ok(seen[0].at >= start && seen[0].at <= Date.now());
});

test('a message a handler sends is one deeper, and is heard inside the one that sent it', () => {
  const bus = createBus(), heard = [];
  bus.on('drag', () => { bus.send('place'); bus.send('place'); });
  bus.on('place', () => { bus.send('frame.enter'); });
  bus.on('frame.enter', () => {});
  bus.tap((phase, m) => heard.push(`${phase} ${m.type} ${m.depth}`));
  bus.send('drag');
  assert.deepEqual(heard, ['before drag 0', 'before place 1', 'before frame.enter 2', 'after frame.enter 2', 'after place 1',
    'before place 1', 'before frame.enter 2', 'after frame.enter 2', 'after place 1', 'after drag 0']);
  bus.send('place');
  assert.equal(heard.at(-1), 'after place 0');      /* depth is back to 0 afterwards */
});

test('when a handler throws, after is still heard, the error comes out, and depth is put back', () => {
  const bus = createBus(), heard = [];
  bus.on('break', () => { throw new Error('broken'); }); bus.on('look', () => {});
  bus.tap((phase, m) => heard.push(`${phase} ${m.type} ${m.depth}`));
  assert.throws(() => bus.send('break'), /broken/);
  bus.send('look');
  assert.deepEqual(heard, ['before break 0', 'after break 0', 'before look 0', 'after look 0']);
});

test('taps are heard in the order they were added, and one taken off hears no more', () => {
  const bus = createBus(), heard = [];
  bus.on('look', () => {});
  const off = bus.tap(phase => heard.push('a ' + phase)); bus.tap(phase => heard.push('b ' + phase));
  bus.send('look'); off(); bus.send('look');
  assert.deepEqual(heard, ['a before', 'b before', 'a after', 'b after', 'b before', 'b after']);
});

test('the log keeps the last 500 messages, oldest first', () => {
  const bus = createBus();
  bus.on('count', () => {});
  for (let n = 0; n < 503; n++) bus.send('count', { n });
  assert.equal(bus.log.length, 500); assert.equal(bus.log[0].payload.n, 3); assert.equal(bus.log[499].payload.n, 502);
});
