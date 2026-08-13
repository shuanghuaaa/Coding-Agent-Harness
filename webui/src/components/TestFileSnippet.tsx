import { useEffect, useState } from 'react';
import { getWorkspaceFile } from '../api/workspace';

interface Props {
  file: string;
  line: number;
  context?: number;
}

export function TestFileSnippet({ file, line, context = 8 }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ n: number; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const invalid = !file || file === '(unknown)';

  useEffect(() => {
    if (!open || invalid) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getWorkspaceFile(file)
      .then((f) => {
        if (cancelled) return;
        const all = f.content.split(/\r?\n/);
        const focus = line > 0 ? line : 1;
        const start = Math.max(1, focus - context);
        const end = Math.min(all.length, focus + context);
        const slice: { n: number; text: string }[] = [];
        for (let n = start; n <= end; n++) {
          slice.push({ n, text: all[n - 1] ?? '' });
        }
        setLines(slice);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLines([]);
        setError(err instanceof Error ? err.message : '无法读取测试文件');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, file, line, context, invalid]);

  if (invalid) return null;

  return (
    <div className="test-file-snippet">
      <button
        type="button"
        className="test-file-snippet-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '收起测试文件' : '查看测试文件'}
        <span className="test-file-snippet-path">{file}{line > 0 ? `:${line}` : ''}</span>
      </button>
      {open && (
        <div className="test-file-snippet-body">
          {loading && <div className="test-file-snippet-meta">加载中…</div>}
          {error && (
            <div className="test-file-snippet-meta error">
              {file}{line > 0 ? `:${line}` : ''} — {error}
            </div>
          )}
          {!loading && !error && lines.length > 0 && (
            <pre className="test-file-snippet-code">
              {lines.map((row) => (
                <div
                  key={row.n}
                  className={`test-file-line ${row.n === line ? 'is-fail-line' : ''}`}
                >
                  <span className="test-file-lineno">{row.n}</span>
                  <span className="test-file-text">{row.text}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
