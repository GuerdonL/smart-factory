/* Tinworld's engine and content, copied unchanged from the published artifact "Tinworld — generative story sim"
   (version 1794533083-403d, 2026-11-13). Edit the artifact, then copy again; do not edit here. */

/* ============================================================
   ENGINE — knows nothing about robots, goblins, mushrooms or forests.
   Everything it runs comes from registries that content packs fill with define():

     verbs      what an actor can do            { target?, alive?, intent, plan? | resolve, absent? }
     species    kinds of actor                  { tags, hostile, hunts, speed, health, stats, slots, avoid, scripts, make, ... }
     items      kinds of thing                  { tags, render, art, slot, damage, use, fixed, make }
     terrains   kinds of place                  { passable, walled, ground, yields, rest, seenFromAfar, nouns, scenery }
     stats      needs that tick over time       { start, rate, max, atMax }
     scripts    behaviors                       { kind, fn(ctx), init?, uses? }
     reflexes   helpers shared between scripts  fn(ctx)
     generators map builders                    fn(W, cfg)
     skins      a world recipe                  { label, options, species, map, cast, scatter, spawns }

   World  = entity graph (containment tree + reference props).
   Entity = { id, template, props (public), priv (private), parent, pos }
   Actor  = entity + behavior script + K (knowledge graph: a mask over the world graph)
   ============================================================ */
const REG = { verbs:{}, species:{}, items:{}, terrains:{}, stats:{}, scripts:{}, reflexes:{}, generators:{}, skins:{},
  dull:new Set(['render','fixed','material','kind','tags','script','health','down']) };   /* facts not worth gossiping about */
function define(pack){
  for (const k in pack){
    if (!(k in REG)) throw new Error('define(): unknown registry "'+k+'"');
    if (k === 'dull') pack.dull.forEach(x => REG.dull.add(x)); else Object.assign(REG[k], pack[k]);
  }
}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const dist = (a,b) => Math.hypot(a.x-b.x, a.z-b.z);
const DIRS = [[0,-1,'north'],[1,0,'east'],[0,1,'south'],[-1,0,'west']];
const val = (x, W) => typeof x === 'function' ? x(W) : x;
const overlap = (a, b) => !!a && !!b && a.some(x => b.includes(x));
/* relations between species are declared with tags, never by name */
const hostile = (A, B) => overlap(A.hostile, B.tags);                       /* A attacks B on sight */
const threatens = (A, B) => hostile(A, B) || overlap(A.hunts, B.tags);      /* B has reason to fear A */

function createWorld(seed, opts={}){
  const skin = REG.skins[opts.skin] ? opts.skin : Object.keys(REG.skins)[0], def = REG.skins[skin];
  const rnd = mulberry32(seed);
  const pick = a => a[Math.floor(rnd()*a.length)];
  const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a; };
  const W = { seed, skin, def, rnd, pick, shuffle, time:0, S:9, ents:new Map(), cells:new Map(), rooms:[], agents:[], actors:[], items:[], events:[], removed:[],
    species:{}, opts:{}, villages:null, onEvent:null, gcT:5 };
  for (const [k, o] of Object.entries(def.options || {})) W.opts[k] = o.choices[opts[k]] != null ? opts[k] : o.default;
  /* a skin switches species on, and may override any part of their definition */
  for (const [name, over] of Object.entries(def.species || {})) W.species[name] = { name, label:name, tags:[name], speed:2.4, art:{}, ...REG.species[name], ...over };

  W.get = id => W.ents.get(id);
  W.at = (cx, cz) => W.cells.get(cx+','+cz);
  W.isRoom = id => W.ents.get(id)?.template === 'room';
  W.cast = () => W.actors.filter(a => a.template === W.protagonist);
  W.name = id => { const e = W.get(id); if (!e) return 'something'; return e.sp && e.sp.named ? e.props.name : 'the '+e.props.name; };
  W.Name = id => { const n = W.name(id); return n[0].toUpperCase()+n.slice(1); };   /* capitalised, for the start of a sentence */
  W.log = (text, roomId, also=[]) => {
    const w = new Set(also); for (const a of W.actors) if (a.parent === roomId) w.add(a.id);
    const ev = { t:W.time, text, w }; W.events.push(ev); if (W.events.length > 400) W.events.shift();
    W.onEvent && W.onEvent(ev);
  };
  W.uid = (prefix, name) => { let id = prefix+'.'+slug(name), n = 2; while (W.ents.has(id)) id = prefix+'.'+slug(name)+'-'+(n++); return id; };
  const cache = {};
  W.placesOf = on => { if (!on) return W.rooms; const k = on.join(); return cache[k] || (cache[k] = W.rooms.filter(r => on.includes(r.props.terrain))); };

  /* ----- places ----- */
  W.addRoom = (name, cx, cz, terrain, extra) => {
    const r = { id:W.uid('room',name), template:'room', parent:'world', cell:{cx,cz}, center:{x:cx*W.S, z:cz*W.S}, props:{ name, terrain, ...extra, exits:[] }, priv:{}, sees:[], tint:W.rooms.length };
    W.ents.set(r.id, r); W.rooms.push(r); W.cells.set(cx+','+cz, r); return r;
  };
  W.randomPoint = room => { const m = W.S/2 - 1.6; return { x:room.center.x + (rnd()*2-1)*m, z:room.center.z + (rnd()*2-1)*m }; };
  W.clamp = (p, room) => { const m = W.S/2 - 0.9; return { x:Math.max(room.center.x-m, Math.min(room.center.x+m, p.x)), z:Math.max(room.center.z-m, Math.min(room.center.z+m, p.z)) }; };
  W.near = (p, room, d=0.95) => { const a = rnd()*Math.PI*2; return W.clamp({ x:p.x+Math.cos(a)*d, z:p.z+Math.sin(a)*d }, room); };
  W.freeSpot = room => { let p; for (let t=0;t<30;t++){ p = W.randomPoint(room); if (W.items.every(i => i.parent !== room.id || dist(i.pos,p) > 1.7)) break; } return p; };

  /* ----- things ----- */
  W.spawnItem = (kind, room, pos, opt) => {
    const d = REG.items[kind]; if (!d) throw new Error('unknown item "'+kind+'"');
    const made = d.make ? d.make(W) : {};
    const props = { name:made.name || kind.replace(/-/g,' '), kind, tags:(d.tags || []).slice() };
    if (made.material) props.material = made.material;
    props.render = d.render || 'icon'; props.fixed = !!d.fixed; if (d.damage) props.damage = d.damage;
    Object.assign(props, made.props);
    if (opt && opt.unique) while (W.items.some(x => x.props.name === props.name)) props.name = pick(opt.unique)+' '+props.name;
    const it = { id:W.uid('item',props.name), template:'item', def:kind, parent:room.id, pos:pos || W.freeSpot(room), props, priv:made.priv || {}, artSeed:Math.floor(rnd()*1e9) };
    W.ents.set(it.id, it); W.items.push(it); return it;
  };

  /* ----- actors ----- */
  const scriptOrder = {};
  W.homeFor = i => W.villages ? W.get(W.villages[i % W.villages.length][Math.floor(i / W.villages.length) % W.villages[i % W.villages.length].length]) : pick(W.rooms);
  W.spawn = (species, place) => {
    const sp = W.species[species]; if (!sp) throw new Error('species "'+species+'" is not part of this skin');
    const i = W.actors.filter(a => a.template === species).length;
    place = place || W.homeFor(i);
    const made = sp.make ? sp.make(W, i, place) : {};
    const props = { name:made.name || sp.label, ...made.props };
    if (sp.family) props.family = [];
    if (!sp.homeless) props.home = place.id;
    if (sp.status) props.status = sp.status[0];
    if (sp.health) props.health = sp.health;
    const order = scriptOrder[species] || (scriptOrder[species] = shuffle(sp.scripts || [sp.script])), script = order[i % order.length];
    if (!REG.scripts[script]) throw new Error('unknown script "'+script+'"');
    const priv = { ...made.priv, script };
    if (REG.scripts[script].init) Object.assign(priv, REG.scripts[script].init(W));
    for (const s of sp.stats || []) priv[s] = Math.round(val(REG.stats[s].start, W) || 0);
    const a = { id:W.uid(species, props.name), template:species, sp, parent:place.id, pos:W.randomPoint(place), color:made.color, short:made.short, props, priv,
      K:new Map(), path:[], pending:null, wait:rnd()*2, talked:{}, facing:rnd()*6.28, moving:false, percT:0, intent:'waking up', doing:null, prev:null,
      speed:sp.speed, avoid:sp.avoid && new Set(sp.avoid) };
    for (const s of sp.slots || []) a[s] = null;
    W.ents.set(a.id, a); W.agents.push(a); W.actors.push(a); learn(W, a, a, true);
    if (sp.family){ const sib = W.actors.find(b => b !== a && b.template === species && !b.dead && b.props.family.length === 0 && rnd() < 0.7);
      if (sib){ a.props.family.push(sib.id); sib.props.family.push(a.id);
        for (const [x,y] of [[a,sib],[sib,a]]){ const r = rec(x, y); r.facts.name = y.props.name; r.facts.family = y.props.family.slice(); x.K.get(x.id).facts.family = x.props.family.slice(); } } }
    perceive(W, a);
    return a;
  };
  /* movement primitives that verbs build on */
  W.wander = (a, why) => { a.path = [W.randomPoint(W.get(a.parent))]; a.intent = why || 'wandering'; return true; };
  W.travel = (a, to, why) => { const route = to && routeKnown(W, a, a.parent, to); if (!route || route.length < 2) return false;
    a.path = [...waypoints(W, route), W.randomPoint(W.get(to))]; a.intent = (why || 'heading to ')+W.name(to); return true; };

  /* ----- build the world from the skin's recipe ----- */
  const map = val(def.map, W);
  if (!REG.generators[map.generator]) throw new Error('unknown generator "'+map.generator+'"');
  REG.generators[map.generator](W, map);
  W.big = W.rooms.length > 400;
  for (const rule of def.scatter || []){
    if (rule.perPlace) for (const room of W.placesOf(rule.on)){ const [lo, hi] = rule.perPlace; for (let n = lo + Math.floor(rnd()*(hi-lo+1)); n > 0; n--) W.spawnItem(rule.pick(W), room, null, rule); }
    else for (let k=0, n=val(rule.count, W); k<n; k++){
      let room = pick(W.placesOf(rule.on));
      if (rule.nearSettlement && W.villages && W.rooms.length > 30){ const c = W.get(W.villages[k % W.villages.length][0]).cell, near = W.placesOf(rule.on).filter(r => Math.hypot(r.cell.cx-c.cx, r.cell.cz-c.cz) <= rule.nearSettlement); if (near.length) room = pick(near); }
      W.spawnItem(rule.items[k % rule.items.length], room, null, rule);
    }
  }
  const cast = val(def.cast, W); W.protagonist = cast.species;
  for (let i=0;i<cast.count;i++) W.spawn(cast.species);
  W.rules = (def.spawns || []).map(r => ({ r, t:r.first ?? r.every }));
  for (const x of W.rules) runRule(W, x.r, true);
  W.log('The world wakes: '+W.rooms.length+' '+(def.placeWord || 'places')+', '+W.items.length+' things, '+W.cast().length+' '+(W.species[cast.species].plural || cast.species+'s')+'.', null, W.actors.map(a => a.id));
  return W;
}

