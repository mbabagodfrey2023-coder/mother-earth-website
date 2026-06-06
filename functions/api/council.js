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

    return new Response(JSON.stringify({
      advisors, peer, synthesis, raw,
      timestamp: new Date().toISOString()
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
