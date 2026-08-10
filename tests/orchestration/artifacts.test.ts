import { describe, it, expect } from 'vitest';
import { parseStageOutput, decideGate } from '../../src/orchestration/artifacts';

const changedFiles = ['src/foo.ts'];

describe('parseStageOutput', () => {
  it('parses fenced json block', () => {
    const content = 'Done.\n```json\n{"summary":"Implemented foo","findings":[]}\n```';
    const { artifact, parseOk } = parseStageOutput('coder', content, changedFiles);
    expect(parseOk).toBe(true);
    expect(artifact.summary).toBe('Implemented foo');
    expect(artifact.role).toBe('coder');
    expect(artifact.changedFiles).toEqual(changedFiles);
    expect(artifact.rawExcerpt).toContain('```json');
  });

  it('parses ARTIFACT: line', () => {
    const content =
      'Review complete.\nARTIFACT: {"summary":"Looks good","findings":[{"severity":"info","message":"nit"}]}';
    const { artifact, parseOk } = parseStageOutput('reviewer', content, changedFiles);
    expect(parseOk).toBe(true);
    expect(artifact.summary).toBe('Looks good');
    expect(artifact.findings).toEqual([{ severity: 'info', message: 'nit' }]);
  });

  it('returns parseOk=false on missing artifact', () => {
    const content = 'Plain assistant reply without structured output.';
    const { artifact, parseOk } = parseStageOutput('reviewer', content, changedFiles);
    expect(parseOk).toBe(false);
    expect(artifact.findings).toEqual([]);
    expect(artifact.testStatus).toBe('skipped');
    expect(artifact.summary).toBe(content);
    expect(artifact.role).toBe('reviewer');
    expect(artifact.changedFiles).toEqual(changedFiles);
  });

  it('returns parseOk=false on invalid json and truncates long summary', () => {
    const content = 'x'.repeat(600) + '\n```json\n{not json}\n```';
    const { artifact, parseOk } = parseStageOutput('tester', content, changedFiles);
    expect(parseOk).toBe(false);
    expect(artifact.findings).toEqual([]);
    expect(artifact.testStatus).toBe('skipped');
    expect(artifact.summary.length).toBeLessThanOrEqual(500);
  });
});

describe('decideGate', () => {
  it('retry_coder when reviewer has block finding', () => {
    const { artifact } = parseStageOutput(
      'reviewer',
      '```json\n{"summary":"Issues","findings":[{"severity":"block","message":"unsafe API"}]}\n```',
      changedFiles,
    );
    expect(decideGate(artifact)).toEqual({
      action: 'retry_coder',
      reason: 'unsafe API',
    });
  });

  it('continue when reviewer has only warn findings', () => {
    const { artifact } = parseStageOutput(
      'reviewer',
      '```json\n{"summary":"Minor notes","findings":[{"severity":"warn","message":"style"}]}\n```',
      changedFiles,
    );
    expect(decideGate(artifact)).toEqual({ action: 'continue' });
  });

  it('retry_coder when tester reports fail', () => {
    const { artifact } = parseStageOutput(
      'tester',
      '```json\n{"summary":"Tests failed","testStatus":"fail"}\n```',
      changedFiles,
    );
    expect(decideGate(artifact)).toEqual({
      action: 'retry_coder',
      reason: 'Tests failed',
    });
  });

  it('continue when tester reports pass', () => {
    const { artifact } = parseStageOutput(
      'tester',
      '```json\n{"summary":"All green","testStatus":"pass"}\n```',
      changedFiles,
    );
    expect(decideGate(artifact)).toEqual({ action: 'continue' });
  });

  it('continue when parse failed (malformed artifact)', () => {
    const { artifact } = parseStageOutput('reviewer', 'no structured output', changedFiles);
    expect(decideGate(artifact)).toEqual({ action: 'continue' });
  });
});