/* ---------- spawn rules: how a skin keeps the world stocked ---------- */
function runRule(W, r, initial){
  if (r.item){                                   /* things that grow on a kind of terrain */
    const places = W.placesOf(r.on), max = val(r.perPlace, W) || 1;
    if (initial){ const d = val(r.initial, W) || 0;
      for (const p of places) for (let n = Math.min(max, Math.floor(d) + (W.rnd() < d % 1 ? 1 : 0)); n > 0; n--) W.spawnItem(r.item, p);
      return; }
    const per = new Map(); for (const i of W.items) if (i.def === r.item) per.set(i.parent, (per.get(i.parent) || 0) + 1);
    for (let t = Math.max(r.minTries || 1, Math.round(places.length*r.share)); t > 0; t--){ const p = W.pick(places); if ((per.get(p.id) || 0) < max){ W.spawnItem(r.item, p); per.set(p.id, (per.get(p.id) || 0) + 1); } }
  } else if (r.home){                            /* one creature per lair; a new one moves in after the old one dies */
    for (const p of W.placesOf([r.home])) if (!W.agents.some(a => a.template === r.species && a.props.home === p.id)){
      const g = W.spawn(r.species, p); if (!initial && r.announce) W.log(r.announce(g.props.name, W.name(p.id)), p.id); }
  } else {                                       /* a roaming population kept near a target size */
    const target = val(r.target, W), live = W.agents.filter(a => a.template === r.species).length;
    for (let n = initial ? target-live : Math.min(target-live, Math.max(1, Math.ceil(target/8))); n > 0; n--) W.spawn(r.species, W.pick(W.placesOf(r.on)));
  }
}
function housekeeping(W, dt){
  for (const x of W.rules){ x.t -= dt; if (x.t <= 0){ x.t = x.r.every; runRule(W, x.r, false); } }
  W.gcT -= dt; if (W.gcT > 0) return; W.gcT = 5;
  /* things that left the world are forgotten once nobody still believes in them */
  for (const a of W.agents) for (const r of a.K.values()){ const e = W.get(r.id); if (!e || (e.parent === 'void' && !r.loc)) a.K.delete(r.id); }
  const gone = [...W.ents.values()].filter(e => e.parent === 'void' && !W.agents.some(a => a.K.has(e.id)));
  for (const e of gone){ W.ents.delete(e.id); W.removed.push(e.id); for (const a of W.actors) a.K.delete(e.id); }
  if (gone.length){ W.items = W.items.filter(i => W.ents.has(i.id)); W.actors = W.actors.filter(a => W.ents.has(a.id)); }
}

