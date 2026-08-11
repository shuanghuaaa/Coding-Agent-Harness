import { useEffect, useState } from 'react';
import { ChevronUp, Folder, File, HardDrive } from 'lucide-react';
import { browseWorkspace, setWorkspaceRoot, type BrowseEntry } from '../api/workspace';

interface FolderPickerProps {
  currentPath: string;
  title?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSelected: (path: string) => void;
}

export function FolderPicker({
  currentPath,
  title = '选择工作区文件夹',
  confirmLabel = '打开此文件夹',
  onClose,
  onSelected,
}: FolderPickerProps) {
  const [browsePath, setBrowsePath] = useState(currentPath || '');
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [pathInput, setPathInput] = useState(currentPath || '');
  const [selected, setSelected] = useState(currentPath || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await browseWorkspace(path);
      setBrowsePath(result.path);
      setParent(result.parent);
      setEntries(result.entries);
      if (result.path) {
        setPathInput(result.path);
        setSelected(result.path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load(currentPath || '');
  }, [currentPath]);

  const confirm = async () => {
    const target = pathInput.trim() || selected;
    if (!target) {
      setError('请选择或输入一个文件夹路径');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const abs = await setWorkspaceRoot(target);
      onSelected(abs);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="folder-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="folder-picker-title">
      <div className="folder-picker panel">
        <div className="folder-picker-head">
          <h2 id="folder-picker-title">{title}</h2>
          <p className="folder-picker-hint">从下方列表选择，或直接粘贴绝对路径</p>
        </div>

        <div className="folder-picker-path-row">
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="例如 D:\projects\my-app"
            spellCheck={false}
          />
          <button type="button" className="header-btn" disabled={busy} onClick={() => void load(pathInput.trim())}>
            转到
          </button>
        </div>

        <div className="folder-picker-toolbar">
          <button
            type="button"
            className="header-btn"
            disabled={busy || (parent === null && browsePath === '')}
            onClick={() => void load(parent ?? '')}
          >
            <ChevronUp size={14} />
            上级
          </button>
          <button type="button" className="header-btn" disabled={busy} onClick={() => void load('')}>
            <HardDrive size={14} />
            磁盘根目录
          </button>
          <span className="folder-picker-current" title={browsePath || '（选择磁盘）'}>
            {browsePath || '（选择磁盘）'}
          </span>
        </div>

        {error && <div className="sessions-error">{error}</div>}

        <ul className="folder-picker-list">
          {busy && entries.length === 0 && <li className="folder-picker-empty">加载中…</li>}
          {!busy && entries.length === 0 && <li className="folder-picker-empty">此目录为空</li>}
          {entries.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                className={`folder-picker-item ${selected === entry.path ? 'selected' : ''} ${entry.type}`}
                onClick={() => {
                  if (entry.type === 'folder') {
                    setSelected(entry.path);
                    setPathInput(entry.path);
                  }
                }}
                onDoubleClick={() => {
                  if (entry.type === 'folder') void load(entry.path);
                }}
              >
                {entry.type === 'folder' ? <Folder size={14} /> : <File size={14} />}
                <span>{entry.name}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="folder-picker-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
