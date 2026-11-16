/* =====================================================================================================
   Pearl Museum: the one site script. Edit this file, then rebuild script.min.js (see README).
   Load it in <head>, WITHOUT defer, naming the page:  <script src="assets/js/script.min.js" data-page="about"></script>
   GSAP stays its own file (assets/js/vendor/), loaded without blocking: by SITE below, or by a defer tag on index.

   What runs when (the same moments as the separate scripts this file replaces):
     head            SITE (the shared engine, was site.js) on every page except index; index runs HEAD.index
     parse finished  PAGE[name] (was the page's inline <script> at the end of <body>), registered first so it runs
                     before SITE boots; then, on index only, MENU (was a deferred menu.js)
   ===================================================================================================== */
(function () {
  var S = document.currentScript;
  var JS_BASE = ((S && S.src) || '').replace(/[^/?#]*([?#].*)?$/, '');
  var NAME = (S && S.getAttribute('data-page')) || '';
  var HEAD = {}, PAGE = {};

  // page code runs once the document is parsed; this listener is added before SITE adds its own boot listener
  var parsed = false;
  function afterParse() {
    if (parsed || document.readyState === 'loading') return;
    parsed = true;
    document.removeEventListener('readystatechange', afterParse);
    if (PAGE[NAME]) PAGE[NAME]();
    if (NAME === 'index') MENU();
  }
  document.addEventListener('readystatechange', afterParse);

  /* ================= SITE: the shared engine (all pages except index) ================= */
  function SITE() {
/* =====================================================================================================
   Pearl Museum kit: site.js (load it in <head>, WITHOUT defer). It needs nothing else to be loaded first:
     - it loads GSAP itself (assets/js/vendor/gsap-3.12.5.min.js) without blocking;
       copy, cues, clips and the menu work before GSAP arrives, page timelines are added once it is there
     - it starts the menu (MENU, below) as soon as the page is parsed
     - it boots when the document is parsed, without waiting for deferred scripts
   The engine from index.html, made reusable:
     - html classes: js + fx (cinematic) or rm (reduced motion, also ?rm=1); no JS = flow layout
     - asset fallbacks: phone file -> desktop file, poster -> still, then the placeholder gradient + file name
     - scrub scenes: each .scene's stage is fixed while its scroll runs; the clip in it is scrubbed by scroll
     - cues: [data-cue="from to"] fade copy in and out straight from the scroll position (no smoothing)
     - timelines: PM.timeline('sceneId', (gsap, T) => tl) for page choreography, driven by scene progress
     - header: navy lock-up over light scenes (data-theme="light") and light reading sections (.flow--cream,
       [data-theme="light"]), with a soft tinted blur behind the header while reading copy passes under it
     - reading sections: as a .flow between two scenes scrolls away, the NEXT scene's stage shows behind it
     - sound: off until opted in; PM.sound.stems({...}) + PM.sound.mix(fn) on the shared stem player
     - keyboard: [data-fp] focus brings its moment into view
   Everything a page needs is on window.PM. See kit/KIT.md.
   ===================================================================================================== */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var rmPref = q.get('rm') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.className = (document.documentElement.className + ' js ' + (rmPref ? 'rm' : 'fx')).trim();
  // missing assets fail quietly: phone file -> desktop file, data-alt chain, then the placeholder shows the expected name
  document.addEventListener('error', function (e) {
    var t = e.target; if (!t || t.tagName !== 'IMG') return;
    var pic = t.parentNode;
    if (pic && pic.tagName === 'PICTURE' && !t.dataset.fbm) {
      var s = pic.querySelector('source');
      if (s && /-m[.-]/.test(t.currentSrc || '')) {
        if (s.dataset.next) { var n = s.dataset.next.split('|'); s.srcset = n.shift(); if (n.length) s.dataset.next = n.join('|'); else delete s.dataset.next; return; }
        t.dataset.fbm = '1'; s.parentNode.removeChild(s); return;
      }
    }
    if (t.dataset.alt) { var a = t.dataset.alt.split('|'); t.src = a.shift(); if (a.length) t.dataset.alt = a.join('|'); else delete t.dataset.alt; return; }
    t.classList.add('is-missing');
    var f = t.closest('.frame'); if (f && t.dataset.role === 'bg') f.classList.add('is-ph');
  }, true);
})();

window.PM = (() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const dwell = (x, d) => clamp(x + d * Math.sin(x * 6.2832) / 6.2832); // settles mid-scene, moves quicker at the edges
  const Q = new URLSearchParams(location.search);
  const root = document.documentElement;
  const RM = root.classList.contains('rm'), FX = !RM;
  const MQ = matchMedia('(max-width:719.98px)');
  const hooks = { frame: [], measure: [] }, TLB = {}, TL = {};
  const PM = { $, $$, clamp, lerp, sm, dwell, Q, RM, FX, MQ, get mobile() { return MQ.matches; } };

  /* ================= LIBRARIES: GSAP and the menu load on their own, nothing critical waits for them ================= */
  const KIT = JS_BASE; // the folder of this bundle: vendor/gsap is loaded relative to it
  PM.kit = KIT;
  const addScript = (src, onerror) => { const el = document.createElement('script'); el.src = src; el.async = true; if (onerror) el.onerror = onerror; document.head.appendChild(el); return el; };
  if (FX && !window.gsap && !document.querySelector('script[src*="gsap"]'))
    addScript(KIT + 'vendor/gsap-3.12.5.min.js');
  const ensureMenu = () => { if (!window.PMMenu && !document.getElementById('pm-menu') && document.querySelector('header.top')) MENU(); };

  /* ================= SOUND: the shared stem player (assets/audio, see AUDIO.md) =================
     Off until opted in. Stems are decoded only after that, nearest scene first; a missing file is silent.
     Loops play between 0.5 s and 0.5 s + L. One-shots duck the music. One low-pass on everything except the
     'under' bus while under water. Master +8 dB into a firm limiter (see MASTER_DB). */
  const DB = d => d <= -90 ? 0 : Math.pow(10, d / 20);
  // the stems are delivered quiet (ambience -26 to -32 LUFS, music -20): +8 dB lifts a scene to about -20 LUFS; the limiter catches the splash
  const MASTER_DB = 8;
  const SNDX = (() => {
    let ctx = null, on = false, loading = false, master, lp, duck, offT = 0, t0 = 0, STEMS = {};
    const bus = {}, buf = {}, loops = {}, want = {}, cues = {}, loadedAt = {}, fired = {};
  // scroll speed in screens per second: beds glide longer and passing moments are skipped when the visitor scrolls fast,
  // so a fast and a slow reader hear the same story instead of a pile-up of effects
  let spd = 0, sy = scrollY, st = performance.now();
  addEventListener('scroll', () => { const t = performance.now(), dt = Math.max(16, t - st) / 1000; spd = spd * .6 + (Math.abs(scrollY - sy) / innerHeight / dt) * .4; sy = scrollY; st = t; }, { passive: true });
  const speed = () => spd * Math.exp(-(performance.now() - st) / 250);
  const lastShot = {}, pend = {};
  // a moment skipped at speed still plays if the visitor settles within 1.2 s (only the latest one, so they never pile up)
  function flush() { if (speed() > .8) return; let r = null; for (const k in pend) if (!r || pend[k].at > pend[r].at) r = k; if (!r) return; const q = pend[r]; for (const k in pend) delete pend[k]; if (performance.now() < q.until) shot(r, q.o); }
  // a short outdoor space for the effects (generated, no file): stereo noise with a 0.9 s fall, dark, so close-miked takes sit in the scene
  function space(c) {
    const n = Math.round(c.sampleRate * .9), ir = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lpS = 0; for (let i = 0; i < n; i++) { lpS = lpS * .82 + (Math.random() * 2 - 1) * .18; d[i] = lpS * Math.pow(1 - i / n, 3.2); } }
    const cv = c.createConvolver(); cv.buffer = ir; return cv;
  }
    function init() {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC();
      const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .18; lim.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = 0; master.connect(lim);
      lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = .5; lp.connect(master);
      duck = ctx.createGain(); duck.connect(lp);
      bus.music = ctx.createGain(); bus.music.connect(duck);
      bus.bed = ctx.createGain(); bus.bed.connect(lp);
      bus.fx = ctx.createGain();
    const fxTone = ctx.createBiquadFilter(); fxTone.type = 'highshelf'; fxTone.frequency.value = 7500; fxTone.gain.value = -4; bus.fx.connect(fxTone); fxTone.connect(lp);
    const rv = space(ctx), rvG = ctx.createGain(); rvG.gain.value = .14; bus.fx.connect(rv); rv.connect(rvG); rvG.connect(lp);
      bus.under = ctx.createGain(); bus.under.connect(master);
      return true;
    }
    async function loadAll(near) {
      if (loading) return; loading = true; t0 = performance.now();
      const roles = Object.keys(STEMS).sort((a, b) => Math.abs(STEMS[a][3] - near) - Math.abs(STEMS[b][3] - near) || STEMS[a][3] - STEMS[b][3]);
      for (const role of roles) {
        try {
          const r = await fetch('assets/audio/' + role + '.m4a'); if (!r.ok) continue;
          buf[role] = await ctx.decodeAudioData(await r.arrayBuffer());
          loadedAt[role] = Math.round(performance.now() - t0);
          if (STEMS[role][1] && want[role] > 0) startLoop(role);
        } catch (_) {}
      }
    }
    function startLoop(role) {
      if (loops[role] || !buf[role]) return;
      const L = STEMS[role][1], b = buf[role];
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = .5; src.loopEnd = Math.min(b.duration, .5 + L);
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(bus[STEMS[role][0]]);
      src.start(ctx.currentTime + .03, STEMS[role][4] ? .5 : .5 + Math.random() * L);
      loops[role] = { src, g, cur: -1 };
    }
    function level(role, v, tc) { flush();
      v = Math.max(0, v || 0); want[role] = v;
      if (!ctx || !buf[role] || !STEMS[role]) return;
      if (v > .0005 && !loops[role]) startLoop(role);
      const Lp = loops[role]; if (!Lp || Math.abs(Lp.cur - v) < .0005) return; Lp.cur = v;
      Lp.g.gain.setTargetAtTime(v * DB(STEMS[role][2]), ctx.currentTime, (tc || .35) * (1 + Math.min(3, speed() * 1.5)));
    }
    function shot(role, o) {
      if (!on || !ctx || !buf[role]) return false; o = o || {};
      const t = ctx.currentTime + Math.max(0, ((o.at || performance.now()) - performance.now()) / 1000);
    if (!o.at && !o.always && speed() > 1.6) { pend[role] = { o, at: performance.now(), until: performance.now() + 1200 }; return false; }
    const nowS = performance.now(); if (!o.always && nowS - (lastShot[role] || -1e9) < 800) return false; lastShot[role] = nowS;
      const src = ctx.createBufferSource(); src.buffer = buf[role];
      const g = ctx.createGain(); g.gain.value = DB(STEMS[role][2] + (o.db || 0));
      src.playbackRate.value = 1 + (Math.random() - .5) * .05; src.connect(g); g.connect(bus[STEMS[role][0]]); src.start(t); fired[role] = (fired[role] || 0) + 1;
      if (STEMS[role][0] !== 'music' && !o.noDuck) { duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(.7, t, .08); duck.gain.setTargetAtTime(1, t + Math.min(1.6, buf[role].duration * .7), .5); }
      return true;
    }
    function cue(role, play, fade) {
      if (!ctx || !buf[role]) return;
      const c = cues[role];
      if (play && !c) {
        const src = ctx.createBufferSource(); src.buffer = buf[role];
        const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(DB(STEMS[role][2]), ctx.currentTime, .4);
        src.connect(g); g.connect(bus.music); src.start();
        cues[role] = { src, g }; src.onended = () => { if (cues[role] && cues[role].src === src) cues[role].done = true; };
        fired[role] = (fired[role] || 0) + 1;
      } else if (!play && c && !c.stopping && !c.done) {
        c.stopping = true; c.g.gain.setTargetAtTime(0, ctx.currentTime, fade || .8);
        setTimeout(() => { try { c.src.stop(); } catch (_) {} if (cues[role] === c) delete cues[role]; }, (fade || .8) * 5000);
      } else if (!play && c && c.done) delete cues[role];
    }
    return {
      get on() { return on; },
      stems(s) { STEMS = s || {}; },
      set(v, near) {
        if (v && !ctx && !init()) return false;
        on = v; if (!ctx) return true; clearTimeout(offT);
        if (v) { ctx.resume(); master.gain.setTargetAtTime(DB(MASTER_DB), ctx.currentTime, .6); loadAll(near || 1); }
        else { master.gain.setTargetAtTime(0, ctx.currentTime, .15); offT = setTimeout(() => { if (!on) ctx.suspend(); }, 900); }
        return true;
      },
      suspend(h) {
        if (!ctx) return;
        if (h) { master.gain.setTargetAtTime(0, ctx.currentTime, .08); setTimeout(() => { if (document.hidden) ctx.suspend(); }, 400); }
        else if (on) { ctx.resume(); master.gain.setTargetAtTime(DB(MASTER_DB), ctx.currentTime, .5); }
      },
      level, shot, cue,
      filter(hz) { if (ctx) lp.frequency.setTargetAtTime(hz, ctx.currentTime, .12); },
      debug: () => ({ on, state: ctx ? ctx.state : 'none', loaded: Object.keys(buf).length, loadedAt, live: Object.fromEntries(Object.entries(loops).map(([k, v]) => [k, +v.cur.toFixed(3)])), cues: Object.keys(cues), fired: { ...fired } })
    };
  })();
  let mixFn = null;
  PM.sound = {
    // stems: { role: [bus 'bed'|'music'|'fx'|'under', loop length L in s (0 = one-shot), mix dB, scene number for load order, startAtLoopPoint] }
    stems: s => SNDX.stems(s), mix: fn => { mixFn = fn; },
    level: SNDX.level, shot: SNDX.shot, cue: SNDX.cue, filter: SNDX.filter, get on() { return SNDX.on; }, set: (v, n) => SNDX.set(v, n)
  };
  if (Q.get('audiodebug') === '1') window.__snd = SNDX.debug;

  /* ================= SCENES ================= */
  let SC = [], SI = {}, CUES = [], CLIPS = [], vh = innerHeight, maxY = 1, IDLE = false;
  // idle prefetch of the NEXT scene's clip only: after the first scroll and 2.5 s after load, never on Save-Data or a 2g/3g link
  const slowNet = () => { const c = navigator.connection; return !!c && (!!c.saveData || /2g|3g/.test(c.effectiveType || '')); };
  let loadedIdle = false, scrolledOnce = false;
  const idleCheck = () => { IDLE = loadedIdle && scrolledOnce && !slowNet(); };
  addEventListener('load', () => setTimeout(() => { loadedIdle = true; idleCheck(); }, 2500));
  addEventListener('scroll', () => { if (!scrolledOnce) { scrolledOnce = true; idleCheck(); } }, { passive: true });
  function measure() {
    vh = innerHeight;
    maxY = Math.max(1, document.documentElement.scrollHeight - vh);
    SC.forEach((s, i) => { s.top = s.el.offsetTop; s.end = s.top + s.el.offsetHeight; s.len = Math.max(1, s.el.offsetHeight - (i === SC.length - 1 && !s.el.nextElementSibling ? vh : 0)); s.tp = -2; });
    SC.forEach((s, i) => { s.afterFlow = i > 0 && s.top - SC[i - 1].end > 1; }); // a reading section sits between this scene and the last
    measureHeader();
    hooks.measure.forEach(f => f());
  }
  const P = (id, y = scrollY) => { const s = SI[id]; return s ? (y - s.top) / s.len : 0; };
  function updateCues(y) {
    for (const c of CUES) {
      const p = (y - c.sc.top) / c.sc.len;
      let o = c.a < 0 ? 1 : sm(c.a, c.a + c.r, p);
      if (c.b < 1.5) o *= 1 - sm(c.b - c.r, c.b, p);
      o = Math.round(o * 1000) / 1000;
      if (o === c.o) continue;
      c.o = o; c.el.style.opacity = o;
      c.el.style.transform = o < 1 ? `translate3d(0,${((1 - o) * 12).toFixed(1)}px,0)` : 'none';
      c.el.classList.toggle('is-live', o > .5);
    }
  }
  /* ================= HEADER over light grounds ================= */
  // light scenes switch the lock-up to navy; light reading sections also get a soft blur and a tint of their own ground
  // behind the header (set --tint on a section to match it), so copy never runs under the logo unbacked
  let HL = [], headH = 72, sceneLight = false, headLast = '';
  const HEAD_TINT = 'rgba(244,239,232,.78)', HEAD_TINT_DARK = 'rgba(6,8,12,.7)';
  const LIGHT_SEL = '.flow--cream,[data-theme="light"]';
  function measureHeader() {
    const top = $('header.top'); headH = top ? top.offsetHeight : 72;
    // every reading section gets a backing as it passes under the header; light ones also switch the lock-up to navy
    const sel = '.flow,.bleed[data-theme="light"],.foot[data-theme="light"]' + (FX ? '' : ',.scene[data-theme="light"]');
    HL = $$(sel).map(el => { const r = el.getBoundingClientRect(), light = el.matches(LIGHT_SEL); return { el, light, top: r.top + scrollY, bot: r.bottom + scrollY, tint: getComputedStyle(el).getPropertyValue('--tint').trim() || (light ? HEAD_TINT : HEAD_TINT_DARK) }; });
  }
  function updateHeader(y) {
    const line = y + headH * .5;
    let hit = null; for (const h of HL) if (h.top <= line && h.bot > line) { hit = h; break; }
    const light = sceneLight || !!(hit && hit.light);
    const key = (light ? 'L' : 'D') + (hit ? hit.tint : '');
    if (key === headLast) return; headLast = key;
    root.classList.toggle('theme-light', light);
    root.classList.toggle('head-backed', !!hit);
    if (hit) root.style.setProperty('--head-tint', hit.tint);
  }

  function updateStages(y) {
    let k = 0; SC.forEach((s, i) => { if (y >= s.top - 1) k = i; });
    const kp = (y - SC[k].top) / SC[k].len, covered = kp >= SC[k].enter;
    // a reading section (or several) between scene k and the next: once it covers the top of the screen, whatever shows
    // below it as it scrolls away is the NEXT scene, never the one already read
    const n = SC[k + 1], ahead = !!n && n.top - SC[k].end > 1 && y >= SC[k].end - 1 && y < n.top - 1;
    SC.forEach((s, i) => {
      const far = i < k - 1 || i > k + 1;
      let off = i < k - 1 || (i === k - 1 && (covered || SC[k].afterFlow)) || i === k + 1;
      if (ahead) off = i !== k + 1;
      if (far !== s.far) { s.far = far; s.stage.classList.toggle('is-far', far); s.stage.classList.toggle('is-near', !far); }
      if (!far && (i <= k || kp > .2 || (IDLE && i === k + 1))) CLIPS.forEach(c => c.scene === s.id && (!c.lazy || scrolledOnce) && c.load());
      if (off !== s.off) { s.off = off; s.stage.classList.toggle('is-off', off); }
    });
    // header: navy lock-up on light scenes once they have covered the one beneath
    sceneLight = !ahead && SC[k].el.dataset.theme === 'light' && covered && y < SC[k].end;
    PM.k = k; PM.kp = kp;
    return k;
  }

  /* ================= SCRUB CLIP: poster first, clip fetched as a blob once near, playhead walks to the scroll ================= */
  function Clip(v) {
    this.v = v; this.scene = v.closest('.scene').id; this.poster = v.parentNode.querySelector('.poster');
    this.ready = false; this.t = 0; this.seeking = false; this.loading = false; this.shown = false; this.dur = 0;
    this.lazy = v.dataset.load === 'scroll'; // data-load="scroll": not part of the first view, fetched on the visitor's first scroll
    v.addEventListener('seeked', () => { this.seeking = false; if (!this.shown) { this.shown = true; v.classList.add('is-shown'); } });
    v.addEventListener('loadedmetadata', () => { this.dur = v.duration || 0; this.ready = this.dur > 0; this.seek(Math.max(.001, this.t)); });
  }
  Clip.prototype.load = async function () {
    if (this.loading || RM) return; this.loading = true;
    if (MQ.matches && this.v.dataset.m === 'still') return; // the phone keeps its own still with a slow push
    if (this.v.dataset.alpha && !ALPHA_OK) return;          // keyed WebM: the PNG poster carries it where alpha video is not supported
    const L = x => (x || '').split('|').filter(Boolean);
    const srcs = MQ.matches && this.v.dataset.srcM ? (this.v.dataset.mOnly ? L(this.v.dataset.srcM) : L(this.v.dataset.srcM).concat(L(this.v.dataset.src))) : L(this.v.dataset.src);
    for (const s of srcs) {
      try { const r = await fetch(s); if (!r.ok) continue; const b = await r.blob(); if (!b.size) continue; this.v.src = URL.createObjectURL(b); this.v.load(); return; }
      catch (_) { if (location.protocol === 'file:') { this.v.src = s; this.v.load(); return; } }
    }
    useStill(this.poster);
  };
  Clip.prototype.seek = function (t) { if (!this.ready || this.seeking) return; if (Math.abs(this.v.currentTime - t) < .008) return; this.seeking = true; try { this.v.currentTime = t; } catch (_) { this.seeking = false; } };
  Clip.prototype.update = function (frac, instant) {
    frac = clamp(frac);
    if (!this.ready) { if (this.poster) this.poster.style.transform = `scale(${(1.02 + .1 * frac).toFixed(4)}) translate3d(0,${(-1.5 * frac).toFixed(2)}%,0)`; return; }
    if (this.poster && this.poster.style.transform) this.poster.style.transform = '';
    const tgt = frac * Math.max(0, this.dur - .04);
    if (instant) this.t = tgt; else { this.t += (tgt - this.t) * .2; if (Math.abs(tgt - this.t) < .01) this.t = tgt; }
    this.seek(this.t);
  };
  // reduced motion and missing clips: a poster with data-still swaps to its still (for example the opened shell)
  function useStill(pic) {
    const img = pic && pic.querySelector('img[data-still]'); if (!img) return;
    const src = pic.querySelector('source'); if (src && img.dataset.stillM) src.srcset = img.dataset.stillM;
    img.removeAttribute('data-alt'); img.src = img.dataset.still;
  }

  /* ================= TIMELINES: positions are authored in scene progress (0 to 1) ================= */
  let tlBuilt = false;
  const buildOne = id => { const T = () => gsap.timeline({ paused: true, defaults: { ease: 'none', duration: 1 } }); try { TL[id] = TLB[id](gsap, T); } catch (e) { console.error(e); } if (SI[id]) SI[id].tp = -2; };
  PM.timeline = (id, build) => { TLB[id] = build; if (tlBuilt) buildOne(id); };
  // timelines are motion only: until GSAP has loaded the page simply holds its resting state
  function buildTimelines() {
    if (!FX || !window.gsap) return false;
    for (const id in TLB) buildOne(id);
    tlBuilt = true; root.classList.remove('no-tl');
    return true;
  }
  function updateTimelines(y) {
    for (const s of SC) { const tl = TL[s.id]; if (!tl) continue; const p = clamp((y - s.top) / s.len); if (p === s.tp) continue; s.tp = p; tl.time(p); }
  }

  /* ================= SOUND TOGGLE (header .tgl#soundTgl and any [data-sound-toggle]) ================= */
  function syncSoundUI() {
    const on = SNDX.on;
    $$('#soundTgl,[data-sound-toggle]').forEach(b => b.setAttribute('aria-pressed', on));
    const st = $('#soundState'); if (st) st.textContent = on ? 'Sound on' : 'Sound off';
    $$('[data-sound-label]').forEach(e => e.textContent = on ? 'Sound is on' : 'Turn on sound');
  }
  function toggleSound() { SNDX.set(!SNDX.on, (PM.k || 0) + 1); syncSoundUI(); }

  /* ================= PLATE SCENES: keyframed layers over a clean plate ================= */
  // data-kf='{"0":{"y":8,"scale":.9,"opacity":0,"blur":6},"0.4":{"y":0,"scale":1,"opacity":1,"blur":0},"1":{"y":-4}}'
  // missing values carry over from the previous stop; stops ease into each other (smoothstep)
  const KF_KEYS = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1, blur: 0 };
  function parseKF(str) {
    if (!str) return null;
    // .6 is accepted as well as 0.6
    let o; try { o = JSON.parse(str.replace(/([:\[,]\s*-?)\.(\d)/g, '$10.$2')); } catch (e) { console.error('data-kf is not valid JSON', str); return null; }
    const stops = Object.keys(o).map(Number).sort((a, b) => a - b).map(t => ({ t, v: o[String(t)] || o[t] }));
    let cur = { ...KF_KEYS }; stops.forEach(s => { cur = { ...cur, ...s.v }; s.v = cur; });
    return stops;
  }
  function kfAt(stops, p) {
    if (p <= stops[0].t) return stops[0].v;
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      if (p <= b.t) { const k = sm(a.t, b.t, p), v = {}; for (const key in KF_KEYS) v[key] = lerp(a.v[key], b.v[key], k); return v; }
    }
    return stops[stops.length - 1].v;
  }
  let KFS = [];
  function applyKF(L, p) {
    const stops = (MQ.matches && L.m) || L.d; if (!stops) return;
    const v = kfAt(stops, p), key = v.x.toFixed(2) + v.y.toFixed(2) + v.scale.toFixed(3) + v.rot.toFixed(2) + v.opacity.toFixed(3) + v.blur.toFixed(1);
    if (key === L.last) return; L.last = key;
    L.el.style.transform = `translate3d(${v.x.toFixed(2)}vw,${v.y.toFixed(2)}vh,0) scale(${v.scale.toFixed(4)}) rotate(${v.rot.toFixed(2)}deg)`;
    L.el.style.opacity = v.opacity.toFixed(3);
    L.el.style.filter = v.blur > .05 ? `blur(${v.blur.toFixed(1)}px)` : '';
  }
  function bootPlates() {
    KFS = $$('[data-kf]').map(el => ({ el, sc: el.closest('.scene') && el.closest('.scene').id, d: parseKF(el.dataset.kf), m: parseKF(el.dataset.kfM), rmAt: el.dataset.rmAt != null ? +el.dataset.rmAt : 1, last: '' })).filter(L => L.d);
    if (RM || !FX) KFS.forEach(L => applyKF(L, L.rmAt));   // a static composite
  }
  function updatePlates(y) {
    for (const L of KFS) { const s = SI[L.sc]; if (!s || s.far) continue; applyKF(L, clamp((y - s.top) / s.len)); }
  }
  // WebM with alpha only where the browser composites it (not Safari); elsewhere the PNG poster stays
  const ALPHA_OK = (() => { const v = document.createElement('video'); return !!v.canPlayType && v.canPlayType('video/webm; codecs="vp09.00.10.08"') !== '' && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent); })();

  /* ================= CONTENT: reveals and inline loops ================= */
  function bootContent() {
    const rev = $$('[data-reveal]');
    if (FX && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px', threshold: .12 });
      rev.forEach(el => io.observe(el));
    } else rev.forEach(el => el.classList.add('is-in'));
    // inline loops: muted, playsinline, play only while on screen, a pause control; reduced motion keeps the poster
    $$('.loop').forEach(fig => {
      const v = $('video', fig), btn = $('.loop__ctl', fig); if (!v) return;
      v.muted = true; v.playsInline = true; v.loop = true;
      if (RM) { v.removeAttribute('autoplay'); v.preload = 'none'; v.pause(); return; }
      let wantPlay = true, seen = false;
      const sync = () => { fig.classList.toggle('is-paused', !wantPlay); if (btn) { btn.setAttribute('aria-pressed', String(!wantPlay)); btn.querySelector('.t').textContent = wantPlay ? 'Pause' : 'Play'; } };
      const run = () => { if (wantPlay && seen) { const p = v.play(); if (p) p.catch(() => {}); } else v.pause(); };
      if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { seen = e.isIntersecting; run(); }), { threshold: .25 }).observe(fig); else { seen = true; run(); }
      if (btn) btn.addEventListener('click', () => { wantPlay = !wantPlay; sync(); run(); });
      sync();
    });
  }

  /* ================= LOOP ================= */
  let lastT = performance.now(), running = true, sndT = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    const y = scrollY;
    if (FX && !tlBuilt && window.gsap) buildTimelines();
    if (FX && SC.length) {
      updateStages(y); updateTimelines(y); updateCues(y); updatePlates(y);
      for (const c of CLIPS) {
        if (c.custom) continue;
        const s = SI[c.scene]; if (s.far) continue;
        c.update(dwell(clamp((y - s.top) / s.len), +(s.el.dataset.dwell || .3)));
      }
    }
    updateHeader(y);
    hooks.frame.forEach(f => f(now, dt, y));
    if (mixFn && SNDX.on && now - sndT > 60) { sndT = now; mixFn(y, P); }
  }

  /* ================= BOOT ================= */
  PM.onFrame = fn => hooks.frame.push(fn);
  PM.onMeasure = fn => hooks.measure.push(fn);
  PM.P = P; PM.measure = () => measure();
  PM.clip = id => CLIPS.filter(c => c.scene === id);
  function boot() {
    SC = $$('.scene').map((el, i) => ({ id: el.id || ('scene' + i), el, i, stage: $('.stage', el), top: 0, len: 1, tp: -2, far: null, off: null, enter: +(el.dataset.enter || (i ? .12 : 0)) }));
    SC.forEach(s => { if (!s.el.id) s.el.id = s.id; if (s.stage) s.stage.style.setProperty('--z', s.i + 1); });
    SI = {}; SC.forEach(s => SI[s.id] = s); PM.scenes = SC; PM.SI = SI;
    CUES = $$('[data-cue]').map(el => {
      const sc = el.dataset.scene ? SI[el.dataset.scene] : el.closest('.scene') && SI[el.closest('.scene').id];
      if (!sc) return null;
      const [a, b, r] = el.dataset.cue.split(' ').map(Number);
      return { el, sc, a, b, r: r || .035, o: -1 };
    }).filter(Boolean);
    CLIPS = $$('video.scrub').map(v => new Clip(v));
    if (RM) $$('img[data-still]').forEach(i => useStill(i.parentNode));
    measure();
    bootContent(); bootPlates();
    if (FX && !buildTimelines()) root.classList.add('no-tl');
    $$('#soundTgl,[data-sound-toggle]').forEach(b => b.addEventListener('click', toggleSound));
    syncSoundUI();
    // keyboard focus brings its moment into view
    document.addEventListener('focusin', e => {
      if (!FX) return;
      const host = e.target.closest && e.target.closest('[data-fp]'); if (!host) return;
      const sc = host.dataset.fpScene ? SI[host.dataset.fpScene] : host.closest('.scene') && SI[host.closest('.scene').id]; if (!sc) return;
      const target = sc.top + parseFloat(host.dataset.fp) * sc.len;
      if (Math.abs(target - scrollY) > vh * .25) scrollTo({ top: Math.min(target, maxY), behavior: 'auto' });
    });
    if (Q.get('s') && SI[Q.get('s')]) { const s = SI[Q.get('s')]; scrollTo(0, Math.min(maxY, s.top + parseFloat(Q.get('p') || 0) * s.len)); } // test hook: ?s=scene&p=.3
    if (FX && SC.length) { const y = scrollY; updateStages(y); updateTimelines(y); updateCues(y); updatePlates(y); }
    updateHeader(scrollY);
    requestAnimationFrame(frame);
  }
  let rz = 0, lastW = innerWidth, lastH = innerHeight;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140 && matchMedia('(pointer:coarse)').matches) return; lastW = innerWidth; lastH = innerHeight; measure(); }, 120); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; SNDX.suspend(true); }
    else { running = true; lastT = performance.now(); SNDX.suspend(false); requestAnimationFrame(frame); }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => measure());
  addEventListener('load', () => measure());
  // boot as soon as the document is parsed: readyState "interactive" comes before deferred scripts (a slow CDN) have run
  let booted = false;
  const go = () => { if (booted || document.readyState === 'loading') return; booted = true; ensureMenu(); boot(); };
  if (document.readyState === 'loading') { document.addEventListener('readystatechange', go); document.addEventListener('DOMContentLoaded', go); } else setTimeout(go);
  return PM;
})();
  }

  /* ================= MENU: the site menu (started by SITE, or after the page code on index) ================= */
  function MENU() {
/* Pearl Museum site menu. One list of pages for the whole site: edit PAGES here only.
   Adds a "Menu" button to the header (into .top__end, or after the last header child) and a full-screen overlay:
   role=dialog with aria-modal, focus moves in and is kept inside, Escape or Close returns focus to the button. */
(() => {
  const PAGES = [
    ['index.html', 'Home'],
    ['about.html', 'Sultan Ali Al-Owais'],
    ['history.html', 'Our History'],
    ['collection.html', 'The Collection'],
    ['merchants.html', 'Captains and Merchants'],
    ['coinage.html', 'Coinage'],
    ['visit.html', 'Visit Us']
  ];
  const VISIT = 'visit.html';
  const base = JS_BASE;
  function init() {
    const top = document.querySelector('header.top'); if (!top || document.getElementById('pm-menu')) return;
    let end = top.querySelector('.top__end');
    if (!end) { end = document.createElement('div'); end.className = 'top__end'; const last = top.querySelector('.tgl'); if (last) { last.replaceWith(end); end.appendChild(last); } else top.appendChild(end); }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'menu-btn'; btn.id = 'pmMenuBtn';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'pm-menu'); btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML = '<span class="menu-btn__i" aria-hidden="true"></span><span>Menu</span>';
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    // "Plan your visit" always in the header bar, before Menu; marked current on the Visit page itself
    const visit = document.createElement('a');
    visit.className = 'top-visit'; visit.href = VISIT; visit.setAttribute('aria-label', 'Plan your visit');
    visit.innerHTML = '<span class="top-visit__l">Plan your visit</span><span class="top-visit__s" aria-hidden="true">Visit</span>';
    if (here === VISIT) visit.setAttribute('aria-current', 'page');
    end.appendChild(visit);
    end.appendChild(btn);
    const ov = document.createElement('div');
    ov.className = 'pm-menu'; ov.id = 'pm-menu';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Site menu'); ov.hidden = true;
    ov.innerHTML = `
      <div class="pm-menu__bar">
        <a class="pm-menu__mark" href="index.html" aria-label="Emirates NBD Pearl Museum, home"><img src="${base}../images/logo-enbd-white.svg" alt="" width="110" height="30"><span class="div" aria-hidden="true"></span><span class="t" aria-hidden="true">Pearl Museum</span></a>
        <button type="button" class="pm-menu__close"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg><span>Close</span></button>
      </div>
      <nav class="pm-menu__body" aria-label="Site">
        <ol class="pm-menu__list">${PAGES.map(([href, name], i) => `<li><a href="${href}"${href === here ? ' aria-current="page"' : ''}><span class="n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span>${name}</span></a></li>`).join('')}</ol>
        <div class="pm-menu__foot">
          <a class="pm-visit" href="${VISIT}">Plan your visit <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
          <span>Emirates NBD HQ, Dubai Creek, Deira. By appointment.</span>
        </div>
      </nav>`;
    document.body.appendChild(ov);
    const close = ov.querySelector('.pm-menu__close');
    const focusables = () => Array.from(ov.querySelectorAll('a[href],button')).filter(e => e.offsetParent !== null);
    function open() {
      ov.hidden = false; requestAnimationFrame(() => ov.classList.add('is-open'));
      document.documentElement.classList.add('pm-menu-open');
      btn.setAttribute('aria-expanded', 'true');
      document.querySelectorAll('body > *:not(#pm-menu):not(script)').forEach(el => { if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); el.dataset.pmInert = '1'; } });
      const cur = ov.querySelector('[aria-current="page"]') || ov.querySelector('.pm-menu__list a');
      setTimeout(() => cur.focus(), 30);
      document.dispatchEvent(new CustomEvent('pm:menu', { detail: { open: true } }));
    }
    function shut() {
      ov.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('pm-menu-open');
      document.querySelectorAll('[data-pm-inert]').forEach(el => { el.removeAttribute('inert'); delete el.dataset.pmInert; });
      setTimeout(() => { if (!ov.classList.contains('is-open')) ov.hidden = true; }, 360);
      btn.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('pm:menu', { detail: { open: false } }));
    }
    btn.addEventListener('click', () => ov.classList.contains('is-open') ? shut() : open());
    close.addEventListener('click', shut);
    ov.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); shut(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    // a link to this same page (or a #hash on it) simply closes the menu
    ov.querySelectorAll('.pm-menu__list a').forEach(a => a.addEventListener('click', () => { if (a.getAttribute('aria-current') === 'page') shut(); }));
    window.PMMenu = { open, close: shut, pages: PAGES };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
  }

  /* ================= HEAD.index: runs in <head> ================= */
  HEAD.index = function () {
  (function(){
    var q = new URLSearchParams(location.search);
    var rm = q.get('rm') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.documentElement.className = 'js ' + (rm ? 'rm' : 'fx');
    // missing assets: the phone file falls back to the desktop one, the poster to the still, then the gradient placeholder shows
    document.addEventListener('error', function(e){
      var t = e.target;
      if (!t || t.tagName !== 'IMG') return;
      var pic = t.parentNode;
      if (pic && pic.tagName === 'PICTURE' && !t.dataset.fbm) {
        var s = pic.querySelector('source');
        if (s && /-m[.-]/.test(t.currentSrc || '')) {
          if (s.dataset.next) { var n = s.dataset.next.split('|'); s.srcset = n.shift(); if (n.length) s.dataset.next = n.join('|'); else delete s.dataset.next; return; }
          t.dataset.fbm = '1'; s.parentNode.removeChild(s); return;
        }
      }
      if (t.dataset.standin && !t.dataset.sti) { t.dataset.sti = '1'; if (pic && pic.querySelector('source')) pic.querySelector('source').srcset = 'assets/images/s1-arrival-m.jpg'; t.src = 'assets/images/s1-arrival.jpg'; t.classList.add('is-standin'); var fr = t.closest('.frame'); if (fr) fr.classList.add('is-ph'); return; }
      if (t.dataset.alt) { var a = t.dataset.alt.split('|'); t.src = a.shift(); if (a.length) t.dataset.alt = a.join('|'); else delete t.dataset.alt; return; }
      t.classList.add('is-missing');
      var f = t.closest('.frame');
      if (f && t.dataset.role === 'bg') f.classList.add('is-ph');
      var sp = t.closest('.st-plane'); if (sp) sp.classList.add('is-ph');
    }, true);
  })();
  };

  /* ================= PAGE.index: runs when index.html is parsed ================= */
  PAGE.index = function () {
(() => {
'use strict';
/* ================= UTIL ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const dwell = (x, d) => clamp(x + d * Math.sin(x * 6.2832) / 6.2832); // settles mid-scene, moves quicker at the edges
const Q = new URLSearchParams(location.search);
const root = document.documentElement;
const RM = root.classList.contains('rm');
const FX = !RM;
const MQ = matchMedia('(max-width:719.98px)');
let MOBILE = MQ.matches;

/* ================= SOUND: produced stems (assets/audio, see AUDIO.md) =================
   Off until the visitor turns it on. Stems are fetched and decoded only then, nearest scene first; a missing file is silent.
   Loops play from Web Audio buffers between 0.5 s and 0.5 s + L (each file carries 0.5 s of its own material either side).
   Beds and music crossfade with the scroll at AUDIO.md's suggested levels; one-shots fire on the story's events and duck
   the music; everything except the underwater world itself goes through one low-pass while we are under. Master -6 dB. */
const BEAT = 777, STEP = BEAT / 4; // the deck rhythm is about 77 BPM: 0.777 s per beat
const DB = d => d <= -90 ? 0 : Math.pow(10, d / 20);
const STEMS = {
  // role: [bus, loop length L in s (0 = one-shot), mix dB from AUDIO.md, scene index for load order]
  'amb-creek-today':     ['bed', 28, 0, 1], 'amb-creek-1949': ['bed', 28, 0, 1], 'music-drone-bed': ['music', 40, 0, 1],
  'amb-open-sea':        ['bed', 28, 0, 2], 'music-oud-sparse': ['music', 39, 0, 2],
  'amb-deck':            ['bed', 28, 0, 3], 'music-deck-rhythm': ['music', 33.568, 0, 3], 'sfx-rope-roller': ['fx', 0, 0, 3], 'sfx-inhale': ['fx', 0, 0, 3], 'sfx-sail-gust': ['fx', 0, -2, 3], 'music-nahham-voice': ['fx', 28.8, -2, 3],
  'sfx-splash-entry':    ['fx', 0, 0, 4], 'amb-underwater': ['under', 28, 0, 4], 'sfx-heartbeat': ['under', 0, 0, 4], 'sfx-heartbeat-loop': ['under', 5.19, -4, 4],
  'sfx-bubbles-nose':    ['under', 0, 0, 4], 'sfx-ascent-rush': ['under', 0, 0, 4], 'music-ascent-swell': ['music', 0, -6, 4],
  'sfx-surface-break':   ['fx', 0, 0, 4], 'sfx-gasp': ['fx', 0, 0, 4], 'sfx-redive-close': ['fx', 0, 0, 4],
  'amb-seabed':          ['under', 28, 0, 5], 'sfx-shell-lift': ['under', 0, 0, 5],
  'amb-dawn-deck':       ['bed', 28, 0, 6], 'sfx-shell-open': ['fx', 0, 0, 6],
  'music-pearl-theme':   ['music', 0, 0, 7], 'music-end-resolve': ['music', 0, -3, 9]
};
// the stems are delivered quiet (ambience -26 to -32 LUFS, music -20): +8 dB lifts a scene to about -20 LUFS; the limiter catches the splash
const MASTER_DB = 8;
const SNDX = (() => {
  let ctx = null, on = false, loading = false, master, lp, duck, offT = 0, t0Load = 0;
  const bus = {}, buf = {}, loops = {}, want = {}, cues = {}, loadedAt = {}, fired = {};
// scroll speed in screens per second: beds glide longer and passing moments are skipped when the visitor scrolls fast,
// so a fast and a slow reader hear the same story instead of a pile-up of effects
let spd = 0, sy = scrollY, st = performance.now();
addEventListener('scroll', () => { const t = performance.now(), dt = Math.max(16, t - st) / 1000; spd = spd * .6 + (Math.abs(scrollY - sy) / innerHeight / dt) * .4; sy = scrollY; st = t; }, { passive: true });
const speed = () => spd * Math.exp(-(performance.now() - st) / 250);
const lastShot = {}, pend = {};
  // a moment skipped at speed still plays if the visitor settles within 1.2 s (only the latest one, so they never pile up)
  function flush() { if (speed() > .8) return; let r = null; for (const k in pend) if (!r || pend[k].at > pend[r].at) r = k; if (!r) return; const q = pend[r]; for (const k in pend) delete pend[k]; if (performance.now() < q.until) shot(r, q.o); }
// a short outdoor space for the effects (generated, no file): stereo noise with a 0.9 s fall, dark, so close-miked takes sit in the scene
function space(c) {
  const n = Math.round(c.sampleRate * .9), ir = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lpS = 0; for (let i = 0; i < n; i++) { lpS = lpS * .82 + (Math.random() * 2 - 1) * .18; d[i] = lpS * Math.pow(1 - i / n, 3.2); } }
  const cv = c.createConvolver(); cv.buffer = ir; return cv;
}
  function init() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .18; lim.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0; master.connect(lim);
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = .5; lp.connect(master);
    duck = ctx.createGain(); duck.connect(lp);
    bus.music = ctx.createGain(); bus.music.connect(duck);
    bus.bed = ctx.createGain(); bus.bed.connect(lp);
    bus.fx = ctx.createGain();
  const fxTone = ctx.createBiquadFilter(); fxTone.type = 'highshelf'; fxTone.frequency.value = 7500; fxTone.gain.value = -4; bus.fx.connect(fxTone); fxTone.connect(lp);
  const rv = space(ctx), rvG = ctx.createGain(); rvG.gain.value = .14; bus.fx.connect(rv); rv.connect(rvG); rvG.connect(lp);
    bus.under = ctx.createGain(); bus.under.connect(master); // the underwater world is heard as it is, not muffled again
    return true;
  }
  async function loadAll(near) {
    if (loading) return; loading = true; t0Load = performance.now();
    const roles = Object.keys(STEMS).sort((a, b) => Math.abs(STEMS[a][3] - near) - Math.abs(STEMS[b][3] - near) || STEMS[a][3] - STEMS[b][3]);
    for (const role of roles) {
      try {
        const r = await fetch('assets/audio/' + role + '.m4a'); if (!r.ok) continue;
        buf[role] = await ctx.decodeAudioData(await r.arrayBuffer());
        loadedAt[role] = Math.round(performance.now() - t0Load);
        if (STEMS[role][1] && want[role] > 0) startLoop(role);
      } catch (_) {}
    }
  }
  function startLoop(role) {
    if (loops[role] || !buf[role]) return;
    const L = STEMS[role][1], b = buf[role];
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    src.loopStart = .5; src.loopEnd = Math.min(b.duration, .5 + L);
    const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(bus[STEMS[role][0]]);
    // the deck rhythm starts on its loop point (just before a drum hit) so the cards can pulse with it; beds start anywhere inside
    const off = role === 'music-deck-rhythm' ? .5 : .5 + Math.random() * L;
    const at = ctx.currentTime + .03; src.start(at, off);
    loops[role] = { src, g, cur: -1, at, off };
    if (role === 'music-deck-rhythm' && SNDX.onBeatStart) SNDX.onBeatStart(performance.now() + 30);
  }
  function level(role, v, tc) { flush();
    v = Math.max(0, v || 0); want[role] = v;
    if (!ctx || !buf[role]) return;
    if (v > .0005 && !loops[role]) startLoop(role);
    const Lp = loops[role]; if (!Lp) return;
    if (Math.abs(Lp.cur - v) < .0005) return; Lp.cur = v;
    Lp.g.gain.setTargetAtTime(v * DB(STEMS[role][2]), ctx.currentTime, (tc || .35) * (1 + Math.min(3, speed() * 1.5)));
  }
  function duckFor(t, dur) { duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(.7, t, .08); duck.gain.setTargetAtTime(1, t + Math.min(1.6, dur * .7), .5); }
  function shot(role, o) {
    if (!on || !ctx || !buf[role]) return false;
    o = o || {};
    const t = ctx.currentTime + Math.max(0, ((o.at || performance.now()) - performance.now()) / 1000);
  if (!o.at && !o.always && speed() > 1.6) { pend[role] = { o, at: performance.now(), until: performance.now() + 1200 }; return false; }
  const nowS = performance.now(); if (!o.always && nowS - (lastShot[role] || -1e9) < 800) return false; lastShot[role] = nowS;
    const src = ctx.createBufferSource(); src.buffer = buf[role];
    const g = ctx.createGain(); g.gain.value = DB(STEMS[role][2] + (o.db || 0));
    src.playbackRate.value = 1 + (Math.random() - .5) * .05; src.connect(g); g.connect(bus[STEMS[role][0]]); src.start(t);
    fired[role] = (fired[role] || 0) + 1;
    if (STEMS[role][0] !== 'music' && !o.noDuck) duckFor(t, buf[role].duration);
    return true;
  }
  // a played-once music cue that can fade out if the visitor leaves
  function cue(role, play, fade) {
    if (!ctx || !buf[role]) return;
    const c = cues[role];
    if (play && !c) {
      const src = ctx.createBufferSource(); src.buffer = buf[role];
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(DB(STEMS[role][2]), ctx.currentTime, .4);
      src.connect(g); g.connect(bus.music); src.start();
      cues[role] = { src, g, end: performance.now() + buf[role].duration * 1000 };
      src.onended = () => { if (cues[role] && cues[role].src === src) cues[role].done = true; };
      fired[role] = (fired[role] || 0) + 1;
    } else if (!play && c && !c.stopping && !c.done) {
      c.stopping = true; c.g.gain.setTargetAtTime(0, ctx.currentTime, fade || .8);
      setTimeout(() => { try { c.src.stop(); } catch (_) {} if (cues[role] === c) delete cues[role]; }, (fade || .8) * 5000);
    } else if (!play && c && c.done) delete cues[role];
  }
  // seam check: the sample step across loopEnd -> loopStart against the typical step inside the loop
  function seams() {
    const out = {};
    for (const role in buf) {
      const L = STEMS[role][1]; if (!L) continue;
      const b = buf[role], sr = b.sampleRate, d = b.getChannelData(0), a = Math.round(.5 * sr), e = Math.min(d.length - 1, Math.round((.5 + L) * sr));
      let typ = 0; for (let i = a; i < a + sr; i++) typ += Math.abs(d[i + 1] - d[i]); typ /= sr;
      out[role] = { jump: +Math.abs(d[e] - d[a]).toFixed(4), typicalStep: +typ.toFixed(4), loopEnd: +(e / sr).toFixed(3), dur: +b.duration.toFixed(3) };
    }
    return out;
  }
  return {
    get on() { return on; },
    set(v, near) {
      if (v && !ctx && !init()) return false;
      on = v; if (!ctx) return true;
      clearTimeout(offT);
      if (v) { ctx.resume(); master.gain.setTargetAtTime(DB(MASTER_DB), ctx.currentTime, .6); loadAll(near || 1); }
      else { master.gain.setTargetAtTime(0, ctx.currentTime, .15); offT = setTimeout(() => { if (!on) ctx.suspend(); }, 900); }
      return true;
    },
    suspend(h) {
      if (!ctx) return;
      if (h) { master.gain.setTargetAtTime(0, ctx.currentTime, .08); setTimeout(() => { if (document.hidden) ctx.suspend(); }, 400); }
      else if (on) { ctx.resume(); master.gain.setTargetAtTime(DB(MASTER_DB), ctx.currentTime, .5); }
    },
    level, shot, cue,
    filter(hz) { if (ctx) lp.frequency.setTargetAtTime(hz, ctx.currentTime, .12); },
    has: role => !!buf[role],
    debug: () => ({ on, state: ctx ? ctx.state : 'none', master: master ? +master.gain.value.toFixed(3) : 0, lp: lp ? Math.round(lp.frequency.value) : 0, duck: duck ? +duck.gain.value.toFixed(2) : 1,
      loaded: Object.keys(buf).length, loadedAt, live: Object.fromEntries(Object.entries(loops).map(([k, v]) => [k, +v.cur.toFixed(3)])), cues: Object.keys(cues), fired: { ...fired }, seams: seams() })
  };
})();
const SND = SNDX;
if (Q.get('audiodebug') === '1') window.__snd = SNDX.debug; // read-only diagnostics

/* ================= SCENES ================= */
const SC = $$('.scene').map((el, i) => ({ id: el.id, el, i, stage: $('.stage', el), top: 0, len: 1, tp: -2, far: null, off: null }));
const SI = {}; SC.forEach(s => SI[s.id] = s);
// how far into its own scroll a scene must be before the scene beneath it is fully covered
const ENTER = { s1: 0, s2: .3, s3: .1, s4: .035, s5: .56, s6: .1, s7: .16, q: .14, s8: .16 };
let vh = innerHeight, maxY = 1, IDLE = false;
// idle prefetch of the NEXT scene's clip only: after the first scroll and 2.5 s after load, never on Save-Data or a 2g/3g link
const slowNet = () => { const c = navigator.connection; return !!c && (!!c.saveData || /2g|3g/.test(c.effectiveType || '')); };
let loadedIdle = false, scrolledOnce = false;
const idleCheck = () => { IDLE = loadedIdle && scrolledOnce && !slowNet(); };
addEventListener('load', () => setTimeout(() => { loadedIdle = true; idleCheck(); }, 2500));
addEventListener('scroll', () => { if (!scrolledOnce) { scrolledOnce = true; idleCheck(); } }, { passive: true });
function measure() {
  vh = innerHeight; MOBILE = MQ.matches;
  maxY = Math.max(1, document.documentElement.scrollHeight - vh);
  SC.forEach((s, i) => { s.top = s.el.offsetTop; s.len = Math.max(1, s.el.offsetHeight - (i === SC.length - 1 ? vh : 0)); s.tp = -2; });
  if (TL.q) { handoff(); TL.q.invalidate(); }
}
const P = (id, y) => { const s = SI[id]; return (y - s.top) / s.len; };

/* ================= CUES: opacity straight from the scroll position, no smoothing ================= */
const CUES = $$('[data-cue]').map(el => {
  const sc = el.dataset.scene ? SI[el.dataset.scene] : SI[el.closest('.scene').id];
  const [a, b, r] = el.dataset.cue.split(' ').map(Number);
  return { el, sc, a, b, r: r || .035, o: -1 };
});
function updateCues(y) {
  for (const c of CUES) {
    const p = (y - c.sc.top) / c.sc.len;
    let o = c.a < 0 ? 1 : sm(c.a, c.a + c.r, p);
    if (c.b < 1.5) o *= 1 - sm(c.b - c.r, c.b, p);
    o = Math.round(o * 1000) / 1000;
    if (o === c.o) continue;
    c.o = o;
    c.el.style.opacity = o;
    c.el.style.transform = o < 1 ? `translate3d(0,${((1 - o) * 12).toFixed(1)}px,0)` : 'none';
    c.el.classList.toggle('is-live', o > .5);
  }
}

/* ================= STAGES: near ones are rendered, the next one waits transparent ================= */
function updateStages(y) {
  let k = 0; SC.forEach((s, i) => { if (y >= s.top - 1) k = i; });
  const kp = (y - SC[k].top) / SC[k].len, covered = kp >= (ENTER[SC[k].id] || 0);
  SC.forEach((s, i) => {
    const far = i < k - 1 || i > k + 1;
    const off = i < k - 1 || (i === k - 1 && covered) || i === k + 1;
    if (far !== s.far) { s.far = far; s.stage.classList.toggle('is-far', far); s.stage.classList.toggle('is-near', !far); }
    // clips load for the scene you are in and the one behind it; the next one waits until you are under way (or the page is idle)
    if (!far && (i <= k || kp > .2 || (IDLE && i === k + 1))) CLIPS.forEach(c => c.scene === s.id && c.deck === undefined && c.load());
    if (!far && s.id === 's3') deckInit();
    if (off !== s.off) { s.off = off; s.stage.classList.toggle('is-off', off); }
  });
  return k;
}

/* ================= SCRUB SCENE: one component for every clip =================
   Poster first. The clip is fetched as a blob (so it seeks without range support) once its scene is near.
   Scroll writes a target, the playhead walks to it. If the clip is missing, the poster carries the move. */
function Clip(v) {
  this.v = v; this.scene = v.closest('.scene').id; this.poster = v.parentNode.querySelector('.poster');
  this.ready = false; this.t = 0; this.seeking = false; this.loading = false; this.shown = false; this.dur = 0;
  v.addEventListener('seeked', () => { this.seeking = false; if (!this.shown) { this.shown = true; v.classList.add('is-shown'); } });
  v.addEventListener('loadedmetadata', () => { this.dur = v.duration || 0; this.ready = this.dur > 0; this.seek(Math.max(.001, this.t)); });
}
Clip.prototype.load = async function () {
  if (this.loading || RM) return; this.loading = true;
  MOBILE = MQ.matches;
  if (MOBILE && this.v.dataset.m === 'still') return; // the phone keeps its own composition as a still with a slow push
  const L = x => (x || '').split('|').filter(Boolean);
  const srcs = MOBILE && this.v.dataset.srcM ? (this.v.dataset.mOnly ? L(this.v.dataset.srcM) : L(this.v.dataset.srcM).concat(L(this.v.dataset.src))) : L(this.v.dataset.src);
  for (const s of srcs) {
    try {
      const r = await fetch(s);
      if (!r.ok) continue;
      const b = await r.blob(); if (!b.size) continue;
      this.v.src = URL.createObjectURL(b); this.v.load(); return;
    } catch (_) { if (location.protocol === 'file:') { this.v.src = s; this.v.load(); return; } }
  }
  useStill(this.poster);
};
function useStill(pic) {
  const img = pic && pic.querySelector('img[data-still]'); if (!img) return;
  const src = pic.querySelector('source'); if (src) src.srcset = img.dataset.stillM;
  img.removeAttribute('data-alt'); img.src = img.dataset.still;
}
if (RM) $$('img[data-still]').forEach(i => useStill(i.parentNode));
Clip.prototype.seek = function (t) { if (!this.ready || this.seeking) return; if (Math.abs(this.v.currentTime - t) < .008) return; this.seeking = true; try { this.v.currentTime = t; } catch (_) { this.seeking = false; } };
Clip.prototype.update = function (frac, instant) {
  frac = clamp(frac);
  if (!this.ready) {
    if (this.poster) this.poster.style.transform = `scale(${(1.02 + .1 * frac).toFixed(4)}) translate3d(0,${(-1.5 * frac).toFixed(2)}%,0)`;
    return;
  }
  if (this.poster && this.poster.style.transform) this.poster.style.transform = '';
  const tgt = frac * Math.max(0, this.dur - .04);
  if (instant) this.t = tgt; else { this.t += (tgt - this.t) * .2; if (Math.abs(tgt - this.t) < .01) this.t = tgt; }
  this.seek(this.t);
};
const CLIPS = $$('video.scrub').map(v => new Clip(v));
CLIPS.forEach(c => { if (c.v.dataset.deck !== undefined) c.deck = c.v.dataset.deck; });
const CLIP = {}; CLIPS.forEach(c => { if (c.deck === undefined) CLIP[c.scene] = c; });

/* ================= S3B: captain to singer, built from green plate layers (no video) ================= */
/* Positions are 1920 x 1080 frame units from assets/s3b-plates/PLATES.md. Each layer sits at its END place in the markup
   and slides from its START offset to 0, a truck left, so every layer travels right at the speed of its own depth.
   The sky never moves, the deck and sea shear about the horizon (y 580), and nothing is scaled. */
const S3B = { el: $('#s3 .s3b'), MOVE: 4.04, HOLD: .25, JOIN: .5, K: .391,
  off: { C2: -48.5, L2: -63.3, C3: -134.8, C4: -122.8, C1: -1152 }, dirty: true, key: '' };
S3B.total = S3B.MOVE + S3B.HOLD + S3B.JOIN; // in footage seconds, like the clips around it
if (S3B.el) { S3B.cap = $('.s3b__cap', S3B.el); S3B.cam = $('.s3b__cam', S3B.el); S3B.fx = $('.s3b__fx', S3B.el); S3B.grain = $('.s3b__grain', S3B.el); S3B.g = {}; $$('.s3b__g', S3B.el).forEach(g => { S3B.g[g.dataset.l] = g; }); }
// linear to scroll, easing out over the last quarter; the speed builds up over the opening dissolve (12%), because the
// s3a2 frame under it is a still frame: a captain already at full speed would leave a double image of his face
S3B.ease = p => { const R = .12, a = 1 / (.75 - R / 2 + .125); if (p < R) return a * p * p / (2 * R); if (p < .75) return a * (p - R / 2); const u = (p - .75) / .25; return a * (.75 - R / 2 + .25 * (u - u * u / 2)); };
S3B.fit = () => {
  const fr = $('#s3 .deck'), W = (fr && fr.clientWidth) || innerWidth, H = (fr && fr.clientHeight) || innerHeight, mob = MQ.matches;
  const fw = mob ? 608 : 1920, sc = Math.max(W / fw, H / 1080);
  Object.assign(S3B, { W, H, mob, sc, tx: (W - fw * sc) / 2, ty: (H - 1080 * sc) / 2, dirty: false, key: '' });
};
addEventListener('resize', () => { S3B.dirty = true; });
S3B.px = v => v.toFixed(2) + 'px';
S3B.render = fr => {
  if (!S3B.el) return;
  if (S3B.dirty) S3B.fit();
  const t = clamp(fr) * S3B.total, key = t.toFixed(4);
  if (key === S3B.key) return; S3B.key = key;
  const px = S3B.px, pm = clamp(t / S3B.MOVE), e = S3B.ease(pm), r = 1 - e;
  const jn = clamp((t - S3B.MOVE - S3B.HOLD) / S3B.JOIN), cut = jn >= .5;
  // the camera box: the full frame on wide screens; on phones a 608-unit crop that starts where s3a2-m ends (x 1040)
  // and settles on the singer, full figure (x 841), by 80% of the move
  const cx = S3B.mob ? lerp(1040, 841, easeIO(clamp(pm / .8))) : 0;
  const cam = `translate3d(${px(S3B.tx - cx * S3B.sc)},${px(S3B.ty)},0) scale(${S3B.sc.toFixed(5)})`;
  S3B.cam.style.transform = cam; S3B.cap.style.transform = cam; S3B.fx.style.transform = cam;
  const G = S3B.g, O = S3B.off;
  G.L1.style.transform = `skewX(${Math.atan(-S3B.K * r).toFixed(5)}rad)`;
  for (const k of ['C2', 'L2', 'C3', 'C4', 'C1']) G[k].style.transform = `translate3d(${px(O[k] * r)},0,0)`;
  // focus pull: the background is soft at the seam (as s3a2 is) and sharp by about 45%; the captain softens as he leaves
  const f = 1 - sm(0, .45, pm), bl = (g, b) => { const v = b > .05 ? `blur(${b.toFixed(2)}px)` : 'none'; if (g.style.filter !== v) g.style.filter = v; };
  bl(G.L0, 2.5 * f); bl(G.L1, 2 * f); bl(G.L2, 3 * f); bl(G.C2, 3 * f); bl(G.C3, 3 * f); bl(G.C4, 3 * f); bl(G.C1, 3 * sm(.2, .7, pm));
  // the seam from s3a2: the captain (registered to its last frame) takes over within 4% of the move, the rest of the frame
  // (a few pixels different) dissolves over the first 8%, the layers already moving; all out under the rope at the cut
  const op = cut ? 0 : sm(0, .08, pm), oc = cut ? 0 : sm(0, .04, pm);
  S3B.cam.style.opacity = op.toFixed(3); S3B.cap.style.opacity = oc.toFixed(3); S3B.grain.style.opacity = (.09 * Math.max(op, oc)).toFixed(3);
  // the join into s3c: the near rope swings across from the upper left, the haze rises and drifts right,
  // s3c's first frame is cut in under them at the midpoint, then the haze clears
  const k = easeIO(jn);
  G.B1.style.opacity = jn > 0 && jn < 1 ? 1 : 0;
  if (S3B.mob) {
    // small screens: the rope swings much closer to the lens (1.8x, its sag through the middle of the 608-unit crop),
    // so it covers the cut there too; scaled about the low point of its sag (1084, 936 in frame units)
    G.B1.style.transformOrigin = '1084px 936px';
    G.B1.style.transform = `translate3d(${px(lerp(845, 1445, k) - 1084)},${px(lerp(-300, 2000, k) - 936)},0) scale(1.8)`;
    bl(G.B1, 10 + 6 * Math.sin(Math.PI * jn));
  } else {
    G.B1.style.transformOrigin = '0 0';
    G.B1.style.transform = `translate3d(${px(lerp(-1920, 1671, k))},${px(lerp(-975, 1080, k))},0)`;
    bl(G.B1, 6 + 4 * Math.sin(Math.PI * jn));
  }
  // the haze peaks (0.9) exactly at the cut
  G.B2.style.opacity = (.9 * (jn < .5 ? sm(0, .5, jn) : 1 - sm(.5, 1, jn))).toFixed(3);
  G.B2.style.transform = `translate3d(${px(77 * jn)},0,0)`;
};
// one shared film grain over the composite, so the layers read as one photograph
S3B.tick = now => { if (!S3B.el || !S3B.on) return; const n = Math.floor(now / 42); if (n === S3B.gn) return; S3B.gn = n; S3B.grain.style.transform = `translate3d(${(n * 37) % 60 - 30}px,${(n * 53) % 60 - 30}px,0)`; };
S3B.clip = { plate: true, v: { dataset: {} }, load() {}, update(fr) { S3B.render(fr); } };

/* ================= DECK SEQUENCE: captain, singer, haulers, diver ================= */
const DECK = { el: $('#s3 .deck'), mode: '', cur: -1, fb: CLIPS.find(c => c.deck === 'fb'), segs: CLIPS.filter(c => /^\d$/.test(c.deck || '')), segEls: $$('#s3 .deck__seg') };
/* The four clips play as one camera move. Scroll maps to footage time, at one steady rate, except the
   diver's breath, which plays slower so there is time to take it with him. Marks are fractions of s3d's own
   length, so a re-shot clip only needs these three numbers checked. */
const DK = {
  dur: [4.04, 4.04, S3B.total, 4.04, 12.04], // captain, captain close, singer (the plate move), haulers, diver; replaced by each clip's real duration as it loads
  // the deck film is one clip: these are its five beats in seconds (captain, captain close, singer, haulers, diver), so every cue
  // and sound mark that names a beat keeps working; film is its length, replaced by the real duration as it loads
  vseg: [0, .7, 1.4, 3.4, 4.5], film: 10.04,
  breath: .21,                     // diver beat: his hands come up with the nose clip and he takes the breath (the hold button and the breath line arrive here)
  step: .59,                       // diver beat: the breath ends as he leans out over the rail; the step, the fall and the splash play after it
  splash: .8,                      // diver beat: he hits the water (the splash sound lands here; the plunge section opens already under)
  slow: 1.6,                       // the breath plays this many times slower per scroll than the rest of the deck (used when share is not set)
  // share of the deck's scroll for each stretch of footage: the five beats, but the diver's split into before the breath, the breath, and the
  // step off with the splash. The film spends only 1.4 s on the captain, so footage time alone would rush his lines.
  share: [.13, .13, .17, .13, .12, .19, .13]
};
function deckLayout() {
  const one = DECK.segs.length === 1;
  const d = one ? DK.vseg.map((s, i, a) => (i < a.length - 1 ? a[i + 1] : DK.film) - s) : DK.dur, n = d.length, start = [0]; for (let i = 1; i < n; i++) start[i] = start[i - 1] + d[i - 1];
  const L = n - 1, total = start[L] + d[L];
  const tb = start[L] + DK.breath * d[L], ts = start[L] + DK.step * d[L];
  // scroll is piecewise linear in footage time: knots at each beat start, the breath, the step and the end
  const T = [...start, tb, ts, total];
  const w = DK.share && DK.share.length === T.length - 1 ? DK.share : T.slice(1).map((t, i) => (t - T[i]) * (i === T.length - 3 ? DK.slow : 1));
  const Pk = [0]; w.forEach((x, i) => { Pk[i + 1] = Pk[i] + x; }); const wT = Pk[Pk.length - 1]; Pk.forEach((x, i) => { Pk[i] = x / wT; });
  Object.assign(DK, { start, total, tb, ts, T, Pk });
  const seg = (a, v) => { let i = 0; while (i < a.length - 2 && v > a[i + 1]) i++; return i; };
  DK.pOf = t => { t = Math.min(Math.max(t, 0), total); const i = seg(T, t); return Pk[i] + (Pk[i + 1] - Pk[i]) * ((t - T[i]) / ((T[i + 1] - T[i]) || 1)); };
  DK.tOf = p => { p = clamp(p); const i = seg(Pk, p); return T[i] + (T[i + 1] - T[i]) * ((p - Pk[i]) / ((Pk[i + 1] - Pk[i]) || 1)); };
  DK.at = (ci, f) => DK.pOf(start[ci] + clamp(f) * d[ci]);
  DK.L = L;
  DK.pBreath = DK.pOf(tb); DK.pStep = DK.pOf(ts);
  // footage-time cues: "clip:fraction", where fraction may be a number or breath / step with an optional offset
  CUES.forEach(c => {
    const dc = c.el.dataset.dc; if (!dc) return;
    const [a, b] = dc.split(' ').map(x => { const [ci, f] = x.split(':'); const m = /^(breath|step)([+-][\d.]+)?$/.exec(f); return DK.at(+ci, m ? DK[m[1]] + (+m[2] || 0) : +f); });
    c.a = a; c.b = b; c.r = Math.min(.03, (b - a) * .25); c.o = -1;
  });
}
if (S3B.el) DECK.segs.splice(2, 0, S3B.clip); // the singer is the plate move, between the two clips it joins
if (Q.get('deckdebug') === '1') window.__deck = { DK, DECK, S3B }; // read-only diagnostics for the verification harness
deckLayout();
async function deckInit() {
  if (DECK.mode || RM) return; DECK.mode = 'checking';
  // a clip counts as present if any of its sources answers; the captain close-up is optional (left out, the rest still plays)
  const has = async c => { if (c.plate) return true; for (const u of (c.v.dataset.src || '').split('|')) { try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok) return true; } catch (_) {} } return false; };
  let ok = [];
  try { ok = await Promise.all(DECK.segs.map(has)); } catch (_) {}
  const required = DECK.segs.every((c, j) => ok[j] || c.v.dataset.optional);
  if (ok.length === DECK.segs.length && required) {
    DECK.mode = 'seq'; DECK.el.classList.add('is-seq');
    DECK.segs.forEach((c, j) => {
      if (!ok[j]) { DK.dur[j] = 0; DECK.segEls[j].remove(); return; }
      if (c.plate) { DK.dur[j] = S3B.total; return; }
      c.v.addEventListener('loadedmetadata', () => { if (c.v.duration > 0) { if (DECK.segs.length === 1) DK.film = c.v.duration; else DK.dur[j] = c.v.duration; deckLayout(); } }); c.load();
    });
    deckLayout();
  }
  else {
    DECK.mode = 'fb'; if (DECK.fb) DECK.fb.load();
    if ((DECK.tries = (DECK.tries || 0) + 1) < 4) setTimeout(() => { if (DECK.mode === 'fb') { DECK.mode = ''; deckInit(); } }, 4000);
  }
}
function updateDeck(p3) {
  const p = clamp(p3);
  if (DECK.mode === 'seq') {
    const t = DK.tOf(p);
    if (DECK.segs.length === 1) { if (DECK.cur !== 0) { DECK.cur = 0; DECK.segEls[0].classList.add('is-on'); } DECK.segs[0].update(t / DK.film, true); return; }
    let i = DK.L; for (let j = 0; j < DK.L; j++) if (DK.dur[j] > 0 && t < DK.start[j + 1]) { i = j; break; }
    if (i !== DECK.cur) { DECK.cur = i; DECK.segEls.forEach(el => el.classList.toggle('is-on', +el.dataset.seg === i)); }
    DECK.segs.forEach((c, j) => { if (DK.dur[j] > 0 && Math.abs(j - i) <= 1) c.update((t - DK.start[j]) / DK.dur[j], true); });
    // the plate move shows s3a2's last frame under its opening dissolve, and s3c's first frame under the rope after the cut
    if (S3B.el) {
      const ts = t - DK.start[2], u1 = i === 2 && ts < S3B.MOVE * .1, u3 = i === 2 && ts >= S3B.MOVE + S3B.HOLD + S3B.JOIN * .5;
      S3B.on = i === 2;
      if (u1 !== S3B.u1) { S3B.u1 = u1; DECK.segEls.forEach(el => { if (+el.dataset.seg === 1) el.classList.toggle('is-under', u1); }); }
      if (u3 !== S3B.u3) { S3B.u3 = u3; DECK.segEls.forEach(el => { if (+el.dataset.seg === 3) el.classList.toggle('is-under', u3); }); }
    }
  } else if (DECK.fb) DECK.fb.update(dwell(p, .3));
}

/* ================= TIMELINES (GSAP is the tween engine; progress comes straight from the scroll) ================= */
const TL = {};
// the cut-out pearl takes over from the photographed one, in the same place and size, then floats to the centre
const HAND = { x: 0, y: 0, s: 1 };
function handoff() {
  // the clip is drawn with object-fit: cover, so map clip coordinates through the same cover transform
  const cs = getComputedStyle($('#q')), el = $('#q .qpearl');
  const v = k => parseFloat(cs.getPropertyValue(k));
  const ar = v('--clip-ar') || 1.7778, W = innerWidth, H = innerHeight;
  const sc = Math.max(W / (ar * 1000), H / 1000), rw = ar * 1000 * sc, rh = 1000 * sc;
  const x = (W - rw) / 2 + v('--pc-x') * rw, y = (H - rh) / 2 + v('--pc-y') * rh, d = v('--pc-d') * rh;
  // layout centre of the cut-out (offsets ignore the transforms GSAP has applied)
  HAND.x = x - (el.offsetLeft + el.offsetWidth / 2); HAND.y = y - (el.offsetTop + el.offsetHeight / 2);
  HAND.s = d / Math.max(1, el.offsetWidth * (v('--cut-fill') || .9));
}
function buildTimelines() {
  handoff();
  if (!FX || !window.gsap) return false;
  const g = window.gsap;
  const T = () => g.timeline({ paused: true, defaults: { ease: 'none', duration: 1 } });
  let t;
  // S1: the clip drifts; the foreground plane travels faster than the clip behind it
  t = T();
  // one slow drift over the Creek today (the 1949 sweep was removed 2026-10-29, Ram)
  t.fromTo('#s1 .plane--bg', { scale: 1.03, xPercent: 0, yPercent: 0 }, { scale: 1.11, xPercent: -1.6, yPercent: -1, ease: 'sine.inOut' }, 0);
  TL.s1 = t;
  // S2: a tide line slips today into 1949; sea haze rides its edge
  t = T();
  t.fromTo('#s2 .stage', { '--w': '0%' }, { '--w': '160%', duration: .3, ease: 'power1.inOut' }, 0)
   .fromTo('#s1 .frame', { filter: 'saturate(1) brightness(1)' }, { filter: 'saturate(.4) brightness(1.08)', duration: .3 }, 0)
   .fromTo('#s2 .plane--bg', { scale: 1.1 }, { scale: 1.0, ease: 'power1.out' }, 0);
  TL.s2 = t;
  // S3: warm sun haze carries us aboard; the rigging plane slides across faster than the deck
  t = T();
  t.fromTo('#s3 .tx--warm', { opacity: 0 }, { opacity: .9, duration: .04 }, 0)
   .fromTo('#s3 .frame', { opacity: 0 }, { opacity: 1, duration: .07 }, .012)
   .to('#s3 .tx--warm', { opacity: 0, duration: .09 }, .05);
  TL.s3 = t;
  // S4: he steps off the side and we go with him: one shot, a single silver flash as we break the surface
  t = T();
  t.fromTo('#s4 .tx--surface', { opacity: 0 }, { opacity: .85, duration: .02, ease: 'power2.in' }, 0)
   .fromTo('#s4 .frame', { opacity: 0 }, { opacity: 1, duration: .015 }, .012)
   .to('#s4 .tx--surface', { opacity: 0, duration: .06, ease: 'power1.out' }, .026)
   .fromTo('#s4 .endfade', { opacity: 0 }, { opacity: .92, duration: .14 }, .86);
  TL.s4 = t;
  // S5: a burst of bubbles, then the dark reveal from the hands outward, exposure rising slowly
  t = T();
  t.fromTo('#s5 .stage', { '--r': '0%' }, { '--r': '160%', duration: .56, ease: 'power1.inOut' }, .04)
   .fromTo('#s5 .shade', { opacity: .92 }, { opacity: .16, duration: .7, ease: 'sine.inOut' }, .04)
   .fromTo('#s5 .plane--bg', { scale: 1.08 }, { scale: 1.0 }, 0);
  TL.s5 = t;
  // S6: silt rises, black, then dawn floods the deck
  t = T();
  t.fromTo('#s6 .tx--silt', { opacity: 0, yPercent: 30 }, { opacity: 1, yPercent: 0, duration: .07, ease: 'power1.out' }, 0)
   .fromTo('#s6 .tx--black', { opacity: 0 }, { opacity: 1, duration: .04 }, .055)
   .fromTo('#s6 .frame', { opacity: 0 }, { opacity: 1, duration: .05 }, .095)
   .fromTo('#s6 .tx--dawn', { opacity: 0 }, { opacity: 1, duration: .04, ease: 'power1.in' }, .085)
   .to('#s6 .tx--dawn', { opacity: 0, duration: .2, ease: 'sine.out' }, .13)
   .fromTo('#s6 .plane--bg', { scale: 1.06 }, { scale: 1.0, ease: 'power1.out' }, .08);
  TL.s6 = t;
  // S7: the pearl's own glow opens the frame
  t = T();
  t.fromTo('#s7 .tx--glow', { opacity: 0, scale: .3 }, { opacity: 1, scale: 1.5, duration: .09, ease: 'sine.out' }, 0)
   .fromTo('#s7 .frame', { opacity: 0 }, { opacity: 1, duration: .05 }, .07)
   .to('#s7 .tx--glow', { opacity: 0, scale: 2.6, duration: .11, ease: 'sine.inOut' }, .1)
   .fromTo('#s7 .plane--bg', { scale: 1.12 }, { scale: 1.0, duration: .6, ease: 'power1.out' }, .1);
  TL.s7 = t;
  // Q: the photo recedes, the pearl stays, a bright ground rises, five words pass behind it
  t = T();
  t.fromTo('#s7 .frame', { scale: 1 }, { scale: .9, duration: .14, ease: 'power1.in' }, 0)
   .fromTo('#q .qbg', { opacity: 0 }, { opacity: 1, duration: .14 }, 0)
   .fromTo('#s7 .plane--bg', { opacity: 1 }, { opacity: 0, duration: .05 }, .055)
   .fromTo('#q .qpearl', { opacity: 0 }, { opacity: 1, duration: .05 }, .02)
   .fromTo('#q .qpearl', { x: () => HAND.x, y: () => HAND.y, scale: () => HAND.s }, { x: 0, y: 0, scale: 1, duration: .14, ease: 'power2.inOut' }, .04);
  const rows = $$('#q .qrow'), S0 = .26, SL = .13;
  rows.forEach((r, i) => t.fromTo(r, { yPercent: 76 }, { yPercent: -76, duration: SL * 1.15 }, S0 + i * SL - SL * .08));
  const qp = '#q .qp', qi = '#q .qp img';
  t.fromTo(qp, { scale: 1, xPercent: 0, rotation: 0 }, { scale: 1.16, xPercent: () => MOBILE ? 10 : 28, duration: SL }, S0)
   .to(qp, { scale: 1, rotation: 24, xPercent: () => MOBILE ? -10 : -28, duration: SL }, S0 + SL)
   .fromTo(qi, { filter: 'hue-rotate(0deg) saturate(1) brightness(1)' }, { filter: 'hue-rotate(-10deg) saturate(1.16) brightness(1.03)', duration: SL * .5 }, S0 + SL * 2)
   .to(qp, { rotation: 0, xPercent: () => MOBILE ? 10 : 28, duration: SL }, S0 + SL * 2)
   .to(qi, { filter: 'hue-rotate(0deg) saturate(1) brightness(1.12)', duration: SL * .5 }, S0 + SL * 3)
   .fromTo('#q .qshine', { opacity: 0, '--sx': '0%', '--sy': '0%' }, { opacity: 1, '--sx': '150%', '--sy': '90%', duration: SL }, S0 + SL * 3)
   .to(qp, { xPercent: () => MOBILE ? -10 : -28, duration: SL }, S0 + SL * 3)
   .to('#q .qshine', { opacity: 0, duration: SL * .3 }, S0 + SL * 4)
   .to(qi, { filter: 'hue-rotate(0deg) saturate(1) brightness(1)', duration: SL * .4 }, S0 + SL * 4)
   .to(qp, { scale: 1.45, xPercent: 0, duration: SL }, S0 + SL * 4)
   .to(qp, { scale: 1, duration: .08 }, S0 + SL * 5);
  TL.q = t;
  // S8: golden light carries us home to the Creek, where the keeper's building stands
  t = T();
  t.fromTo('#q .qfloat', { opacity: 1 }, { opacity: 0, duration: .1 }, 0)
   .fromTo('#s8 .tx--dusk', { opacity: 0 }, { opacity: 1, duration: .12, ease: 'sine.inOut' }, 0)
   .fromTo('#s8 .frame', { opacity: 0 }, { opacity: 1, duration: .2, ease: 'sine.inOut' }, .1)
   .fromTo('#s8 .plane--bg', { scale: 1.06 }, { scale: 1.0, duration: .7, ease: 'power1.out' }, 0);
  TL.s8 = t;
  return true;
}
function updateTimelines(y) {
  for (const s of SC) {
    const tl = TL[s.id]; if (!tl) continue;
    const p = clamp((y - s.top) / s.len);
    if (p === s.tp) continue;
    s.tp = p; tl.time(p); // positions are authored in scene progress, so time = progress whatever the timeline's length
  }
}

/* ================= STATE ================= */
const st = { holding: false, heldMs: 0, breath: 1, holdDepth: 0, dived: false, airFlash: 0, kick: 0, flash: 0, heartPulse: 0 };
const S = {};
const VQ = [];
let clockT0 = performance.now(), nextStep = 0, nextHeart = 0;
const live = $('#live');
const say = t => { live.textContent = t; };

/* ================= THE DIVE: the button only, or Space and Enter while it has focus =================
   idle -> holding (the descent, the breath runs down) -> ascent ("Come up. Breathe.") -> surface ("Air.")
   -> ready ("Dive again") -> redive (one breath, under again) -> holding ... Scrolling on always continues to the seabed. */
const holdBtn = $('#holdBtn'), holdLvl = $('#holdLvl'), holdLbl = $('#holdLbl'), meter = $('#meter'), holdHint = $('#holdHint'), holdUI = $('#holdBeat .holdui'), diveForMe = $('#diveForMe');
const harshScroll = $('#harshScroll');
const inDiveWindow = () => RM || (S.p3 > DK.pBreath - .005 && S.p4 < .565);
const easeIO = x => .5 - .5 * Math.cos(Math.PI * clamp(x));
const D = { state: 'idle', t0: 0, dur: 1, auto: false, autoT: 0, reentry: 1, from: 0, paused: false, pauseK: 0, gasped: false };
// footage marks (fractions of each clip): s4-ascent opens on s4-plunge at 2.5 s, his first gasp in s4-surface is 0.7 s to 2 s
const MK = { branch: .5, gaspIn: .175, gaspOut: .52 };
// one player per surfacing clip: it plays in real time, and falls back to a timer on its poster when the clip is missing
const STC = {};
$$('#s4 .st-plane').forEach(el => {
  const v = el.querySelector('video'), poster = el.querySelector('.poster');
  const c = { el, v, poster, ready: false, loading: false, dur: parseFloat(v.dataset.dur) || 4 };
  STC[el.dataset.st] = c;
  v.addEventListener('loadedmetadata', () => { c.ready = v.duration > 0; if (c.ready) c.dur = v.duration; });
});
async function loadStates() {
  if (RM) return;
  for (const k in STC) {
    const c = STC[k]; if (c.loading) continue; c.loading = true;
    const src = MOBILE && c.v.dataset.srcM ? [c.v.dataset.srcM, c.v.dataset.src] : [c.v.dataset.src];
    for (const u of src) { try { const r = await fetch(u); if (!r.ok) continue; const b = await r.blob(); if (b.size) { c.v.src = URL.createObjectURL(b); c.v.load(); break; } } catch (_) {} }
  }
}
function showPlane(name) {
  for (const k in STC) STC[k].el.classList.toggle('is-on', k === name || (name === 'ready' && k === 'surface'));
}
function play(name) {
  const c = STC[name]; D.t0 = performance.now(); D.dur = c.dur * 1000;
  if (c.ready) { try { c.v.currentTime = 0; const pr = c.v.play(); if (pr) pr.catch(() => {}); } catch (_) {} }
}
function go(state) {
  D.state = state;
  SI.s4.stage.classList.toggle('is-above', state === 'surface' || state === 'ready' || state === 'redive');
  if (state === 'ascent') { showPlane('ascent'); play('ascent'); SNDX.shot('sfx-ascent-rush'); SNDX.shot('music-ascent-swell'); say('Come up. Breathe.'); }
  else if (state === 'branch') { D.t0 = performance.now(); D.dur = 650; D.from = CLIP.s4.t / Math.max(.1, CLIP.s4.dur || 5); }
  else if (state === 'surface') { showPlane('surface'); play('surface'); D.gasped = false; harshScroll.classList.add('is-said'); SNDX.shot('sfx-surface-break', { at: performance.now() + 700 }); SNDX.shot('sfx-gasp', { at: performance.now() + 900 }); }
  else if (state === 'ready') { showPlane('ready'); say('Hold to dive again.'); if (D.auto) D.autoT = performance.now() + 1400; }
  else if (state === 'redive') { showPlane('redive'); play('redive'); st.breath = 1; D.paused = false; SNDX.shot('sfx-redive-close'); }
  else { showPlane(''); for (const k in STC) { try { STC[k].v.pause(); } catch (_) {} } }
  syncHoldUI();
}
function syncHoldUI() {
  const s = D.state, again = s === 'ready' || (s === 'redive' && D.paused);
  holdLbl.textContent = again ? 'Dive again' : 'Hold to dive';
  holdBtn.setAttribute('aria-label', again ? 'Dive again, press and hold' : 'Hold to dive, press and hold');
  holdBtn.classList.toggle('is-ring', s === 'holding' || (s === 'redive' && !D.paused));
  holdUI.classList.toggle('is-hidden', s === 'ascent' || s === 'surface' || s === 'branch');
  holdHint.textContent = again ? 'Hold to take a breath and go under again.' : 'Press and hold. Let go to come up for air.';
  diveForMe.hidden = D.auto || !(s === 'idle' || s === 'ready');
}
function startHold() {
  if (st.holding || !inDiveWindow()) return;
  if (D.state === 'idle') {
    st.holding = true; st.heldMs = 0; D.reentry = 1; go('holding');
    // still on deck: holding carries him over the side and down to where the dive holds
    if (FX && S.p4 < .2) { const s4 = SI.s4, y0 = scrollY, y1 = Math.min(maxY, s4.top + .3 * s4.len); st.carry = { t0: performance.now(), y0, y1, dur: clamp((y1 - y0) / 650, 1.6, 3.2) * 1000 }; }
    D.nextBub = performance.now() + 2000; say(S.p4 < .1 ? 'Breath held. Over the side.' : 'Diving. Let go to come up for air.');
  } else if (D.state === 'ready') {
    st.holding = true; st.heldMs = 0; go('redive'); say('One breath, and under again.');
  } else if (D.state === 'redive' && D.paused) { // holding again picks the redive up where it was let go
    st.holding = true; D.paused = false; D.t0 = performance.now() - D.pauseK * D.dur;
    const c = STC.redive; if (c.ready) { const pr = c.v.play(); if (pr) pr.catch(() => {}); }
    syncHoldUI();
  } else return;
  holdBtn.classList.add('is-holding');
}
function endHold() {
  if (!st.holding) return;
  st.holding = false; st.carry = null; holdBtn.classList.remove('is-holding', 'is-low');
  // letting go underwater: the plunge eases to the frame s4-ascent opens on, then the haulers pull him up
  if (D.state === 'holding') { if ((st.heldMs > 650 || D.auto) && (RM || S.p4 > .1)) { st.dived = true; go(RM ? 'ascent' : 'branch'); } else go('idle'); }
  else if (D.state === 'redive') { // letting go mid-breath pauses him at the surface until the hold resumes
    D.paused = true; D.pauseK = clamp((performance.now() - D.t0) / D.dur); try { STC.redive.v.pause(); } catch (_) {}
    syncHoldUI();
  }
  else syncHoldUI();
}
function stepDive(now) {
  // "Dive for me": one full loop, then it rests underwater
  if (D.auto && st.holding && D.state === 'holding' && now > D.autoT) endHold();
  if (D.auto && D.state === 'ready' && now > D.autoT) { st.holding = true; st.heldMs = 0; holdBtn.classList.add('is-holding'); go('redive'); }
  if (D.state === 'branch' && now - D.t0 >= D.dur) go('ascent');
  if (D.state === 'surface' && !D.gasped && (now - D.t0) / D.dur >= MK.gaspIn) { D.gasped = true; st.airFlash = 1; say('Air. You surfaced.'); }
  if ((D.state === 'ascent' || D.state === 'surface' || D.state === 'redive') && !(D.state === 'redive' && D.paused)) {
    const k = (now - D.t0) / D.dur, c = STC[D.state];
    if (!c.ready && c.poster) c.poster.style.transform = `scale(${(1.04 + .06 * clamp(k)).toFixed(4)})`;
    if (k >= 1) {
      if (D.state === 'ascent') go('surface');
      else if (D.state === 'surface') go('ready');
      else { // the redive hands into the plunge from its first frame, and the hold carries on
        D.reentry = 0; st.holdDepth = 0;
        if (D.auto) { D.auto = false; st.holding = false; holdBtn.classList.remove('is-holding'); go('idle'); }
        else if (st.holding) { st.heldMs = 0; go('holding'); }
        else go('idle');
      }
    }
  }
  // scrolling out of the dive closes the loop quietly
  if (!RM && D.state !== 'idle' && D.state !== 'holding' && !(S.p4 > .12 && S.p4 < .565)) { st.holding = false; D.auto = false; D.paused = false; holdBtn.classList.remove('is-holding'); go('idle'); }
}
holdBtn.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); try { holdBtn.setPointerCapture(e.pointerId); } catch (_) {} startHold(); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => holdBtn.addEventListener(n, () => { if (!D.auto) endHold(); }));
holdBtn.addEventListener('contextmenu', e => e.preventDefault());
holdBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) startHold(); } });
holdBtn.addEventListener('keyup', e => { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!D.auto) endHold(); } });
holdBtn.addEventListener('click', e => e.preventDefault());
holdBtn.addEventListener('blur', () => { if (!D.auto) endHold(); });
diveForMe.addEventListener('click', () => {
  if (st.holding || !(D.state === 'idle' || D.state === 'ready')) return;
  D.auto = true;
  if (D.state === 'ready') { D.autoT = 0; syncHoldUI(); return; }
  startHold(); if (!st.holding) { D.auto = false; return; }
  D.autoT = performance.now() + 4500 + (st.carry ? st.carry.dur : 0);
  syncHoldUI();
});
// a visitor who scrolls takes the camera back
['wheel', 'touchmove'].forEach(n => addEventListener(n, () => { st.carry = null; }, { passive: true }));
const holdBeat = $('#holdBeat');
if (FX) { const layer = document.createElement('div'); layer.className = 'holdlayer'; (document.querySelector('.pm-page') || document.body).appendChild(layer); layer.appendChild(holdBeat); }
let holdOpLast = -1;

// quiet doors are placeholders until those pages exist
$$('[data-door]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); say(a.dataset.door + ': coming soon.'); }));

// keyboard focus brings its moment into view (cinematic layout only)
document.addEventListener('focusin', e => {
  if (!FX) return;
  const host = e.target.closest && e.target.closest('[data-fp]'); if (!host) return;
  const sc = host.dataset.fpScene ? SI[host.dataset.fpScene] : host.closest('.scene') && SI[host.closest('.scene').id]; if (!sc) return;
  const s = sc, target = s.top + (host.dataset.fp === 'breath' ? DK.pBreath + .02 : parseFloat(host.dataset.fp)) * s.len;
  if (Math.abs(target - scrollY) > vh * .25) scrollTo({ top: Math.min(target, maxY), behavior: 'auto' });
});
$('#replay').addEventListener('click', () => {
  st.dived = false; st.breath = 1; harshScroll.classList.remove('is-said'); go('idle');
  scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
  setTimeout(() => { const h = $('#h1'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }, RM ? 0 : 900);
});

// sound
const soundTgl = $('#soundTgl'), soundInvite = $('#soundInvite');
function syncSoundUI() {
  const on = SND.on;
  soundTgl.setAttribute('aria-pressed', on); soundInvite.setAttribute('aria-pressed', on);
  $('#soundState').textContent = on ? 'Sound on' : 'Sound off';
  $('#inviteLbl').textContent = on ? 'Sound is on' : 'Turn on sound';
}
function toggleSound() { const near = SC.reduce((k, s, i) => (scrollY >= s.top - 1 ? i : k), 0); SND.set(!SND.on, [1, 2, 3, 4, 5, 6, 7, 7, 9][near]); syncSoundUI(); }
soundTgl.addEventListener('click', toggleSound);
soundInvite.addEventListener('click', toggleSound);

/* ================= CLOCK (shared by the audio and the crew) ================= */
function schedule() {
  const now = performance.now(), ahead = now + 140;
  if (clockT0 + nextStep * STEP < now - 250) nextStep = Math.ceil((now - clockT0) / STEP);
  while (clockT0 + nextStep * STEP < ahead) {
    const st16 = nextStep, tms = clockT0 + st16 * STEP, q = st16 % 4, L = S.layers || 0;
    if (L >= 1 && q === 0) VQ.push({ t: tms, k: 'dum', v: st16 % 16 === 0 ? 1 : .7 });
    if (L >= 3 && q === 2) VQ.push({ t: tms, k: 'clap', v: .8 });
    nextStep++;
  }
  // one muffled heartbeat at a time: 1.7 s apart at -6 dB with a full breath, quickening toward 0.9 s and 0 dB as it drains
  const heartOn = (st.holding && (D.state === 'holding' || D.state === 'redive')) || D.state === 'branch' || D.state === 'ascent';
  if (heartOn) {
    if (nextHeart < now) nextHeart = now + 120;
    while (nextHeart < ahead) {
      const k = 1 - st.breath; VQ.push({ t: nextHeart, k: 'heart' });
      if (SNDX.on && !SNDX.shot('sfx-heartbeat', { at: nextHeart, db: lerp(-6, 0, k), noDuck: true })) SNDX.level('sfx-heartbeat-loop', 1);
      nextHeart += lerp(1700, 900, k);
    }
  } else { nextHeart = 0; SNDX.level('sfx-heartbeat-loop', 0, .3); }
}
SNDX.onBeatStart = t => { clockT0 = t; nextStep = 0; };
setInterval(schedule, 25);

/* ================= LOOP ================= */
const breathe = $('#breathe'), roles = $$('#s3 .card'), gauge = $('#gauge'), gaugeDot = $('#gaugeDot');
const dark4 = $('#dark4'), iris4 = $('#iris4'), flash4 = $('#flash4'), pulse4 = $('#pulse4');
const states = {}; $$('#midslot .state').forEach(el => states[el.dataset.state] = el);
const XS = {};
let lastT = performance.now(), running = true, sndT = 0, meterLast = 100, stateLast = '', chimed6 = false, chimed7 = false, lightLast = null, gaugeLast = null;
function passiveBump(p) { return sm(.3, .42, p) * (1 - sm(.49, .555, p)) * .85; }
function setState() {
  const ds = D.state, k = (performance.now() - D.t0) / D.dur;
  const stt = ds === 'ascent' || ds === 'branch' ? 'up' : ds === 'surface' ? (k < MK.gaspIn ? 'up' : k < MK.gaspOut ? 'air' : 'harsh') : ds === 'ready' ? 'harsh'
    : ds === 'redive' ? (D.paused ? 'harsh' : 'hold') : ds === 'holding' ? (st.breath < .4 ? 'low' : 'hold') : 'prompt';
  if (stt === stateLast) return; stateLast = stt;
  for (const k in states) { states[k].classList.toggle('is-on', k === stt); states[k].setAttribute('aria-hidden', k === stt ? 'false' : 'true'); }
}
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  const y = scrollY;
  XS.vy = lerp(XS.vy || 0, (y - (XS.y0 == null ? y : XS.y0)) / Math.max(.001, dt), .25); XS.y0 = y;
  S.p1 = P('s1', y); S.p3 = P('s3', y); S.p4 = P('s4', y); S.p5 = P('s5', y); S.p6 = P('s6', y); S.p7 = P('s7', y); S.pq = P('q', y); S.p8 = P('s8', y);
  // the rhythm builds with the crew and swells at the singer, then falls back to the drum as the diver takes his breath
  const p3 = S.p3;
  S.layers = p3 < .02 ? 0 : p3 < DK.at(2, .35) ? 1 : p3 < DK.at(2, .55) ? 2 : p3 < DK.at(2, .7) ? 3 : p3 < DK.at(4, .3) ? 4 : p3 < DK.pBreath ? 2 : 1;
  if (S.p4 > .03) S.layers = 0;
  S.swell = sm(DK.at(2, .5), DK.at(2, .8), p3) * (1 - sm(DK.at(3, .6), DK.at(3, .95), p3));

  // "Take a breath." breathes on an 8 s cycle
  if (FX && S.p1 > .3 && S.p1 < 1) { const b = .5 - .5 * Math.cos(now / 8000 * 6.283); breathe.style.transform = `scale(${(1 + .022 * b).toFixed(4)})`; }

  // the dive (on deck, holding carries the camera over the side)
  stepDive(now);
  if (st.carry && st.holding) {
    const k = (now - st.carry.t0) / st.carry.dur;
    scrollTo(0, lerp(st.carry.y0, st.carry.y1, easeIO(k)));
    if (k >= 1) st.carry = null;
  }
  if (st.holding) {
    st.heldMs += dt * 1000;
    if (D.state === 'holding') st.breath = Math.max(0, st.breath - dt / 9);
    st.holdDepth = 1 - Math.exp(-st.heldMs / 2600);
    if (D.state === 'holding' && (st.breath <= 0 || !inDiveWindow())) endHold();
    holdBtn.classList.toggle('is-low', st.breath < .4);
  } else {
    st.holdDepth = Math.max(0, st.holdDepth - dt * 1.25);
    st.breath = Math.min(1, st.breath + dt * .45);
  }
  st.airFlash = Math.max(0, st.airFlash - dt * 1.4);
  D.reentry = Math.min(1, D.reentry + dt / 1.4);
  holdLvl.style.strokeDashoffset = (358.14 * (1 - st.breath)).toFixed(1);
  const mv = Math.round(st.breath * 10) * 10; if (mv !== meterLast) { meterLast = mv; meter.setAttribute('aria-valuenow', mv); }

  for (let i = VQ.length - 1; i >= 0; i--) {
    const e = VQ[i]; if (e.t > now) continue; VQ.splice(i, 1);
    if (e.k === 'dum') st.kick = Math.max(st.kick, e.v);
    else if (e.k === 'clap') st.flash = Math.min(1, st.flash + .55 * e.v);
    else if (e.k === 'heart') st.heartPulse = 1;
  }
  st.kick = Math.max(0, st.kick - dt * 3); st.flash = Math.max(0, st.flash - dt * 3.2); st.heartPulse = Math.max(0, st.heartPulse - dt * 3.5);

  const win = sm(.12, .16, S.p4) * (1 - sm(.555, .6, S.p4));
  S.passive = (!st.dived && FX && D.state === 'idle') ? passiveBump(S.p4) : 0;
  S.depth = (D.state === 'idle' || D.state === 'holding' || D.state === 'branch') ? Math.max(st.holdDepth, S.passive) * win : 0;
  setState();

  if (FX) {
    updateStages(y);
    updateTimelines(y);
    updateCues(y);
    updateDeck(S.p3); S3B.tick(now);
    const hv = sm(DK.pBreath - .012, DK.pBreath + .012, S.p3) * (1 - sm(.52, .56, S.p4));
    const ho = Math.round(hv * 1000) / 1000;
    if (ho !== holdOpLast) { holdOpLast = ho; holdBeat.style.opacity = ho; holdBeat.style.transform = ho < 1 ? `translate3d(0,${((1 - ho) * 12).toFixed(1)}px,0)` : 'none'; holdBeat.classList.toggle('is-live', ho > .5); }

    // every scene scrubs its own clip across its scroll; S4 adds the held breath on top
    for (const c of CLIPS) {
      if (c.scene === 's4' || c.deck !== undefined) continue;
      const s = SI[c.scene]; if (s.far) continue;
      c.update(dwell(clamp((y - s.top) / s.len), .3));
    }
    const base = S.p4 < .6 ? .18 * sm(.04, .16, S.p4) : .18 + .82 * sm(.6, .985, S.p4);
    // the held breath takes him deeper, toward the frame where the ascent begins (never past it)
    const plungeF = D.state === 'branch' ? lerp(D.from, MK.branch, easeIO((performance.now() - D.t0) / D.dur))
      : lerp(0, lerp(base, Math.max(base, MK.branch), S.depth), 1 - Math.pow(1 - D.reentry, 3));
    if (!SI.s4.far) { CLIP.s4.update(plungeF, D.reentry < 1 || D.state === 'branch'); if (!STC.ascent.loading) loadStates(); }
    const d = S.depth;
    dark4.style.opacity = (d * .55).toFixed(3);
    iris4.style.opacity = sm(0, .25, d).toFixed(3);
    iris4.style.transform = `scale(${(lerp(1.15, .27, Math.pow(d, .8)) * (1 + .025 * st.heartPulse * d)).toFixed(4)})`;
    flash4.style.opacity = (st.airFlash * .6).toFixed(3);
    pulse4.style.transform = d > .02 ? `scale(${(1 + .008 * st.heartPulse * d).toFixed(4)})` : '';

    // the depth gauge: only while you are under
    const under = S.p4 > .05 && S.p6 < .06;
    const dk = clamp((performance.now() - D.t0) / D.dur);
    const depth = D.state === 'ascent' ? lerp(.45, 0, dk) : (D.state === 'surface' || D.state === 'ready') ? 0 : D.state === 'redive' ? .15 * dk
      : S.p4 < 1 ? clamp(base * .8 + d * .5) * D.reentry : S.p5 < 1 ? lerp(.8, 1, sm(0, .5, S.p5)) : 1;
    if (under !== gaugeLast) { gaugeLast = under; gauge.classList.toggle('is-on', under); }
    if (under) gaugeDot.style.transform = `translate3d(0,${(depth * (gauge.offsetHeight - 36)).toFixed(1)}px,0)`;

    // the bright coda inverts the chrome
    const light = S.pq > .08;
    if (light !== lightLast) { lightLast = light; root.classList.toggle('theme-light', light); }

    // events that belong to places in the story: each fires once on the way down, and again only after scrolling back past it
    if (SNDX.on) {
      const cross = (key, v, at) => { const was = XS[key]; XS[key] = v > at; return XS[key] && was === false; };
      if (cross('inhale', S.p3, DK.pBreath + .004)) SNDX.shot('sfx-inhale');
      if (cross('sail', S.p3, DK.at(0, .08))) SNDX.shot('sfx-sail-gust', { noDuck: true });
      if (cross('rope', S.p3, DK.at(3, .15))) SNDX.shot('sfx-rope-roller');
      if (cross('rope2', S.p3, DK.at(3, .62))) SNDX.shot('sfx-rope-roller', { db: -3 });
      if (cross('shell', S.p5, .62)) SNDX.shot('sfx-shell-lift');
      if (cross('open', S.p6, .58)) SNDX.shot('sfx-shell-open');
      // the splash leads the picture by 0.4 s (its impact is 0.4 s into the file), predicted from the scroll speed
      const sy = SI.s3.top + DK.at(4, DK.splash) * SI.s3.len, lead = clamp(XS.vy || 0, 0, 1250) * .4; // at most 500 px ahead, so a fast scroll that stops short of the water stays dry
      if (y < sy - .5 * vh && y + lead < sy - 100) XS.splashArmed = true; // re-armed above the entry, once not already heading into it
      if (XS.splashArmed && y < sy + 300 && y + lead >= sy) { XS.splashArmed = false; SNDX.shot('sfx-splash-entry', { always: true }); }
      if (y > sy + 300) XS.splashArmed = false;                       // jumped past the entry: no late splash
      // fine bubbles from the nose, now and then, while he holds his breath
      if (D.state === 'holding' && st.holding && S.p4 > .05 && now > (D.nextBub || 0)) { SNDX.shot('sfx-bubbles-nose', { noDuck: true }); D.nextBub = now + 6000 + Math.random() * 4000; }
      // music cues that play once: the pearl theme from the moment S7 opens, the resolve at the end
      SNDX.cue('music-pearl-theme', S.p7 > .01 && S.p8 < .06, 1.2);
      SNDX.cue('music-end-resolve', S.p8 > .1, 1.5);
    }
    const voice = 0;
    roles[0].style.setProperty('--k', (st.kick * .9).toFixed(2));
    roles[1].style.setProperty('--k', Math.max(voice * .8, st.flash * .6).toFixed(2));
    roles[2].style.setProperty('--k', Math.max(st.kick, st.flash * .7).toFixed(2));
    roles[3].style.setProperty('--k', (st.heartPulse * .9).toFixed(2));
  }

  // the mix (throttled): AUDIO.md's suggested levels, crossfaded with the scroll
  if (SNDX.on && now - sndT > 60) {
    sndT = now;
    const p1 = S.p1, p2 = P('s2', y), p3 = S.p3, p4 = S.p4, p5 = S.p5, p6 = S.p6, p7 = S.p7, pq = S.pq, p8 = S.p8;
    const ek = (performance.now() - D.t0) / D.dur;
    const then = 0;                                                  // no 1949 reveal any more: the Creek today plays through the opening
    const into2 = sm(0, .3, p2), into3 = sm(0, .12, p3), into6 = sm(0, .1, p6);
    const into4 = sm(.012, .02, p4);                                 // under water just after the splash
    const breath = sm(DK.pBreath - .004, DK.pBreath + .004, p3);   // music out over about 0.4 s of scroll on the breath
    // above water in the dive loop: from the moment his head breaks the surface (0.7 s) until the water closes on the redive (1.3 s)
    const tIn = (performance.now() - D.t0) / 1000;
    const above = D.state === 'surface' ? (tIn > .7 ? 1 : 0) : D.state === 'ready' ? 1 : D.state === 'redive' ? (tIn < 1.3 ? 1 : 0) : 0;
    const under = sm(.012, .03, p4) * (1 - into6);
    const uw = under * (p4 < .6 ? (.4 + .6 * S.depth) : 1) * (1 - above);
    const eq = x => [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
    const [cToday, c1949] = eq(then);
    // ambiences (0 dB as delivered unless AUDIO.md says otherwise)
    SNDX.level('amb-creek-today', cToday * (1 - into2) + DB(-4) * sm(.05, .4, p8), .5);
    SNDX.level('amb-creek-1949', c1949 * (1 - into2), .5);
    SNDX.level('amb-open-sea', into2 * (1 - into3) + DB(-3) * above, .3);
    const rPeak = sm(DK.at(2, .1), DK.at(3, .3), p3) * (1 - sm(DK.at(4, .2), DK.pBreath, p3));
    SNDX.level('amb-deck', into3 * (1 - sm(-.01, .012, p4)) * lerp(1, DB(-6), rPeak));
    SNDX.level('amb-underwater', into4 * (1 - above) * (1 - sm(0, .3, p5)) * (1 - into6), above ? .03 : .1);
    SNDX.level('amb-seabed', sm(0, .3, p5) * (1 - into6));
    SNDX.level('amb-dawn-deck', sm(.08, .2, p6) * (1 - sm(0, .15, p7)));
    // music
    const droneS13 = (p2 < 0 ? DB(-14) * then : lerp(DB(-14), DB(-8), into2)) * (1 - breath) * (p4 > 0 ? 0 : 1);
    const droneS5 = DB(-20) * sm(.1, .4, p5) * (1 - into6);
    const droneS6 = DB(-12) * sm(.15, .45, p6) * (1 - sm(0, .1, p7));
    const droneS8 = DB(-14) * sm(0, .1, p8) * (1 - sm(.12, .35, p8));
    // the singer's voice (wordless work-song call, plays in real time): in as he appears, softer under the haulers he leads, gone before the diver
    const voice = sm(DK.at(1, .92), DK.at(2, .08), p3) * lerp(1, .55, sm(DK.at(3, 0), DK.at(3, .3), p3)) * (1 - sm(DK.at(3, .85), DK.at(4, .1), p3)) * (1 - breath);
    SNDX.level('music-nahham-voice', voice, .6);
    SNDX.level('music-drone-bed', Math.max(droneS13 * (1 - .6 * voice), droneS5, droneS6, droneS8), breath > 0 && breath < 1 ? .13 : 1.2);
    SNDX.level('music-oud-sparse', DB(-4) * sm(.08, .35, p2) * (1 - sm(0, .3, p3)) + DB(-6) * sm(.15, .45, p6) * (1 - sm(0, .2, p7)), 1.5);
    const rIn = sm(DK.at(1, .92), DK.at(2, .12), p3), rBuild = sm(DK.at(2, .1), DK.at(3, .3), p3), rFall = sm(DK.at(4, .2), DK.pBreath, p3);
    SNDX.level('music-deck-rhythm', rIn * DB(lerp(lerp(-30, -8, rBuild), -30, rFall)) * (1 - breath), breath > 0 ? .13 : .6);
    SNDX.filter(lerp(18000, 520, Math.pow(uw, .6)));
  }
}

/* ================= S1: the Creek today as a quiet loop (phones get their own 9:16 crop; reduced motion keeps the still) ================= */
(() => {
  const v = $('#s1 .s1-vid'); if (!v || RM) return;
  const m = matchMedia('(max-width:719.98px)').matches;
  if (m) v.poster = v.dataset.posterM;
  v.src = m ? v.dataset.srcM : v.dataset.src;
  const go = () => { const p = v.play(); if (p) p.catch(() => {}); };
  // play only while the opening is on screen
  if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? go() : v.pause()), { threshold: .01 }).observe($('#s1')); else go();
})();

/* ================= BOOT ================= */
let rz = 0, lastW = innerWidth, lastH = innerHeight;
addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140 && matchMedia('(pointer:coarse)').matches) return; // phone toolbar
    lastW = innerWidth; lastH = innerHeight; measure();
  }, 120);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { running = false; SND.suspend(true); }
  else { running = true; lastT = performance.now(); SND.suspend(false); requestAnimationFrame(frame); }
});
function boot() {
  measure();
  if (FX && !buildTimelines()) root.classList.add('no-tl');
  syncSoundUI(); syncHoldUI();
  if (Q.get('s')) { const s = SI[Q.get('s')]; if (s) scrollTo(0, Math.min(maxY, s.top + parseFloat(Q.get('p') || 0) * s.len)); } // test hook: ?s=s4&p=.3
  else if (Q.get('at')) scrollTo(0, parseFloat(Q.get('at')) * maxY);
  if (FX) { const y = scrollY; updateStages(y); updateTimelines(y); updateCues(y); }
  requestAnimationFrame(frame);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', boot); else boot();
addEventListener('load', measure);
})();
  };

  /* ================= PAGE.history: runs when history.html is parsed ================= */
  PAGE.history = function () {
(() => {
'use strict';
const { $, $$, clamp, lerp, sm, FX, RM } = PM;

/* ---- scene choreography: positions in scene progress, 0 to 1 ---- */
PM.timeline('hero', (gsap, T) => T().fromTo('#hero .plane--bg', { scale: 1.07, xPercent: -1 }, { scale: 1, xPercent: 0, ease: 'power1.out' }, 0));
PM.timeline('y1949', (gsap, T) => T().fromTo('#y1949 .dusk', { opacity: 0 }, { opacity: 1, duration: .45, ease: 'power1.in' }, .18));

/* ---- the music loop: a lighter file and poster on phones ---- */
{ const v = $('#music video'); if (v && PM.mobile) { v.poster = v.dataset.posterM; v.src = v.dataset.srcM; } }

/* ---- the year numeral: a counter whose digits roll with the scroll ---- */
// each digit's natural width in the numeral face, so a rolled year sets like a typeset one
let DW = [];
const measureDW = () => {
  const probe = document.createElement('span'); probe.className = 'yr__n'; probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;font-size:100px;letter-spacing:0';
  (document.querySelector('.pm-page') || document.body).appendChild(probe); const w = [];
  for (let k = 0; k < 10; k++) { probe.textContent = String(k); w[k] = probe.getBoundingClientRect().width / 100; }
  probe.remove(); DW = w;
};
measureDW();
const YR = $$('.yr').map(el => {
  const n = $('.yr__n', el), to = +el.dataset.to, from = el.dataset.from != null ? +el.dataset.from : to;
  const Y = { el, n, to, from, comma: !!el.dataset.comma, scene: el.closest('.scene'), cols: [], v: -1 };
  if (el.dataset.roll) { const r = el.dataset.roll.split(' ').map(Number); Y.a = r[0]; Y.b = r[1]; }
  if (!FX || from === to) return Y; // reduced motion and no-op rolls keep the plain text
  const digits = String(to).length, fin = String(to).padStart(digits, '0');
  n.textContent = '';
  for (let i = digits - 1; i >= 0; i--) {
    if (Y.comma && i === 2) { const c = document.createElement('span'); c.className = 'dg--c'; c.textContent = ','; n.appendChild(c); }
    const d = document.createElement('span'); d.className = 'dg';
    const s = document.createElement('span'); s.className = 'dg__s';
    for (let k = 0; k <= 10; k++) { const c = document.createElement('span'); c.textContent = k % 10; s.appendChild(c); }
    d.appendChild(s); n.appendChild(d); Y.cols.push({ s, d, f: +fin[digits - 1 - i], p: Math.pow(10, i), last: '' });
  }
  return Y;
});
const sizeCols = () => YR.forEach(Y => Y.cols.forEach(c => { c.d.style.width = DW[c.f].toFixed(3) + 'em'; }));
sizeCols();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureDW(); sizeCols(); });
function setYear(Y, v) {
  if (!Y.cols.length) return;
  v = Math.max(0, v); if (v === Y.v || (Math.abs(v - Y.v) < .002 && v !== Y.to && v !== Y.from)) return; Y.v = v;
  for (const c of Y.cols) {
    // odometer: the ones turn continuously; each higher digit turns only during the last unit before it rolls over
    const whole = Math.floor(v / c.p) % 10, rem = v % c.p, carry = c.p === 1 ? v % 1 : Math.max(0, rem - (c.p - 1));
    const pos = c.p === 1 ? (Math.floor(v) % 10) + (v % 1) : whole + carry;
    const t = `translate3d(0,${(-pos).toFixed(3)}em,0)`;
    if (t !== c.last) { c.last = t; c.s.style.transform = t; }
  }
}
const easeOut = t => 1 - Math.pow(1 - t, 3);
// the roll is short and scroll-linked; the moment scrolling pauses, a rolled year eases onto its real value,
// so a pause or a screenshot always shows a real year (it only rolls back if you scroll back above its start)
let lastScroll = 0; addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
function updateYears(vh) {
  const idle = performance.now() - lastScroll > 140;
  for (const Y of YR) {
    if (!Y.cols.length) continue;
    let t;
    if (Y.scene) t = sm(Y.a, Y.b, PM.P(Y.scene.id));
    else { const r = Y.el.getBoundingClientRect(); if (r.bottom < -vh || r.top > vh * 2) continue; t = clamp((vh * .98 - r.top) / (vh * .2)); }
    if (t <= 0) { Y.done = false; setYear(Y, Y.from); continue; }
    if (t >= 1) Y.done = true;
    if (Y.done) { if (Y.v !== Y.to) { const v = Y.v + (Y.to - Y.v) * .22; setYear(Y, Math.abs(Y.to - v) < .02 ? Y.to : v); } continue; }
    if (idle) { Y.done = true; continue; }
    setYear(Y, lerp(Y.from, Y.to, easeOut(t)));
  }
}

/* ---- scenes between reading sections: shown while their own scroll is on screen (the reading above lifts off them) ---- */
const STAGES = $$('.scene').map(el => ({ el, stage: $('.stage', el), peek: null }));
function updatePeek(vh) {
  for (const s of STAGES) {
    const r = s.el.getBoundingClientRect(), on = r.top < vh && r.bottom > 0;
    if (on !== s.peek) { s.peek = on; s.stage.classList.toggle('is-peek', on); s.stage.classList.toggle('is-gone', !on); }
  }
}

/* ---- the header and the rail turn dark over the paper section ---- */
const FLOWS = $$('.flow,.foot'), HDR = 72, LIGHT = $$('[data-light]'), rail = $('#rail'), railLinks = $$('#rail a'), CH = railLinks.map(a => document.getElementById(a.dataset.ch));
let curLast = '', railOn = null;
function updateChrome(vh) {
  let light = PM.k != null && PM.scenes && PM.scenes[PM.k] && PM.scenes[PM.k].el.dataset.theme === 'light';
  for (const el of LIGHT) { const r = el.getBoundingClientRect(); if (r.top <= 56 && r.bottom > 56) light = true; }
  document.documentElement.classList.toggle('theme-light', light);
  let solid = false; for (const el of FLOWS) { const r = el.getBoundingClientRect(); if (r.top <= HDR && r.bottom > 0) { solid = true; break; } }
  document.documentElement.classList.toggle('hdr-solid', solid);
  // rail: on from the first chapter, the current chapter is the last one whose top has passed the middle of the screen
  const first = CH[0].getBoundingClientRect().top, on = first < vh * .7;
  if (on !== railOn) { railOn = on; rail.classList.toggle('is-on', on); }
  let cur = ''; CH.forEach((el, i) => { if (el.getBoundingClientRect().top < vh * .5) cur = railLinks[i].dataset.ch; });
  if (cur !== curLast) { curLast = cur; railLinks.forEach(a => { if (a.dataset.ch === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); }
}

let vh = innerHeight;
PM.onMeasure(() => { vh = innerHeight; });
PM.onFrame(() => { if (FX) { updatePeek(vh); updateYears(vh); } updateChrome(vh); });
if (!FX) addEventListener('scroll', () => updateChrome(vh), { passive: true });

/* ---- rail links: a pinned scene's anchor lands where its copy has arrived ---- */
railLinks.forEach(a => a.addEventListener('click', e => {
  const el = document.getElementById(a.dataset.ch); if (!el) return;
  e.preventDefault();
  const sc = el.classList.contains('scene') && PM.SI && PM.SI[el.id];
  const y = sc ? sc.top + sc.len * .3 : el.getBoundingClientRect().top + scrollY;
  scrollTo({ top: y, behavior: RM ? 'auto' : 'smooth' });
  history.replaceState(null, '', '#' + el.id);
}));

/* ---- sound: off until opted in; beds and the deck rhythm follow the years ---- */
PM.sound.stems({
  'music-drone-bed':   ['music', 40, -8, 1],
  'amb-underwater':    ['under', 28, -3, 2],
  'amb-open-sea':      ['bed', 28, -2, 3],
  'music-deck-rhythm': ['music', 33.568, -5, 4, 1],
  'music-oud-sparse':  ['music', 39, -7, 5],
  'amb-creek-1949':    ['bed', 28, -2, 6],
  'amb-creek-today':   ['bed', 28, -5, 7]
});
const vis = id => { const el = document.getElementById(id); if (!el) return 0; const r = el.getBoundingClientRect(); return clamp((Math.min(r.bottom, vh) - Math.max(r.top, 0)) / vh); };
const inScene = (P, id, y) => { const p = P(id, y); return sm(-.05, .06, p) * (1 - sm(.92, 1.02, p)); };
PM.sound.mix((y, P) => {
  const music = sm(.15, .5, vis('music'));
  PM.sound.level('music-drone-bed', Math.max(vis('hero'), vis('y7000') * .8, vis('y1681') * .7) * (1 - music));
  PM.sound.level('amb-underwater', inScene(P, 'y1637', y));
  PM.sound.level('amb-open-sea', Math.max(inScene(P, 'y1924', y), vis('y1637b') * .6));
  PM.sound.level('music-deck-rhythm', music);
  PM.sound.level('music-oud-sparse', sm(.2, .6, vis('y1926')) * (1 - music));
  PM.sound.level('amb-creek-1949', inScene(P, 'y1949', y));
  PM.sound.level('amb-creek-today', sm(.1, .5, vis('y1963')));
  PM.sound.filter(inScene(P, 'y1637', y) > .5 ? 900 : 18000);
});
})();
  };

  /* ================= PAGE.collection: runs when collection.html is parsed ================= */
  PAGE.collection = function () {
/* ---- lustre: the light moves left, over the top, to the right (three registered photographs) ---- */
PM.timeline('c4', (gsap, T) => T()
  .fromTo('#c4 .l1', { opacity: 1 }, { opacity: 0, duration: .2, ease: 'sine.inOut' }, .3)
  .fromTo('#c4 .l3', { opacity: 0 }, { opacity: 1, duration: .2, ease: 'sine.inOut' }, .62)
  .fromTo('#c4 .plane', { scale: 1 }, { scale: 1.04, duration: 1 }, 0));
/* ---- the loupe: a small lens over the crown, then it grows past the edges ---- */
PM.timeline('c5', (gsap, T) => T()
  .set('#c5 .plane', { scale: 1.04 }, 0)
  .fromTo('#c5 .stage', { '--r': '0vmax' }, { '--r': '9vmax', duration: .1, ease: 'power2.out' }, .04)
  .to('#c5 .stage', { '--r': '12vmax', duration: .14 }, .14)
  .to('#c5 .stage', { '--r': '130vmax', duration: .14, ease: 'power2.in' }, .28)
  .fromTo('#c5 .loupe__ring', { opacity: 1 }, { opacity: 0, duration: .06 }, .36)
  .fromTo('#c5 .loupe img', { scale: 1.12 }, { scale: 1, duration: .5, ease: 'power1.out' }, .04));

/* ---- the turntable: held on its first frame while the plate settles, then turned by the scroll ---- */
(function () {
  if (!PM.FX) return;
  let c = null;
  PM.onFrame((now, dt, y) => {
    if (!c) { c = (PM.clip('c1') || [])[0]; if (!c) return; c.custom = true; }
    const s = PM.SI && PM.SI.c1; if (!s || s.far) return;
    c.update(PM.clamp(((y - s.top) / s.len - .2) / (.66 - .2)));
  });
})();

/* ---- sound (off until the visitor opts in): a low drone and the sparse oud, quiet under the reading ---- */
PM.sound.stems({ 'music-drone-bed': ['music', 40, -14, 1], 'music-oud-sparse': ['music', 39, -8, 1], 'sfx-pearls-pour': ['fx', 0, 0, 2] });
const tray = document.querySelector('.flow--tray');
let trayWas = null;
PM.sound.mix((y, P) => {
  PM.sound.level('music-drone-bed', 1); PM.sound.level('music-oud-sparse', PM.sm(.15, .6, P('c1', y)));
  // the tray of pearls: once each time it comes half into view from below
  if (tray) { const r = tray.getBoundingClientRect(), on = r.top < innerHeight * .55 && r.bottom > innerHeight * .3; if (on && trayWas === false) PM.sound.shot('sfx-pearls-pour'); trayWas = on; }
});
  };

  /* ================= PAGE.coinage: runs when coinage.html is parsed ================= */
  PAGE.coinage = function () {
/* ---- the turntable: held on its first frame while the plate settles, then turned by the scroll (storyboard row A) ---- */
(function () {
  if (!PM.FX) return;
  let c = null;
  PM.onFrame((now, dt, y) => {
    if (!c) { c = (PM.clip('k1') || [])[0]; if (!c) return; c.custom = true; }
    const s = PM.SI && PM.SI.k1; if (!s || s.far) return;
    c.update(PM.clamp(((y - s.top) / s.len - .22) / (.58 - .22)));
  });
})();

/* ---- era openers: normal scroll; the photo drifts a little slower than the page and a band of light crosses the metal ---- */
(function () {
  if (!PM.FX) return;
  const eras = PM.$$('.era').map(el => ({ el, plane: PM.$('.era__plane', el), last: -1 }));
  PM.onFrame(() => {
    const vh = innerHeight;
    for (const E of eras) {
      const r = E.el.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) continue;
      const p = PM.clamp((vh - r.top) / (vh + r.height));
      if (Math.abs(p - E.last) < .0015) continue; E.last = p;
      E.plane.style.transform = `translate3d(0,${((p - .5) * -5).toFixed(2)}%,0) scale(1.04)`;
      E.el.style.setProperty('--sp', (1 - PM.sm(.18, .82, p)).toFixed(4));
    }
  });
})();

/* ---- sound (off until the visitor opts in): the drone and the sparse oud; the deck at dawn under the peak ---- */
PM.sound.stems({ 'music-drone-bed': ['music', 40, -14, 1], 'music-oud-sparse': ['music', 39, -8, 1], 'amb-dawn-deck': ['bed', 28, -4, 2],
  'sfx-coin-turn': ['fx', 0, 0, 1], 'sfx-coin-palm': ['fx', 0, 0, 2] });
// one-shots fire once each time the scroll passes their mark going down
const past = {}, cross = (key, v, at) => { const was = past[key]; past[key] = v > at; return past[key] && was === false; };
PM.sound.mix((y, P) => {
  const k5 = P('k5', y), deck = PM.sm(-.1, .1, k5) * (1 - PM.sm(.95, 1.1, k5));
  if (cross('turn', P('k1', y), .22)) PM.sound.shot('sfx-coin-turn');
  if (cross('palm', k5, .39)) PM.sound.shot('sfx-coin-palm');
  PM.sound.level('music-drone-bed', 1);
  PM.sound.level('music-oud-sparse', PM.sm(.15, .6, P('k1', y)) * (1 - .5 * deck));
  PM.sound.level('amb-dawn-deck', deck);
});
  };

  /* ================= PAGE.merchants: runs when merchants.html is parsed ================= */
  PAGE.merchants = function () {
(() => {
'use strict';
const { $, $$, clamp, lerp, sm, FX, RM } = PM;

/* ---- scene choreography: positions in scene progress, 0 to 1 ---- */
PM.timeline('m1', (gsap, T) => T()
  .fromTo('#m1 .plane--bg', { scale: 1.07, xPercent: 1 }, { scale: 1, xPercent: 0, duration: 1, ease: 'power1.out' }, 0)
  .fromTo('#m1 .m1-dusk', { opacity: 0 }, { opacity: .8, duration: .5, ease: 'power1.in' }, .3));
PM.timeline('m9', (gsap, T) => T()
  .fromTo('#m9 .plane--bg', { scale: 1.06 }, { scale: 1, duration: 1, ease: 'power1.out' }, 0)
  .fromTo('#m9 .m9-night', { opacity: 0 }, { opacity: 1, duration: .45, ease: 'power1.in' }, .2));

/* ---- the sieve loop: a lighter file on phones ---- */
{ const v = $('.loop video[data-src-m]'); if (v && PM.mobile) v.src = v.dataset.srcM; }

/* ---- the launch: the photograph for reduced motion and no JS; under motion the clip's first frame is the poster,
   and the slowed clip (it stops just short of the dhow) plays from 4 to 80 percent of a longer scene, so the launch glides in ---- */
if (FX) { $('#m3Poster').src = 'assets/images/merchants/m3-launch-poster.jpg'; $('#m3PosterM').srcset = 'assets/images/merchants/m3-launch-m-poster.jpg'; }
(function () {
  if (!FX) return;
  let c = null;
  PM.onFrame((now, dt, y) => {
    if (!c) { c = (PM.clip('m3') || [])[0]; if (!c) return; c.custom = true; }
    const s = PM.SI && PM.SI.m3; if (!s || s.far) return;
    c.update(clamp(((y - s.top) / s.len - .04) / (.8 - .04)));
  });
})();

/* ---- the map: each route draws as the map rises into view (complete under reduced motion and without JS) ---- */
const map = $('#map'), mks = $$('.map__mk');
const setDraw = (el, v) => el.setAttribute('stroke-dashoffset', (1 - v).toFixed(4));
if (map && mks.length) {
  if (!FX) mks.forEach(el => setDraw(el, 1));
  else {
    mks.forEach(el => setDraw(el, 0));
    let lastM = -1;
    PM.onFrame(() => {
      const r = map.getBoundingClientRect(), vh = innerHeight;
      const q = clamp((vh * .92 - r.top) / (r.height * .9 + vh * .3));
      if (Math.abs(q - lastM) < .002) return; lastM = q;
      setDraw(mks[0], sm(.05, .6, q)); setDraw(mks[1], sm(.25, .85, q));
    });
  }
}

/* ---- sound: off until opted in; dusk sea, the open water, the drone under the reading ---- */
PM.sound.stems({
  'amb-open-sea':     ['bed', 28, -2, 1],
  'music-drone-bed':  ['music', 40, -12, 1],
  'music-oud-sparse': ['music', 39, -8, 2],
  'amb-creek-1949':   ['bed', 28, -6, 3],
  'sfx-oar-strokes':  ['bed', 10, 0, 2],
  'sfx-sieve-pearls': ['bed', 8, -2, 3]
});
const vis = id => { const el = document.getElementById(id); if (!el) return 0; const r = el.getBoundingClientRect(); return clamp((Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / innerHeight); };
const sieve = document.querySelector('figure.loop video[src*="m6-sieve"]');
const visEl = el => { const r = el.getBoundingClientRect(); return clamp((Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height)); };
const inScene = (P, id, y) => { const p = P(id, y); return sm(-.05, .06, p) * (1 - sm(.92, 1.02, p)); };
PM.sound.mix((y, P) => {
  PM.sound.level('amb-open-sea', Math.max(inScene(P, 'm1', y), inScene(P, 'm3', y)));
  PM.sound.level('music-drone-bed', .7);
  PM.sound.level('music-oud-sparse', Math.max(sm(.2, .6, vis('onward')), inScene(P, 'm9', y)));
  PM.sound.level('amb-creek-1949', inScene(P, 'm9', y) * .7);
  const m3 = P('m3', y); PM.sound.level('sfx-oar-strokes', sm(.02, .08, m3) * (1 - sm(.7, .82, m3)), .5);
  PM.sound.level('sfx-sieve-pearls', sieve ? sm(.25, .6, visEl(sieve)) : 0, .5);
});
})();
  };

  /* ================= PAGE.about: runs when about.html is parsed ================= */
  PAGE.about = function () {
/* ---- page choreography: positions in scene progress 0 to 1 ---- */
// 7 the wish: a calm settle onto the HQ
PM.timeline('wish', (gsap, T) => T().fromTo('#wish .plane--bg', { scale: 1.07 }, { scale: 1.0, ease: 'power1.out' }, 0));

/* ---- sound: off until opted in (header toggle) ---- */
PM.sound.stems({
  'amb-open-sea': ['bed', 28, 0, 1],
  'music-drone-bed': ['music', 40, -16, 1],
  'music-oud-sparse': ['music', 39, -4, 2],
  'amb-creek-today': ['bed', 28, -6, 3],
  'music-end-resolve': ['music', 0, -3, 3]
});
PM.sound.mix((y, P) => {
  const v = y / innerHeight, po = P('poet', y), w = P('wish', y);
  PM.sound.level('amb-open-sea', 1 - PM.sm(.5, 2.2, v));
  PM.sound.level('music-drone-bed', .6 + .4 * PM.sm(-.3, .1, po) * (1 - PM.sm(.9, 1.4, po)));
  PM.sound.level('music-oud-sparse', PM.sm(-.15, .12, po) * (1 - PM.sm(.85, 1.3, po)));
  PM.sound.level('amb-creek-today', PM.sm(-.2, .2, w));
  if (w > .6) PM.sound.cue('music-end-resolve', true); else if (w < .3) PM.sound.cue('music-end-resolve', false, 1.2);
});
  };

  /* ================= PAGE.visit: runs when visit.html is parsed ================= */
  PAGE.visit = function () {
/* ---- page choreography: one calm settle onto the HQ as the visitor scrolls ---- */
PM.timeline('v1', (gsap, T) => T().fromTo('#v1 .plane--bg', { scale: 1.06 }, { scale: 1.0, ease: 'power1.out' }, 0));

/* ---- the request form: design only. Nothing is ever sent; fields show validation once touched ---- */
(() => {
  const form = document.getElementById('reqForm');
  if (!form) return;
  const date = document.getElementById('fDate');
  const t = new Date(); t.setDate(t.getDate() + 1);
  date.min = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const rules = {
    fName: el => el.value.trim() ? '' : 'Please enter your name.',
    fDate: el => !el.value ? 'Please choose a preferred date.' : (el.value < el.min ? 'Please choose a date after today.' : ''),
    fSize: el => (/^\d+$/.test(el.value.trim()) && +el.value >= 1) ? '' : 'Please enter a whole number, 1 or more.'
  };
  const check = el => {
    const msg = rules[el.id](el), err = document.getElementById(el.id + 'Err');
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    err.querySelector('span').textContent = msg || err.querySelector('span').textContent;
    err.hidden = !msg;
  };
  Object.keys(rules).forEach(id => {
    const el = document.getElementById(id);
    // a field is checked once the visitor has typed in it (so simply tabbing past an empty field stays quiet)
    const mark = () => { el.dataset.touched = '1'; };
    el.addEventListener('input', () => { if (el.dataset.blurred) check(el); else mark(); });
    el.addEventListener('change', mark);
    el.addEventListener('blur', () => { if (el.dataset.touched) { el.dataset.blurred = '1'; check(el); } });
  });
  // Send request: check every required field; nothing is sent yet (no backend), the status line says so
  const status = document.getElementById('reqStatus');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const bad = Object.keys(rules).map(id => document.getElementById(id)).filter(el => { el.dataset.blurred = '1'; check(el); return el.getAttribute('aria-invalid') === 'true'; });
    if (bad.length) { status.hidden = true; bad[0].focus(); return; }
    status.textContent = 'Thank you. Online requests are not open yet, so this request has not been sent.';
    status.hidden = false;
  });
})();

/* ---- sound: off until opted in (header toggle); the Creek today, quietly ---- */
PM.sound.stems({ 'amb-creek-today': ['bed', 28, -6, 1] });
PM.sound.mix((y, P) => { PM.sound.level('amb-creek-today', 1 - .5 * PM.sm(.6, 2.4, P('v1', y))); });
  };

  if (HEAD[NAME]) HEAD[NAME](); else SITE();
  if (document.readyState !== 'loading') afterParse();
})();
