BASE 91c678c0f6635bad7d692ab77705ea363d9f9115
HEAD 6fda8aeff6960c2f7c363b520aa2ac1ef0455b6f
## Commits
6fda8ae fix(workspace): map directory reads to 400 and test size/binary gates
ce0bd01 feat(workspace): add safe read-file API for WebUI

## Stat
 src/server/http-server.ts         | 58 ++++++++++++++++++++++++++++-----------
 src/tools/file-tools.ts           | 10 +++++--
 src/workspace/read-file.ts        | 26 ++++++++++++++++++
 tests/workspace/read-file.test.ts | 40 +++++++++++++++++++++++++++
 4 files changed, 115 insertions(+), 19 deletions(-)

## Diff
diff --git a/src/server/http-server.ts b/src/server/http-server.ts
index aaf7879..9b2b683 100644
--- a/src/server/http-server.ts
+++ b/src/server/http-server.ts
@@ -2,38 +2,46 @@ import express from 'express';
 import http from 'http';
 import path from 'path';
 import type { AddressInfo } from 'node:net';
 import { WebSocketServer, WebSocket } from 'ws';
 import { AgentLoop } from '../agent/loop';
 import type { HITLRequest, HITLResponse, RoundProgress, RunResult } from '../agent/loop';
 import type { SessionStore, SessionData } from './session-store';
 import type { WSMessage } from './types';
