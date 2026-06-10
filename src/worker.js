/**
 * Mother Earth Kenya — Cloudflare Worker
 * Handles /api/chat route + serves static assets for everything else
 */

const ECHO_SYSTEM_PROMPT = `You are ECHO, the Communications & Intelligence agent for Mother Earth.

OFFICIAL LEGAL NAME (BRS-reserved · 4 Jun 2026 · valid through 4 Jul 2026):
MOTHER EARTH KENYA ENVIRONMENTAL AI LTD
Reservation number: PVT-PQ1AZ3KV
Status: Name approved by Registrar of Companies, Kenya. Incorporation
filing underway within the 30-day window.

Mother Earth is the world's first AI-native environmental governance
organisation. The founding chapter is in Nairobi, Kenya, and the model
is built to scale — every country is invited to launch its own chapter
under the same Purpose Trust + Golden Share framework.

We run 33 autonomous AI agents across 7 specialist branches:
- CEO (Command Centre)
- AMARA (Legal & Compliance — VASP Act 2025, Kenya law)
- NEXUS (Blockchain & Tech — data provenance, smart contracts)
- GAIA (Environmental Intelligence — CO₂, air quality, NASA data)
- ATLAS (Treasury & Finance)
- IRIS (Data Marketplace — environmental data as verified assets)
- SAGE (Governance — Purpose Trust, Golden Share)
- ECHO (Comms & Growth — that's you)

Current live data (updated by GAIA every 15 min):
- CO₂: ~432 ppm (highest in 3 million years)
- Global temperature anomaly: +1.2°C above pre-industrial baseline
- 33 agents running 24/7 from Nairobi, Kenya

Our data marketplace (IRIS) offers 4 tiers:
- Research: Free (6 months for accredited institutions)
- Guardian: $99/month
- Sentinel: $499/month
- Planetary: $1,499/month

Governance: A Purpose Trust holds the Golden Share with absolute veto
over any decision compromising the environmental mission. The mission
cannot be changed by any investor, board, or acquisition. Ever.
Full architecture: motherearth.systems/governance

Recent milestones (cite these honestly when asked):
- Name Reservation Certificate PVT-PQ1AZ3KV issued by Kenyan Registrar
  of Companies on 4 June 2026 — the official corporate name is now
  locked. Incorporation filing is in motion.
- Public Council Chamber live at /mission-control — any visitor can
  ask a strategic question and watch 5 AI advisors deliberate. Past
  deliberations are permalinked at /council-archive.
- 9 international chapters in active dialogue (USA, Brazil, South
  Africa, Nigeria, UK, India, France, Indonesia, Canada). Applications
  open at /chapters.
- VASP licence application + Purpose Trust registration pending
  post-incorporation.

Key pages to direct visitors to:
- /mission-control — live AI ops, Council Chamber
- /iris            — data marketplace + research access
- /chapters        — global expansion + apply to lead
- /about           — manifesto + founder
- /governance      — Purpose Trust + Golden Share architecture
- /roadmap         — quarterly milestones
- /press           — press kit, boilerplate, brand assets
- /finances        — open-books transparency
- /council-archive — public deliberation archive

Your role: Be helpful, direct, and scientifically grounded. Answer
questions about environmental data, our AI agents, partnerships,
chapter applications, IRIS data access, and governance.

Rules:
- Never make up specific data figures beyond what's above
- Never promise investment returns or make financial advice
- For serious institutional enquiries, direct to hello@motherearth.systems
- For press, direct to press@motherearth.systems
- For chapter applications, direct to /chapters
- Keep responses concise — 2-4 sentences unless a detailed question requires more
- Use plain language, no jargon unless the user uses it first
- Start your very first message by briefly introducing yourself as ECHO`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  // Cron trigger — fires Mon/Wed/Fri at 09:00 UTC
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSocialCycle(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Handle /api/chat
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // Handle /api/council
    if (url.pathname === '/api/council') {
      if (request.method === 'POST') return handleCouncilPost(request, env);
      if (request.method === 'GET')  return handleCouncilGet(request, env);
      return json({ error: 'Method not allowed' }, 405);
    }

    // Handle /api/social/run — manual trigger (protected by SOCIAL_ADMIN_SECRET)
    if (url.pathname === '/api/social/run' && request.method === 'POST') {
      const secret = request.headers.get('x-admin-secret');
      if (!env.SOCIAL_ADMIN_SECRET || secret !== env.SOCIAL_ADMIN_SECRET) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const result = await runSocialCycle(env);
      return json(result);
    }

    // Block public access to the social post queue file
    if (url.pathname === '/social/posts.json') {
      return new Response('Not found', { status: 404 });
    }

    // Everything else → static assets
    // Try exact path first, then try with .html extension for clean URLs
    let res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      const pth = url.pathname;
      // If no file extension, try appending .html (clean URL support)
      if (!pth.includes('.') && !pth.endsWith('/')) {
        const htmlReq = new Request(new URL(pth + '.html', request.url), request);
        const htmlRes = await env.ASSETS.fetch(htmlReq);
        if (htmlRes.ok) return htmlRes;
      }
      // Fallback to custom 404 page
      const notFound = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url)));
      return new Response(notFound.body, {
        status: 404,
        headers: notFound.headers,
      });
    }
    return res;
  }
};

