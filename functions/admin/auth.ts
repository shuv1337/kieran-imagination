// Verify request came through Cloudflare Access
// CF Access adds these headers after successful authentication
export function requireAuth(request: Request): Response | null {
    const cfAccessEmail = request.headers.get('cf-access-authenticated-user-email');

    // If CF Access headers are present, user is authenticated
    if (cfAccessEmail) {
        return null; // Allow request
    }

    // No CF Access headers - reject
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
    });
}
