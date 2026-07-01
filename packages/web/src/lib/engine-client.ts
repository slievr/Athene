const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:3030";

async function engineFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${ENGINE_URL}${path}`, init);
  return res;
}

export async function listSessions(projectId?: string): Promise<unknown[]> {
  const url = projectId
    ? `/api/sessions?projectId=${encodeURIComponent(projectId)}`
    : "/api/sessions";
  const res = await engineFetch(url);
  if (!res.ok) throw new Error(`Engine error: ${res.status}`);
  return res.json() as Promise<unknown[]>;
}

export async function getSession(id: string): Promise<unknown | null> {
  const res = await engineFetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Engine error: ${res.status}`);
  return res.json();
}
