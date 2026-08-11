export interface SavedProject {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

const KEY = 'harness-projects';

function basename(path: string): string {
  const norm = path.replace(/[\\/]+$/, '');
  const parts = norm.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function loadProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedProject[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveProjects(list: SavedProject[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertProject(path: string, name?: string): SavedProject[] {
  const list = loadProjects();
  const existing = list.find((p) => p.path === path);
  if (existing) {
    if (name) existing.name = name;
    saveProjects(list);
    return list;
  }
  const next: SavedProject = {
    id: `proj-${Date.now()}`,
    name: name?.trim() || basename(path),
    path,
    addedAt: Date.now(),
  };
  const updated = [next, ...list];
  saveProjects(updated);
  return updated;
}

export function removeProject(id: string): SavedProject[] {
  const updated = loadProjects().filter((p) => p.id !== id);
  saveProjects(updated);
  return updated;
}
