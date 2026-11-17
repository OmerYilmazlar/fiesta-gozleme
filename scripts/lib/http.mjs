export class FeedError extends Error {}

// Never include remote response bodies, URLs, or underlying network errors in logs.
export async function readResponse(response, limit) {
  if (!response.ok) throw new FeedError(`Remote request failed (HTTP ${response.status}).`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new FeedError('Remote response exceeded the size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function getJson(url, token, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    const data = await readResponse(response, 8 * 1024 * 1024);
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new FeedError('Expected JSON from Meta; received another content type.');
    }
    const json = JSON.parse(data.toString('utf8'));
    if (!json || typeof json !== 'object' || json.error) throw new FeedError('Meta rejected the API request. Check token, permissions and account access.');
    return json;
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError('Meta request failed or returned invalid JSON.');
  }
}
