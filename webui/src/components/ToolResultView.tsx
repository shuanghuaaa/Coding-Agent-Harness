import { useEffect, useState } from 'react';
import { MarkdownContent } from './MarkdownContent';
import { getWorkspaceFile } from '../api/workspace';

function langHintForTool(tool: string): string {
  if (tool === 'git_diff') return 'diff';
  if (tool === 'shell' || tool === 'run_test' || tool === 'run_lint') return 'bash';
  return '';
}

export function parseWrittenPath(result: string): string | null {
  const m = result.match(/^File written:\s*(.+)$/m);
  if (!m?.[1]) return null;
  return m[1].trim();
}

function enrichWriteResult(result: string, fileContent: string | null, filePath: string | null): string {
  if (/```/.test(result)) return result;
  if (!fileContent || !filePath) return result;
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const lang =
    ({ ts: 'typescript', tsx: 'tsx', js: 'javascript', py: 'python', c: 'c', h: 'c', cpp: 'cpp', md: 'markdown' } as Record<
      string,
      string
    >)[ext] || ext || 'text';
  return `${result.trim()}\n\n\`\`\`${lang}\n${fileContent}\n\`\`\``;
}

/** Renders tool output; for legacy write_file results, loads file content into a code fence. */
export function ToolResultView({ tool, result }: { tool: string; result: string }) {
  const [enriched, setEnriched] = useState(result);

  useEffect(() => {
    let cancelled = false;
    setEnriched(result);
    if (tool !== 'write_file' || /```/.test(result)) return;
    const filePath = parseWrittenPath(result);
    if (!filePath) return;
    void getWorkspaceFile(filePath)
      .then((f) => {
        if (cancelled) return;
        setEnriched(enrichWriteResult(result, f.content, f.path || filePath));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tool, result]);

  return <MarkdownContent source={enriched} langHint={langHintForTool(tool)} />;
}