async function handleChat(request, env) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return json({ error: 'Invalid request' }, 400);
    }

    if (messages.length > 20) {
      return json({ error: 'Conversation limit reached. Email hello@motherearth.systems to continue.' }, 429);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Service temporarily unavailable' }, 503);
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        system: ECHO_SYSTEM_PROMPT,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      console.error('Anthropic error:', await res.text());
      return json({ error: 'AI service error. Try again.' }, 502);
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text || 'No response generated.';
    return json({ reply });

  } catch (err) {
    console.error('Chat error:', err);
    return json({ error: 'Internal error. Please try again.' }, 500);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extraHeaders }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   COUNCIL CHAMBER — public LLM Council deliberation + KV-persisted archive
══════════════════════════════════════════════════════════════════════════ */

const ME_MISSION = `Develop, manufacture, and supply technologies for planetary-scale
environmental monitoring, ecological intelligence, and sustainable systems —
governed by a Purpose Trust with Golden Share veto, operating as a Kenya SEZ
Enterprise under VASP Act 2025.`;

const COUNCIL_SYSTEM = `You are facilitating the Mother Earth Kenya LLM Council — a 5-advisor
deliberation protocol for strategic decisions affecting environmental intelligence,
the 33-agent AI organisation, or planetary mission alignment.

Mission: ${ME_MISSION}

Each advisor must take a genuinely independent stance. Each advisor speaks in their
own distinct voice. The Chairman synthesises into one decisive recommendation.

Respond in EXACTLY this format. No deviations. No preamble.

## Council Deliberation

**AXIOM:** [First principles — strip all assumptions. State only what is verified true. 2-3 sentences max.]

**VECTOR:** [Risk & downside — what fails, who gets hurt, worst-case path. 2-3 sentences max.]

**FORGE:** [Pragmatist — what can actually be built/done given current resources, time, credits, skill. 2-3 sentences max.]

**HORIZON:** [Strategist — 2nd-order effects, 2-5 year implications. Mention how the 7 branch leads (AMARA, NEXUS, GAIA, ATLAS, IRIS, SAGE, ECHO) are affected. 2-3 sentences max.]

**CONTRARY:** [Devil's advocate — argue the OPPOSITE of the apparent intent, even if obviously wrong. This is your only job. 2-3 sentences max.]

### Peer Review
[Each advisor identifies the strongest challenge to their own view OR challenges another's blind spot — 1 line each.]

### Chairman's Synthesis
[Weigh all 5 + peer challenges. State the final recommendation with explicit reasoning. Acknowledge the strongest dissenting view before concluding. 3-5 sentences.]`;

// In-memory rate-limit cache (per worker instance — best-effort)
const lastSeenCouncil = new Map();
const ONE_HOUR_MS = 60 * 60 * 1000;

