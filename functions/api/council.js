/**
 * Cloudflare Pages Function — /api/council
 *
 * Runs the Mother Earth LLM Council on a visitor question.
 * Returns: 5 advisor views (AXIOM, VECTOR, FORGE, HORIZON, CONTRARY)
 *          + Chairman's Synthesis.
 *
 * Rate limiting: max 1 deliberation per IP per hour (in-memory only —
 * upgrade to KV-backed storage for cross-region enforcement).
 */

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

// Lightweight in-memory rate-limit cache (per worker instance)
const lastSeen = new Map();
const ONE_HOUR = 60 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // ── Rate limit by IP (best-effort, per-instance) ───────────────────────
    const ip = request.headers.get('CF-Connecting-IP')
            || request.headers.get('X-Forwarded-For')
            || 'anon';
    const now  = Date.now();
    const prev = lastSeen.get(ip) || 0;
    if (now - prev < ONE_HOUR) {
      const waitMin = Math.ceil((ONE_HOUR - (now - prev)) / 60000);
      return new Response(JSON.stringify({
        error: `Council recently convened on your behalf. Next deliberation available in ~${waitMin} min.`
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await request.json();
    const question = (body.question || '').trim();
    if (!question || question.length < 12) {
      return new Response(JSON.stringify({ error: 'Question must be at least 12 characters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (question.length > 600) {
      return new Response(JSON.stringify({ error: 'Question too long — keep it under 600 chars.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',
        max_tokens: 1200,
        system: [{
          type: 'text',
          text: COUNCIL_SYSTEM,
          cache_control: { type: 'ephemeral' }  // cache the giant prompt
        }],
        messages: [{ role: 'user', content: `QUESTION FOR COUNCIL:\n${question}` }],
      }),
    });

    if (!anthropicRes.ok) {
      const errTxt = await anthropicRes.text();
      console.error('Council Anthropic error:', errTxt);
      return new Response(JSON.stringify({ error: 'Council unavailable — try again shortly.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await anthropicRes.json();
    const raw  = data.content?.[0]?.text || '';

    // Parse advisor blocks
    const advisors = {};
    ['AXIOM','VECTOR','FORGE','HORIZON','CONTRARY'].forEach(name => {
      const m = raw.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]+?)(?=\\n\\*\\*|\\n###|$)`));
      if (m) advisors[name] = m[1].trim();
    });
    const peerMatch = raw.match(/### Peer Review\s*([\s\S]+?)(?=###|$)/);
    const peer      = peerMatch ? peerMatch[1].trim() : '';
    const synthMatch = raw.match(/### Chairman['']?s Synthesis\s*([\s\S]+?)$/i);
    const synthesis  = synthMatch ? synthMatch[1].trim() : raw;

    // Mark this IP as having received a deliberation
    lastSeen.set(ip, now);

    // ── PERSIST TO KV ARCHIVE ──────────────────────────────────────────────
    // Generate a short shareable ID and store the full deliberation.
    // Also append to the public index so /api/council/archive can list them.
    const archiveId = (Date.now().toString(36) +
                       Math.random().toString(36).slice(2, 7)).toLowerCase();
    const timestamp = new Date().toISOString();
    const record = {
      id: archiveId,
      question,
      advisors,
      peer,
      synthesis,
      raw,
      timestamp,
      // Don't store IP or any visitor PII
    };

    if (env.COUNCIL_ARCHIVE) {
      try {
        // Store the full record (forever — no TTL)
        await env.COUNCIL_ARCHIVE.put(
          `council:${archiveId}`,
          JSON.stringify(record)
        );

        // Append a slim summary to the index for fast listing
        // The index is a JSON array of {id, question, ts, summary}
        let index = [];
        const existingIdx = await env.COUNCIL_ARCHIVE.get('index', 'json');
        if (Array.isArray(existingIdx)) index = existingIdx;

        // Trim synthesis to a 240-char preview for the index
        const preview = synthesis.replace(/\s+/g, ' ').slice(0, 240) +
                        (synthesis.length > 240 ? '…' : '');

        index.unshift({
          id: archiveId,
          question: question.slice(0, 180) + (question.length > 180 ? '…' : ''),
          ts: timestamp,
          preview,
        });

        // Cap the public index at 200 most-recent entries
        if (index.length > 200) index = index.slice(0, 200);
        await env.COUNCIL_ARCHIVE.put('index', JSON.stringify(index));
      } catch (kvErr) {
        // Don't fail the user-facing response if KV write fails
        console.error('KV write failed:', kvErr.message);
      }
    }

    return new Response(JSON.stringify({
      id: archiveId,
      advisors, peer, synthesis, raw,
      timestamp,
      permalink: `/council/${archiveId}`
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Council function error:', err);
    return new Response(JSON.stringify({ error: 'Internal error. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

/**
 * GET /api/council            — returns the public archive index
 * GET /api/council?id=xxx     — returns a single deliberation record
 *
 * Single endpoint to avoid Cloudflare Pages Functions sub-route routing issues.
 * The frontend at /council-archive uses ?id= for permalinks.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const url = new URL(request.url);
    const id  = (url.searchParams.get('id') || '').replace(/[^a-z0-9]/gi, '');

    if (!env.COUNCIL_ARCHIVE) {
      if (id) {
        return new Response(JSON.stringify({ error: 'Archive not yet bound. Cloudflare KV namespace COUNCIL_ARCHIVE is not yet wired to this Pages project.' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ entries: [], notBound: true, message: 'Archive not yet bound. Council deliberations will appear here once Cloudflare KV is wired up via the Pages dashboard.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Single record lookup: ?id=xxx ────────────────────────────────────
    if (id) {
      if (id.length < 6 || id.length > 32) {
        return new Response(JSON.stringify({ error: 'Invalid deliberation ID.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const record = await env.COUNCIL_ARCHIVE.get(`council:${id}`, 'json');
      if (!record) {
        return new Response(JSON.stringify({ error: 'Deliberation not found.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(record), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, immutable',
        },
      });
    }

    // ── Index list ───────────────────────────────────────────────────────
    let limit = parseInt(url.searchParams.get('limit') || '50', 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    const index = await env.COUNCIL_ARCHIVE.get('index', 'json');
    const entries = Array.isArray(index) ? index.slice(0, limit) : [];

    return new Response(JSON.stringify({ entries, total: entries.length }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    console.error('Council archive GET error:', err);
    return new Response(JSON.stringify({ error: 'Failed to load archive.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
