export interface MemoryEntry {
  id: number;
  key: string;
  value: string;
  category: 'convention' | 'decision' | 'preference';
  created_at: string;
  updated_at: string;
}