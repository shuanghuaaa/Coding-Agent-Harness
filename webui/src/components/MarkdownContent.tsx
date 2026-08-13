import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

interface Segment {
  type: 'text' | 'code';
  value: string;
  lang?: string;
}

/** Split markdown into text and fenced code blocks (```lang ... ```). */
export function splitMarkdownFences(source: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([a-zA-Z0-9_+-]*)[ \t]*\r?\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(source)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: source.slice(last, match.index) });
    }
    segments.push({
      type: 'code',
      lang: match[1] || undefined,
      value: match[2].replace(/\n$/, ''),
    });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    segments.push({ type: 'text', value: source.slice(last) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: source }];
}

function isCodeLikeLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (
    /^(import |export |from |const |let |var |function |class |interface |type |enum |def |async |await |return |if |for |while |switch |case |try |catch |package |using |#include |public |private |protected )/.test(
      t,
    )
  ) {
    return true;
  }
  if (/^[\s]*[{}\[\]();]+[\s]*$/.test(line)) return true;
  if (/[{};=<>]/.test(t) && /[()[\]{}]/.test(t) && t.length < 160) return true;
  if (/^\s{2,}\S/.test(line) && /[;{}()=`]/.test(t)) return true;
  if (/^(<\/?[a-zA-Z]|\$[({]|>>> |\$ )/.test(t)) return true;
  return false;
}

/**
 * Turn plain dumps (code + surrounding explanation) into markdown fences,
 * keeping leading/trailing 说明 as normal text.
 */
export function promotePlainCodeToMarkdown(source: string, langHint = ''): string {
  const trimmed = source.replace(/^\uFEFF/, '');
  if (!trimmed.trim()) return trimmed;
  if (/```/.test(trimmed)) return trimmed;

  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return trimmed;

  const codeFlags = lines.map(isCodeLikeLine);
  const codeCount = codeFlags.filter(Boolean).length;
  if (codeCount < 2) return trimmed;

  const start = codeFlags.findIndex(Boolean);
  let end = codeFlags.length - 1;
  while (end > start && !codeFlags[end]) end--;

  const before = lines.slice(0, start).join('\n').trimEnd();
  const code = lines.slice(start, end + 1).join('\n').replace(/\s+$/, '');
  const after = lines.slice(end + 1).join('\n').trimStart();

  if (!code.trim() || code.split('\n').length < 2) return trimmed;

  const lang = langHint || guessLang(code);
  const fence = '```' + lang + '\n' + code + '\n```';
  return [before, fence, after].filter((p) => p && p.trim().length > 0).join('\n\n');
}

function guessLang(code: string): string {
  if (/\bimport\s+.+from\s+['"]|export\s+(default|function|const|class)/.test(code)) return 'typescript';
  if (/\bdef\s+\w+\(|^\s*from\s+\w+\s+import/m.test(code)) return 'python';
  if (/^#!/.test(code) || /\becho\b|\bnpm\b|\bcd\b/.test(code)) return 'bash';
  if (/<\/?[a-zA-Z][\w:-]*>/.test(code)) return 'html';
  if (/\{[\s\S]*"[^"]+"\s*:/.test(code)) return 'json';
  return 'text';
}

function guessLangFromTool(tool?: string, result?: string): string {
  if (tool === 'git_diff') return 'diff';
  if (tool === 'shell' || tool === 'run_test' || tool === 'run_lint') return 'bash';
  if (tool === 'search') return 'text';
  if (result && /File written:|\.tsx?\b/.test(result)) return 'typescript';
  return '';
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const CORE_LINES = 48;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const label = lang && lang.length > 0 ? lang : 'code';
  const lines = code.split('\n');
  const tooLong = lines.length > CORE_LINES;
  const displayCode =
    !tooLong || expanded
      ? code
      : `${lines.slice(0, CORE_LINES).join('\n')}\n`;

  const onCopy = async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="md-code-wrap">
      <div className="md-code-toolbar">
        <span className="md-code-lang">
          {label}
          {tooLong ? ` · ${lines.length} 行` : ''}
        </span>
        <div className="md-code-toolbar-actions">
          {tooLong && (
            <button
              type="button"
              className="md-code-copy"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? '折叠为核心片段' : '展开全部代码'}
            >
              <span>{expanded ? '收起' : '展开全部'}</span>
            </button>
          )}
          <button
            type="button"
            className="md-code-copy"
            onClick={() => void onCopy()}
            title="复制完整代码"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>
      <pre className="md-code-block">
        <code className={lang ? `language-${lang}` : undefined}>{displayCode}</code>
      </pre>
      {tooLong && !expanded && (
        <button type="button" className="md-code-more" onClick={() => setExpanded(true)}>
          代码较长，已展示前 {CORE_LINES} 行核心片段 · 点击展开全部（共 {lines.length} 行）
        </button>
      )}
    </div>
  );
}

interface MarkdownContentProps {
  source: string;
  className?: string;
  /** When true, promote plain code dumps into fenced blocks (keep 说明). */
  promotePlainCode?: boolean;
  /** Optional language hint for promoted / unlabeled fences. */
  langHint?: string;
}

/**
 * Render markdown so markers like # / ** / ` / - disappear into real formatting.
 * Fenced code keeps copy + collapse UI.
 */
export function MarkdownContent({
  source,
  className,
  promotePlainCode = true,
  langHint = '',
}: MarkdownContentProps) {
  const prepared = promotePlainCode ? promotePlainCodeToMarkdown(source, langHint) : source;

  return (
    <div className={`md-content ${className ?? ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className: codeClass, children }) {
            const text = String(children).replace(/\n$/, '');
            const match = /language-([a-zA-Z0-9_+-]+)/.exec(codeClass || '');
            const looksFenced = Boolean(match) || text.includes('\n');
            if (looksFenced) {
              return <CodeBlock code={text} lang={match?.[1] || langHint || undefined} />;
            }
            return <code className="md-inline-code">{children}</code>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="md-table-wrap">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

export function toolResultToMarkdown(tool: string, result: string): string {
  const hint = guessLangFromTool(tool, result);
  return promotePlainCodeToMarkdown(result, hint);
}
