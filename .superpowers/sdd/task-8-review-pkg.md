BASE f307f9f2a5d5b263cad275fb2990b65b10fd2faa
HEAD 126ba41e7d2fbd17b74e1561ffbc167fd87688f5
## Commits
126ba41 feat(webui): APIs and WS for file read, resume, orchestrate

## Stat
 webui/src/api/workspace.ts      |  19 +++
 webui/src/hooks/useWebSocket.ts | 285 +++++++++++++++++++++++++---------------
 webui/src/types.ts              |  36 ++++-
 3 files changed, 231 insertions(+), 109 deletions(-)

## Diff
diff --git a/webui/src/api/workspace.ts b/webui/src/api/workspace.ts
new file mode 100644
index 0000000..6be6bf5
--- /dev/null
+++ b/webui/src/api/workspace.ts
@@ -0,0 +1,19 @@
+import type { FileTreeNode, WorkspaceFile } from '../types';
+
+function authHeaders(): HeadersInit {
+  const token = new URLSearchParams(window.location.search).get('token') || '';
+  return token ? { Authorization: `Bearer ${token}` } : {};
+}
+
+export async function listWorkspaceFiles(): Promise<FileTreeNode[]> {
+  const res = await fetch('/api/workspace/files', { headers: authHeaders() });
+  if (!res.ok) throw new Error(`HTTP ${res.status}`);
+  return res.json() as Promise<FileTreeNode[]>;
+}
+
+export async function getWorkspaceFile(path: string): Promise<WorkspaceFile> {
+  const q = new URLSearchParams({ path });
+  const res = await fetch(`/api/workspace/file?${q}`, { headers: authHeaders() });
+  if (!res.ok) throw new Error(`HTTP ${res.status}`);
+  return res.json() as Promise<WorkspaceFile>;
+}
diff --git a/webui/src/hooks/useWebSocket.ts b/webui/src/hooks/useWebSocket.ts
index 44434f1..2c7651f 100644
--- a/webui/src/hooks/useWebSocket.ts
+++ b/webui/src/hooks/useWebSocket.ts
@@ -1,108 +1,177 @@
-import { useState, useEffect, useRef, useCallback } from 'react';
-import type { WSMessage, AgentResult, HITLRequestPayload, RoundProgress, ChatItem } from '../types';
-
-export function useWebSocket(url: string) {
-  const wsRef = useRef<WebSocket | null>(null);
-  const [connected, setConnected] = useState(false);
-  const [reconnecting, setReconnecting] = useState(false);
-  const [result, setResult] = useState<AgentResult | null>(null);
-  const [status, setStatus] = useState<string>('idle');
-  const [hitlRequest, setHitlRequest] = useState<HITLRequestPayload | null>(null);
-  const [chat, setChat] = useState<ChatItem[]>([]);
-  const idRef = useRef(0);
-  const retryRef = useRef(0);
-  const timerRef = useRef<number | null>(null);
-
-  useEffect(() => {
-    let unmounted = false;
-    const token = new URLSearchParams(window.location.search).get('token') || '';
-    const wsUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;
-
-    const connect = () => {
-      if (unmounted) return;
-      const ws = new WebSocket(wsUrl);
-      wsRef.current = ws;
-
-      ws.onopen = () => {
-        retryRef.current = 0;
-        setConnected(true);
-        setReconnecting(false);
-      };
-      ws.onclose = () => {
-        setConnected(false);
-        if (unmounted) return;
-        setReconnecting(true);
-        const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
-        retryRef.current += 1;
-        timerRef.current = window.setTimeout(connect, delay);
-      };
-      ws.onmessage = (event) => {
-        const msg: WSMessage = JSON.parse(event.data);
-        if (msg.type === 'status') {
-          const next = (msg.payload as { status: string }).status;
-          setStatus(next);
-          if (next === 'error' || next === 'cancelled') {
-            setHitlRequest(null);
-          }
-        } else if (msg.type === 'progress') {
-          const p = msg.payload as RoundProgress;
-          setChat((prev) => [
-            ...prev,
-            {
-              id: `agent-${++idRef.current}`,
-              kind: 'agent',
-              round: p.round,
-              text: p.assistantContent,
-              actions: p.actions,
-              feedbackStatus: p.feedbackStatus,
-            },
-          ]);
-        } else if (msg.type === 'result') {
-          const payload = msg.payload as AgentResult;
-          setResult(payload);
-          setStatus(payload.status || 'idle');
-          setHitlRequest(null);
-        } else if (msg.type === 'hitl_request') {
-          setHitlRequest(msg.payload as HITLRequestPayload);
-        }
-      };
-    };
-
-    connect();
-
-    return () => {
-      unmounted = true;
-      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
-      wsRef.current?.close();
-      wsRef.current = null;
-    };
-  }, [url]);
-
-  const sendTask = useCallback((task: string) => {
-    wsRef.current?.send(JSON.stringify({ type: 'task', payload: { task } }));
-    setStatus('running');
-    setResult(null);
-    setHitlRequest(null);
-    setChat([{ id: `user-${++idRef.current}`, kind: 'user', text: task }]);
-  }, []);
-
-  const cancel = useCallback(() => {
-    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
-  }, []);
-
-  const respondHITL = useCallback(
-    (approved: boolean, modifiedArgs?: Record<string, unknown>) => {
-      if (!hitlRequest) return;
-      wsRef.current?.send(
-        JSON.stringify({
-          type: 'hitl_response',
-          payload: { toolCallId: hitlRequest.toolCallId, approved, modifiedArgs },
-        }),
-      );
-      setHitlRequest(null);
-    },
-    [hitlRequest],
-  );
-
-  return { connected, reconnecting, status, result, hitlRequest, chat, sendTask, cancel, respondHITL };
-}
+import { useState, useEffect, useRef, useCallback } from 'react';

