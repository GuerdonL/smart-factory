/* node tinworld/demo.js [seed] [seconds]  — one robot's update feed, as it would be given to an agent */
const Sim = require('./sim.js'), { makeFeed } = require('./feed.js');
const seed = +process.argv[2] || 7, secs = +process.argv[3] || 90;
const W = Sim.createWorld(seed, { skin:'wild', size:'medium' });
const a = W.actors.find(x => x.template === 'robot' && x.priv.script === 'forager') || W.actors[0];
const feed = makeFeed(W, a);
let chars = 0, lines = 0;
for (let t = 0; t <= secs * 20; t++){
  if (t % 5 === 0){ const out = feed.read(); if (out.length){ console.log('[' + W.time.toFixed(1).padStart(5) + 's] ' + out.join('\n         ')); chars += out.join('\n').length; lines += out.length; } }
  Sim.step(W, 0.05);
}
console.log('\n' + lines + ' lines, ' + chars + ' characters in ' + secs + ' s (' + Math.round(chars / secs * 60) + ' a minute). The full description, repeated at every decision, would have been about ' + Math.round(Sim.describeFor(W, a).length * 30) + ' a minute.');
