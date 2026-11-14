/* What an agent is told, as a stream of updates instead of a full description every time.

   const feed = makeFeed(W, actor);   feed.read() -> lines that are new since the last read

   The first read says who and where the agent is. After that a line appears only when something changes:
     - it enters a square: the square, and the exits it can see from there
     - something comes into view in its square: what it is and where, relative to the agent
       (direction and distance; given once, when first seen, and only for things in view)
     - something in its square leaves or is no longer there
     - an event happens where it can witness it (someone eats, attacks, talks, arrives)
     - its health changes, or its hunger passes another ten
   Nothing is repeated. What the agent saw earlier it has to remember for itself.

   Everything comes from the actor's own knowledge graph (actor.K) and the events it witnessed, never from the world directly. */
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const DIRS = [[0, -1, 'north'], [1, 0, 'east'], [0, 1, 'south'], [-1, 0, 'west']];

function where(from, to){
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  if (d < 1.5) return 'beside you';
  const k = Math.round(Math.atan2(dx, -dz) / (Math.PI / 4));           /* 0 = north (z falls), clockwise */
  return Math.round(d) + ' steps ' + COMPASS[((k % 8) + 8) % 8];
}

function makeFeed(W, a){
  const K = a.K, st = { started:false, room:null, inView:new Map(), lastT:-1, health:null, hungerBand:null, dead:false };
  const named = id => { const r = K.get(id), e = W.get(id); const n = r && r.facts.name; if (!n) return 'something'; return e && e.sp && e.sp.named ? n : 'the ' + n; };
  const Named = id => { const n = named(id); return n[0].toUpperCase() + n.slice(1); };
  const exitsLine = roomId => {
    const rr = K.get(roomId), here = W.get(roomId), ex = (rr && rr.facts.exits) || [];
    if (!ex.length) return 'There is no way out.';
    return 'Exits: ' + ex.map(id => { const o = W.get(id), d = DIRS.find(d => d[0] === o.cell.cx - here.cell.cx && d[1] === o.cell.cz - here.cell.cz); return (d ? d[2] : 'on') + ' to ' + named(id); }).join('; ') + '.';
  };
  const stats = () => { const out = []; if (a.props.health != null) out.push('health ' + Math.round(a.props.health)); for (const s of a.sp.stats || []) out.push(s + ' ' + Math.round(a.priv[s])); return out; };
  /* what is in view: things in the agent's square, and what the actors there carry */
  const view = () => { const m = new Map();
    for (const r of K.values()){ if (r.id === a.id || r.template === 'room' || !r.loc) continue;
      if (r.loc === a.parent) m.set(r.id, { r, held:null });
      else { const h = K.get(r.loc); if (h && h.template !== 'room' && h.loc === a.parent && h.id !== a.id) m.set(r.id, { r, held:h.id }); } }
    return m; };

  function read(){
    const out = [];
    if (st.dead) return out;
    if (!st.started){
      st.started = true;
      const sp = a.sp, rr = K.get(a.parent);
      out.push('You are ' + a.props.name + ', ' + (sp.describe ? sp.describe(a) : 'a ' + sp.label) + '.');
      if (stats().length) out.push(stats().join(', ').replace(/^./, c => c.toUpperCase()) + '.');
      st.health = a.props.health; st.hungerBand = a.priv.hunger != null ? Math.floor(a.priv.hunger / 10) : null;
      for (const s of sp.slots || []) if (a[s]) out.push('You are ' + s + ' ' + named(a[s]) + '.');
    }
    /* events witnessed since the last read, in order */
    /* (not the world's opening line, and not the narration of the agent's own first step into a square: "You enter" says that) */
    const own = a.props.name + ' ';
    const evs = []; for (const ev of W.events) if (ev.t > st.lastT && ev.t > 0 && ev.w.has(a.id) && !(ev.text.startsWith(own) && ev.text.endsWith('for the first time.'))) evs.push(ev.text);
    st.lastT = W.time;
    const moved = a.parent !== st.room;          /* on entering a square, say where it is and what is there before what happens there */
    if (!moved) out.push(...evs);
    /* a new square */
    if (a.parent !== st.room){
      const rr = K.get(a.parent);
      out.push((st.room == null ? 'You are in ' : 'You enter ') + named(a.parent) + ' (' + rr.facts.terrain + ').');
      out.push(exitsLine(a.parent));
      st.room = a.parent; st.inView = new Map();
    }
    /* what came into view, and what went */
    const now = view();
    for (const [id, v] of now){ const was = st.inView.get(id);
      if (!was) out.push(v.held ? Named(v.held) + ' is carrying ' + named(id) + '.' : 'You see ' + named(id) + (v.r.pos ? ', ' + where(a.pos, v.r.pos) : '') + '.');
    }   /* a thing changing hands in view is already told by the event ("Hob scoops up the brown mushroom.") */
    /* gone: only for what was standing or lying in the square. What someone carried goes with them, or the event said what became of it. */
    for (const [id, v] of st.inView) if (!now.has(id) && !v.held && !(a.sp.slots || []).some(s => a[s] === id)) out.push(v.name[0].toUpperCase() + v.name.slice(1) + ' is no longer here.');
    st.inView = new Map([...now].map(([id, v]) => [id, { held:v.held, name:named(id) }]));
    if (moved) out.push(...evs);
    /* the agent's own numbers, only when they move */
    if (a.props.health != null && Math.abs(a.props.health - st.health) >= 1){ out.push('Health ' + Math.round(a.props.health) + '.'); st.health = a.props.health; }
    if (a.priv.hunger != null){ const band = Math.floor(a.priv.hunger / 10); if (band !== st.hungerBand){ out.push('Hunger ' + Math.round(a.priv.hunger) + '.'); st.hungerBand = band; } }
    if (a.dead){ st.dead = true; out.push('You are ' + (a.sp.status ? a.sp.status[1] : 'dead') + '.'); }
    return out;
  }
  return { read };
}
module.exports = { makeFeed, where };