/* ---------- knowledge graph ---------- */
function rec(a, ent){
  let r = a.K.get(ent.id);
  if (!r){ r = { id:ent.id, template:ent.template, facts:{}, loc:null, pos:null, seen:null, lastLoc:null }; a.K.set(ent.id, r); }
  return r;
}
function learn(W, a, ent, priv){
  const r = rec(a, ent), share = ent.template === 'room';
  for (const k in ent.props){ const v = ent.props[k]; r.facts[k] = Array.isArray(v) && !share ? v.slice() : v; }
  if (priv) for (const k in ent.priv) r.facts[k] = ent.priv[k];
  return r;
}
function perceive(W, a){
  const room = W.get(a.parent);
  /* beliefs that this place now contradicts */
  for (const r of a.K.values()){
    if (r.id === a.id || r.template === 'room') continue;
    const ent = W.get(r.id); if (!ent){ a.K.delete(r.id); continue; }
    if (r.loc == null) continue;
    const holder = W.get(r.loc);
    const gone = (r.loc === room.id && ent.parent !== room.id) ||
                 (holder && holder.K && holder.parent === room.id && ent.parent !== holder.id);
    if (gone){ if (ent.parent === 'void') a.K.delete(r.id); else { r.lastLoc = r.loc; r.loc = null; } }
  }
  const rr = learn(W, a, room); rr.visitedAt = W.time; rr.seen = W.time;
  for (const id of room.sees){ const o = W.get(id), er = rec(a, o); er.facts.name = o.props.name; er.facts.terrain = o.props.terrain;
    if (REG.terrains[o.props.terrain].seenFromAfar){ learn(W, a, o); er.visitedAt = er.visitedAt ?? W.time; } }
  const see = (ent, loc) => { const r = learn(W, a, ent, ent.id === a.id); r.loc = loc; r.pos = { x:ent.pos.x, z:ent.pos.z }; r.seen = W.time; };
  for (const it of W.items) if (it.parent === room.id) see(it, room.id);
  for (const b of W.actors) if (b.parent === room.id){ see(b, room.id);
    for (const slot of b.sp.slots || []) if (b[slot]){ const it = W.get(b[slot]); it.pos = b.pos; see(it, b.id); } }
}
function routeKnown(W, a, from, to){
  if (from === to) return [from];
  const ok = id => !(a.avoid && a.avoid.has(W.get(id).props.terrain));
  if (!ok(to)) return null;
  const prev = new Map([[from,null]]), q = [from];
  while (q.length){ const cur = q.shift();
    for (const n of (a.K.get(cur)?.facts.exits || [])){ if (prev.has(n) || !ok(n)) continue; prev.set(n, cur);
      if (n === to){ const path = [n]; let c = cur; while (c){ path.unshift(c); c = prev.get(c); } return path; } q.push(n); } }
  return null;
}
/* hops from where the actor stands to every place it can reach through exits it knows: one search, reused */
function reach(W, a){
  const hops = new Map([[a.parent, 0]]), q = [a.parent];
  for (let h=0;h<q.length;h++){ const cur = q[h], ex = a.K.get(cur)?.facts.exits; if (!ex) continue; const d = hops.get(cur)+1;
    for (const n of ex){ if (hops.has(n) || (a.avoid && a.avoid.has(W.get(n).props.terrain))) continue; hops.set(n, d); q.push(n); } }
  return hops;
}
/* what a behavior script is allowed to see: its own config, and the world through its knowledge graph */
function makeCtx(W, a){
  let L = null, hops = null; const sp = a.sp, spOf = r => W.species[r.template];
  const sort = () => { if (L) return L; L = { all:[], item:[], room:[], actor:[] };
    for (const r of a.K.values()){ L.all.push(r); if (r.template === 'item') L.item.push(r); else if (r.template === 'room') L.room.push(r); else if (r.id !== a.id) L.actor.push(r); } return L; };
  const H = () => hops || (hops = reach(W, a));
  const has = (r, tag) => !!r && !!r.facts.tags && r.facts.tags.includes(tag);
  const know = {
    all:() => sort().all, get:id => a.K.get(id),
    items:tag => tag ? sort().item.filter(r => has(r, tag)) : sort().item,
    rooms:terrain => terrain ? sort().room.filter(r => r.facts.terrain === terrain) : sort().room,
    actors:() => sort().actor,
    kin:() => sort().actor.filter(r => r.template === a.template),                 /* my own kind */
    tagged:tag => sort().actor.filter(r => spOf(r).tags.includes(tag)),            /* e.g. 'game', 'monster' */
    threats:() => sort().actor.filter(r => threatens(spOf(r), sp)),                /* kinds that attack or hunt mine */
    targets:() => sort().actor.filter(r => hostile(sp, spOf(r))),                  /* kinds mine attacks on sight */
    isRoom:id => a.K.get(id)?.template === 'room',
  };
  const self = { id:a.id, species:a.template, ...a.props, ...a.priv, room:a.parent, resting:a.doing === 'rest' };
  for (const s of sp.slots || []) self[s] = a[s];
  return {
    self, know, has, up:r => !r.facts.down,
    yields:(r, tag) => { const t = REG.terrains[r.facts.terrain]; return !!t && !!t.yields && t.yields.includes(tag); },
    canEnter:id => !(a.avoid && a.avoid.has(a.K.get(id)?.facts.terrain)),
    exits:(a.K.get(a.parent).facts.exits || []).slice(),
    pick:W.pick, rand:W.rnd, now:W.time, chance:p => W.rnd() < p,
    since:id => W.time - (a.talked[id] ?? -1e9),
    nearest(list){ let best = null, bd = 1e9;
      for (const r of list){ const d = H().get(r.template === 'room' ? r.id : r.loc); if (d != null && d < bd){ bd = d; best = r; } }
      return best; },
    /* the least recently visited reachable place; among equals, the closest */
    leastVisitedRoom(){
      let ties = [], bv = Infinity, bd = Infinity;
      for (const [id, d] of H()){ if (id === a.parent) continue; const v = a.K.get(id)?.visitedAt ?? -1;
        if (v < bv || (v === bv && d < bd)){ bv = v; bd = d; ties = [id]; } else if (v === bv && d === bd) ties.push(id); }
      return ties.length ? W.pick(ties) : null;
    },
  };
}

/* ---------- acting: the engine only dispatches; verbs live in the registry ---------- */
function waypoints(W, route){
  const out = [];
  for (let i=1;i<route.length;i++){ const A = W.get(route[i-1]), B = W.get(route[i]);
    out.push({ x:(A.center.x+B.center.x)/2, z:(A.center.z+B.center.z)/2, room:B.id }); }
  return out;
}
function plan(W, a, act){
  const v = act && REG.verbs[act.do];
  a.prev = a.doing; a.doing = v ? act.do : 'wander';
  if (!v) return W.wander(a);
  if (v.plan){ if (!v.plan(W, a, act)) W.wander(a); return; }              /* verbs that are only movement */
  if (v.target){                                                          /* verbs done to something: walk to where it is believed to be */
    const r = a.K.get(act.target);
    if (!r || !r.loc || !W.isRoom(r.loc) || !r.pos) return W.wander(a);
    const route = routeKnown(W, a, a.parent, r.loc); if (!route) return W.wander(a);
    a.path = [...waypoints(W, route), W.near(r.pos, W.get(r.loc))];
    a.pending = { do:act.do, target:act.target }; a.intent = val(v.intent, W.name(act.target)) || act.do;
    return;
  }
  a.pending = { do:act.do }; a.intent = val(v.intent, '') || act.do;       /* verbs done on the spot */
}
function resolve(W, a, p){
  const v = REG.verbs[p.do], room = W.get(a.parent); let t = null;
  if (v.target){
    t = W.get(p.target); if (!t) return;
    if (t.parent !== room.id || (v.alive && t.dead)){ if (v.absent) W.log(v.absent(W.Name(a.id), W.name(t.id)), room.id); return; }
    if (dist(a.pos, t.pos) > 1.5 && !p.retry){ a.path = [W.near(t.pos, room)]; a.pending = { ...p, retry:true }; return; }
  }
  v.resolve(W, a, t, room);
}
/* helpers verbs use */
function letGo(W, a, slot){ const it = W.get(a[slot]); a[slot] = null; if (!it) return null; it.parent = a.parent; it.pos = W.near(a.pos, W.get(a.parent), 0.8); return it; }
function tell(W, from, to){
  const c = [], cares = from.sp.cares;
  for (const r of from.K.values()){
    if (r.id === to.id || !W.get(r.id)) continue;
    const tr = to.K.get(r.id);
    for (const k in r.facts) if (!REG.dull.has(k) && (!tr || !(k in tr.facts))) c.push([r, k]);
    if (r.loc && r.id !== from.id && W.get(r.loc) && (!tr || (tr.loc !== r.loc && (tr.seen ?? -1) < (r.seen ?? -1)))) c.push([r, 'loc']);
  }
  if (!c.length) return null;
  /* news about threats, and about the kinds of thing this species cares for, travels first */
  const hot = c.filter(([r, k]) => k === 'loc' && (overlap(r.facts.tags, cares) || (W.species[r.template] && threatens(W.species[r.template], to.sp))));
  const [r, k] = W.pick(hot.length && W.rnd() < 0.7 ? hot : c), ent = W.get(r.id), tr = rec(to, ent);
  if (!tr.facts.name) tr.facts.name = r.facts.name ?? ent.props.name;
  for (const f of ['tags','kind']) if (r.facts[f] != null) tr.facts[f] = r.facts[f];
  tr.heardFrom = from.id;
  if (k === 'loc'){ tr.loc = r.loc; tr.pos = r.pos && { ...r.pos }; tr.seen = r.seen;
    return W.isRoom(r.loc) ? 'that '+W.name(r.id)+' is in '+W.name(r.loc) : 'that '+W.name(r.loc)+' is carrying '+W.name(r.id); }
  tr.facts[k] = Array.isArray(r.facts[k]) ? r.facts[k].slice() : r.facts[k];
  if (k === 'name') return 'about '+W.name(r.id);
  if (k === 'secret') return r.id === from.id ? 'a secret: it '+r.facts[k] : 'that '+W.name(r.id)+' '+r.facts[k];
  if (k === 'status') return 'that '+W.name(r.id)+' is '+r.facts[k];
  const v = r.facts[k], vs = Array.isArray(v) ? (v.map(x => W.get(x) ? W.name(x) : x).join(', ') || 'nothing') : (W.get(v) ? W.name(v) : v);
  if (k === 'exits') return 'that '+W.name(r.id)+' leads to '+vs;
  if (k === 'inscription') return 'that '+W.name(r.id)+' is inscribed '+vs;
  return 'that '+(r.id === from.id ? 'its own' : W.name(r.id)+"'s")+' '+k+' is '+vs;
}
function hurt(W, t, dmg, by){
  t.props.health = Math.max(0, t.props.health - dmg);
  if (t.props.health > 0){ if (by){ t.path = []; t.pending = null; t.wait = Math.min(t.wait, 0.3); } return false; }
  const sp = t.sp, room = t.parent, death = sp.death || {};
  for (const s of sp.slots || []) letGo(W, t, s);
  t.dead = true; t.props.down = true; t.path = []; t.pending = null; t.moving = false; t.intent = sp.status ? sp.status[1] : 'dead';
  if (sp.status) t.props.status = sp.status[1];
  W.agents = W.agents.filter(x => x !== t);
  W.log(((by ? death.killed : death.spent) || (n => n+' dies.'))(W.Name(t.id)), room);
  for (const d of sp.drops || []) W.spawnItem(d, W.get(room), { ...t.pos });
  if (!sp.corpse) t.parent = 'void';
  if (t.template === W.protagonist && !W.agents.some(x => x.template === W.protagonist)) W.log('No '+sp.label+' is left. Add one, or start a new world.', null, W.actors.map(x => x.id));
  return true;
}
function step(W, dt){
  W.time += dt; housekeeping(W, dt);
  for (const a of W.agents.slice()){
    if (a.dead) continue;
    let died = false;
    for (const s of a.sp.stats || []){ const d = REG.stats[s]; a.priv[s] = Math.min(d.max, a.priv[s] + dt*d.rate);
      if (a.priv[s] >= d.max && d.atMax && d.atMax.health && hurt(W, a, -d.atMax.health*dt, null)){ died = true; break; } }
    if (died) continue;
    a.percT -= dt; if (a.percT <= 0){ perceive(W, a); a.percT = 0.25; }
    a.moving = false;
    if (a.wait > 0){ a.wait -= dt; continue; }
    if (a.path.length){
      const wp = a.path[0], d = dist(a.pos, wp), s = a.speed*dt;
      a.moving = true;
      if (d > 0.001) a.facing = Math.atan2(wp.x-a.pos.x, wp.z-a.pos.z);
      if (d <= s){
        a.pos = { x:wp.x, z:wp.z }; a.path.shift();
        if (wp.room && wp.room !== a.parent){
          const first = a.K.get(wp.room)?.visitedAt == null;
          a.parent = wp.room; perceive(W, a);
          if (first && a.sp.narrates) W.log(W.Name(a.id)+' '+W.pick(a.sp.narrates)+' '+W.name(wp.room)+' for the first time.', wp.room);
          /* walking into an enemy, either way round, interrupts the plan */
          if (W.agents.some(b => b.parent === a.parent && (hostile(a.sp, b.sp) || hostile(b.sp, a.sp)))){ a.path = []; a.pending = null; }
        }
      } else a.pos = { x:a.pos.x+(wp.x-a.pos.x)/d*s, z:a.pos.z+(wp.z-a.pos.z)/d*s };
      continue;
    }
    if (a.pending){ const p = a.pending; a.pending = null; resolve(W, a, p); if (a.dead) continue; perceive(W, a); if (!a.path.length) a.wait = 0.8 + W.rnd()*1.2; continue; }
    let act = null;
    try { act = REG.scripts[a.priv.script].fn(makeCtx(W, a)); } catch (e) { a.intent = 'script error: '+e.message; }
    plan(W, a, act);
  }
}
/* second-person description built ONLY from the actor's knowledge */
function describeFor(W, a){
  const K = a.K, nm = id => { const e = W.get(id); if (!e) return 'something'; return e.sp && e.sp.named ? K.get(id)?.facts.name ?? 'someone' : 'the '+(K.get(id)?.facts.name ?? 'unknown thing'); };
  const room = W.get(a.parent) || W.get(K.get(a.id)?.loc), ago = r => Math.round(W.time - r.seen)+'s ago';
  if (!room) return 'You are nowhere at all.';
  const rr = K.get(room.id), sp = a.sp;
  const L = ['You are '+a.props.name+', '+(sp.describe ? sp.describe(a) : 'a '+sp.label)+'. You are in '+nm(room.id)+' ('+[rr.facts.terrain, rr.facts.mood, rr.facts.light].filter(Boolean).join(', ')+').'];
  if (a.dead) L.push('You are '+(sp.status ? sp.status[1] : 'dead')+'. This is the last thing you knew.');
  if (a.props.health != null) L.push(['health '+Math.round(a.props.health), ...(sp.stats || []).map(s => s+' '+Math.round(a.priv[s]))].join(', ').replace(/^h/, 'H')+'.');
  const here = [...K.values()].filter(r => r.loc === room.id && r.id !== a.id);
  L.push(here.length ? 'You see: '+here.map(r => nm(r.id)).join(', ')+'.' : 'You see nothing of note.');
  L.push('Exits: '+(rr.facts.exits || []).map(id => { const o = W.get(id), d = DIRS.find(d => d[0] === o.cell.cx-room.cell.cx && d[1] === o.cell.cz-room.cell.cz);
    return d[2]+' to '+nm(id)+(K.get(id).visitedAt == null ? ' (never visited)' : ''); }).join('; ')+'.');
  for (const s of sp.slots || []) if (a[s]) L.push('You are '+s+' '+nm(a[s])+'.');
  const mem = [...K.values()].filter(r => r.template !== 'room' && r.loc && r.loc !== room.id && r.loc !== a.id && r.id !== a.id && W.get(r.loc));
  if (mem.length) L.push('You remember: '+mem.slice(0,8).map(r => nm(r.id)+(W.isRoom(r.loc) ? ' in ' : ' carried by ')+nm(r.loc)+' ('+ago(r)+')').join('; ')+(mem.length > 8 ? '; and more' : '')+'.');
  const lost = [...K.values()].filter(r => r.template !== 'room' && !r.loc && r.id !== a.id);
  if (lost.length) L.push('You know of, but cannot place: '+lost.slice(0,12).map(r => nm(r.id)).join(', ')+(lost.length > 12 ? ', and more' : '')+'.');
  return L.join('\n');
}

