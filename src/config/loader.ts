import * as fs from 'fs';

export class ConfigLoader {
  load(filePath: string): string[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }
}