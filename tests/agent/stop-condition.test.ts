import { describe, it, expect } from 'vitest';
import { StopCondition } from '../../src/agent/stop-condition';

describe('StopCondition', () => {
  it('returns true when max rounds reached', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(10, 'stop')).toEqual({ stop: true, reason: 'Max rounds (10) reached' });
  });

  it('returns true when LLM finish reason is stop', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(3, 'stop')).toEqual({ stop: true, reason: 'Task completed' });
  });

  it('returns false when rounds remain and finish reason is tool_calls', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(3, 'tool_calls')).toEqual({ stop: false, reason: '' });
  });

  it('returns true when user cancelled', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(3, 'tool_calls', true)).toEqual({ stop: true, reason: 'User cancelled' });
  });
});