/* ---------- built-in map generators (a pack can register more) ---------- */
define({ generators:{
  /* open country: smooth noise for water and biomes, settlements clustered into villages, lairs kept away from them */
  wilds(W, cfg){
    const { rnd, pick, shuffle } = W, [cols, rows] = cfg.size, N = cols*rows, big = N > 30;
    const noise = step => { const gw = Math.ceil(cols/step)+2, gh = Math.ceil(rows/step)+2, g = Array.from({ length:gw*gh }, rnd);
      return (x, z) => { const fx = x/step, fz = z/step, ix = Math.floor(fx), iz = Math.floor(fz); let tx = fx-ix, tz = fz-iz; tx = tx*tx*(3-2*tx); tz = tz*tz*(3-2*tz);
        const v = (a, b) => g[b*gw+a]; return (v(ix,iz)*(1-tx) + v(ix+1,iz)*tx)*(1-tz) + (v(ix,iz+1)*(1-tx) + v(ix+1,iz+1)*tx)*tz; }; };
    const e1 = noise(5), e2 = noise(2.5), E = [], layers = cfg.biomes.map(() => noise(4)), M = cfg.biomes.map(() => []);
    for (let i=0;i<N;i++){ const x = i % cols, z = Math.floor(i/cols); E.push(e1(x,z)*0.7 + e2(x,z)*0.3); layers.forEach((f, b) => M[b].push(f(x,z))); }
    const q = (arr, p) => arr.slice().sort((a, b) => a-b)[Math.min(arr.length-1, Math.floor(arr.length*p))];
    const eq = q(E, cfg.waterShare ?? 0.09), cut = cfg.biomes.map((b, k) => q(M[k], 1 - b.share));
    const terr = E.map((e, i) => { if (cfg.water && e < eq) return cfg.water; const k = cfg.biomes.findIndex((b, k) => M[k][i] > cut[k]); return k < 0 ? cfg.base : cfg.biomes[k].terrain; });
    const wet = t => REG.terrains[t].passable === false;
    /* keep the largest connected landmass; anything cut off becomes water */
    const comp = new Int32Array(N).fill(-1); let best = -1, bestSize = 0, nc = 0;
    for (let s=0;s<N;s++){ if (wet(terr[s]) || comp[s] >= 0) continue; const q2 = [s]; comp[s] = nc;
      for (let h=0;h<q2.length;h++){ const i = q2[h], x = i % cols, z = Math.floor(i/cols);
        for (const [dx,dz] of DIRS){ const nx = x+dx, nz = z+dz, j = nz*cols+nx; if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || wet(terr[j]) || comp[j] >= 0) continue; comp[j] = nc; q2.push(j); } }
      if (q2.length > bestSize){ bestSize = q2.length; best = nc; } nc++; }
    for (let i=0;i<N;i++) if (!wet(terr[i]) && comp[i] !== best) terr[i] = cfg.water;
    const land = []; for (let i=0;i<N;i++) if (!wet(terr[i])) land.push(i);
    const d = (i, j) => Math.hypot(i % cols - j % cols, Math.floor(i/cols) - Math.floor(j/cols));
    const minD = (i, list) => list.reduce((m, j) => Math.min(m, d(i, j)), 1e9);
    const inner = land.filter(i => { const x = i % cols, z = Math.floor(i/cols); return x > 2 && z > 2 && x < cols-3 && z < rows-3; }), pool = inner.length > 10 ? inner : land;
    const st = cfg.settlement, centers = [], special = new Set();
    for (let v=0;v<st.count;v++){ let bi = pick(pool), bd = -1; for (let t=0;t<60;t++){ const i = pick(pool), dd = centers.length ? minD(i, centers) : rnd(); if (dd > bd){ bd = dd; bi = i; } } centers.push(bi); }
    const villages = centers.map(c => { const hs = land.filter(i => !special.has(i) && d(i, c) <= 3.5).sort((a, b) => d(a, c) - d(b, c)).slice(0, st.size); hs.forEach(i => { terr[i] = st.terrain; special.add(i); }); return hs; });
    for (const lair of cfg.lairs || []){ const mine = [], keep = [...special];
      for (let c=0;c<lair.count;c++) placing: for (let far = lair.dist; far >= 1; far--) for (let t=0;t<60;t++){ const i = pick(land);
        if (!special.has(i) && minD(i, keep) >= far && minD(i, mine) >= far){ terr[i] = lair.terrain; special.add(i); mine.push(i); break placing; } } }
    const used = new Set(), adjs = shuffle(cfg.names.adjs);
    const nameFor = (t, i) => { const noun = pick(REG.terrains[t].nouns || [t]);
      if (!big) return adjs[i % adjs.length]+' '+noun;
      for (let k=0;;k++){ const n = pick(cfg.names.syl1)+pick(cfg.names.syl2)+' '+noun+(k > 30 ? ' '+used.size : ''); if (!used.has(n)){ used.add(n); return n; } } };
    terr.forEach((t, i) => W.addRoom(nameFor(t, i), i % cols - Math.floor(cols/2), Math.floor(i/cols) - Math.floor(rows/2), t));
    for (const r of W.rooms) for (const [dx,dz] of DIRS){ const o = W.at(r.cell.cx+dx, r.cell.cz+dz); if (!o) continue;
      r.sees.push(o.id); if (!wet(r.props.terrain) && !wet(o.props.terrain)) r.props.exits.push(o.id); }
    W.villages = villages.filter(v => v.length).map(v => v.map(i => W.rooms[i].id));
  },
  /* a small building: a blob of rooms joined by doors */
  rooms(W, cfg){
    const { rnd, pick, shuffle } = W;
    const cells = [[0,0]], key = (x,z) => x+','+z, has = new Map([[key(0,0),0]]), edges = new Set();
    const n = cfg.count[0] + Math.floor(rnd()*(cfg.count[1]-cfg.count[0]+1));
    for (let guard=0; cells.length < n && guard < 500; guard++){
      const i = Math.floor(rnd()*cells.length), [cx,cz] = cells[i], [dx,dz] = pick(DIRS), nx = cx+dx, nz = cz+dz;
      if (Math.abs(nx) > 1 || nz < -1 || nz > 1 || has.has(key(nx,nz))) continue;
      has.set(key(nx,nz), cells.length); cells.push([nx,nz]); edges.add(i+'-'+(cells.length-1));
    }
    cells.forEach(([cx,cz], i) => { for (const [dx,dz] of DIRS){ const j = has.get(key(cx+dx,cz+dz)); if (j != null && j > i && !edges.has(i+'-'+j) && rnd() < 0.3) edges.add(i+'-'+j); } });
    const adjs = shuffle(cfg.names.adjs), nouns = shuffle(cfg.names.nouns);
    cells.forEach(([cx,cz], i) => W.addRoom(adjs[i]+' '+nouns[i], cx, cz, cfg.terrain, cfg.props ? cfg.props(W) : {}));
    for (const e of edges){ const [i,j] = e.split('-').map(Number); W.rooms[i].props.exits.push(W.rooms[j].id); W.rooms[j].props.exits.push(W.rooms[i].id); }
    for (const r of W.rooms) r.sees = r.props.exits;
  },
}});

