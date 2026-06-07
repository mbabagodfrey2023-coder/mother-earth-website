/**
 * GET /api/council/{id} — fetch a single deliberation by ID
 * Returns the full record (advisors, peer, synthesis, raw, ts, question).
 */
export async function onRequestGet(context) {
  const { env, params } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const id = (params.id || '').toString().replace(/[^a-z0-9]/gi, '');
  if (!id || id.length < 6 || id.length > 32) {
    return new Response(JSON.stringify({ error: 'Invalid deliberation ID.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    if (!env.COUNCIL_ARCHIVE) {
      return new Response(JSON.stringify({ error: 'Archive not yet bound.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const record = await env.COUNCIL_ARCHIVE.get(`council:${id}`, 'json');
    if (!record) {
      return new Response(JSON.stringify({ error: 'Deliberation not found. The ID may be incorrect or the entry may have been removed.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(record), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        // Deliberations are immutable — cache aggressively
        'Cache-Control': 'public, max-age=3600, immutable',
      },
    });
  } catch (err) {
    console.error('Council [id] error:', err);
    return new Response(JSON.stringify({ error: 'Failed to load deliberation.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
