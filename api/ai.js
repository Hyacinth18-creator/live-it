import { isAuthenticated, json, readJson } from '../src/server/vercel-api.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }
  if (!await isAuthenticated(req)) {
    json(res, 401, { error: 'Authentication required.' });
    return;
  }

  let payload;
  try {
    payload = readJson(req);
  } catch {
    json(res, 400, { error: 'Invalid or oversized request.' });
    return;
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.slice(-12).filter((message) =>
    ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string').map((message) => ({
    role: message.role,
    content: message.content.slice(0, 4000),
  })) : [];
  if (!messages.length || messages.at(-1).role !== 'user') {
    json(res, 400, { error: 'Ask a question to start the conversation.' });
    return;
  }

  const ollamaUrl = process.env.OLLAMA_URL;
  if (!ollamaUrl) {
    json(res, 503, { error: 'AI is not configured. Set OLLAMA_URL to a reachable Ollama service in Vercel.' });
    return;
  }
  let endpoint;
  try {
    endpoint = new URL('/api/chat', ollamaUrl);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Unsupported protocol');
  } catch {
    json(res, 503, { error: 'OLLAMA_URL must be a valid HTTP or HTTPS URL.' });
    return;
  }

  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) {
      json(res, 502, { error: `Ollama returned ${response.status}. Check the configured model service.` });
      return;
    }
    const result = await response.json();
    json(res, 200, { answer: result.message?.content || '', model });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      json(res, 504, { error: 'The AI service took too long to respond.' });
      return;
    }
    json(res, 503, { error: 'Cannot reach the configured Ollama service. Check OLLAMA_URL and that the model is available.' });
  }
}
