BASE 6fda8aeff6960c2f7c363b520aa2ac1ef0455b6f
HEAD 0e5ece5352e8bf31ba1a306a09fbfbf9a22ce1f9
## Commits
0e5ece5 feat(sessions): support update for resume writes

## Stat
 src/server/session-store.ts        |  7 +++++++
 tests/server/session-store.test.ts | 24 ++++++++++++++++++++++++
 2 files changed, 31 insertions(+)

## Diff
diff --git a/src/server/session-store.ts b/src/server/session-store.ts
index 1ba8ec9..ffdc300 100644
--- a/src/server/session-store.ts
+++ b/src/server/session-store.ts
@@ -72,14 +72,21 @@ export class SessionStore {
       rounds: row.rounds,
       created_at: row.created_at,
       data: JSON.parse(row.data) as SessionData,
     };
   }
 
   delete(id: number): boolean {
     return this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0;
   }
 
+  update(id: number, input: NewSession): boolean {
+    const info = this.db
+      .prepare('UPDATE sessions SET task = ?, status = ?, rounds = ?, data = ? WHERE id = ?')
+      .run(input.task, input.status, input.rounds, JSON.stringify(input.data), id);
+    return info.changes > 0;
+  }
+
   close(): void {
     this.db.close();
   }
 }
diff --git a/tests/server/session-store.test.ts b/tests/server/session-store.test.ts
index 7dc4171..d0737e2 100644
--- a/tests/server/session-store.test.ts
+++ b/tests/server/session-store.test.ts
@@ -49,11 +49,35 @@ describe('SessionStore', () => {
     expect(list[0].task).toBe('newer');
     expect(list[0]).not.toHaveProperty('data');
   });
 
   it('deletes a session and reports whether it existed', () => {
     const id = store.save({ task: 'gone', status: 'completed', rounds: 1, data: sampleData });
     expect(store.delete(id)).toBe(true);
     expect(store.get(id)).toBeUndefined();
     expect(store.delete(id)).toBe(false);
   });
+
+  it('update rewrites status rounds and data for existing id', () => {
+    const id = store.save({
+      task: 't1',
+      status: 'completed',
+      rounds: 1,
+      data: { progressEvents: [], feedbackHistory: [], messages: [] },
+    });
+    const ok = store.update(id, {
+      task: 't1',
+      status: 'completed',
+      rounds: 3,
+      data: {
+        progressEvents: [],
+        feedbackHistory: [],
+        messages: [{ role: 'user', content: 'again' }],
+      },
+    });
+    expect(ok).toBe(true);
+    const row = store.get(id)!;
+    expect(row.rounds).toBe(3);
+    expect(row.data.messages[0].content).toBe('again');
+    expect(store.update(99999, { task: 'x', status: 'error', rounds: 0, data: { progressEvents: [], feedbackHistory: [], messages: [] } })).toBe(false);
+  });
 });

