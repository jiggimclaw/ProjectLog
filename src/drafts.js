const PREFIX = 'projectlog.draft.v4.1';
const CAPTURE_KEY = `${PREFIX}.quick-capture`;

function getStorage(storage) {
  try {
    return storage ?? globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function editorIdentity(editor) {
  const entityId = editor?.entity?.id ?? 'new';
  const projectId = editor?.projectId ?? 'none';
  const materialType = editor?.materialType ?? 'none';
  return `${editor?.type ?? 'unknown'}:${entityId}:${projectId}:${materialType}`;
}

export function editorDraftKey(editor) {
  return `${PREFIX}.editor.${editorIdentity(editor)}`;
}

function readJson(key, storage) {
  const target = getStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value, storage) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key, storage) {
  const target = getStorage(storage);
  if (!target) return;
  try { target.removeItem(key); } catch { /* storage unavailable */ }
}

export function persistEditorDraft(editor, draft, storage) {
  return writeJson(editorDraftKey(editor), { draft, savedAt: new Date().toISOString() }, storage);
}

export function restoreEditorDraft(editor, storage) {
  return readJson(editorDraftKey(editor), storage)?.draft ?? null;
}

export function clearEditorDraft(editor, storage) {
  remove(editorDraftKey(editor), storage);
}

export function persistCaptureDraft(value, storage) {
  if (!String(value ?? '').trim()) {
    remove(CAPTURE_KEY, storage);
    return true;
  }
  return writeJson(CAPTURE_KEY, { value: String(value), savedAt: new Date().toISOString() }, storage);
}

export function restoreCaptureDraft(storage) {
  return readJson(CAPTURE_KEY, storage)?.value ?? '';
}

export function clearCaptureDraft(storage) {
  remove(CAPTURE_KEY, storage);
}
