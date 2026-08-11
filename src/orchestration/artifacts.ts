import type { AgentRole } from './roles';

export interface StageArtifact {
  role: AgentRole;
  summary: string;
  changedFiles: string[];
  findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
  testStatus?: 'pass' | 'fail' | 'skipped';
  rawExcerpt?: string;
}

export type GateDecision =
  | { action: 'continue' }
  | { action: 'retry_coder'; reason: string }
  | { action: 'warn'; reason: string }
  | { action: 'retry_artifact'; reason: string };

const SUMMARY_MAX = 500;

interface ParsedPayload {
  summary?: string;
  findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
  testStatus?: 'pass' | 'fail' | 'skipped';
}

function truncate(text: string, max = SUMMARY_MAX): string {
  return text.length <= max ? text : text.slice(0, max);
}

function extractJsonSource(content: string): { json: string; excerpt: string } | null {
  const fenceMatch = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return { json: fenceMatch[1].trim(), excerpt: fenceMatch[0] };
  }

  const lineMatch = content.match(/^ARTIFACT:\s*(.+)$/m);
  if (lineMatch) {
    return { json: lineMatch[1].trim(), excerpt: lineMatch[0] };
  }

  return null;
}

function parsePayload(json: string): ParsedPayload | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (typeof data !== 'object' || data === null) {
      return null;
    }

    const payload: ParsedPayload = {};

    if (typeof data.summary === 'string') {
      payload.summary = data.summary;
    }

    if (Array.isArray(data.findings)) {
      payload.findings = data.findings.filter(
        (f): f is { severity: 'info' | 'warn' | 'block'; message: string } =>
          typeof f === 'object' &&
          f !== null &&
          (f.severity === 'info' || f.severity === 'warn' || f.severity === 'block') &&
          typeof f.message === 'string',
      );
    }

    if (data.testStatus === 'pass' || data.testStatus === 'fail' || data.testStatus === 'skipped') {
      payload.testStatus = data.testStatus;
    }

    return payload;
  } catch {
    return null;
  }
}

function fallbackArtifact(role: AgentRole, content: string, changedFiles: string[]): StageArtifact {
  return {
    role,
    summary: truncate(content),
    changedFiles,
    findings: [],
    testStatus: 'skipped',
  };
}

export function parseStageOutput(
  role: AgentRole,
  content: string,
  changedFiles: string[],
): { artifact: StageArtifact; parseOk: boolean } {
  const source = extractJsonSource(content);
  if (!source) {
    return { artifact: fallbackArtifact(role, content, changedFiles), parseOk: false };
  }

  const payload = parsePayload(source.json);
  if (!payload) {
    return { artifact: fallbackArtifact(role, content, changedFiles), parseOk: false };
  }

  const artifact: StageArtifact = {
    role,
    summary: payload.summary ?? truncate(content),
    changedFiles,
    rawExcerpt: source.excerpt,
  };

  if (payload.findings !== undefined) {
    artifact.findings = payload.findings;
  }
  if (payload.testStatus !== undefined) {
    artifact.testStatus = payload.testStatus;
  }

  return { artifact, parseOk: true };
}

export function parseArtifactFromAssistant(
  role: AgentRole,
  content: string,
  changedFiles: string[],
): StageArtifact {
  return parseStageOutput(role, content, changedFiles).artifact;
}

export function decideGate(artifact: StageArtifact, parseOk: boolean = true): GateDecision {
  if (!parseOk) {
    return { action: 'retry_artifact', reason: 'artifact parse failed' };
  }

  if (artifact.role === 'reviewer') {
    const block = artifact.findings?.find((f) => f.severity === 'block');
    if (block) {
      return { action: 'retry_coder', reason: block.message };
    }
  }

  if (artifact.role === 'tester' && artifact.testStatus === 'fail') {
    return { action: 'retry_coder', reason: artifact.summary };
  }

  return { action: 'continue' };
}
