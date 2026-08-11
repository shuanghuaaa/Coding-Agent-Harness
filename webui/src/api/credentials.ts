function authHeaders(): HeadersInit {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function saveCredential(service: string, account: string, password: string): Promise<void> {
  const res = await fetch('/api/credentials', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ service, account, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}

export async function getCredentialStatus(): Promise<boolean> {
  const res = await fetch('/api/credentials/status', { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { configured: boolean };
  return body.configured;
}

export async function deleteCredential(service: string, account: string): Promise<void> {
  const res = await fetch('/api/credentials', {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ service, account }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}