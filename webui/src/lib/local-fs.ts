const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.turbo', '__pycache__', '.venv', 'venv']);
const SKIP_FILE = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|exe|dll|so|dylib|mp4|mp3|wasm)$/i;
const MAX_FILE = 512 * 1024;

type DirHandle = FileSystemDirectoryHandle;

function picker(): (() => Promise<DirHandle>) | undefined {
  return (window as unknown as { showDirectoryPicker?: () => Promise<DirHandle> }).showDirectoryPicker;
}

export function canWriteLocalFolder(): boolean {
  return typeof picker() === 'function';
}

export async function pickLocalDirectory(): Promise<DirHandle | null> {
  const show = picker();
  if (!show) return null;
  const handle = await show();
  const perm = handle as DirHandle & {
    requestPermission?: (opts: { mode: string }) => Promise<string>;
  };
  if (perm.requestPermission) {
    const mode = await perm.requestPermission({ mode: 'readwrite' });
    if (mode !== 'granted') throw new Error('未获得对本机文件夹的读写权限');
  }
  return handle;
}

export async function readLocalDirectory(handle: DirHandle, prefix = ''): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string }> = [];
  const entries = (handle as DirHandle & {
    values: () => AsyncIterable<FileSystemHandle>;
  }).values();
  for await (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (SKIP_DIR.has(entry.name)) continue;
      out.push(...await readLocalDirectory(entry as DirHandle, rel));
      continue;
    }
    if (SKIP_FILE.test(entry.name)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    if (file.size > MAX_FILE) continue;
    const buf = await file.arrayBuffer();
    if (new Uint8Array(buf).includes(0)) continue;
    out.push({ path: rel, content: new TextDecoder().decode(buf) });
  }
  return out;
}

export async function writeLocalFile(root: DirHandle, relPath: string, content: string): Promise<void> {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === '..')) {
    throw new Error(`非法本地路径: ${relPath}`);
  }
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const file = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}