+import type {

+  WSMessage,

+  AgentResult,

+  HITLRequestPayload,

+  RoundProgress,

+  ChatItem,

+  CheckpointDiffPayload,

+  OrchestratorStatus,

+} from '../types';

+

+export function useWebSocket(url: string) {

+  const wsRef = useRef<WebSocket | null>(null);

+  const [connected, setConnected] = useState(false);

+  const [reconnecting, setReconnecting] = useState(false);

+  const [result, setResult] = useState<AgentResult | null>(null);

+  const [status, setStatus] = useState<string>('idle');

+  const [hitlRequest, setHitlRequest] = useState<HITLRequestPayload | null>(null);

+  const [chat, setChat] = useState<ChatItem[]>([]);

+  const [checkpoint, setCheckpoint] = useState<CheckpointDiffPayload | null>(null);

+  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus | null>(null);

+  const idRef = useRef(0);

+  const retryRef = useRef(0);

+  const timerRef = useRef<number | null>(null);

+

+  useEffect(() => {

+    let unmounted = false;

+    const token = new URLSearchParams(window.location.search).get('token') || '';

+    const wsUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;

+

+    const connect = () => {

+      if (unmounted) return;

+      const ws = new WebSocket(wsUrl);

+      wsRef.current = ws;

+

+      ws.onopen = () => {

+        retryRef.current = 0;

+        setConnected(true);

+        setReconnecting(false);

+      };

+      ws.onclose = () => {

+        setConnected(false);

+        if (unmounted) return;

+        setReconnecting(true);

+        const delay = Math.min(1000 * 2 ** retryRef.current, 10000);

+        retryRef.current += 1;

+        timerRef.current = window.setTimeout(connect, delay);

+      };

+      ws.onmessage = (event) => {

+        const msg: WSMessage = JSON.parse(event.data);

+        if (msg.type === 'status') {

+          const next = (msg.payload as { status: string }).status;

+          setStatus(next);

+          if (next === 'error' || next === 'cancelled') {

+            setHitlRequest(null);

+          }

+        } else if (msg.type === 'orchestrator_status') {

+          setOrchestratorStatus(msg.payload as OrchestratorStatus);

+        } else if (msg.type === 'progress') {

+          const p = msg.payload as RoundProgress;

+          setChat((prev) => [

+            ...prev,

+            {

+              id: `agent-${++idRef.current}`,

+              kind: 'agent',

+              round: p.round,

+              text: p.assistantContent,

+              actions: p.actions,

+              feedbackStatus: p.feedbackStatus,

+              ...(p.agentRole ? { agentRole: p.agentRole } : {}),

+            },

+          ]);

+        } else if (msg.type === 'result') {

+          const payload = msg.payload as AgentResult;

+          setResult(payload);

+          setStatus(payload.status || 'idle');

+          setHitlRequest(null);

+          setCheckpoint(payload.checkpoint ?? null);

+        } else if (msg.type === 'hitl_request') {

+          setHitlRequest(msg.payload as HITLRequestPayload);

+        }

+      };

+    };

+

+    connect();

+

+    return () => {

+      unmounted = true;

+      if (timerRef.current !== null) window.clearTimeout(timerRef.current);

+      wsRef.current?.close();

+      wsRef.current = null;

+    };

+  }, [url]);

+

+  const seedChat = useCallback((items: ChatItem[]) => {

+    setChat(items);

+    idRef.current = items.length;

+  }, []);

+

+  const sendTask = useCallback((task: string, opts?: { sessionId?: number }) => {

+    const payload: { task: string; sessionId?: number } = { task };

+    if (opts?.sessionId != null) payload.sessionId = opts.sessionId;

+    wsRef.current?.send(JSON.stringify({ type: 'task', payload }));

+    setStatus('running');

+    setResult(null);

+    setHitlRequest(null);

+    setCheckpoint(null);

+    setOrchestratorStatus(null);

+    const userItem: ChatItem = { id: `user-${++idRef.current}`, kind: 'user', text: task };

+    if (opts?.sessionId != null) {

+      setChat((prev) => [...prev, userItem]);

+    } else {

+      setChat([userItem]);

+    }

+  }, []);

+

+  const sendOrchestrate = useCallback(

+    (task: string, opts?: { maxRetries?: number; sessionId?: number }) => {

+      const payload: { task: string; maxRetries?: number; sessionId?: number } = { task };

+      if (opts?.maxRetries != null) payload.maxRetries = opts.maxRetries;

+      if (opts?.sessionId != null) payload.sessionId = opts.sessionId;

+      wsRef.current?.send(JSON.stringify({ type: 'orchestrate', payload }));

+      setStatus('running');

+      setResult(null);

+      setHitlRequest(null);

+      setCheckpoint(null);

+      setOrchestratorStatus(null);

+      const userItem: ChatItem = { id: `user-${++idRef.current}`, kind: 'user', text: task };

+      if (opts?.sessionId != null) {

+        setChat((prev) => [...prev, userItem]);

+      } else {

+        setChat([userItem]);

+      }

+    },

+    [],

+  );

+

+  const clearOrchestratorStatus = useCallback(() => setOrchestratorStatus(null), []);

+

+  const clearCheckpoint = useCallback(() => setCheckpoint(null), []);

+

+  const cancel = useCallback(() => {

+    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));

+  }, []);

