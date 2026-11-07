import { createHash, timingSafeEqual } from 'node:crypto';
import { hasValidSession } from './session.js';

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function isAuthenticated(req) {
  return hasValidSession(req.headers.cookie, process.env.LIVEIT_SESSION_SECRET);
}

export function safeEqual(actual, expected) {
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function bodyString(body) {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return '';
}

export function readForm(req) {
  const body = req.body;
  const rawBody = bodyString(body);
  if (Buffer.byteLength(rawBody) > 4096) throw new Error('Request is too large.');
  if (rawBody) return new URLSearchParams(rawBody);
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (Array.isArray(value)) value.forEach((item) => form.append(key, String(item)));
      else if (value !== undefined && value !== null) form.append(key, String(value));
    }
    if (Buffer.byteLength(form.toString()) > 4096) throw new Error('Request is too large.');
    return form;
  }
  return new URLSearchParams();
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
