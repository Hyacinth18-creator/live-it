export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function bodyString(body) {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return '';
}

export function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 16_384) throw new Error('Request is too large.');
    return req.body;
  }
  const rawBody = bodyString(req.body);
  if (Buffer.byteLength(rawBody) > 16_384) throw new Error('Request is too large.');
  const payload = JSON.parse(rawBody);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid request body.');
  return payload;
}