+import { readWorkspaceFile } from '../workspace/read-file';
 import { logger } from '../utils/logger';
 
 interface PendingHITL {
   request: HITLRequest;
   resolve: (response: HITLResponse) => void;
   ws: WebSocket;
 }
 
 export class HarnessServer {
   private app: express.Application;
   private server: http.Server;
   private wss: WebSocketServer;
   private loop: AgentLoop;
   private sessionStore?: SessionStore;
+  private workspaceRoot: string;
   private token: string;
   private pendingHITL: Map<string, PendingHITL> = new Map();
   private runningLoops: Map<WebSocket, AgentLoop> = new Map();
   public readonly ready: Promise<void>;
 
-  constructor(loop: AgentLoop, port: number = 3000, sessionStore?: SessionStore) {
+  constructor(
+    loop: AgentLoop,
+    port: number = 3000,
+    sessionStore?: SessionStore,
+    workspaceRoot: string = process.cwd(),
+  ) {
     this.loop = loop;
     this.sessionStore = sessionStore;
+    this.workspaceRoot = workspaceRoot;
     this.token = process.env.HARNESS_TOKEN || '';
 
     this.app = express();
     this.server = http.createServer(this.app);
     this.wss = new WebSocketServer({
       server: this.server,
       verifyClient: (info, cb) => {
         const clientToken = new URL(info.req.url ?? '', `http://${info.req.headers.host}`).searchParams.get('token');
@@ -47,33 +55,33 @@ export class HarnessServer {
     });
 
     this.app.use(express.json());
 
     this.app.get('/health', (_req, res) => {
       res.json({ status: 'ok' });
     });
 
+    const requireToken: express.RequestHandler = (req, res, next) => {
+      if (!this.token) {
+        next();
+        return;
+      }
+      const auth = req.headers.authorization;
+      const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
+      const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
+      if (bearer === this.token || queryToken === this.token) {
+        next();
+        return;
+      }
+      res.status(401).json({ error: 'unauthorized' });
+    };
+
     if (this.sessionStore) {
       const store = this.sessionStore;
-      const requireToken: express.RequestHandler = (req, res, next) => {
-        if (!this.token) {
-          next();
-          return;
-        }
-        const auth = req.headers.authorization;
-        const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
-        const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
-        if (bearer === this.token || queryToken === this.token) {
-          next();
-          return;
-        }
-        res.status(401).json({ error: 'unauthorized' });
-      };
-
       this.app.get('/api/sessions', requireToken, (_req, res) => {
         res.json(store.list());
       });
       this.app.get('/api/sessions/:id', requireToken, (req, res) => {
         const id = Number(req.params.id);
         const record = Number.isInteger(id) ? store.get(id) : undefined;
         if (!record) {
           res.status(404).json({ error: 'session not found' });
@@ -87,16 +95,34 @@ export class HarnessServer {
         if (!ok) {
           res.status(404).json({ error: 'session not found' });
           return;
         }
         res.json({ ok: true });
       });
     }
 
+    this.app.get('/api/workspace/file', requireToken, (req, res) => {
+      const p = typeof req.query.path === 'string' ? req.query.path : '';
+      if (!p) {
+        res.status(400).json({ error: 'missing path' });
+        return;
+      }
+      try {
+        res.json(readWorkspaceFile(this.workspaceRoot, p));
+      } catch (err) {
+        const msg = String(err);
+        const status = /traversal|blocked|not a file/i.test(msg) ? 400
+          : /not found/i.test(msg) ? 404
+          : /too large|binary/i.test(msg) ? 415
+          : 500;
+        res.status(status).json({ error: msg });
+      }
+    });
+
     this.app.use(express.static(path.join(__dirname, '../../webui/dist')));
     this.app.get('*', (_req, res) => {
       res.sendFile(path.join(__dirname, '../../webui/dist/index.html'));
     });
 
     this.wss.on('connection', (ws: WebSocket) => {
       logger.info('WebSocket client connected');
       ws.on('message', async (data: Buffer) => {
diff --git a/src/tools/file-tools.ts b/src/tools/file-tools.ts
index 7f801e4..c3fc701 100644
--- a/src/tools/file-tools.ts
+++ b/src/tools/file-tools.ts
@@ -3,25 +3,29 @@ import * as fs from 'fs';
 import * as path from 'path';
 
 let workspaceRoot = process.cwd();
 
 export function setWorkspaceRoot(root: string): void {
   workspaceRoot = root;
 }
 
-function resolvePath(inputPath: string): string {
-  const resolved = path.resolve(workspaceRoot, inputPath);
-  const relative = path.relative(path.resolve(workspaceRoot), resolved);
+export function resolveWorkspacePath(inputPath: string, root: string = workspaceRoot): string {
+  const resolved = path.resolve(root, inputPath);
+  const relative = path.relative(path.resolve(root), resolved);
   if (relative.startsWith('..') || path.isAbsolute(relative)) {
     throw new Error(`Path traversal blocked: ${inputPath}`);
   }
   return resolved;
 }
 
+function resolvePath(inputPath: string): string {
+  return resolveWorkspacePath(inputPath);
+}
+
 export const readFileTool: Tool = {
   name: 'read_file',
   description: 'Read the contents of a file',
   parameters: {
     type: 'object',
     properties: {
       path: { type: 'string', description: 'The file path to read' },
     },
diff --git a/src/workspace/read-file.ts b/src/workspace/read-file.ts
new file mode 100644
index 0000000..b9f1e9c
--- /dev/null
+++ b/src/workspace/read-file.ts
@@ -0,0 +1,26 @@
+import { readFileSync, statSync } from 'node:fs';
+import { relative } from 'node:path';
+import { resolveWorkspacePath } from '../tools/file-tools';
+
+const DEFAULT_MAX = 1 * 1024 * 1024;
+
+export function readWorkspaceFile(
+  root: string,
+  relativePath: string,
+  maxBytes: number = DEFAULT_MAX,
+): { path: string; content: string; size: number } {
+  const abs = resolveWorkspacePath(relativePath, root);
+  let st;
+  try {
+    st = statSync(abs);
+  } catch {
+    throw new Error(`File not found: ${relativePath}`);
+  }
+  if (!st.isFile()) throw new Error(`Not a file: ${relativePath}`);
+  if (st.size > maxBytes) throw new Error(`File too large: ${relativePath}`);
+  const buf = readFileSync(abs);
+  if (buf.includes(0)) throw new Error(`binary file not supported: ${relativePath}`);
+  const content = buf.toString('utf-8');
+  const rel = relative(root, abs).replace(/\\/g, '/');
+  return { path: rel, content, size: st.size };
+}
diff --git a/tests/workspace/read-file.test.ts b/tests/workspace/read-file.test.ts
new file mode 100644
index 0000000..cf568ad
--- /dev/null
+++ b/tests/workspace/read-file.test.ts
@@ -0,0 +1,40 @@
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
+import { join } from 'node:path';
+import { tmpdir } from 'node:os';
+import { readWorkspaceFile } from '../../src/workspace/read-file';
+
+describe('readWorkspaceFile', () => {
+  let root: string;
+  beforeEach(() => {
+    root = mkdtempSync(join(tmpdir(), 'ws-read-'));
+    writeFileSync(join(root, 'hello.txt'), 'hello world', 'utf-8');
+  });
+  afterEach(() => rmSync(root, { recursive: true, force: true }));
+
+  it('reads a text file relative to root', () => {
+    const r = readWorkspaceFile(root, 'hello.txt');
+    expect(r.content).toBe('hello world');
+    expect(r.path).toBe('hello.txt');
+    expect(r.size).toBeGreaterThan(0);
+  });
+
+  it('blocks path traversal', () => {
+    expect(() => readWorkspaceFile(root, '../secret')).toThrow(/traversal|blocked/i);
+  });
+
+  it('rejects missing files', () => {
+    expect(() => readWorkspaceFile(root, 'nope.txt')).toThrow(/not found|ENOENT|Failed/i);
+  });
+
+  it('rejects files larger than maxBytes', () => {
+    const big = Buffer.alloc(1024 * 1024 + 1, 'a');
+    writeFileSync(join(root, 'big.txt'), big);
+    expect(() => readWorkspaceFile(root, 'big.txt')).toThrow(/too large/i);
+  });
+
+  it('rejects binary files', () => {
+    writeFileSync(join(root, 'bin.dat'), Buffer.from([0x48, 0x00, 0x69]));
+    expect(() => readWorkspaceFile(root, 'bin.dat')).toThrow(/binary/i);
+  });
+});

