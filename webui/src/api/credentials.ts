const jsonHeaders: HeadersInit = { 'Content-Type': 'application/json' };

export async function saveCredential(service: string, account: string, password: string): Promise<void> {
  const res = await fetch('/api/credentials', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ service, account, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}

export async function getCredentialStatus(): Promise<boolean> {
  const res = await fetch('/api/credentials/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { configured: boolean };
  return body.configured;
}

export async function deleteCredential(service: string, account: string): Promise<void> {
  const res = await fetch('/api/credentials', {
    method: 'DELETE',
    headers: jsonHeaders,
    body: JSON.stringify({ service, account }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}