const Sim = { REG, define, createWorld, step, describeFor, mulberry32 };



/* ============================================================
   CONTENT — everything the engine runs is declared here with define().
   To add content, add an entry; the engine and the renderer need no changes.

   A new creature, a new food and a new verb, for example:

     define({
       species:{ wolf:{ label:'wolf', plural:'wolves', tags:['wolf','beast'], hostile:['game'], hunts:['robot'],
                        speed:2.6, health:45, avoid:['house'], script:'raider', homeless:true,
                        attack:{ damage:12, verbs:['bites','snaps at'] }, drops:['pelt'],
                        art:{ model:'deer', color:'#8a8f9c', dot:0.6 } } },
       items:{ pelt:{ tags:['hide'] }, berries:{ tags:['food'], use:{ hunger:-20 }, useVerbs:['eats'], art:'gem' } },
       verbs:{ howl:{ intent:'howling', resolve(W, a, t, room){ W.log(W.Name(a.id)+' howls.', room.id); } } },
     });

   ...then list it in a skin:  species:{ wolf:{} },  spawns:[{ species:'wolf', on:['forest'], every:60, target:4 }]
   Relations are by tag: `hostile:['robot']` attacks anything tagged robot; scripts ask know.threats() and
   know.targets() instead of naming a species.
   ============================================================ */
const POOL = {
  roomAdj:['Humming','Dusty','Sunken','Copper','Quiet','Flickering','Mossy','Velvet','Echoing','Crooked'],
  roomNoun:['Greenhouse','Archive','Workshop','Pantry','Observatory','Boiler Room','Gallery','Depot','Parlor','Clock Room'],
  wildAdj:['Mossy','Quiet','Windy','Crooked','Sunken','Hollow','Amber','Misty','Bramble','Old','Far','Thorn','Silver','Low','Echo','Fern','Ash','Wren'],
  syl1:['Vel','Tarn','Ash','Bram','Cor','Dun','El','Fen','Gal','Hol','Is','Jor','Kel','Lor','Mar','Nor','Or','Pen','Quil','Ros','Sil','Tor','Ul','Wyn','Yar','Zel','Ald','Brin','Cael','Eth'],
  syl2:['moor','brook','dale','wick','holt','mere','ford','by','den','stead','ley','combe','thorpe','fell','shaw','worth','gate','well','ridge','mouth'],
  mood:['warm','drowsy','tense','cheerful','solemn','cluttered','hushed'],
  light:['sunlit','lamplit','dim','flickering','blue-tinted','golden'],
  robot:['Pip','Bolt','Mosa','Tink','Rivet','Dot','Juno','Fenn','Ozzo','Lumi','Kip','Nub','Wren','Zed','Moss','Quill','Tab','Echo','Pixel','Nim','Otto','Bix','Cog','Dax','Elko','Fizz','Gus','Hob','Ivo','Jib','Koda','Lark','Miso','Nox','Opal','Pogo','Rook','Sola','Tully','Umi','Vim','Wick','Yam','Zuzu'],
  goblin:['Grub','Snag','Mog','Rikk','Urt','Blix','Krum','Vex','Skab','Nurk','Zog','Brak','Gnash','Slub','Wort','Hask','Druk','Pox','Yig','Crud'],
  temper:['spiteful','hungry','bored','territorial','sneaky'],
  model:['MK-2','Tinker 9','Lil-Unit','B33P','Sprocket C','Pocket Class'],
  job:['lamplighter','archivist','tea courier','moss gardener','clock winder','cartographer','button sorter','night porter','bell tuner'],
  quirk:['hums when thinking','counts floor tiles','is afraid of magnets','collects static','apologizes to doors','naps standing up','whistles in binary'],
  secret:['once ate a fuse','cannot actually read','is saving up for legs','dreams of the sea','reset the big clock by accident','keeps a pet dust bunny','has a second, quieter voice'],
  material:['brass','tin','glass','copper','jade','ruby','paper'],
  modelAdj:['old','heavy','wobbly','polished','forgotten'],
  imageOf:['a hill at dusk','two moons','a quiet harbor','an orange field','the first robot','a red sun'],
  inscription:['"property of nobody"','"wind me twice"','"for M., with static"','"do not open before winter"','"7 of 9"','"made in the Sunken Depot"','"return to sender"','"it was always you"'],
  color:['#ff8a5b','#5bc8ff','#9be564','#f7c948','#c79bff','#ff7eb6','#5eead4','#ffd1a1'],
};

/* ------------------------------------------------------------
   VERBS. Three shapes:
     plan(W, a, act)            movement only; return false to fall back to wandering
     resolve(W, a, t, room)     done on the spot (no target), or
     target:true + resolve      done to something: the engine walks the actor to where it believes
                                the target is, then calls resolve — or logs `absent` if it is not there
   ------------------------------------------------------------ */
