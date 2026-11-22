/* Canvases and graphs with streams (graph.js: stream), for tests/streams.test.js and for the backend's fixtures
   (backend/fixtures/generate.mjs). A stream's numbers are the backend's alone, so the fixtures hold the backend to
   nothing here but that it takes each graph: what each comes to is worked out by hand in backend/tests/test_streams.py. */
import { B, space, arrow, adds } from './looping.js';

export const st = (length = 1, start = 0, step = 1, end = 'stop') => ({ length, start, step, end });
export const noisy = (seed, dist, stream) => ({ noise: { seed, dist }, stream });
export const filed = (file, stream) => ({ file, stream });
/* The running total of a stream's rows. A tile that does not end, whose pattern is x over S: x is a stream of one
   value, a row of data/rows.csv; S the state, from 0; the step adds the two rows of a cell. It takes one step each
   tick, and in cell k the stream stands where it stood at tick k − 1: so at tick t the loop is the sum of the
   file's first t rows. */
export function streamTotal({ stream = {}, file = 'data/rows.csv', repeat = {} } = {}){
  return { top: space([
    B('x', 0, 0, 1, 1, { source: filed(file, { ...st(), ...stream }) }),
    B('S', 0, 1, 1, 1, { entries: { '1,1': 0 } }),
    arrow('step', { id: 'T', as: 'tile' }, {}, { inside: adds() })],
  [{ id: 'T', name: 'Total', members: [0, 1], groups: [], repeat: { x: 0, y: 0, cols: 1, rows: 2, across: 'inf', down: 1, step: 'step', ...repeat } }]) };
}
export const STREAMS = {
  /* one of each kind, and what is made of one */
  'streams: one of each kind': { top: space([
    B('Sn', 0, 0, 8, 2, { source: noisy(3, 'uniform', st(4)) }),                     /* four values of 2 by 2, side by side */
    B('Sg', 0, 10, 3, 1, { source: noisy(3, 'normal', st(1, 5, 2, 'wrap')) }),
    B('Sc', 20, 0, 6, 2, { source: filed('data/table.csv', st(2, 0, 2)) }),         /* two values of three columns, two rows each */
    B('St', 20, 10, 4, 1, { source: filed('data/words.txt', st(2, 0, 2, 'wrap')) }),      /* two values of two characters */
    B('Sp', 40, 0, 2, 3, { source: filed('data/cube.npy', st()) }),
    B('Su', 40, 10, 2, 1, { source: noisy(1, 'uniform', st(2, null)) }),              /* a start that is not known */
    B('Sf', 60, 0, 2, 2, { source: filed(null, st()) }),                              /* no file chosen */
    B('Sw', 60, 10, 3, 1, { source: noisy(1, 'uniform', st(2)) }),                    /* three columns are no whole number of two values */
    B('M', 80, 0, 2, 2, { entries: { '1,1': 1, '2,1': 0, '1,2': 0, '2,2': 2 } }), B('Sm', 82, 0, 2, 2, { source: noisy(4, 'uniform', st()) })]) },      /* a product with one */
  /* a stream in a plain tile: the same in every cell */
  'streams: in a tile': { top: space([B('Sn', 0, 0, 2, 1, { source: noisy(3, 'uniform', st(2)) }), arrow('out', { id: 'T', as: 'tile' }, { side: 's' })],
    [{ id: 'T', name: null, members: [0], groups: [], repeat: { x: 0, y: 0, cols: 2, rows: 1, across: 2, down: 2 } }]) },
  'streams: the running total of a stream': streamTotal(),
  'streams: the running total of a stream that wraps': streamTotal({ stream: { end: 'wrap' } }),
};