async function handleCouncilPost(request, env) {
  try {
    const ip = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For')
            || 'anon';
    const now  = Date.now();
    const prev = lastSeenCouncil.get(ip) || 0;
    if (now - prev < ONE_HOUR_MS) {
      const waitMin = Math.ceil((ONE_HOUR_MS - (now - prev)) / 60000);
      return json({ error: `Council recently convened on your behalf. Next deliberation available in ~${waitMin} min.` }, 429);
    }

    const body = await request.json();
    const question = (body.question || '').trim();
    if (!question || question.length < 12) return json({ error: 'Question must be at least 12 characters.' }, 400);
    if (question.length > 600)              return json({ error: 'Question too long — keep it under 600 chars.' }, 400);

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Service temporarily unavailable.' }, 503);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',
        max_tokens: 1200,
        system: [{
          type: 'text',
          text: COUNCIL_SYSTEM,
          cache_control: { type: 'ephemeral' }
        }],
        messages: [{ role: 'user', content: `QUESTION FOR COUNCIL:\n${question}` }],
      }),
    });

    if (!res.ok) {
      console.error('Council Anthropic error:', await res.text());
      return json({ error: 'Council unavailable — try again shortly.' }, 502);
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text || '';

    const advisors = {};
    ['AXIOM','VECTOR','FORGE','HORIZON','CONTRARY'].forEach(name => {
      const m = raw.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]+?)(?=\\n\\*\\*|\\n###|$)`));
      if (m) advisors[name] = m[1].trim();
    });
    const peerMatch  = raw.match(/### Peer Review\s*([\s\S]+?)(?=###|$)/);
    const peer       = peerMatch ? peerMatch[1].trim() : '';
    const synthMatch = raw.match(/### Chairman['']?s Synthesis\s*([\s\S]+?)$/i);
    const synthesis  = synthMatch ? synthMatch[1].trim() : raw;

    lastSeenCouncil.set(ip, now);

    // ── PERSIST TO KV ARCHIVE (if bound) ──────────────────────────────────
    const archiveId = (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).toLowerCase();
    const timestamp = new Date().toISOString();
    const record    = { id: archiveId, question, advisors, peer, synthesis, raw, timestamp };

    if (env.COUNCIL_ARCHIVE) {
      try {
        await env.COUNCIL_ARCHIVE.put(`council:${archiveId}`, JSON.stringify(record));

        let index = [];
        const existing = await env.COUNCIL_ARCHIVE.get('index', 'json');
        if (Array.isArray(existing)) index = existing;

        const preview = synthesis.replace(/\s+/g, ' ').slice(0, 240) +
                        (synthesis.length > 240 ? '…' : '');

        index.unshift({
          id: archiveId,
          question: question.slice(0, 180) + (question.length > 180 ? '…' : ''),
          ts: timestamp,
          preview,
        });
        if (index.length > 200) index = index.slice(0, 200);
        await env.COUNCIL_ARCHIVE.put('index', JSON.stringify(index));
      } catch (kvErr) {
        console.error('KV write failed:', kvErr.message);
      }
    }

    return json({
      id: archiveId,
      advisors, peer, synthesis, raw,
      timestamp,
      permalink: `/council-archive.html?id=${archiveId}`,
    });

  } catch (err) {
    console.error('Council POST error:', err);
    return json({ error: 'Internal error. Please try again.' }, 500);
  }
}

