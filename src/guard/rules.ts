import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DangerousPattern {
  name: string;
  toolName: string;
  argKey?: string;
  pattern: RegExp;
  severity: 'high' | 'critical';
  description: string;
}

interface ConfigPattern {
  name: string;
  toolName: string;
  argKey?: string;
  pattern: string;
  severity: 'high' | 'critical';
  description: string;
}

interface GuardrailConfig {
  patterns?: ConfigPattern[];
  disabled?: string[];
}

export const BUILTIN_PATTERNS: DangerousPattern[] = [
  {
    name: 'rm_rf',
    toolName: 'shell',
    argKey: 'command',
    pattern: /rm\s+-rf\s+/,
    severity: 'critical',
    description: 'Recursive force delete - can destroy the filesystem',
  },
  {
    name: 'git_push_force',
    toolName: 'shell',
    argKey: 'command',
    pattern: /git\s+push\s+.*--force/,
    severity: 'high',
    description: 'Force push to remote - can overwrite remote history',
  },
  {
    name: 'drop_table',
    toolName: 'shell',
    argKey: 'command',
    pattern: /DROP\s+TABLE/i,
    severity: 'critical',
    description: 'DROP TABLE - can destroy database tables',
  },
  {
    name: 'sudo',
    toolName: 'shell',
    argKey: 'command',
    pattern: /\bsudo\b/,
    severity: 'high',
    description: 'sudo - elevated privileges',
  },
  {
    name: 'system_file_write',
    toolName: 'write_file',
    argKey: 'path',
    pattern: /^(\/etc\/|\/boot\/|C:\\Windows\\)/i,
    severity: 'critical',
    description: 'Writing to system directories',
  },
  {
    name: 'system_file_delete',
    toolName: 'delete_file',
    argKey: 'path',
    pattern: /^(\/etc\/|\/boot\/|C:\\Windows\\)/i,
    severity: 'critical',
    description: 'Deleting system files',
  },
  {
    name: 'curl_wget',
    toolName: 'shell',
    argKey: 'command',
    pattern: /\b(curl|wget)\b.*\b(https?:\/\/)/,
    severity: 'high',
    description: 'Outbound network request',
  },
];

export const dangerousPatterns: DangerousPattern[] = BUILTIN_PATTERNS;

function loadGuardrailConfig(): GuardrailConfig {
  try {
    const configPath = resolve(process.cwd(), 'guardrail.config.json');
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as GuardrailConfig;
  } catch {
    return {};
  }
}

export function getEffectivePatterns(): DangerousPattern[] {
  const config = loadGuardrailConfig();
  const disabled = new Set(config.disabled ?? []);

  const customPatterns: DangerousPattern[] = (config.patterns ?? []).map((p) => ({
    ...p,
    pattern: new RegExp(p.pattern),
  }));

  const merged = new Map<string, DangerousPattern>();
  for (const p of BUILTIN_PATTERNS) {
    merged.set(p.name, p);
  }
  for (const p of customPatterns) {
    merged.set(p.name, p);
  }

  return [...merged.values()].filter((p) => !disabled.has(p.name));
}