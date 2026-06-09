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
  /* ── VOICE CONTROLS ── */
  .me-echo-voice-btn {
    background: none; border: 1px solid rgba(255,255,255,.12); border-radius: 6px;
    color: rgba(255,255,255,.55); cursor: pointer;
    width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; transition: color .2s, border-color .2s, background .2s;
    margin-right: 6px;
  }
  .me-echo-voice-btn:hover { color: #4ade80; border-color: rgba(74,222,128,.4); }
  .me-echo-voice-btn.active {
    color: #4ade80; border-color: rgba(74,222,128,.45); background: rgba(74,222,128,.06);
    box-shadow: 0 0 8px rgba(74,222,128,.18);
  }
  .me-echo-voice-btn.speaking { animation: meEchoSpeakPulse 1.2s ease-in-out infinite; }
  @keyframes meEchoSpeakPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,.45); }
    50%     { box-shadow: 0 0 0 6px rgba(74,222,128,0); }
  }
  .me-echo-voice-panel {
    display: none; position: absolute; top: 60px; right: 14px; z-index: 5;
    background: #050d0a; border: 1px solid rgba(74,222,128,0.25); border-radius: 10px;
    padding: 12px 14px; min-width: 220px;
    box-shadow: 0 12px 32px rgba(0,0,0,.5);
  }
  .me-echo-voice-panel.open { display: block; }
  .me-echo-voice-panel h5 {
    font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: .2em;
    color: rgba(74,222,128,.7); margin: 0 0 8px; font-weight: 700;
  }
  .me-echo-voice-panel .me-vp-row {
    display: flex; gap: 6px; margin-bottom: 10px;
  }
  .me-echo-voice-panel .me-vp-gender {
    flex: 1; padding: 7px; background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.08); border-radius: 6px;
    color: rgba(255,255,255,.55); cursor: pointer; font-size: 11px; font-weight: 600;
    transition: all .2s;
  }
  .me-echo-voice-panel .me-vp-gender.active {
    background: rgba(74,222,128,.1); color: #4ade80; border-color: rgba(74,222,128,.4);
  }
  .me-echo-voice-panel select {
    width: 100%; padding: 8px 10px; background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.08); border-radius: 6px;
    color: #F2F0EB; font-size: 11px; font-family: 'Inter', sans-serif;
    cursor: pointer; outline: none;
  }
  .me-echo-voice-panel select option { background: #050d0a; color: #F2F0EB; }
  .me-echo-voice-panel .me-vp-note {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: rgba(255,255,255,.3); margin-top: 8px; letter-spacing: .05em;
  }
  .me-echo-voice-test {
    background: rgba(74,222,128,.08); border: 1px solid rgba(74,222,128,.3);
    color: #4ade80; padding: 6px 12px; border-radius: 5px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .1em;
    width: 100%; margin-top: 6px; font-weight: 700;
  }
  .me-echo-voice-test:hover { background: rgba(74,222,128,.15); }

  #me-echo-mic {
    width: 36px; height: 36px; border-radius: 8px;
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
    color: rgba(255,255,255,.55); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; flex-shrink: 0; transition: all .2s; margin-right: 6px;
  }
  #me-echo-mic:hover { color: #4ade80; border-color: rgba(74,222,128,.3); }
  #me-echo-mic.recording {
    background: rgba(239,68,68,.15); border-color: rgba(239,68,68,.45);
    color: #ef4444; animation: meEchoMicPulse 1s ease-in-out infinite;
  }
  @keyframes meEchoMicPulse {
    0%,100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(239,68,68,.4); }
    50%     { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(239,68,68,0); }
  }
  #me-echo-mic[disabled] { opacity: .3; cursor: not-allowed; }

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
      <div class="me-echo-header" style="position:relative">
        <div class="me-echo-avatar">🌍</div>
        <div class="me-echo-header-info">
          <div class="me-echo-name">ECHO — Mother Earth AI</div>
          <div class="me-echo-status">Online · Environmental Intelligence</div>
        </div>
        <button class="me-echo-voice-btn" id="me-echo-voice-toggle" type="button" title="Toggle voice mode — ECHO speaks responses">🔊</button>
        <button class="me-echo-close" type="button">✕</button>
        <div class="me-echo-voice-panel" id="me-echo-voice-panel">
          <h5>// VOICE SETTINGS</h5>
          <div class="me-vp-row">
            <button class="me-vp-gender" data-gender="female" type="button">Female</button>
            <button class="me-vp-gender" data-gender="male" type="button">Male</button>
          </div>
          <select id="me-echo-voice-select"></select>
          <button class="me-echo-voice-test" id="me-echo-voice-test" type="button">▶ TEST VOICE</button>
          <div class="me-vp-note">Voices use your device's built-in TTS · free · private</div>
        </div>
      </div>
      <div id="me-echo-messages"></div>
      <div class="me-echo-suggestions" id="me-echo-suggestions">
        <button class="me-echo-suggestion" type="button">What does Mother Earth do?</button>
        <button class="me-echo-suggestion" type="button">What is the current CO₂ level?</button>
        <button class="me-echo-suggestion" type="button">How can my country start a chapter?</button>
        <button class="me-echo-suggestion" type="button">How does IRIS data work?</button>
      </div>
      <div class="me-echo-input-row">
        <button id="me-echo-mic" type="button" title="Tap to speak (instead of typing)">🎙️</button>
        <textarea id="me-echo-input" placeholder="Ask ECHO anything..." rows="1"></textarea>
        <button id="me-echo-send" type="button">➤</button>
      </div>
      <div class="me-echo-footer-note">Powered by Claude · Voice via your device · Mother Earth</div>
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
      '/mission-control': 'Mission Control (live operations dashboard with the public Council Chamber)',
      '/iris':            'the IRIS Data Marketplace landing page',
      '/chapters':        'the Global Chapters page',
      '/governance':      'the Governance page (Purpose Trust + Golden Share constitutional document)',
      '/about':           'the About / Founder / Manifesto page',
      '/roadmap':         'the public Roadmap page',
      '/press':           'the Press kit / Recent shipping page',
      '/finances':        'the Finances open-books transparency page',
      '/council-archive': 'the public Council Archive (past AI deliberations with permalinks)',
      '/data-pipeline':   'the Data Pipeline explainer (NASA → GAIA → screen, 15-min refresh)',
      '/partners':        'the Partners page (institutional partnerships, MOUs, chapter pipeline)',
      '/contact':         'the Contact page (general, press, partnership, chapter, research routing)',
      '/privacy':         'the Privacy Policy page',
      '/terms':           'the Terms of Service page',
      '/api-docs':        'the IRIS API documentation page',
      '/brand-kit':       'the brand kit page',
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
    // Speak bot replies if voice mode is on
    if (role === 'bot' && voicePrefs.enabled) speak(text);
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

  /* ── VOICE ENGINE ──────────────────────────────────────────────────────
     Browser Web Speech API — free, zero-latency, private.
     speechSynthesis = TTS (ECHO speaks)
     SpeechRecognition = STT (user speaks instead of typing)
  ─────────────────────────────────────────────────────────────────────── */

  const synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Persisted prefs
  const voicePrefs = {
    enabled: localStorage.getItem('me-echo-voice-on')   === '1',
    gender:  localStorage.getItem('me-echo-voice-gender') || 'female',
    voiceURI:localStorage.getItem('me-echo-voice-uri')   || null,
  };
  let availableVoices = [];

  // Heuristic gender classifier on voice name + lang
  // Apple's M voices: Daniel, Alex, Fred, Aaron, Tom, Arthur, Bruce, etc.
  // Apple's F voices: Samantha, Karen, Moira, Tessa, Victoria, Allison, Ava, etc.
  // Google: "en-GB-Standard-A" patterns — we fall back to heuristic word match
  const MALE_HINTS   = /\b(male|man|guy|adam|alex|alexander|arnold|antoni|aaron|arthur|brian|bruce|callum|charles|daniel|david|diego|domi|eddie|eric|fred|george|henry|jack|james|jason|jeff|john|josh|kevin|liam|luca|mark|matt|michael|nathan|noah|oliver|onyx|paul|peter|reuben|ryan|sam|sebastian|simon|stephen|steve|thomas|tom|toby|will|william)\b/i;
  const FEMALE_HINTS = /\b(female|woman|girl|alice|allison|amy|anna|ava|bella|carla|cathy|charlotte|chloe|claire|domi|elena|elsa|emma|eva|fiona|grace|hannah|helena|isabella|jenny|joanna|julia|karen|kate|kathy|lara|laura|linda|lucy|lulu|maria|mary|maya|moira|monica|natasha|nicki|nicole|nova|olivia|paige|rachel|raveena|rebecca|samantha|sara|sarah|shimmer|sophia|stacy|stephanie|susan|tessa|valeria|victoria|zoe)\b/i;

  function guessGender(voice) {
    const name = (voice.name || '').toLowerCase();
    if (MALE_HINTS.test(name))   return 'male';
    if (FEMALE_HINTS.test(name)) return 'female';
    // Voice name like "en-US-Standard-D" — D/B/I/J = male, A/C/E/F/G/H = female (Google convention)
    const m = name.match(/-([a-z])$/i);
    if (m) {
      const ch = m[1].toUpperCase();
      if ('BDIJ'.includes(ch)) return 'male';
      if ('ACEFGH'.includes(ch)) return 'female';
    }
    return 'unknown';
  }

  function loadVoices() {
    if (!synth) return [];
    const all = synth.getVoices();
    if (all.length === 0) return [];
    // Filter to English voices only (any locale) for now
    availableVoices = all.filter(v => /^en/i.test(v.lang));
    return availableVoices;
  }

  function pickVoice() {
    if (availableVoices.length === 0) loadVoices();
    if (availableVoices.length === 0) return null;
    // Try saved URI first
    if (voicePrefs.voiceURI) {
      const saved = availableVoices.find(v => v.voiceURI === voicePrefs.voiceURI);
      if (saved) return saved;
    }
    // Then any voice matching preferred gender
    const matches = availableVoices.filter(v => guessGender(v) === voicePrefs.gender);
    if (matches.length > 0) {
      // Prefer local (high-quality) voices over remote
      const local = matches.find(v => v.localService);
      return local || matches[0];
    }
    return availableVoices[0];
  }

  function speak(text) {
    if (!synth || !text) return;
    try {
      synth.cancel();  // stop anything already speaking
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate  = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      const toggleBtn = $('me-echo-voice-toggle');
      u.onstart = () => toggleBtn && toggleBtn.classList.add('speaking');
      u.onend   = () => toggleBtn && toggleBtn.classList.remove('speaking');
      u.onerror = () => toggleBtn && toggleBtn.classList.remove('speaking');
      synth.speak(u);
    } catch (e) { /* ignore — best effort */ }
  }

  function stopSpeaking() { if (synth) synth.cancel(); }

  function populateVoiceSelect() {
    const sel = $('me-echo-voice-select');
    if (!sel) return;
    if (availableVoices.length === 0) loadVoices();
    const filtered = availableVoices.filter(v => guessGender(v) === voicePrefs.gender);
    const list = filtered.length > 0 ? filtered : availableVoices;
    sel.innerHTML = list.map(v =>
      `<option value="${v.voiceURI}" ${v.voiceURI === voicePrefs.voiceURI ? 'selected' : ''}>${v.name} (${v.lang})${v.localService ? ' ★' : ''}</option>`
    ).join('') || '<option>No voices available</option>';
  }

  function setVoiceMode(on) {
    voicePrefs.enabled = on;
    localStorage.setItem('me-echo-voice-on', on ? '1' : '0');
    const btn = $('me-echo-voice-toggle');
    if (btn) {
      btn.classList.toggle('active', on);
      btn.textContent = on ? '🔊' : '🔇';
      btn.title = on
        ? 'Voice mode ON — ECHO speaks replies. Click to open settings.'
        : 'Voice mode OFF — click to enable spoken replies';
    }
    if (!on) stopSpeaking();
  }

  function setGender(g) {
    voicePrefs.gender = g;
    voicePrefs.voiceURI = null;  // reset specific voice so pickVoice() re-selects
    localStorage.setItem('me-echo-voice-gender', g);
    localStorage.removeItem('me-echo-voice-uri');
    document.querySelectorAll('.me-vp-gender').forEach(b =>
      b.classList.toggle('active', b.dataset.gender === g)
    );
    populateVoiceSelect();
  }

  /* ── MIC INPUT ── */
  let recognition = null;
  let recognising = false;
  let lastTranscript = '';
  let gotAnyResult = false;

  function initMic() {
    const mic = $('me-echo-mic');
    if (!mic) return;
    if (!SpeechRec) {
      mic.disabled = true;
      mic.title = 'Voice input not supported in this browser';
      return;
    }
    recognition = new SpeechRec();
    recognition.continuous     = false;
    recognition.interimResults = true;   // show live transcript as user speaks
    recognition.lang           = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      gotAnyResult = false;
      lastTranscript = '';
      const input = $('me-echo-input');
      if (input) input.placeholder = '🎙️ Listening… speak now';
    };

    recognition.onresult = (e) => {
      gotAnyResult = true;
      // Build full transcript from all results
      let interim = '', final = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final   += r[0].transcript;
        else           interim += r[0].transcript;
      }
      lastTranscript = (final || interim).trim();
      const input = $('me-echo-input');
      if (input) input.value = lastTranscript;
    };

    recognition.onend = () => {
      recognising = false;
      const mic   = $('me-echo-mic');
      const input = $('me-echo-input');
      if (mic) {
        mic.classList.remove('recording');
        mic.textContent = '🎙️';
      }
      if (input) input.placeholder = 'Ask ECHO anything...';

      // If we got a transcript, auto-send it. Otherwise, surface a helpful message.
      if (lastTranscript && lastTranscript.length > 0) {
        setTimeout(() => send(), 300);
      } else if (!gotAnyResult) {
        addMsg('bot', "🎙️ I didn't catch any speech. Try again — speak clearly within ~3 seconds of tapping the mic. Or type your question instead.");
      }
    };

    recognition.onerror = (e) => {
      recognising = false;
      const mic = $('me-echo-mic');
      const input = $('me-echo-input');
      if (mic) {
        mic.classList.remove('recording');
        mic.textContent = '🎙️';
      }
      if (input) input.placeholder = 'Ask ECHO anything...';

      const msg = {
        'not-allowed':       "🔒 Microphone permission denied. To fix: Safari → Settings → Websites → Microphone → set motherearth.systems to 'Allow'. Also check System Settings → Privacy & Security → Microphone → Safari is enabled.",
        'service-not-allowed':"🔒 Microphone service not available. Check System Settings → Privacy & Security → Microphone → Safari is enabled.",
        'no-speech':         "🎙️ I didn't hear anything. Tap the mic again and speak clearly within ~3 seconds.",
        'audio-capture':     "🎙️ No microphone detected on this device. Check your input device in System Settings → Sound.",
        'network':           "🌐 Network error during speech recognition. Try again in a moment.",
        'aborted':           null, // user cancelled — no message needed
        'language-not-supported': "🌐 Speech recognition language not supported.",
      }[e.error] || `🎙️ Speech recognition error: ${e.error}. Try typing instead.`;

      if (msg) addMsg('bot', msg);
    };

    mic.addEventListener('click', () => {
      if (recognising) {
        try { recognition.stop(); } catch (_) {}
        return;
      }
      try {
        stopSpeaking(); // don't capture ECHO's own voice
        recognition.start();
        recognising = true;
        mic.classList.add('recording');
        mic.textContent = '⏹';
      } catch (e) {
        // Most common: 'recognition has already started' — recover by stopping then retrying
        try { recognition.abort(); } catch (_) {}
        addMsg('bot', `🎙️ Couldn't start mic: ${e.message}. Try again in a moment.`);
      }
    });
  }

  /* ── VOICE UI WIRING ── */
  function initVoiceUI() {
    const toggleBtn = $('me-echo-voice-toggle');
    const panel     = $('me-echo-voice-panel');
    const select    = $('me-echo-voice-select');
    const testBtn   = $('me-echo-voice-test');

    if (!synth) {
      // No TTS support — hide controls
      if (toggleBtn) toggleBtn.style.display = 'none';
      return;
    }

    // Load voices (may need to wait for voiceschanged on Chrome)
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => { loadVoices(); populateVoiceSelect(); };
    }

    // Click voice toggle: short-press = on/off; if on, also opens panel
    let pressTimer = null;
    let panelOpen = false;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (voicePrefs.enabled) {
        // Already on — toggle the settings panel
        panelOpen = !panelOpen;
        panel.classList.toggle('open', panelOpen);
        if (panelOpen) populateVoiceSelect();
      } else {
        // Turn on
        setVoiceMode(true);
        // Brief test phrase so user hears the voice
        speak("Voice mode on. I'm ECHO.");
      }
    });
    // Long-press or right-click to turn OFF
    toggleBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      setVoiceMode(false);
      panelOpen = false; panel.classList.remove('open');
    });
    // Click outside closes panel
    document.addEventListener('click', (e) => {
      if (panelOpen && !panel.contains(e.target) && e.target !== toggleBtn) {
        panelOpen = false; panel.classList.remove('open');
      }
    });

    // Gender buttons
    document.querySelectorAll('.me-vp-gender').forEach(b => {
      b.addEventListener('click', () => setGender(b.dataset.gender));
    });
    document.querySelector(`.me-vp-gender[data-gender="${voicePrefs.gender}"]`)?.classList.add('active');

    // Voice select
    select.addEventListener('change', () => {
      voicePrefs.voiceURI = select.value;
      localStorage.setItem('me-echo-voice-uri', select.value);
    });

    // Test button
    testBtn.addEventListener('click', () => {
      speak("Hello — I'm ECHO, Mother Earth's communications agent. This is how I sound when speaking replies.");
    });

    // Apply persisted state
    setVoiceMode(voicePrefs.enabled);
    populateVoiceSelect();

    // Stop speaking when widget closes
    document.querySelector('.me-echo-close').addEventListener('click', stopSpeaking);
  }

  initVoiceUI();
  initMic();
})();
