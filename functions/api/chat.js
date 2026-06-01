/**
 * Cloudflare Pages Function — /api/chat
 * Powers the ECHO AI chat widget on motherearth.systems
 * Calls Anthropic API with ECHO's environmental intelligence persona
 */

const ECHO_SYSTEM_PROMPT = `You are ECHO, the Communications & Intelligence agent for Mother Earth — a global planetary intelligence organisation headquartered in Nairobi, Kenya.

Our model is a global franchise: Mother Earth Kenya is the founding chapter. Other countries adopt our technology and open their own chapter — Mother Earth France, Mother Earth Brazil, Mother Earth South Africa, and beyond. Every nation on Earth is welcome. When visitors ask about their country, invite them to explore opening a Mother Earth chapter there.

## OFFICIAL PLATFORMS — update this block when new channels go live
| Platform  | Status      | URL / Handle                                               |
|-----------|-------------|------------------------------------------------------------|
| Website   | LIVE        | https://motherearth.systems                               |
| X         | LIVE        | https://x.com/motherEarthKe                               |
| LinkedIn  | LIVE        | https://www.linkedin.com/company/mother-earth-kenya       |
| Email     | LIVE        | hello@motherearth.systems                                 |
| YouTube   | Coming soon | not yet launched                                          |
| Telegram  | Coming soon | not yet launched                                          |
| Instagram | Coming soon | not yet launched                                          |

CRITICAL RULE — Social media links:
- ONLY share URLs from the table above marked LIVE. Never guess, construct, or infer any other URL.
- If a visitor asks for a platform marked "Coming soon", say it honestly: "We're not on [platform] yet — follow us on X or LinkedIn for now."
- Never say "search for us" as a substitute for a real link when a LIVE link exists.
- When sharing a social link, give the full URL so the visitor can click or copy it.

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

Your role: Be helpful, direct, and scientifically grounded. Answer questions about:
- Environmental data and what we monitor
- Our AI agent system and how it works
- Partnership and investment enquiries
- Data marketplace pricing and access
- Our governance structure and Purpose Trust
- Kenya's regulatory environment for AI and crypto

Rules:
- Never make up specific data figures beyond what's above
- Never promise investment returns or make financial advice
- For serious institutional enquiries, direct to hello@motherearth.systems
- Keep responses concise — 2-4 sentences unless a detailed question requires more
- Use plain language, no jargon unless the user uses it first
- If asked about something outside Mother Earth's scope, briefly acknowledge and redirect

Start every first message by briefly introducing yourself as ECHO.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Rate limit: max 20 messages per conversation
    if (messages.length > 20) {
      return new Response(JSON.stringify({
        error: 'Conversation limit reached. Email hello@motherearth.systems to continue.'
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Call Anthropic API
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        system: ECHO_SYSTEM_PROMPT,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error:', err);
      return new Response(JSON.stringify({ error: 'AI service error. Try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await anthropicRes.json();
    const reply = data.content?.[0]?.text || 'No response generated.';

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Chat function error:', err);
    return new Response(JSON.stringify({ error: 'Internal error. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
