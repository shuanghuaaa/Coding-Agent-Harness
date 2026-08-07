import { useCallback, useEffect, useState } from 'react';
import { listSessions, deleteSession } from '../api/sessions';
import type { SessionSummary } from '../types';

export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSessions(await listSessions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: number) => {
      await deleteSession(id);
      await refresh();
    },
    [refresh],
  );

  return { sessions, loading, error, refresh, remove };
}
