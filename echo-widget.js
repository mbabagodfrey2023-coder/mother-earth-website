/**
 * Mother Earth Kenya — ECHO Chat Widget (drop-in)
 *
 * Add to any page with: <script src="/echo-widget.js" defer></script>
 *
 * Self-contained: injects own CSS, HTML, and event handlers.
 * Calls /api/chat (Cloudflare Pages Function powered by Claude).
 * Safe to load on pages that don't define --green/--text/--bg vars (falls back
 * to inline-color values).
 */
(function () {
  'use strict';
  // Guard: don't double-init
  if (window.__ME_ECHO_LOADED__) return;
  window.__ME_ECHO_LOADED__ = true;

  /* ── CSS (scoped via #echo-* selectors so it can't bleed) ───────────── */
  const css = `
  #me-echo-btn {
    position: fixed; bottom: 28px; right: 28px; z-index: 9000;
    width: 56px; height: 56px; border-radius: 50%;
    background: #4ade80; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 0 rgba(74,222,128,0.5);
    animation: meEchoPulse 2.5s infinite;
    transition: transform .2s, background .2s; font-size: 22px;
  }
  #me-echo-btn:hover { transform: scale(1.1); background: #86efac; }
  #me-echo-btn .me-echo-badge {
    position: absolute; top: -2px; right: -2px;
    background: #ef4444; color: #fff; font-size: 9px; font-weight: 700;
    width: 16px; height: 16px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', monospace;
  }
  @keyframes meEchoPulse {
    0%   { box-shadow: 0 0 0 0 rgba(74,222,128,.5); }
    70%  { box-shadow: 0 0 0 14px rgba(74,222,128,0); }
    100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
  }
  #me-echo-panel {
    position: fixed; bottom: 96px; right: 28px; z-index: 9000;
    width: 360px; max-width: calc(100vw - 48px);
    background: #0a1628; border: 1px solid rgba(74,222,128,0.3);
    border-radius: 16px; overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    display: none; flex-direction: column;
    transform: translateY(20px); opacity: 0;
    transition: transform .3s ease, opacity .3s ease;
  }
  #me-echo-panel.open { display: flex; transform: translateY(0); opacity: 1; }
  .me-echo-header {
    background: linear-gradient(135deg, rgba(74,222,128,0.15), rgba(14,165,233,0.1));
    padding: 16px 20px; border-bottom: 1px solid rgba(74,222,128,0.15);
    display: flex; align-items: center; gap: 12px;
  }
  .me-echo-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(74,222,128,0.2); border: 1px solid rgba(74,222,128,0.4);
    display: flex; align-items: center; justify-content: center; font-size: 16px;
  }
  .me-echo-header-info .me-echo-name { font-size: 13px; font-weight: 700; color: #F2F0EB; }
  .me-echo-header-info .me-echo-status {
    font-size: 10px; color: #4ade80; font-family: 'JetBrains Mono', monospace;
    display: flex; align-items: center; gap: 5px;
  }
  .me-echo-status::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: #4ade80; display: inline-block;
  }
  .me-echo-close {
    margin-left: auto; background: none; border: none; color: rgba(255,255,255,.4);
    cursor: pointer; font-size: 18px; line-height: 1; padding: 4px;
    transition: color .2s;
  }
  .me-echo-close:hover { color: #F2F0EB; }
  #me-echo-messages {
    flex: 1; overflow-y: auto; padding: 16px; display: flex;
    flex-direction: column; gap: 12px; min-height: 280px; max-height: 380px;
  }
  #me-echo-messages::-webkit-scrollbar { width: 4px; }
  #me-echo-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }
  .me-echo-msg {
    max-width: 85%; font-size: 13px; line-height: 1.6;
    padding: 10px 14px; border-radius: 12px;
    animation: meEchoMsgIn .2s ease;
  }
  @keyframes meEchoMsgIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  .me-echo-msg.bot {
    background: rgba(255,255,255,0.06); color: rgba(247,250,252,0.9);
    border-radius: 4px 12px 12px 12px; align-self: flex-start;
  }
  .me-echo-msg.user {
    background: rgba(74,222,128,0.15); color: #F2F0EB;
    border: 1px solid rgba(74,222,128,0.2);
    border-radius: 12px 4px 12px 12px; align-self: flex-end;
  }
  .me-echo-typing {
    display: flex; gap: 4px; padding: 12px 14px;
    background: rgba(255,255,255,0.06); border-radius: 4px 12px 12px 12px;
    align-self: flex-start; align-items: center;
  }
  .me-echo-typing span {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(74,222,128,.6); animation: meEchoTyping 1.2s infinite;
  }
  .me-echo-typing span:nth-child(2) { animation-delay: .2s; }
  .me-echo-typing span:nth-child(3) { animation-delay: .4s; }
  @keyframes meEchoTyping { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
  .me-echo-input-row {
    padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.06);
    display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.2);
  }
  #me-echo-input {
    flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; padding: 10px 14px; color: #F2F0EB;
    font-family: 'Inter', sans-serif; font-size: 13px; outline: none;
    transition: border-color .2s; resize: none; max-height: 80px;
  }
  #me-echo-input:focus { border-color: rgba(74,222,128,0.4); }
  #me-echo-input::placeholder { color: rgba(255,255,255,.3); }
  #me-echo-send {
    width: 36px; height: 36px; border-radius: 8px;
    background: #4ade80; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; flex-shrink: 0; transition: background .2s, opacity .2s;
  }
  #me-echo-send:hover { background: #86efac; }
  #me-echo-send:disabled { opacity: .4; cursor: not-allowed; }
  .me-echo-suggestions {
    padding: 0 16px 12px; display: flex; flex-wrap: wrap; gap: 6px;
  }
  .me-echo-suggestion {
    background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.2);
    color: rgba(74,222,128,.8); font-size: 11px; padding: 5px 10px;
    border-radius: 20px; cursor: pointer; font-family: 'Inter', sans-serif;
    transition: background .2s, color .2s;
  }
  .me-echo-suggestion:hover { background: rgba(74,222,128,0.2); color: #4ade80; }
  .me-echo-footer-note {
    text-align: center; font-size: 10px; color: rgba(255,255,255,.2);
    padding: 0 16px 10px; font-family: 'JetBrains Mono', monospace;
  }
  @media (max-width: 500px) {
    #me-echo-btn { bottom: 20px; right: 20px; width: 50px; height: 50px; }
    #me-echo-panel { bottom: 84px; right: 16px; left: 16px; width: auto; }
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ── HTML ──────────────────────────────────────────────────────────── */
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <button id="me-echo-btn" title="Chat with ECHO — Mother Earth AI">
      🌍 <span class="me-echo-badge">AI</span>
    </button>
    <div id="me-echo-panel">
      <div class="me-echo-header">
        <div class="me-echo-avatar">🌍</div>
        <div class="me-echo-header-info">
          <div class="me-echo-name">ECHO — Mother Earth AI</div>
          <div class="me-echo-status">Online · Environmental Intelligence</div>
        </div>
        <button class="me-echo-close" type="button">✕</button>
      </div>
      <div id="me-echo-messages"></div>
      <div class="me-echo-suggestions" id="me-echo-suggestions">
        <button class="me-echo-suggestion" type="button">What does Mother Earth do?</button>
        <button class="me-echo-suggestion" type="button">What is the current CO₂ level?</button>
        <button class="me-echo-suggestion" type="button">How can my country start a chapter?</button>
        <button class="me-echo-suggestion" type="button">How does IRIS data work?</button>
      </div>
      <div class="me-echo-input-row">
        <textarea id="me-echo-input" placeholder="Ask ECHO anything..." rows="1"></textarea>
        <button id="me-echo-send" type="button">➤</button>
      </div>
      <div class="me-echo-footer-note">Powered by Claude · Mother Earth</div>
    </div>
  `;
  document.body.appendChild(wrapper);

  /* ── STATE ─────────────────────────────────────────────────────────── */
  let open = false;
  let messages = [];     // {role, content}
  let waiting = false;

  // Page context — gives ECHO awareness of which page the visitor is on
  function pageContext() {
    const path = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
    const map = {
      '/':                'the homepage',
      '/index':           'the homepage',
      '/mission-control': 'Mission Control (live operations dashboard)',
      '/iris':            'the IRIS Data Marketplace landing page',
      '/chapters':        'the Global Chapters page',
      '/about':           'the About / Founder / Manifesto page',
      '/privacy':         'the Privacy Policy page',
      '/terms':           'the Terms of Service page',
      '/api-docs':        'the IRIS API documentation page',
    };
    return map[path] || ('the page ' + path);
  }

  /* ── HELPERS ───────────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  function toggle() {
    open = !open;
    $('me-echo-panel').classList.toggle('open', open);
    if (open && messages.length === 0) greet();
    if (open) setTimeout(() => $('me-echo-input').focus(), 300);
  }

  function greet() {
    addMsg('bot', "Hi, I'm ECHO — Mother Earth's communications agent. You're on " + pageContext() + ". Ask me anything about our 33 AI agents, environmental data, global chapters, or governance.");
  }

  function addMsg(role, text) {
    const m = $('me-echo-messages');
    const d = document.createElement('div');
    d.className = 'me-echo-msg ' + role;
    d.textContent = text;
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
  }

  function showTyping() {
    const m = $('me-echo-messages');
    const d = document.createElement('div');
    d.className = 'me-echo-typing'; d.id = 'me-echo-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
  }

  function hideTyping() {
    const t = $('me-echo-typing');
    if (t) t.remove();
  }

  function suggest(text) {
    $('me-echo-input').value = text;
    $('me-echo-suggestions').style.display = 'none';
    send();
  }

  async function send() {
    if (waiting) return;
    const input = $('me-echo-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = ''; input.style.height = 'auto';
    $('me-echo-suggestions').style.display = 'none';
    addMsg('user', text);

    // Prepend page-context note on first user message so ECHO knows where they are
    if (messages.length === 0) {
      messages.push({ role: 'user', content: '[Visitor is currently on ' + pageContext() + '] ' + text });
    } else {
      messages.push({ role: 'user', content: text });
    }

    waiting = true;
    $('me-echo-send').disabled = true;
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages })
      });
      const data = await res.json();
      hideTyping();
      if (data.reply) {
        addMsg('bot', data.reply);
        messages.push({ role: 'assistant', content: data.reply });
      } else {
        addMsg('bot', data.error || 'Something went wrong. Try again in a moment.');
      }
    } catch (err) {
      hideTyping();
      addMsg('bot', 'Connection error. Please check your network and try again.');
    }
    waiting = false;
    $('me-echo-send').disabled = false;
    $('me-echo-input').focus();
  }

  /* ── EVENT WIRING ──────────────────────────────────────────────────── */
  $('me-echo-btn').addEventListener('click', toggle);
  document.querySelector('.me-echo-close').addEventListener('click', toggle);
  $('me-echo-send').addEventListener('click', send);
  $('me-echo-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('me-echo-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });
  document.querySelectorAll('.me-echo-suggestion').forEach(btn => {
    btn.addEventListener('click', () => suggest(btn.textContent.trim()));
  });
})();
