import axios from 'axios';

export const TOKEN_KEY = 'kavacha.token';
export const USER_KEY = 'kavacha.user';
export const UNAUTHORIZED_EVENT = 'kavacha:unauthorized';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const client = axios.create({
  baseURL,
  timeout: 240000,
  headers: { Accept: 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function normalizeError(error) {
  const status = error.response?.status || 0;
  const body = error.response?.data;
  const payload = body && typeof body === 'object' && 'error' in body ? body.error : null;
  const err = new Error(
    payload?.message ||
      (status === 0 ? 'The KAVACHA API is unreachable. Is the Flask server running?' : error.message) ||
      'Request failed.',
  );
  err.status = status;
  err.code = payload?.code || 'request_failed';
  err.details = payload?.details || null;
  return err;
}

client.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') return response;
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      if (!body.success) throw normalizeError({ response: { data: body, status: response.status } });
      return { data: body.data, meta: body.meta ?? null };
    }
    return { data: body, meta: null };
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw normalizeError(error);
  },
);

function filenameFromHeaders(headers, fallback) {
  const disposition = headers?.['content-disposition'] || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : fallback;
}

export const api = {
  get: (url, params) => client.get(url, { params }),
  post: (url, data) => client.post(url, data),
  put: (url, data) => client.put(url, data),
  patch: (url, data) => client.patch(url, data),
  delete: (url) => client.delete(url),

  upload: (url, formData, onProgress) =>
    client.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
      },
    }),

  async blob(url, params) {
    const response = await client.get(url, { params, responseType: 'blob' });
    return {
      url: URL.createObjectURL(response.data),
      mime: response.headers?.['content-type'],
    };
  },

  async download(url, fallbackName, params) {
    const response = await client.get(url, { params, responseType: 'blob' });
    const objectUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filenameFromHeaders(response.headers, fallbackName || 'kavacha-download');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  },
};

export default api;