define({ verbs:{
  wait:   { plan(W, a){ a.wait = 1.5; a.intent = 'waiting'; return true; } },
  wander: { plan(W, a){ return W.wander(a); } },
  goto:   { plan(W, a, act){ return W.travel(a, act.room); } },
  flee:   { plan(W, a){ const ex = a.K.get(a.parent).facts.exits || [];
            return W.travel(a, a.props.home, 'fleeing to ') || W.travel(a, ex.length && W.pick(ex), 'fleeing to ') || W.wander(a, 'cowering'); } },

  drop: { intent:'putting something down',
    resolve(W, a, t, room){ const it = letGo(W, a, 'holding'); if (!it) return;
      W.log(W.Name(a.id)+' '+W.pick(['sets down','carefully places','drops'])+' '+W.name(it.id)+' in '+W.name(room.id)+'.', room.id); } },
  /* use whatever is held: the item's definition says what it does to which stat */
  use: { intent:'using what it holds',
    resolve(W, a, t, room){ const it = W.get(a.holding), d = it && REG.items[it.def]; if (!d || !d.use) return;
      for (const k in d.use){ if (k === 'health') a.props.health = Math.min(a.sp.health, a.props.health + d.use[k]); else if (k in a.priv) a.priv[k] = Math.max(0, a.priv[k] + d.use[k]); }
      a.holding = null; it.parent = 'void';
      W.log(W.Name(a.id)+' '+W.pick(d.useVerbs || ['uses'])+' '+W.name(it.id)+'.', room.id); } },
  /* rest: the terrain's definition says what resting there restores */
  rest: { intent:'resting',
    resolve(W, a, t, room){ const r = REG.terrains[room.props.terrain].rest; if (!r) return;
      if (a.prev !== 'rest') W.log(W.Name(a.id)+' '+(a.sp.restVerb || 'settles down')+' at '+W.name(room.id)+'.', room.id);
      if (r.health) a.props.health = Math.min(a.sp.health, a.props.health + r.health); } },

  take: { target:true, intent:n => 'going to take '+n,
    absent:(A, T) => A+' reaches for where '+T+' used to be. It is gone.',
    resolve(W, a, t, room){
      if (t.props.fixed) return W.log(W.Name(a.id)+' tugs at '+W.name(t.id)+'. It will not budge.', room.id);
      const want = REG.items[t.def].slot || 'holding', slot = (a.sp.slots || []).includes(want) ? want : 'holding';
      if (!(a.sp.slots || []).includes(slot)) return;
      if (a[slot]) letGo(W, a, slot);
      t.parent = a.id; a[slot] = t.id;
      W.log(W.Name(a.id)+' '+(slot === 'holding' ? W.pick(['picks up','pockets','scoops up','claims']) : W.pick(['arms itself with','hefts','takes up']))+' '+W.name(t.id)+'.', room.id); } },
  inspect: { target:true, intent:n => 'going to study '+n,
    absent:(A, T) => A+' came to study '+T+', but it is not here.',
    resolve(W, a, t, room){ const r = learn(W, a, t, true); r.inspected = true;
      W.log(W.Name(a.id)+' studies '+W.name(t.id)+(t.priv.inscription ? '. It reads '+t.priv.inscription+'.' : '. Nothing is written on it.'), room.id); } },
  talk: { target:true, intent:n => 'looking for '+n,
    absent:(A, T) => A+' looks around for '+T+' and finds no one.',
    resolve(W, a, t, room){
      if (t.dead || !t.sp || !t.sp.talks || !a.sp.talks) return W.log(W.Name(a.id)+' nudges '+W.name(t.id)+'. No response.', room.id);
      a.talked[t.id] = t.talked[a.id] = W.time; t.wait = Math.max(t.wait, 1.6);
      a.facing = Math.atan2(t.pos.x-a.pos.x, t.pos.z-a.pos.z); t.facing = a.facing + Math.PI;
      const s1 = tell(W, a, t), s2 = tell(W, t, a);
      W.log(W.Name(a.id)+' '+(s1 ? W.pick(['tells','whispers to','informs'])+' '+W.name(t.id)+' '+s1+'.' : 'chats with '+W.name(t.id)+' but has nothing new to say.'), room.id);
      if (s2) W.log(W.name(t.id)+' replies '+s2+'.', room.id); } },
  /* attack: damage comes from the best weapon in any slot, else from the species' natural attack */
  attack: { target:true, alive:true, intent:n => 'going after '+n,
    absent:(A, T) => A+' charges in after '+T+' and finds nothing to hit.',
    resolve(W, a, t, room){
      if (t.props.health == null) return;
      a.facing = Math.atan2(t.pos.x-a.pos.x, t.pos.z-a.pos.z);
      const wpn = (a.sp.slots || []).map(s => W.get(a[s])).filter(i => i && i.props.damage).sort((x, y) => y.props.damage - x.props.damage)[0];
      const nat = a.sp.attack || { damage:2, verbs:['shoves'] }, T = W.name(t.id);
      if (wpn) W.log(W.Name(a.id)+' '+W.pick(['swings','brings down','thrusts'])+' '+W.name(wpn.id)+' at '+T+'.', room.id);
      else W.log(W.Name(a.id)+' '+W.pick(nat.verbs)+' '+T+(nat.suffix || '')+'.', room.id);
      hurt(W, t, wpn ? wpn.props.damage : nat.damage, a); } },
}});

/* ------------------------------------------------------------
   STATS: needs that rise over time. atMax says what happens when one is full.
   ------------------------------------------------------------ */
define({ stats:{
  hunger:{ start:W => W.rnd()*25, rate:0.8, max:100, atMax:{ health:-1.5 } },
}, dull:['hunger','weights','light','mood','damage','terrain','temper','model'] });

/* ------------------------------------------------------------
   SCRIPTS. fn(ctx) -> { do:<verb>, target?, room? }. ctx exposes only the actor's own config and
   whatever its knowledge graph allows. A script can be an if-then tree or a network.
   ------------------------------------------------------------ */
