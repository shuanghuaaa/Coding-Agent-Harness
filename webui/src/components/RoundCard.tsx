import { useState } from 'react';
import {
  FileText,
  FilePenLine,
  Trash2,
  Terminal,
  Search,
  GitBranch,
  FlaskConical,
  Wrench,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ChatItem } from '../types';

const TOOL_ICON: Record<string, typeof Wrench> = {
  read_file: FileText,
  write_file: FilePenLine,
  delete_file: Trash2,
  shell: Terminal,
  search: Search,
  git_diff: GitBranch,
  run_test: FlaskConical,
};

function ToolBlock({ tool, result }: { tool: string; result: string }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[tool] ?? Wrench;
  const blocked = result.startsWith('BLOCKED');

  return (
    <div className={`tool-block ${blocked ? 'blocked' : ''}`}>
      <button type="button" className="tool-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        <Icon size={12} aria-hidden />
        <span className="tool-name">{tool}</span>
        <span className="tool-preview">{result.split('\n')[0].slice(0, 60)}</span>
      </button>
      {open && (
        <pre className="tool-result">
          {result.slice(0, 2000)}
          {result.length > 2000 ? '\n…（截断）' : ''}
        </pre>
      )}
    </div>
  );
}

export function RoundCard({ item }: { item: ChatItem }) {
  const hasText = Boolean(item.text?.trim());
  const hasActions = Boolean(item.actions && item.actions.length > 0);

  return (
    <article className="round-card panel" id={`round-${item.round}`}>
      <header className="round-head">
        <span className="round-no">ROUND {String(item.round).padStart(2, '0')}</span>
        {item.feedbackStatus && (
          <span className={`fb-tag ${item.feedbackStatus}`}>
            {item.feedbackStatus === 'fail' ? '✕ 测试未通过' : '✓ 测试通过'}
          </span>
        )}
      </header>
      {hasText && <p className="round-text">{item.text}</p>}
      {hasActions && (
        <div className="tool-list">
          {item.actions!.map((a, i) => (
            <ToolBlock key={i} tool={a.tool} result={a.result} />
          ))}
        </div>
      )}
      {!hasText && !hasActions && <p className="round-text dim">（本轮无文字输出）</p>}
    </article>
  );
}
