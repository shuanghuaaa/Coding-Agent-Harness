### Task 7: Test file snippet viewer

**Files:**
- Create: `webui/src/components/TestFileSnippet.tsx`
- Modify: `webui/src/components/TaskRoundList.tsx` (or trail detail under fail steps)
- Modify: `webui/src/styles.css`
- Reuse: `webui/src/api/workspace.ts` `getWorkspaceFile`

**Interfaces:**
- Props: `{ file: string; line: number; context?: number }` default context 8
- On expand: fetch file; slice lines `[line-1-context, line+context]`; highlight `line`

- [ ] **Step 1: Implement TestFileSnippet**

```tsx
// Pseudocode structure
export function TestFileSnippet({ file, line, context = 8 }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ n: number; text: string }[]>([]);
  // when open flips true → getWorkspaceFile(file) → split → slice
  // invalid file '(unknown)' → don't render button
}
```

- [ ] **Step 2: Mount for each failure with valid file** on the feedback detail area of a round that has fail feedback (use data from `feedback` on progress / history failures).

Hydrate: ensure `ChatItem` or round details can carry `feedback` summary from progress (`useWebSocket` already maps progress — extend to copy `feedback` onto the chat item).

- [ ] **Step 3: Build webui**

Run: `cd webui && npm run build`

---