/* shared survival reflexes: returns an action, or null when nothing is urgent */
function survive(ctx){
  const { self, know } = ctx;
  const foe = know.threats().find(t => t.loc === self.room && ctx.up(t));
  if (foe) return self.wielding && self.health > 35 ? { do:'attack', target:foe.id } : { do:'flee' };
  if (self.hunger > 55){
    if (ctx.has(know.get(self.holding), 'food')) return { do:'use' };
    const food = ctx.nearest(know.items('food').filter(i => know.isRoom(i.loc)));
    if (food) return { do:'take', target:food.id };
    const game = self.wielding && ctx.nearest(know.tagged('game').filter(d => know.isRoom(d.loc)));
    if (game) return { do:'attack', target:game.id };
    /* nothing known to eat: head for the nearest food-bearing place not searched lately */
    const larder = ctx.nearest(know.rooms().filter(r => ctx.yields(r, 'food') &&
      (r.visitedAt == null || ctx.now - r.visitedAt > 60)));
    if (larder) return { do:'goto', room:larder.id };
  }
  if (self.health < 45 || (self.resting && self.health < 90))
    return self.room === self.home ? { do:'rest' } : { do:'goto', room:self.home };
  return null;
}
const weights = W => ({ weights:Array.from({ length:40 }, () => Math.round((W.rnd()*2-1)*100)/100) });
define({ reflexes:{ survive }, scripts:{
  collector: { kind:'if-then tree',
    init:W => { const kinds = [...new Set(W.items.filter(x => !x.props.fixed).map(x => x.props.kind))]; return { desires:kinds.length ? W.pick(kinds) : 'nothing' }; },
    fn(ctx){
    const { self, know } = ctx;
    if (self.holding)
      return self.room === self.home ? { do:'drop' } : { do:'goto', room:self.home };
    const want = know.items().find(i =>
      i.facts.kind === self.desires && know.isRoom(i.loc) && i.loc !== self.home);
    if (want) return { do:'take', target:want.id };
    return { do:'goto', room:ctx.leastVisitedRoom() };
  }},
  gossip: { kind:'if-then tree', fn(ctx){
    const { self, know } = ctx;
    const fresh = a => ctx.up(a) && ctx.since(a.id) > 20;
    const here = know.kin().find(a => a.loc === self.room && fresh(a));
    if (here) return { do:'talk', target:here.id };
    const far = know.kin().filter(a => know.isRoom(a.loc) && fresh(a));
    if (far.length) return { do:'talk', target:ctx.pick(far).id };
    return { do:'goto', room:ctx.leastVisitedRoom() };
  }},
  scholar: { kind:'if-then tree', fn(ctx){
    const { self, know } = ctx;
    const unread = know.items().filter(i => !i.inspected && know.isRoom(i.loc));
    const near = unread.find(i => i.loc === self.room) || unread[0];
    if (near) return { do:'inspect', target:near.id };
    return { do:'goto', room:ctx.leastVisitedRoom() };
  }},
  wanderer: { kind:'coin flip', fn(ctx){
    return ctx.chance(0.5) ? { do:'wander' } : { do:'goto', room:ctx.pick(ctx.exits) };
  }},
  neural: { kind:'5-4-5 neural net', init:weights, fn(ctx){
    const { self, know } = ctx, W = self.weights;
    const here = know.all().filter(r => r.loc === self.room);
    const loose = here.filter(r => r.template === 'item' && !r.facts.fixed);
    const kin = here.filter(r => r.template === self.species && r.id !== self.id);
    const rooms = know.rooms();
    const x = [ self.holding ? 1 : 0, loose.length / 3, kin.length / 2,
                rooms.filter(r => r.visitedAt != null).length / rooms.length, 1 ];
    const h = [0,1,2,3].map(j => Math.tanh(x.reduce((s, v, i) => s + v * W[j*5+i], 0)));
    const out = [0,1,2,3,4].map(k => Math.exp(2 * h.reduce((s, v, j) => s + v * W[20+k*4+j], 0)));
    let r = ctx.rand() * out.reduce((a, b) => a + b), k = 0;
    while (k < 4 && (r -= out[k]) > 0) k++;
    if (k === 1) return { do:'goto', room:ctx.pick(ctx.exits) };
    if (k === 2 && loose.length && !self.holding) return { do:'take', target:ctx.pick(loose).id };
    if (k === 3 && self.holding) return { do:'drop' };
    if (k === 4 && kin.length) return { do:'talk', target:ctx.pick(kin).id };
    return { do:'wander' };
  }},
  forager: { kind:'reflexes + if-then tree', uses:['survive'], fn(ctx){
    const { self, know } = ctx;
    const urgent = survive(ctx); if (urgent) return urgent;
    if (self.holding)
      return self.room === self.home ? { do:'drop' } : { do:'goto', room:self.home };
    const food = ctx.nearest(know.items('food').filter(i => know.isRoom(i.loc) && i.loc !== self.home));
    if (food) return { do:'take', target:food.id };
    return { do:'goto', room:ctx.leastVisitedRoom() };
  }},
  hunter: { kind:'reflexes + if-then tree', uses:['survive'], fn(ctx){
    const { self, know } = ctx;
    const urgent = survive(ctx); if (urgent) return urgent;
    if (!self.wielding){
      const weapon = ctx.nearest(know.items('weapon').filter(i => know.isRoom(i.loc)));
      if (weapon) return { do:'take', target:weapon.id };
      return { do:'goto', room:ctx.leastVisitedRoom() };
    }
    const prey = ctx.nearest([...know.threats(), ...know.tagged('game')].filter(t => know.isRoom(t.loc)));
    if (prey) return { do:'attack', target:prey.id };
    return { do:'goto', room:ctx.leastVisitedRoom() };
  }},
  scout: { kind:'reflexes + if-then tree', uses:['survive'], fn(ctx){
    const { self, know } = ctx;
    const urgent = survive(ctx); if (urgent) return urgent;
    const friend = know.kin().find(a => a.loc === self.room && ctx.up(a) && ctx.since(a.id) > 25);
    if (friend) return { do:'talk', target:friend.id };
    return { do:'goto', room:ctx.leastVisitedRoom() };
  }},
  feral: { kind:'reflexes + neural net', uses:['survive'], init:weights, fn(ctx){
    return survive(ctx) || REG.scripts.neural.fn(ctx);
  }},
  /* attacks whatever its species is hostile to; works for any predator */
  raider: { kind:'if-then tree', fn(ctx){
    const { self, know } = ctx;
    const prey = know.targets().find(a => a.loc === self.room && ctx.up(a));
    if (prey) return { do:'attack', target:prey.id };
    const seen = know.targets().filter(a => ctx.up(a) && know.isRoom(a.loc) && ctx.canEnter(a.loc));
    if (seen.length && ctx.chance(0.6)) return { do:'attack', target:ctx.nearest(seen).id };
    if (self.home && self.room !== self.home && ctx.chance(0.35)) return { do:'goto', room:self.home };
    return ctx.chance(0.5) ? { do:'wander' } : { do:'goto', room:ctx.pick(ctx.exits) };
  }},
  /* bolts from whatever threatens its species; works for any prey animal */
  skittish: { kind:'if-then tree', fn(ctx){
    const { self, know } = ctx;
    const threat = know.threats().some(a => a.loc === self.room && ctx.up(a));
    if (threat && ctx.chance(0.75)) return { do:'goto', room:ctx.pick(ctx.exits) };
    return ctx.chance(0.7) ? { do:'wander' } : { do:'goto', room:ctx.pick(ctx.exits) };
  }},
}});

/* ------------------------------------------------------------
   TERRAINS. scenery(t) draws with t.add(shape, x,y,z, sx,sy,sz, color, turn) and t.ring(n, r0, r1, fn);
   shapes are whatever the renderer's art registry offers (box, block, cyl, cone, tent, gem, water, fire, ember).
   ------------------------------------------------------------ */
define({ terrains:{
  room:  { walled:true, ground:['#eadfca','#d6e4d1','#d4ddeb','#ecd6d3','#e7e0c2','#dbd4ea','#d0e6e3'] },
  house: { walled:true, ground:'#dcbf93', nouns:['House','Cabin','Hut'], rest:{ health:10 },
    scenery(t){ t.add('block', -2.9, 0.15, -3.2, 1.5, 0.3, 0.9, '#b24a3a'); t.add('block', -3.3, 0.36, -3.2, 0.5, 0.14, 0.7, '#f4f1ea');
      t.add('block', 2.9, 0.55, -3.6, 0.9, 1.1, 0.5, '#6b6f7d'); t.add('ember', 2.9, 0.35, -3.33, 0.5, 0.4, 0.1, '#ffb347'); } },
  forest:{ ground:'#6f9f5c', ink:'dark', nouns:['Wood','Thicket','Grove'], yields:['food'],
    scenery(t){ t.ring(9, 2.4, 4.0, (x, z) => { const s = 0.8 + t.rnd()*0.6, gr = t.pick(['#3f7d4a','#4c8f55','#366e42']);
      t.add('cyl', x, 0.35*s, z, 0.15*s, 0.7*s, 0.15*s, '#6b4a32'); t.add('cone', x, 1.25*s, z, 0.8*s, 1.3*s, 0.8*s, gr); t.add('cone', x, 1.95*s, z, 0.58*s, 1.0*s, 0.58*s, gr); }); } },
  meadow:{ ground:'#a8cc78', nouns:['Meadow','Field','Heath'],
    scenery(t){ t.ring(14, 0.5, 4.1, (x, z) => t.add('gem', x, 0.09, z, 0.09, 0.09, 0.09, t.pick(['#fff3b0','#ff9ab0','#ffffff','#c79bff'])));
      t.ring(7, 0.5, 4.1, (x, z) => t.add('cone', x, 0.17, z, 0.1, 0.35, 0.1, '#7fae5a')); } },
  lake:  { passable:false, seenFromAfar:true, ground:'#d9cfa3', nouns:['Lake','Pond','Mere'],
    scenery(t){ t.add('water', 0, 0, 0, t.S-1.3, 0.1, t.S-1.3, '#4f9fd0');
      t.ring(5, 0.5, 3.2, (x, z) => t.add('cyl', x, 0.07, z, 0.3, 0.03, 0.3, '#5fae6a'));
      t.ring(6, 3.7, 3.9, (x, z) => t.add('cyl', x, 0.4, z, 0.03, 0.8, 0.03, '#8a9a4a')); } },
  camp:  { ground:'#9c8262', ink:'dark', nouns:['Goblin Camp'],
    scenery(t){ for (const [x, z] of [[-2.7,-2.6],[2.6,-2.9]]) t.add('tent', x, 0.8, z, 1.1, 1.6, 1.1, '#6e5a48', Math.PI/4);
      for (let k=0;k<6;k++){ const a = k/6*6.283; t.add('gem', 2.7+Math.cos(a)*0.45, 0.08, 2.6+Math.sin(a)*0.45, 0.14, 0.12, 0.14, '#55555c'); }
      t.add('fire', 2.7, 0.3, 2.6, 0.28, 0.6, 0.28, '#ffb347');
      t.add('cyl', -3.2, 0.75, 2.4, 0.04, 1.5, 0.04, '#4a3a2a'); t.add('gem', -3.2, 1.55, 2.4, 0.17, 0.2, 0.17, '#efe9da');
      for (let k=0;k<6;k++) t.add('cone', -1.5+k*0.6, 0.4, -4.1, 0.1, 0.8, 0.1, '#4a3a2a'); } },
}});

