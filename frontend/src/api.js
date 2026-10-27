import { useStore } from './store.js';

// Same-origin by default (nginx proxies /api). Set VITE_API_URL at build time for a split deployment.
const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = useStore.getState().token;
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }
  if (res.status === 401 && auth && token) {
    useStore.getState().setSession(null, null);
    throw new Error('Your session expired. Please log in again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 429 ? 'Too many attempts. Please wait a minute.' : `Request failed (${res.status})`));
  return data;
}

export const api = {
  register: (b) => request('/auth/register', { method: 'POST', body: b, auth: false }),
  login: (b) => request('/auth/login', { method: 'POST', body: b, auth: false }),
  listDesigns: () => request('/designs'),
  getDesign: (id) => request(`/designs/${id}`),
  createDesign: (b) => request('/designs', { method: 'POST', body: b }),
  updateDesign: (id, b) => request(`/designs/${id}`, { method: 'PUT', body: b }),
  deleteDesign: (id) => request(`/designs/${id}`, { method: 'DELETE' }),
  setAvatar: (avatar) => request('/account/avatar', { method: 'PUT', body: { avatar } }),
  // gift shop (round 40)
  account: () => request('/account'),
  shop: () => request('/shop', { auth: false }),
  buy: (itemId) => request('/shop/buy', { method: 'POST', body: { itemId } }),
  // round 42: a decorated card was downloaded (kind 'picture' | 'gif') – earns gift points once per card
  downloadPoints: (cardKey, kind) => request('/points/download', { method: 'POST', body: { cardKey, kind } }),
};
