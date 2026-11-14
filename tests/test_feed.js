/* node tests/test_feed.js — the update feed says each thing once and only from what the agent knows */
const assert = require('assert');
const Sim = require('../tinworld/sim.js'), { makeFeed, where } = require('../tinworld/feed.js');
assert.strictEqual(where({ x:0, z:0 }, { x:0, z:-3 }), '3 steps north');
assert.strictEqual(where({ x:0, z:0 }, { x:4, z:4 }), '6 steps south-east');
assert.strictEqual(where({ x:0, z:0 }, { x:1, z:0 }), 'beside you');
for (const seed of [3, 7, 11]){
  const W = Sim.createWorld(seed, { skin:'wild', size:'medium' });
  const a = W.actors.find(x => x.template === 'robot' && x.priv.script === 'forager');
  const feed = makeFeed(W, a), all = [];
  let first = null, quiet = 0, reads = 0;
  for (let t = 0; t <= 120 * 20; t++){
    if (t % 5 === 0){ const out = feed.read(); if (!first) first = out; reads++; if (!out.length) quiet++; all.push(...out);
      assert.deepStrictEqual(feed.read(), [], 'a second read at the same moment has nothing new'); }
    Sim.step(W, 0.05);
  }
  assert.ok(first[0].startsWith('You are ' + a.props.name), first[0]);
  assert.ok(first.some(l => l.startsWith('You are in ')) && first.some(l => l.startsWith('Exits: ')));
  assert.ok(quiet > reads / 2, 'most moments have nothing to report (' + quiet + '/' + reads + ')');
  assert.ok(!all.some(l => /^Something|undefined|NaN|The world wakes/.test(l)), all.find(l => /^Something|undefined|NaN|The world wakes/.test(l)));
  assert.ok(all.some(l => l.startsWith('You enter ')) && all.some(l => l.startsWith('Hunger ')));
  const full = Sim.describeFor(W, a).length;
  assert.ok(all.join('\n').length / 120 * 60 < full * 30 / 2, 'well under half the size of repeating the full description');
}
console.log('feed ok');
