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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
