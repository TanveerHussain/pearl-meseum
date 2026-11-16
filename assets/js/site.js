/* =====================================================================================================
   Pearl Museum kit: site.js (load it in <head>, WITHOUT defer). It needs nothing else to be loaded first:
     - it loads GSAP itself (assets/js/vendor/gsap-3.12.5.min.js) without blocking;
       copy, cues, clips and the menu work before GSAP arrives, page timelines are added once it is there
     - it loads assets/js/menu.js itself as soon as the page is parsed (a <script src="assets/js/menu.js"> tag is harmless)
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
  const KIT = ((document.currentScript && document.currentScript.src) || '').replace(/site\.js(\?.*)?$/, '');
  PM.kit = KIT;
  const addScript = (src, onerror) => { const el = document.createElement('script'); el.src = src; el.async = true; if (onerror) el.onerror = onerror; document.head.appendChild(el); return el; };
  if (FX && !window.gsap && !document.querySelector('script[src*="gsap"]'))
    addScript(KIT + 'vendor/gsap-3.12.5.min.js');
  const ensureMenu = () => { if (!window.PMMenu && !document.getElementById('pm-menu') && document.querySelector('header.top')) addScript(KIT + 'menu.js'); };

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
