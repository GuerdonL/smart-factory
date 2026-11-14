(() => {
  const view = document.getElementById('view'), world = document.getElementById('world'), pos = document.getElementById('pos');
  /* the camera: world point (x, y) appears at screen (x * z + tx, y * z + ty) */
  const cam = { tx: innerWidth / 2, ty: innerHeight / 2, z: 1 };
  const ZMIN = 0.1, ZMAX = 4, GRID = 24;
  try { const s = JSON.parse(localStorage.getItem('sf-cam')); if (s && isFinite(s.tx + s.ty + s.z)) Object.assign(cam, s); } catch (e) {}
  let saveT = 0;
  function draw(){
    world.style.transform = 'translate(' + cam.tx + 'px,' + cam.ty + 'px) scale(' + cam.z + ')';
    /* the dot grid lives in the background so it never runs out; minor dots fade away when zoomed far out */
    let g = GRID * cam.z; const major = g * 5; const showMinor = g >= 9;
    view.style.backgroundSize = major + 'px ' + major + 'px, ' + (showMinor ? g + 'px ' + g + 'px' : '0 0');
    view.style.backgroundPosition = (cam.tx - major / 2) + 'px ' + (cam.ty - major / 2) + 'px, ' + (cam.tx - g / 2) + 'px ' + (cam.ty - g / 2) + 'px';
    pos.textContent = Math.round((innerWidth / 2 - cam.tx) / cam.z) + ', ' + Math.round((innerHeight / 2 - cam.ty) / cam.z) + ' · ' + Math.round(cam.z * 100) + '%';
    clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('sf-cam', JSON.stringify(cam)); } catch (e) {} }, 300);
  }
  function zoomAt(sx, sy, f){
    const z = Math.min(ZMAX, Math.max(ZMIN, cam.z * f)), k = z / cam.z;
    cam.tx = sx - (sx - cam.tx) * k; cam.ty = sy - (sy - cam.ty) * k; cam.z = z; draw();
  }
  /* drag to pan; two fingers pan and pinch */
  const pts = new Map(); let pinch = 0;
  /* right click: the browser's menu is swallowed and ours opens at the pointer. "New" will get a submenu; for now it does nothing. */
  const menu = document.getElementById('menu');
  const closeMenu = () => { menu.hidden = true; };
  addEventListener('contextmenu', e => { e.preventDefault(); if (e.target.closest('#hud')) return closeMenu();
    menu.hidden = false; const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - w - 4)) + 'px'; menu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - h - 4)) + 'px'; });
  addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('#menu')) closeMenu(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  addEventListener('blur', closeMenu);
  view.addEventListener('pointerdown', e => { if (e.button === 2 || (e.button === 0 && e.ctrlKey)) return; view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); view.classList.add('panning'); pinch = 0; });
  view.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1){ cam.tx += e.clientX - p.x; cam.ty += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; draw(); return; }
    const before = [...pts.values()].map(q => ({ x: q.x, y: q.y })); p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...pts.values()], [a0, b0] = before;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mx0 = (a0.x + b0.x) / 2, my0 = (a0.y + b0.y) / 2;
    cam.tx += mx - mx0; cam.ty += my - my0;
    const d = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
    zoomAt(mx, my, d0 > 0 ? d / d0 : 1);
  });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) view.classList.remove('panning'); };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  /* wheel and trackpad: scroll pans, pinch or ctrl/cmd + wheel zooms about the pointer */
  view.addEventListener('wheel', e => { e.preventDefault(); closeMenu();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)));
    else { const m = e.deltaMode ? 16 : 1; cam.tx -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * m; cam.ty -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * m; draw(); }
  }, { passive: false });
  document.getElementById('home').addEventListener('click', () => { cam.tx = innerWidth / 2; cam.ty = innerHeight / 2; cam.z = 1; draw(); });
  addEventListener('resize', draw);
  draw();
})();