+

+  const respondHITL = useCallback(

+    (approved: boolean, modifiedArgs?: Record<string, unknown>) => {

+      if (!hitlRequest) return;

+      wsRef.current?.send(

+        JSON.stringify({

+          type: 'hitl_response',

+          payload: { toolCallId: hitlRequest.toolCallId, approved, modifiedArgs },

+        }),

+      );

+      setHitlRequest(null);

+    },

+    [hitlRequest],

+  );

+

+  return {

+    connected,

+    reconnecting,

+    status,

+    result,

+    hitlRequest,

+    chat,

+    checkpoint,

+    orchestratorStatus,

+    sendTask,

+    sendOrchestrate,

+    seedChat,

+    cancel,

+    respondHITL,

+    clearCheckpoint,

+    clearOrchestratorStatus,

+  };

+}

diff --git a/webui/src/types.ts b/webui/src/types.ts
index 7a99893..353be53 100644
--- a/webui/src/types.ts
+++ b/webui/src/types.ts
@@ -1,32 +1,66 @@
+export type AgentRole = 'coder' | 'reviewer' | 'tester';
+
+export type RoleStatus = 'idle' | 'running' | 'waiting' | 'done' | 'blocked' | 'error';
+
+export interface OrchestratorStatus {
+  phase: string;
+  roles: Record<AgentRole, RoleStatus>;
+  retryCount: number;
+  maxRetries: number;
+  lastGate?: { from: string; reason: string };
+}
+
 export interface WSMessage {
-  type: 'status' | 'result' | 'hitl_request' | 'log' | 'progress';
+  type: 'status' | 'result' | 'hitl_request' | 'log' | 'progress' | 'orchestrator_status';
   payload: unknown;
 }
 
 export interface RoundProgress {
   round: number;
   assistantContent: string;
   actions: Array<{ tool: string; result: string }>;
   feedbackStatus?: string;
+  agentRole?: string;
 }
 
 export interface ChatItem {
   id: string;
   kind: 'user' | 'agent';
   /** user text, or agent round card */
   text?: string;
   round?: number;
   actions?: Array<{ tool: string; result: string }>;
   feedbackStatus?: string;
+  agentRole?: string;
+}
+
+export interface WorkspaceFile {
+  path: string;
+  content: string;
+  size: number;
+}
+
+export interface CheckpointDiffPayload {
+  id: string;
+  files: string[];
+  patch: string;
 }
 
 export interface AgentResult {
   status: string;
   rounds: number;
   messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>;
   feedbackHistory: Array<{ round: number; status: string }>;
+  checkpoint?: CheckpointDiffPayload | null;
+}
+
+export interface FileTreeNode {
+  name: string;
+  path: string;
+  type: 'file' | 'folder';
+  children?: FileTreeNode[];
 }
 
 export interface HITLRequestPayload {
   toolCallId: string;
   toolName: string;

