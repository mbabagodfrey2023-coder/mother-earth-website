/**
 * Mother Earth Kenya — Mobile Menu (drop-in)
 *
 * Add to any page with: <script src="/mobile-menu.js" defer></script>
 *
 * Renders a hamburger button + slide-in sheet on mobile only.
 * Auto-detects which page is active. Same nav order as desktop:
 * HOME · // LIVE OPS · IRIS · CHAPTERS · GOVERNANCE · ABOUT · ROADMAP · PRESS
 *
 * Self-contained: injects own CSS, HTML, and event handlers. Safe to
 * load alongside echo-widget.js (different element IDs, no conflict).
 */
(function () {
  'use strict';
  if (window.__ME_MOBILE_MENU__) return;
  window.__ME_MOBILE_MENU__ = true;

  const NAV = [
    { label: 'Home',        href: '/',                       path: '/' },
    { label: '// Live Ops', href: '/mission-control.html',   path: '/mission-control' },
    { label: 'IRIS',        href: '/iris.html',              path: '/iris' },
    { label: 'Chapters',    href: '/chapters.html',          path: '/chapters' },
    { label: 'Governance',  href: '/governance.html',        path: '/governance' },
    { label: 'About',       href: '/about.html',             path: '/about' },
    { label: 'Roadmap',     href: '/roadmap.html',           path: '/roadmap' },
    { label: 'Press',           href: '/press.html',             path: '/press' },
    { label: 'Finances',        href: '/finances.html',          path: '/finances' },
    { label: 'Council Archive', href: '/council-archive.html',   path: '/council-archive' },
  ];

  // Detect active page
  const here = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';

  /* ── CSS ──────────────────────────────────────────────────── */
  const css = `
  #me-mm-btn {
    display: none;
    position: fixed; top: 14px; right: 16px; z-index: 9995;
    width: 44px; height: 44px; padding: 0;
    background: rgba(2,6,6,.9); border: 1px solid rgba(255,255,255,.1);
    border-radius: 10px; backdrop-filter: blur(20px);
    align-items: center; justify-content: center;
    cursor: pointer; transition: border-color .2s, background .2s;
  }
  #me-mm-btn:hover { border-color: rgba(74,222,128,.4); background: rgba(13,43,28,.9); }
  #me-mm-btn .me-mm-bars { display:flex; flex-direction:column; gap:5px; align-items:flex-end; }
  #me-mm-btn .me-mm-bars span {
    display:block; height: 1.5px; background: #F2F0EB; border-radius: 1px;
    transition: width .25s ease, transform .25s ease, opacity .25s ease;
  }
  #me-mm-btn .me-mm-bars span:nth-child(1) { width: 20px; }
  #me-mm-btn .me-mm-bars span:nth-child(2) { width: 14px; }
  #me-mm-btn .me-mm-bars span:nth-child(3) { width: 20px; }
  body.me-mm-open #me-mm-btn .me-mm-bars span:nth-child(1) { transform: translateY(7px) rotate(45deg); width: 20px; }
  body.me-mm-open #me-mm-btn .me-mm-bars span:nth-child(2) { opacity: 0; }
  body.me-mm-open #me-mm-btn .me-mm-bars span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); width: 20px; }

  #me-mm-overlay {
    display: none; position: fixed; inset: 0; z-index: 9990;
    background: rgba(2,6,6,.72); backdrop-filter: blur(12px);
    opacity: 0; transition: opacity .3s ease;
  }
  #me-mm-overlay.show { display: block; opacity: 1; }

  #me-mm-sheet {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 9993;
    width: 84%; max-width: 380px;
    background: #050d0a; border-left: 1px solid rgba(212,175,55,.12);
    box-shadow: -24px 0 64px rgba(0,0,0,.6);
    transform: translateX(100%); transition: transform .35s cubic-bezier(.2,.9,.3,1);
    display: flex; flex-direction: column;
    padding: 80px 28px 24px;
    overflow-y: auto;
  }
  body.me-mm-open #me-mm-sheet { transform: translateX(0); }

  .me-mm-brand {
    display: flex; align-items: center; gap: 12px; margin-bottom: 32px;
    padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .me-mm-brand img { width: 44px; height: 44px; object-fit: contain; }
  .me-mm-brand strong { font-size: 14px; font-weight: 800; letter-spacing: .04em; color: #F2F0EB; }
  .me-mm-brand small {
    display: block; font-family:'JetBrains Mono', monospace;
    font-size: 9px; letter-spacing: .2em; color: rgba(74,222,128,.7); margin-top: 2px;
  }

  .me-mm-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .me-mm-nav a {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 18px; border-radius: 10px;
    font-size: 16px; font-weight: 600; letter-spacing: .01em;
    color: rgba(242,240,235,.78); text-decoration: none;
    transition: background .2s, color .2s, padding .2s;
    border: 1px solid transparent;
  }
  .me-mm-nav a:hover {
    background: rgba(74,222,128,.06); color: #F2F0EB; padding-left: 22px;
  }
  .me-mm-nav a.active {
    background: rgba(212,175,55,.08); color: #D4AF37;
    border-color: rgba(212,175,55,.2);
  }
  .me-mm-nav a::after {
    content: '→'; font-family:'JetBrains Mono', monospace;
    font-size: 14px; opacity: 0; transform: translateX(-6px);
    transition: opacity .2s, transform .2s;
  }
  .me-mm-nav a:hover::after,
  .me-mm-nav a.active::after { opacity: .7; transform: translateX(0); }

  .me-mm-foot {
    margin-top: 28px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.06);
    display: flex; flex-direction: column; gap: 12px;
  }
  .me-mm-foot a {
    text-align: center; padding: 14px;
    border-radius: 8px; font-size: 13px; font-weight: 700; letter-spacing: .04em;
    text-decoration: none;
  }
  .me-mm-cta {
    background: #4ade80; color: #000;
  }
  .me-mm-cta:hover { background: #86efac; }
  .me-mm-meta {
    text-align: center; font-family:'JetBrains Mono', monospace;
    font-size: 9px; letter-spacing: .2em; color: rgba(242,240,235,.32);
    margin-top: 12px;
  }

  /* SHOW BUTTON ONLY ON MOBILE / TABLET */
  @media (max-width: 1050px) { #me-mm-btn { display: inline-flex; } }

  /* Disable body scroll when open */
  body.me-mm-open { overflow: hidden; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── HTML ──────────────────────────────────────────────────── */
  const navItemsHtml = NAV.map(item => {
    const active = (here === item.path || here === item.path.replace(/^\//, ''))
      ? ' class="active"' : '';
    return `<a href="${item.href}"${active}>${item.label}</a>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button id="me-mm-btn" type="button" aria-label="Open menu">
      <span class="me-mm-bars"><span></span><span></span><span></span></span>
    </button>
    <div id="me-mm-overlay" aria-hidden="true"></div>
    <aside id="me-mm-sheet" aria-label="Mobile navigation">
      <div class="me-mm-brand">
        <img src="/logo-official-256.png" alt="Mother Earth Kenya"/>
        <div>
          <strong>MOTHER EARTH</strong>
          <small>// PLANETARY INTELLIGENCE</small>
        </div>
      </div>
      <nav class="me-mm-nav">
        ${navItemsHtml}
      </nav>
      <div class="me-mm-foot">
        <a class="me-mm-cta" href="mailto:hello@motherearth.systems">Get in Touch →</a>
        <div class="me-mm-meta">© 2026 · MOTHER EARTH KENYA LTD</div>
      </div>
    </aside>
  `;
  document.body.appendChild(wrap);

  /* ── BEHAVIOUR ─────────────────────────────────────────────── */
  const btn = document.getElementById('me-mm-btn');
  const overlay = document.getElementById('me-mm-overlay');
  const sheet = document.getElementById('me-mm-sheet');

  function open() {
    document.body.classList.add('me-mm-open');
    overlay.classList.add('show');
    btn.setAttribute('aria-expanded', 'true');
  }
  function close() {
    document.body.classList.remove('me-mm-open');
    overlay.classList.remove('show');
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    if (document.body.classList.contains('me-mm-open')) close();
    else open();
  }

  btn.addEventListener('click', toggle);
  overlay.addEventListener('click', close);
  // Close when any nav link tapped
  sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  // Close on escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();
