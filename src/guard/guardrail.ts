import { dangerousPatterns } from './rules';

export interface GuardResult {
  blocked: boolean;
  reason?: string;
  severity?: 'high' | 'critical';
}

export function guardrail(
  toolName: string,
  args: Record<string, unknown>
): GuardResult {
  for (const rule of dangerousPatterns) {
    if (rule.toolName !== toolName) continue;

    const value = rule.argKey ? String(args[rule.argKey] ?? '') : JSON.stringify(args);
    if (rule.pattern.test(value)) {
      return {
        blocked: true,
        reason: `${rule.description}: detected "${rule.name}" in ${toolName}`,
        severity: rule.severity,
      };
    }
  }

  return { blocked: false };
}