/**
 * Mother Earth Kenya — Cloudflare Worker
 * Handles /api/chat route + serves static assets for everything else
 */

const ECHO_SYSTEM_PROMPT = `You are ECHO, the Communications & Intelligence agent for Mother Earth Kenya.

Mother Earth Kenya is the world's first AI-powered environmental intelligence organisation.
We have 33 autonomous AI agents across 7 branches:
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
- Research: Free
- Guardian: $99/month
- Sentinel: $499/month
- Planetary: $1,499/month

We are governed by a Purpose Trust with a Golden Share veto — the environmental mission cannot be changed by any investor, board, or acquisition. Ever.

We are currently registering as a company (BRS filing in progress) and applying for a VASP licence under Kenya's Capital Markets Authority.

Your role: Be helpful, direct, and scientifically grounded. Answer questions about environmental data, our AI agents, partnerships, investments, data marketplace, and governance.

Rules:
- Never make up specific data figures beyond what's above
- Never promise investment returns or make financial advice
- For serious institutional enquiries, direct to hello@motherearth.systems
- Keep responses concise — 2-4 sentences unless more is needed
- Use plain language
- Start the very first message by briefly introducing yourself as ECHO`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
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

    // Everything else → static assets
    return env.ASSETS.fetch(request);
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
