// All calls to the serverless functions go through here: they carry the access code and are counted
// for the daily "leituras hoje" indicator.
import { bump, markQuotaHit } from './usage.js';

const KEY = 'mt-code';
export const getCode = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const setCode = (c) => { try { localStorage.setItem(KEY, c); } catch { /* private mode */ } };

export async function apiPost(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-access-code': getCode() }, body: JSON.stringify(body) });
  if (path !== '/api/login') bump(1, path);
  if (res.status === 401) window.dispatchEvent(new CustomEvent('need-login'));
  if (res.status === 429) {
    const peek = await res.clone().json().catch(() => ({}));
    if (/Limite .*Gemini/i.test(peek.error ?? '')) markQuotaHit(peek.error);
  }
  return res;
}

export async function apiGet(path) {
  const res = await fetch(path, { headers: { 'x-access-code': getCode() } });
  if (res.status === 401) window.dispatchEvent(new CustomEvent('need-login'));
  return res;
}

// → { required: boolean, ok: boolean } ; ok = this browser already holds a valid code (or none is needed)
export async function checkLogin() {
  try {
    const info = await (await fetch('/api/login')).json();
    if (!info.required) return { required: false, ok: true };
    if (!getCode()) return { required: true, ok: false };
    const res = await apiPost('/api/login', { code: getCode() });
    return { required: true, ok: res.ok };
  } catch { return { required: false, ok: true }; } // no API (local dev): nothing to protect
}

export async function login(code) {
  const res = await apiPost('/api/login', { code });
  const body = await res.json().catch(() => ({}));
  if (res.ok) setCode(code);
  return { ok: res.ok, error: body.error };
}

export async function apiSend(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-access-code': getCode() }, body: JSON.stringify(body) });
  if (res.status === 401) window.dispatchEvent(new CustomEvent('need-login'));
  return res;
}
