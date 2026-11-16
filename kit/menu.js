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
  const base = (document.currentScript && document.currentScript.src || '').replace(/menu\.js(\?.*)?$/, '');
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
        <a class="pm-menu__mark" href="index.html" aria-label="Emirates NBD Pearl Museum, home"><img src="${base}logo-enbd-white.svg" alt="" width="110" height="30"><span class="div" aria-hidden="true"></span><span class="t" aria-hidden="true">Pearl Museum</span></a>
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
