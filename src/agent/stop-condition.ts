export interface StopConditionConfig {
  maxRounds: number;
}

export class StopCondition {
  constructor(private config: StopConditionConfig) {}

  shouldStop(
    currentRound: number,
    finishReason: string,
    userCancelled?: boolean
  ): { stop: boolean; reason: string } {
    if (userCancelled) {
      return { stop: true, reason: 'User cancelled' };
    }

    if (currentRound >= this.config.maxRounds) {
      return { stop: true, reason: `Max rounds (${this.config.maxRounds}) reached` };
    }

    if (finishReason === 'stop') {
      return { stop: true, reason: 'Task completed' };
    }

    return { stop: false, reason: '' };
  }
}