async function handleCouncilGet(request, env) {
  try {
    const url = new URL(request.url);
    const id  = (url.searchParams.get('id') || '').replace(/[^a-z0-9]/gi, '');

    if (!env.COUNCIL_ARCHIVE) {
      if (id) {
        return json({ error: 'Archive not yet bound. Cloudflare KV namespace COUNCIL_ARCHIVE is not yet wired to this Worker.' }, 503);
      }
      return json({
        entries: [],
        notBound: true,
        message: 'Archive not yet bound. Council deliberations will appear here once Cloudflare KV is wired up via the Workers settings.'
      });
    }

    // Single record lookup
    if (id) {
      if (id.length < 6 || id.length > 32) {
        return json({ error: 'Invalid deliberation ID.' }, 400);
      }
      const record = await env.COUNCIL_ARCHIVE.get(`council:${id}`, 'json');
      if (!record) return json({ error: 'Deliberation not found.' }, 404);
      return json(record, 200, { 'Cache-Control': 'public, max-age=3600, immutable' });
    }

    // Index list
    let limit = parseInt(url.searchParams.get('limit') || '50', 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    const index   = await env.COUNCIL_ARCHIVE.get('index', 'json');
    const entries = Array.isArray(index) ? index.slice(0, limit) : [];

    return json({ entries, total: entries.length }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (err) {
    console.error('Council GET error:', err);
    return json({ error: 'Failed to load archive.' }, 500);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SOCIAL AUTO-POSTER — X + LinkedIn scheduled posting
   Post queue lives in /social/posts.json (static asset, not publicly served).
   Sent post IDs are tracked in POSTS_KV under the key "posted".
   Fires on cron schedule defined in wrangler.jsonc (Mon/Wed/Fri 09:00 UTC).

   Required Worker secrets (set via: npx wrangler secret put <NAME>):
     X_API_KEY              — Twitter app Consumer Key
     X_API_SECRET           — Twitter app Consumer Secret
     X_ACCESS_TOKEN         — Twitter user Access Token (your account)
     X_ACCESS_TOKEN_SECRET  — Twitter user Access Token Secret
     LINKEDIN_ACCESS_TOKEN  — LinkedIn OAuth 2.0 token (w_organization_social scope)
     LINKEDIN_ORG_URN       — e.g. urn:li:organization:12345678
     SOCIAL_ADMIN_SECRET    — any random string (protects /api/social/run endpoint)
══════════════════════════════════════════════════════════════════════════ */

// ── OAuth 1.0a helpers for X (Twitter API v2) ─────────────────────────────

// Percent-encodes a string per RFC 3986 (required by OAuth 1.0a spec)
function pct(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

// HMAC-SHA1 + base64 encode — Cloudflare Workers Web Crypto API
async function hmacSha1b64(key, msg) {
  const enc = new TextEncoder();
  const k   = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Builds the Authorization: OAuth ... header for a POST to api.twitter.com/2/tweets
async function xAuthHeader(env) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const ts    = String(Math.floor(Date.now() / 1000));
  const oAuth = {
    oauth_consumer_key:     env.X_API_KEY,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        ts,
    oauth_token:            env.X_ACCESS_TOKEN,
    oauth_version:          '1.0',
  };

  // OAuth 1.0a signature base: method + URL + sorted params (JSON body excluded)
  const paramStr = Object.keys(oAuth).sort()
    .map(k => `${pct(k)}=${pct(oAuth[k])}`).join('&');
  const base = `POST&${pct('https://api.twitter.com/2/tweets')}&${pct(paramStr)}`;

  const sigKey = `${pct(env.X_API_SECRET)}&${pct(env.X_ACCESS_TOKEN_SECRET)}`;
  oAuth.oauth_signature = await hmacSha1b64(sigKey, base);

  return 'OAuth ' + Object.keys(oAuth).sort()
    .map(k => `${pct(k)}="${pct(oAuth[k])}"`).join(', ');
}

// Posts a tweet using OAuth 1.0a user-context auth (required for write access)
async function postToX(text, env) {
  if (!env.X_API_KEY || !env.X_ACCESS_TOKEN) {
    return { platform: 'x', ok: false, error: 'X credentials not configured' };
  }
  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': await xAuthHeader(env),
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    return { platform: 'x', ok: res.ok, status: res.status, data };
  } catch (e) {
    return { platform: 'x', ok: false, error: e.message };
  }
}

// ── LinkedIn API (OAuth 2.0 Bearer, ugcPosts endpoint) ────────────────────

// Posts to the Mother Earth Kenya company page via LinkedIn ugcPosts API
async function postToLinkedIn(text, env) {
  if (!env.LINKEDIN_ACCESS_TOKEN || !env.LINKEDIN_ORG_URN) {
    return { platform: 'linkedin', ok: false, error: 'LinkedIn credentials not configured' };
  }
  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization':             `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
        'Content-Type':              'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author:         env.LINKEDIN_ORG_URN,       // urn:li:organization:XXXXXXXX
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary:    { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    });
    const data = await res.json();
    return { platform: 'linkedin', ok: res.ok, status: res.status, data };
  } catch (e) {
    return { platform: 'linkedin', ok: false, error: e.message };
  }
}

// ── Core posting cycle (called by cron + manual trigger) ──────────────────

async function runSocialCycle(env) {
  if (!env.POSTS_KV) {
    console.warn('Social: POSTS_KV not bound — skipping');
    return { skipped: true, reason: 'POSTS_KV not bound. Run: npx wrangler kv namespace create POSTS_KV' };
  }

  // Read post queue from static asset (not publicly exposed — blocked in fetch handler)
  let posts;
  try {
    const res = await env.ASSETS.fetch('https://motherearth.systems/social/posts.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ({ posts } = await res.json());
  } catch (e) {
    console.error('Social: failed to load posts.json:', e.message);
    return { skipped: true, reason: `posts.json read failed: ${e.message}` };
  }

  // Load set of already-sent post IDs
  const sentRaw = await env.POSTS_KV.get('posted') || '[]';
  const sent    = new Set(JSON.parse(sentRaw));

  // Find next approved post that hasn't been sent yet
  const pending = posts.filter(p => p.status === 'approved' && !sent.has(p.id));
  if (pending.length === 0) {
    console.log('Social: queue empty — all approved posts have been sent');
    return { posted: null, remaining: 0 };
  }
  const post = pending[0];

  // Fire to each platform
  const results = [];
  if (post.platforms.includes('x'))
    results.push(await postToX(post.x_text, env));
  if (post.platforms.includes('linkedin'))
    results.push(await postToLinkedIn(post.linkedin_text || post.x_text, env));

  // Persist sent state
  sent.add(post.id);
  await env.POSTS_KV.put('posted', JSON.stringify([...sent]));

  console.log(`Social: posted ${post.id} →`, JSON.stringify(results));
  return { posted: post.id, platforms: post.platforms, results, remaining: pending.length - 1 };
}
