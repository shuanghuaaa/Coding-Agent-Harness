import { useEffect, useState } from 'react';
import { Check, Copy, FileOutput } from 'lucide-react';
import type { AgentResult, ChatItem } from '../types';

function isIntermediateThought(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return true;
  return /^(Let me|I'll|I will|I'm going to|I need to|Checking|Looking|Reading|Searching|我来|让我|接下来|先|正在)/i.test(t);
}

/** 提取任务结束后的最终答复 / 生成内容全文 */
export function extractFinalOutput(
  result: AgentResult | null,
  chat: ChatItem[],
): string {
  if (result?.messages?.length) {
    let fallback = '';
    for (let i = result.messages.length - 1; i >= 0; i--) {
      const m = result.messages[i];
      if (m.role !== 'assistant' || typeof m.content !== 'string') continue;
      const text = m.content.trim();
      if (!text) continue;
      const hasTools = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
      if (!hasTools) return text;
      if (!fallback) fallback = text;
    }
    if (fallback) return fallback;
  }

  const agents = chat.filter((c) => c.kind === 'agent');
  for (let i = agents.length - 1; i >= 0; i--) {
    const text = agents[i].text?.trim() ?? '';
    if (!text) continue;
    if (!isIntermediateThought(text)) return text;
  }
  const last = agents[agents.length - 1]?.text?.trim();
  return last || '';
}

interface FinalResultCardProps {
  content: string;
  status?: string;
}

export function FinalResultCard({ content, status }: FinalResultCardProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!content.trim()) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
    }
  };

  const ok = !status || status === 'completed' || status === 'cancelled';

  return (
    <div className={`final-result-card ${ok ? 'ok' : 'bad'}`}>
      <div className="final-result-head">
        <span className="final-result-title">
          <FileOutput size={14} />
          最终结果
          {status ? <span className="final-result-status">{status}</span> : null}
        </span>
        <button
          type="button"
          className="header-btn final-result-copy"
          onClick={() => void handleCopy()}
          title="复制内容"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="final-result-body">{content}</pre>
    </div>
  );
}
