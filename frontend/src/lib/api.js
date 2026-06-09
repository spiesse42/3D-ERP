// Haal het Ingress pad op van de server
async function getBase() {
  try {
    const res = await fetch('/ingress-path');
    if (res.ok) {
      const data = await res.json();
      if (data.path) {
        console.log('Ingress pad:', data.path);
        return data.path + '/api';
      }
    }
  } catch (e) {}
  return '/api';
}

let basePromise = getBase();

async function req(method, path, body) {
  const BASE = await basePromise;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  get:    (path)        => req('GET',    path),
  post:   (path, body)  => req('POST',   path, body),
  put:    (path, body)  => req('PUT',    path, body),
  patch:  (path, body)  => req('PATCH',  path, body),
  delete: (path)        => req('DELETE', path),
};