/* ------------------------------------------------------------
   ITEMS. tags are what scripts ask about ('food', 'weapon'); `use` is what the use verb applies;
   `slot` says where it is carried; render is 'icon' | 'model' | 'image' and `art` names the picture.
   ------------------------------------------------------------ */
const trinket = art => ({ render:'icon', art, make:W => { const material = W.pick(POOL.material); return { name:material+' '+art, material, priv:{ inscription:W.pick(POOL.inscription) } }; } });
const furniture = art => ({ render:'model', art, fixed:true, make:W => ({ name:W.pick(POOL.modelAdj)+' '+art, material:W.pick(['pine','iron','clay','oak']) }) });
const picture = art => ({ render:'image', art, fixed:true, make:W => ({ name:art+' of '+W.pick(POOL.imageOf), material:'canvas', priv:{ inscription:'"signed, '+W.pick(POOL.robot)+'"' } }) });
const weapon = (art, material, damage) => ({ tags:['weapon'], slot:'wielding', damage, art, make:W => ({ material, priv:{ inscription:W.pick(POOL.inscription) } }) });
define({ items:{
  key:trinket('key'), book:trinket('book'), gem:trinket('gem'), cup:trinket('cup'), coin:trinket('coin'), battery:trinket('battery'), letter:trinket('letter'), wrench:trinket('wrench'),
  crate:furniture('crate'), plant:furniture('plant'), lamp:furniture('lamp'), barrel:furniture('barrel'), table:furniture('table'),
  painting:picture('painting'), poster:picture('poster'), map:picture('map'),
  'iron-sword':weapon('sword', 'iron', 30), 'rusty-sword':weapon('sword', 'rust', 24), 'spiked-bat':weapon('bat', 'wood', 22),
  mushroom:{ tags:['food'], art:'mushroom', use:{ hunger:-35 }, useVerbs:['eats','gobbles up','munches'],
    make:W => { const [name, material] = W.pick([['red mushroom','ruby'],['brown mushroom','copper'],['speckled mushroom','paper']]); return { name, material }; } },
  venison:{ tags:['food'], art:'meat', use:{ hunger:-70 }, useVerbs:['eats','devours'], make:() => ({ material:'meat' }) },
}});

/* ------------------------------------------------------------
   SPECIES. Relations are by tag: hostile = attacks on sight, hunts = may go after.
   A skin switches a species on and can override any field (see the skins below).
   ------------------------------------------------------------ */
define({ species:{
  robot:{ label:'robot', plural:'robots', named:true, tags:['robot','person'], talks:true, family:true, corpse:true,
    slots:['holding'], narrates:['rolls into','toddles into','peeks into'],
    describe:a => 'a '+a.props.occupation+' unit',
    wake:(a, W) => a.props.name+', a '+a.props.occupation+', switches on in '+W.name(a.parent)+'.',
    make(W, i){ const n = POOL.robot.length, order = W.robotNames || (W.robotNames = W.shuffle(POOL.robot));
      return { name:order[i % n] + (i >= n ? ' '+(Math.floor(i/n)+1) : ''), color:POOL.color[i % POOL.color.length],
        props:{ model:W.pick(POOL.model), occupation:W.pick(POOL.job), quirk:W.pick(POOL.quirk) }, priv:{ secret:W.pick(POOL.secret) } }; },
    art:{ model:'robot', dot:1, tagY:2.7 } },
  goblin:{ label:'goblin', plural:'goblins', named:true, tags:['goblin','monster'], hostile:['robot'], speed:1.9, health:70, avoid:['house'], script:'raider',
    attack:{ damage:15, verbs:['clubs','bites','whacks','jabs'] },
    death:{ killed:n => n+' shrieks and collapses into a heap of rags.' },
    describe:a => 'a '+a.props.temper+' goblin',
    make(W){ const short = W.pick(POOL.goblin); return { name:short+' the goblin', short, props:{ temper:W.pick(POOL.temper) } }; },
    art:{ model:'goblin', color:'#ff4a3a', dot:0.8, tagY:2.2 } },
  deer:{ label:'deer', plural:'deer', tags:['deer','animal','game'], speed:2.1, health:20, avoid:['house','camp'], homeless:true, script:'skittish', drops:['venison'],
    death:{ killed:n => n+' falls.' },
    make:() => ({ name:'wild deer' }),
    art:{ model:'deer', color:'#c9a274', dot:0.45, bar:false } },
}});

/* ------------------------------------------------------------
   SKINS. A skin is a recipe: which species are on (with overrides), how the map is built,
   who the protagonists are, what is scattered at the start, and what keeps spawning.
   ------------------------------------------------------------ */
const SIZES = { small:[5,3,4], medium:[16,16,12], huge:[50,50,40] };
define({ skins:{
  wild:{ label:'Wildwood survival', placeWord:'squares',
    blurb:'Robots get hungry, eat mushrooms and venison, recharge in houses, and can arm themselves. Goblins raid from their camps but will not enter a house.',
    options:{
      size:{ label:'map', choices:{ small:'5 × 3', medium:'16 × 16', huge:'50 × 50' }, default:'huge' },
      houses:{ label:'houses', choices:{ one:'one per village', each:'one per robot' }, default:'one' },
    },
    species:{
      robot:{ health:100, stats:['hunger'], slots:['holding','wielding'], hunts:['game'], cares:['food','weapon'], status:['running','powered down'],
        scripts:['forager','hunter','scout','feral'], restVerb:'plugs in to recharge', attack:{ damage:4, verbs:['bonks'], suffix:' with a tiny fist' },
        death:{ killed:n => n+' sparks, sags, and powers down.', spent:n => n+' runs out of charge and powers down.' } },
      goblin:{}, deer:{},
    },
    map:W => { const [cols, rows, n] = SIZES[W.opts.size], villages = Math.max(1, Math.round(n/5));
      return { generator:'wilds', size:[cols, rows], water:'lake', waterShare:0.09, base:'meadow', biomes:[{ terrain:'forest', share:0.42 }],
        settlement:{ terrain:'house', count:villages, size:W.opts.houses === 'each' ? Math.ceil(n/villages) : 1 },
        lairs:[{ terrain:'camp', count:Math.max(2, Math.round(cols*rows/80)), dist:4 }],
        names:{ adjs:POOL.wildAdj, syl1:POOL.syl1, syl2:POOL.syl2 } }; },
    cast:W => ({ species:'robot', count:SIZES[W.opts.size][2] }),
    scatter:[ { items:['iron-sword','spiked-bat','rusty-sword'], on:['forest','meadow'], nearSettlement:6, count:W => Math.max(3, Math.round(SIZES[W.opts.size][2]*0.6)) } ],
    spawns:[
      { item:'mushroom', on:['forest'], every:20, first:8, share:0.12, minTries:2, perPlace:W => W.big ? 1 : 2, initial:W => W.big ? 0.6 : 1.5 },
      { species:'deer', on:['forest','meadow'], every:45, first:20, target:W => Math.max(2, Math.round(W.rooms.length/110)) },
      { species:'goblin', home:'camp', every:50, first:60, announce:(g, place) => g+' crawls out of a tent at '+place+'.' },
    ] },
  tin:{ label:'Tinworld house', placeWord:'rooms',
    species:{ robot:{ scripts:['collector','gossip','scholar','wanderer','neural'] } },
    map:() => ({ generator:'rooms', count:[5,6], terrain:'room', names:{ adjs:POOL.roomAdj, nouns:POOL.roomNoun }, props:W => ({ mood:W.pick(POOL.mood), light:W.pick(POOL.light) }) }),
    cast:() => ({ species:'robot', count:4 }),
    scatter:[ { perPlace:[3,4], unique:['small','bent','shiny','odd','tiny','second'],
      pick:W => { const r = W.rnd(); return r < 0.58 ? W.pick(['key','book','gem','cup','coin','battery','letter','wrench']) : r < 0.82 ? W.pick(['crate','plant','lamp','barrel','table']) : W.pick(['painting','poster','map']); } } ],
  },
}});

module.exports = Sim;
