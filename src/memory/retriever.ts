import type { MemoryEntry } from './types';

export interface MemoryRetriever {
  retrieve(task: string, allMemories: MemoryEntry[], maxResults: number): MemoryEntry[];
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'in', 'to', 'of', 'and', 'for', 'with', 'on', 'at', 'by',
  'it', 'or', 'be', 'as', 'so', 'we', 'no', 'not', 'but', 'if', 'do', 'has', 'had',
  'was', 'are', 'were', 'been', 'can', 'will', 'would', 'could', 'should', 'may',
  'i', 'you', 'he', 'she', 'they', 'me', 'him', 'her', 'my', 'your', 'this', 'that',
]);

export class KeywordRetriever implements MemoryRetriever {
  retrieve(task: string, allMemories: MemoryEntry[], maxResults: number): MemoryEntry[] {
    if (!task || allMemories.length === 0) return [];

    const keywords = this.extractKeywords(task);
    if (keywords.length === 0) return [];

    const scored = allMemories.map((entry) => {
      const lowerKey = entry.key.toLowerCase();
      const lowerValue = entry.value.toLowerCase();
      const matches = keywords.filter(
        (kw) => lowerKey.includes(kw) || lowerValue.includes(kw),
      ).length;
      return { entry, score: matches };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.entry);
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,，。！？、；：""''（）\(\)\[\]{}]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  }
}
