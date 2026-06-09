// HA Ingress URL is: /api/hassio_ingress/TOKEN/
// We halen het pad uit window.location
function getBase() {
  const loc = window.location;
  const pathname = loc.pathname;
  
  // Ingress pad: /api/hassio_ingress/TOKEN
  const ingressMatch = pathname.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  if (ingressMatch) {
    return loc.origin + ingressMatch[1] + '/api';
  }
  
  // Oud Ingress pad: /app/SLUG
  const appMatch = pathname.match(/^(\/app\/[^/]+)/);
  if (appMatch) {
    return loc.origin + appMatch[1] + '/api';
  }
  
  return '/api';
}

const BASE = getBase();
console.log('API base:', BASE);

async function req(method, path, body) {
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
