import { buildBackupFilename } from './backup.js?v=4.0.0';
import { createBug, createIdea, createProject, updateEntity } from './domain.js?v=4.0.0';
import { editorTitle, renderEditorFields, selectedTagsFromEditor } from './forms.js?v=4.0.0';
import { icon } from './icons.js?v=4.0.0';
import {
  createAttachment,
  createInboxItem,
  createReference,
  updateMaterial,
} from './materials.js?v=4.0.0';
import {
  activeRootTab,
  currentInboxForView,
  currentProjectForView,
  currentReferenceForView,
  renderHeader,
  renderMain,
  tabBarVisible,
} from './views.js?v=4.0.0';
import {
  createNavigationState,
  currentView,
  popView,
  pushView,
  replaceView,
  resetRootView,
} from './navigation.js?v=4.0.0';
import { parseLaunchCommand } from './router.js?v=4.0.0';
import {
  actionSheet,
  quickCaptureSheet,
  confirmSheet,
  filterSheet,
  projectPickerSheet,
  tagPickerSheet,
} from './sheets.js?v=4.0.0';
import { ProjectLogRepository } from './storage.js?v=4.0.0';
import { escapeHtml } from './view-helpers.js?v=4.0.0';

export const APP_VERSION = '4.0.0';

const repository = new ProjectLogRepository();
const LEGACY_EXTRAS_KEY = 'projectlog.extras.v3';

const state = {
  navigation: createNavigationState('projects'),
  projects: [],
  bugs: [],
  ideas: [],
  inboxItems: [],
  references: [],
  attachments: [],
  events: [],
  monthlySummaries: [],
  settings: { startView: 'projects', includeArchived: false },
  search: { projects: '', inbox: '', library: '' },
  filters: { bugs: 'open', ideas: 'open', library: 'all' },
  attachmentUrls: new Map(),
  editor: null,
  sheet: null,
  pendingImport: null,
  baseUrl: '',
};

const appShell = document.querySelector('#app-shell');
const header = document.querySelector('#app-header');
const main = document.querySelector('#app-main');
const nav = document.querySelector('#tab-bar');
const editorDialog = document.querySelector('#editor-dialog');
const editorForm = document.querySelector('#editor-form');
const editorTitleElement = document.querySelector('#editor-title');
const editorFields = document.querySelector('#editor-fields');
const editorError = document.querySelector('#editor-error');
const editorDeleteSlot = document.querySelector('#editor-delete-slot');
const actionDialog = document.querySelector('#action-dialog');
const actionSheetContent = document.querySelector('#action-sheet-content');
const imageInput = document.querySelector('#image-file');
const attachmentInput = document.querySelector('#attachment-file');
const importInput = document.querySelector('#import-file');
const toast = document.querySelector('#toast');
const statusBarMeta = document.querySelector('#status-bar-style');

function appBaseUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function syncStatusBarStyle() {
  if (!statusBarMeta) return;
  statusBarMeta.content = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'black-translucent' : 'default';
}

function showToast(message, timeout = 3000) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), timeout);
}

function rebuildAttachmentUrls() {
  for (const value of state.attachmentUrls.values()) URL.revokeObjectURL?.(value);
  state.attachmentUrls = new Map();
  for (const attachment of state.attachments) {
    if (attachment.blob instanceof Blob && URL.createObjectURL) {
      state.attachmentUrls.set(attachment.id, URL.createObjectURL(attachment.blob));
    }
  }
}

async function refresh({ renderView = true } = {}) {
  const [projects, bugs, ideas, inboxItems, references, attachments, events, monthlySummaries, settings] = await Promise.all([
    repository.list('projects'),
    repository.list('bugs'),
    repository.list('ideas'),
    repository.list('inboxItems'),
    repository.list('references'),
    repository.list('attachments'),
    repository.listEvents(),
    repository.listMonthlySummaries(),
    repository.getSettings(),
  ]);
  Object.assign(state, { projects, bugs, ideas, inboxItems, references, attachments, events, monthlySummaries, settings });
  rebuildAttachmentUrls();
  if (renderView) render();
}

async function migrateLegacyExtras() {
  const raw = localStorage.getItem(LEGACY_EXTRAS_KEY);
  if (!raw || state.inboxItems.length || state.references.length) return;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { localStorage.removeItem(LEGACY_EXTRAS_KEY); return; }
  const projectIds = new Set(state.projects.map((project) => project.id));
  for (const item of parsed.inbox ?? []) {
    try {
      await repository.saveInboxItem(createInboxItem({
        type: ['note', 'link'].includes(item.type) ? item.type : 'note',
        title: item.title ?? 'Unbenannter Eintrag',
        body: item.body ?? item.description ?? '',
        url: item.url ?? '',
        tags: item.tags ?? [],
      }, { id: item.id, now: item.createdAt ?? new Date().toISOString() }));
    } catch { /* invalid legacy item is skipped */ }
  }
  for (const item of parsed.references ?? []) {
    const validProjects = (item.projectIds ?? []).filter((id) => projectIds.has(id));
    if (!validProjects.length) continue;
    try {
      await repository.saveReference(createReference({
        type: ['note', 'link'].includes(item.type) ? item.type : 'note',
        title: item.title ?? 'Unbenannte Referenz',
        body: item.body ?? item.description ?? '',
        url: item.url ?? '',
        projectIds: validProjects,
        tags: item.tags ?? [],
      }, { id: item.id, now: item.createdAt ?? new Date().toISOString() }));
    } catch { /* invalid legacy reference is skipped */ }
  }
  localStorage.removeItem(LEGACY_EXTRAS_KEY);
  await refresh({ renderView: false });
}

function syncTabBar() {
  const visible = tabBarVisible(state);
  const secondary = state.navigation.stack.length > 1;
  nav.hidden = !visible;
  appShell.classList.toggle('has-root-tabs', visible);
  appShell.classList.toggle('has-secondary-view', secondary);
  const active = activeRootTab(state);
  for (const button of nav.querySelectorAll('[data-nav]')) {
    const selected = button.dataset.nav === active;
    button.classList.toggle('is-active', selected);
    button.toggleAttribute('aria-current', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    const iconName = button.dataset.nav === 'projects'
      ? (selected ? 'folder-filled' : 'folder')
      : (selected ? 'tray-filled' : 'tray');
    button.querySelector('.tab-icon').innerHTML = icon(iconName);
  }
}

function render() {
  state.baseUrl = appBaseUrl();
  header.innerHTML = renderHeader(state);
  main.innerHTML = renderMain(state);
  syncTabBar();
}

function navigatePush(name, params = {}) {
  state.navigation = pushView(state.navigation, name, params);
  render();
  main.scrollTop = 0;
}

function navigateReplace(name, params = {}) {
  state.navigation = replaceView(state.navigation, name, params);
  render();
  main.scrollTop = 0;
}

function navigateBack() {
  state.navigation = popView(state.navigation);
  render();
  main.scrollTop = 0;
}

function navigateRoot(root) {
  state.navigation = resetRootView(state.navigation, root);
  render();
  main.scrollTop = 0;
}

function openSheet(html, context = {}) {
  state.sheet = context;
  actionSheetContent.innerHTML = html;
  document.documentElement.classList.add('modal-open');
  actionDialog.showModal();
}

function closeSheet() {
  if (actionDialog.open) actionDialog.close();
  state.sheet = null;
}

function openGlobalMenu() {
  openSheet(actionSheet({
    title: 'ProjectLog',
    actions: [
      { action: 'go-library', label: 'Referenzen', detail: 'Alle verarbeiteten Materialien', iconName: 'link' },
      { action: 'go-archive', label: 'Archiv', detail: 'Archivierte Projekte und Referenzen', iconName: 'archive' },
      { action: 'go-settings', label: 'Einstellungen', detail: 'Backup, Kurzbefehle und lokale Daten', iconName: 'gear' },
    ],
  }), { type: 'menu' });
}

function captureEditorDraft() {
  if (!state.editor || !editorDialog.open) return;
  const data = new FormData(editorForm);
  state.editor.draft = Object.fromEntries([...data.entries()].filter(([key]) => key !== 'tags'));
  state.editor.draft.favorite = data.get('favorite') === 'on';
}

function renderEditor() {
  editorTitleElement.textContent = editorTitle(state.editor);
  editorFields.innerHTML = renderEditorFields(state.editor);
  editorError.hidden = true;
  editorError.textContent = '';
  const entity = state.editor.entity;
  editorDeleteSlot.innerHTML = entity
    ? `<button class="danger-button" type="button" data-editor-action="request-delete">${state.editor.type === 'project' ? 'Projekt löschen' : state.editor.type === 'inbox' ? 'Eingangseintrag löschen' : state.editor.type === 'reference' ? 'Referenz löschen' : 'Eintrag löschen'}</button>`
    : '';
}

function openEditor(type, entity = null, options = {}) {
  const projectId = entity?.projectId ?? options.projectId ?? currentProjectForView(state)?.id ?? null;
  state.editor = {
    type,
    entity,
    projectId,
    materialType: options.materialType,
    prefill: options.prefill ?? {},
    tags: [...(entity?.tags ?? options.tags ?? [])],
    draft: {},
  };
  renderEditor();
  document.documentElement.classList.add('modal-open');
  editorDialog.showModal();
  window.setTimeout(() => editorFields.querySelector('input:not([type="hidden"]), textarea, select')?.focus(), 50);
}

function closeEditor() {
  if (editorDialog.open) editorDialog.close();
  state.editor = null;
}

async function saveEditor(formData) {
  const editor = state.editor;
  const now = new Date().toISOString();
  const tags = selectedTagsFromEditor(editor);
  if (editor.type === 'project') {
    const values = {
      name: formData.get('name'),
      description: formData.get('description'),
      status: formData.get('status'),
      priority: formData.get('priority'),
      favorite: formData.get('favorite') === 'on',
    };
    const saved = editor.entity ? updateEntity('project', editor.entity, values, now) : createProject(values, { now });
    await repository.saveEntity('project', saved);
    closeEditor();
    await refresh({ renderView: false });
    state.navigation = pushView(createNavigationState('projects'), 'project', { projectId: saved.id });
    render();
  } else if (editor.type === 'bug') {
    const values = {
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status'),
      severity: formData.get('severity'),
      tags,
    };
    const saved = editor.entity
      ? updateEntity('bug', editor.entity, values, now)
      : createBug({ ...values, projectId: editor.projectId }, { sequence: await repository.nextSequence('bug'), now });
    await repository.saveEntity('bug', saved);
    closeEditor();
    await refresh();
  } else if (editor.type === 'idea') {
    const values = {
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status'),
      value: formData.get('value'),
      tags,
    };
    const saved = editor.entity
      ? updateEntity('idea', editor.entity, values, now)
      : createIdea({ ...values, projectId: editor.projectId }, { sequence: await repository.nextSequence('idea'), now });
    await repository.saveEntity('idea', saved);
    closeEditor();
    await refresh();
  } else if (editor.type === 'inbox') {
    const values = {
      type: formData.get('materialType'),
      title: formData.get('title'),
      body: formData.get('body'),
      url: formData.get('url') ?? '',
      attachmentId: editor.entity?.attachmentId ?? null,
      tags,
    };
    const saved = editor.entity
      ? updateMaterial('inbox', editor.entity, values, now)
      : createInboxItem(values, { now });
    await repository.saveInboxItem(saved);
    closeEditor();
    await refresh({ renderView: false });
    state.navigation = pushView(createNavigationState('inbox'), 'inbox-detail', { inboxId: saved.id });
    render();
  } else if (editor.type === 'reference') {
    const values = {
      title: formData.get('title'),
      body: formData.get('body'),
      url: formData.get('url') ?? editor.entity.url,
      tags,
    };
    const saved = updateMaterial('reference', editor.entity, values, now);
    await repository.saveReference(saved);
    closeEditor();
    await refresh();
  }
  showToast('Gesichert.');
}

function quickCaptureKind(value) {
  return /^https?:\/\//i.test(value.trim()) ? 'link' : 'note';
}

function quickCaptureTitle(value, type) {
  if (type === 'link') {
    try { return new URL(value.trim()).hostname.replace(/^www\./, '').slice(0, 160); }
    catch { return value.trim().slice(0, 160); }
  }
  return value.trim().split(/\r?\n/).find(Boolean)?.slice(0, 160) ?? 'Neue Notiz';
}

async function saveQuickCapture(value) {
  const normalized = value.trim();
  if (!normalized) throw new Error('Gib einen Gedanken, Link oder eine Notiz ein.');
  const type = quickCaptureKind(normalized);
  const title = quickCaptureTitle(normalized, type);
  const body = type === 'note' ? normalized.split(/\r?\n/).slice(1).join('\n').trim() : '';
  const item = createInboxItem({
    type,
    title,
    body,
    url: type === 'link' ? normalized : '',
    tags: [],
  }, { now: new Date().toISOString() });
  await repository.saveInboxItem(item);
  closeSheet();
  await refresh({ renderView: false });
  state.navigation = pushView(createNavigationState('inbox'), 'inbox-detail', { inboxId: item.id });
  render();
  showToast(type === 'link' ? 'Link im Eingang gesichert.' : 'Notiz im Eingang gesichert.');
}

function openTagPicker() {
  captureEditorDraft();
  openSheet(tagPickerSheet({ selected: state.editor.tags }), { type: 'tag-picker' });
}

function openCompose() {
  openSheet(quickCaptureSheet(), { type: 'quick-capture' });
}

function openProjectMenu() {
  const project = currentProjectForView(state);
  if (!project) return;
  openSheet(actionSheet({
    title: project.name,
    actions: [
      { action: 'project-new-bug', label: 'Neuer Bug', iconName: 'bug' },
      { action: 'project-new-idea', label: 'Neue Idee', iconName: 'bulb' },
      { action: 'project-assign-reference', label: 'Referenz zuordnen', iconName: 'link' },
      { action: 'project-toggle-favorite', label: project.favorite ? 'Favorit entfernen' : 'Als Favorit markieren', iconName: project.favorite ? 'pin-filled' : 'pin' },
      { action: 'project-edit', label: 'Projekt bearbeiten', iconName: 'edit' },
      { action: 'project-delete-request', label: 'Projekt löschen', iconName: 'trash', destructive: true },
    ],
  }), { type: 'project-menu', projectId: project.id });
}

function openInboxMenu() {
  const item = currentInboxForView(state);
  if (!item) return;
  openSheet(actionSheet({
    title: item.title,
    actions: [
      { action: 'inbox-process', label: 'Weiterverarbeiten', detail: 'Projekt, Idee, Bug oder Referenz', iconName: 'sparkles' },
      { action: 'inbox-share', label: 'Teilen', iconName: 'share' },
      { action: 'inbox-delete-request', label: 'Löschen', iconName: 'trash', destructive: true },
    ],
  }), { type: 'inbox-menu', inboxId: item.id });
}

function openReferenceMenu() {
  const reference = currentReferenceForView(state);
  if (!reference) return;
  openSheet(actionSheet({
    title: reference.title,
    actions: [
      { action: 'reference-share', label: 'Teilen', iconName: 'share' },
      { action: 'reference-return', label: 'Zurück in den Eingang', iconName: 'restore' },
      { action: 'reference-toggle-archive', label: reference.archived ? 'Wiederherstellen' : 'Archivieren', iconName: 'archive' },
      { action: 'reference-delete-request', label: 'Löschen', iconName: 'trash', destructive: true },
    ],
  }), { type: 'reference-menu', referenceId: reference.id });
}

function openProcessSheet() {
  const item = currentInboxForView(state);
  if (!item) return;
  openSheet(actionSheet({
    title: 'Weiterverarbeiten',
    message: 'Der Eingangseintrag wird anschließend aus dem Eingang entfernt.',
    actions: [
      { action: 'process-project', label: 'Als Projekt', detail: 'Neues Projekt aus dem Inhalt erstellen', iconName: 'folder' },
      { action: 'process-idea', label: 'Als Idee', detail: 'Einem Projekt zuordnen', iconName: 'bulb' },
      { action: 'process-bug', label: 'Als Bug', detail: 'Einem Projekt zuordnen', iconName: 'bug' },
      { action: 'process-reference', label: 'Als Referenz', detail: 'Einem oder mehreren Projekten zuordnen', iconName: 'link' },
    ],
  }), { type: 'process', inboxId: item.id });
}

function openFilter(type) {
  const configs = {
    bugs: {
      title: 'Bugs filtern',
      options: [
        { value: 'open', label: 'Offen' }, { value: 'critical', label: 'Kritisch' },
        { value: 'resolved', label: 'Behoben' }, { value: 'all', label: 'Alle' },
      ],
    },
    ideas: {
      title: 'Ideen filtern',
      options: [
        { value: 'open', label: 'Offen' }, { value: 'strategic', label: 'Strategisch' },
        { value: 'implemented', label: 'Umgesetzt' }, { value: 'all', label: 'Alle' },
      ],
    },
    library: {
      title: 'Referenzen filtern',
      options: [
        { value: 'all', label: 'Alle' }, { value: 'link', label: 'Links' },
        { value: 'image', label: 'Bilder' }, { value: 'file', label: 'Dateien' }, { value: 'note', label: 'Notizen' },
      ],
    },
  };
  const config = configs[type];
  openSheet(filterSheet({ ...config, selected: state.filters[type] }), { type: 'filter', filterType: type });
}

function openProjectPicker({ purpose, multiple, selected = [], title }) {
  if (!state.projects.length) {
    showToast('Lege zuerst ein Projekt an.');
    return;
  }
  openSheet(projectPickerSheet({ projects: state.projects.filter((project) => project.status !== 'archived'), selected, multiple, purpose, title }), { type: 'project-picker', purpose });
}

async function captureFiles(fileList, materialType) {
  const files = [...(fileList ?? [])];
  if (!files.length) return;
  const now = new Date().toISOString();
  const records = files.map((file) => {
    const attachment = createAttachment({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, blob: file }, { now });
    const baseTitle = file.name.replace(/\.[^.]+$/, '') || file.name;
    const item = createInboxItem({ type: materialType, title: baseTitle, attachmentId: attachment.id }, { now });
    return { attachment, item };
  });
  for (const { attachment, item } of records) {
    await repository.saveAttachment(attachment);
    await repository.saveInboxItem(item);
  }
  await refresh({ renderView: false });
  state.navigation = records.length === 1
    ? pushView(createNavigationState('inbox'), 'inbox-detail', { inboxId: records[0].item.id })
    : createNavigationState('inbox');
  render();
  const label = materialType === 'image' ? (records.length === 1 ? 'Bild' : 'Bilder') : (records.length === 1 ? 'Datei' : 'Dateien');
  showToast(`${records.length} ${label} im Eingang gesichert.`);
}

function companionReferenceForInbox(item, projectIds, now) {
  if (item.type === 'note') return null;
  return createReference({
    type: item.type,
    title: item.title,
    body: item.body,
    url: item.url,
    attachmentId: item.attachmentId,
    tags: item.tags,
    projectIds,
  }, { now });
}

async function processInboxToProject(inboxId) {
  const item = state.inboxItems.find((entry) => entry.id === inboxId);
  if (!item) throw new Error('Eingangseintrag nicht gefunden');
  const now = new Date().toISOString();
  const project = createProject({ name: item.title.slice(0, 80), description: item.body, status: 'planned', priority: 'normal', favorite: false }, { now });
  const reference = companionReferenceForInbox(item, [project.id], now);
  await repository.processInboxItem({ inboxId, kind: 'project', entity: project, reference });
  await refresh({ renderView: false });
  state.navigation = pushView(createNavigationState('projects'), 'project', { projectId: project.id });
  render();
  showToast('Als Projekt übernommen.');
}

async function processInboxWithProjects(purpose, projectIds) {
  const inboxId = state.sheet?.inboxId ?? state.sheet?.sourceInboxId;
  const item = state.inboxItems.find((entry) => entry.id === inboxId);
  if (!item) throw new Error('Eingangseintrag nicht gefunden');
  const now = new Date().toISOString();
  if (purpose === 'idea') {
    const idea = createIdea({ projectId: projectIds[0], title: item.title, description: item.body, tags: item.tags }, { sequence: await repository.nextSequence('idea'), now });
    const reference = companionReferenceForInbox(item, [projectIds[0]], now);
    await repository.processInboxItem({ inboxId, kind: 'idea', entity: idea, reference });
  } else if (purpose === 'bug') {
    const bug = createBug({ projectId: projectIds[0], title: item.title, description: item.body, tags: item.tags, severity: 'major' }, { sequence: await repository.nextSequence('bug'), now });
    const reference = companionReferenceForInbox(item, [projectIds[0]], now);
    await repository.processInboxItem({ inboxId, kind: 'bug', entity: bug, reference });
  } else if (purpose === 'reference') {
    const reference = createReference({
      type: item.type,
      title: item.title,
      body: item.body,
      url: item.url,
      attachmentId: item.attachmentId,
      tags: item.tags,
      projectIds,
    }, { now });
    await repository.processInboxItem({ inboxId, kind: 'reference', entity: reference });
  }
  await refresh({ renderView: false });
  state.navigation = resetRootView(state.navigation, 'inbox');
  render();
  showToast('Eingangseintrag verarbeitet.');
}

async function assignReferenceProjects(referenceId, projectIds) {
  const reference = state.references.find((item) => item.id === referenceId);
  if (!reference) throw new Error('Referenz nicht gefunden');
  const updated = updateMaterial('reference', reference, { projectIds }, new Date().toISOString());
  await repository.saveReference(updated);
  await refresh();
  showToast('Projektzuordnung aktualisiert.');
}

async function assignExistingReference(referenceId, projectId) {
  const reference = state.references.find((item) => item.id === referenceId);
  if (!reference) throw new Error('Referenz nicht gefunden');
  const projectIds = [...new Set([...reference.projectIds, projectId])];
  await repository.saveReference(updateMaterial('reference', reference, { projectIds }, new Date().toISOString()));
  await refresh();
  showToast('Referenz zugeordnet.');
}

function openExistingReferencePicker() {
  const project = currentProjectForView(state);
  const available = state.references.filter((reference) => !reference.archived && !reference.projectIds.includes(project.id));
  if (!available.length) {
    showToast('Keine weitere Referenz verfügbar.');
    return;
  }
  openSheet(actionSheet({
    title: 'Referenz zuordnen',
    actions: available.map((reference) => ({ action: 'assign-existing-reference', value: reference.id, label: reference.title, detail: reference.type, iconName: reference.type === 'link' ? 'link' : reference.type === 'image' ? 'photo' : 'document' })),
  }), { type: 'reference-picker', projectId: project.id });
}

async function returnReferenceToInbox(reference) {
  const inbox = createInboxItem({
    type: reference.type,
    title: reference.title,
    body: reference.body,
    url: reference.url,
    attachmentId: reference.attachmentId,
    tags: reference.tags,
  }, { now: new Date().toISOString() });
  await repository.saveInboxItem(inbox);
  await repository.deleteReference(reference.id);
  await refresh({ renderView: false });
  state.navigation = pushView(createNavigationState('inbox'), 'inbox-detail', { inboxId: inbox.id });
  render();
  showToast('Zurück in den Eingang verschoben.');
}

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; }
    catch { /* use selection fallback */ }
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const copied = document.execCommand?.('copy') ?? false;
  area.remove();
  return copied;
}

function currentMaterial() {
  return currentInboxForView(state) ?? currentReferenceForView(state);
}

async function openMaterialAttachment() {
  const item = currentMaterial();
  if (!item?.attachmentId) throw new Error('Kein Anhang vorhanden');
  const attachment = state.attachments.find((entry) => entry.id === item.attachmentId);
  const url = state.attachmentUrls.get(item.attachmentId);
  if (!attachment || !url) throw new Error('Anhang konnte nicht geöffnet werden');
  const anchor = document.createElement('a');
  anchor.href = url;
  if (!attachment.mimeType.startsWith('image/') && attachment.mimeType !== 'application/pdf') anchor.download = attachment.name;
  else { anchor.target = '_blank'; anchor.rel = 'noopener'; }
  anchor.click();
}

async function shareMaterial(item) {
  const attachment = item.attachmentId ? await repository.getAttachment(item.attachmentId) : null;
  const shareData = { title: item.title, text: item.body || item.title };
  if (item.url) shareData.url = item.url;
  if (attachment) {
    const file = new File([attachment.blob], attachment.name, { type: attachment.mimeType });
    if (navigator.canShare?.({ files: [file] })) shareData.files = [file];
  }
  if (navigator.share) {
    try { await navigator.share(shareData); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  const text = [item.title, item.url, item.body].filter(Boolean).join('\n');
  await navigator.clipboard.writeText(text);
  showToast('In die Zwischenablage kopiert.');
}

async function shareBackup() {
  const backup = await repository.exportBackup();
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
  const filename = buildBackupFilename(new Date()).replace('.json', '-v3.json');
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'ProjectLog Backup' }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('Backup heruntergeladen.');
}

async function executeImport() {
  const file = state.pendingImport;
  if (!file) return;
  const parsed = JSON.parse(await file.text());
  await repository.importBackup(parsed);
  state.pendingImport = null;
  await refresh({ renderView: false });
  state.navigation = createNavigationState('projects');
  render();
  showToast('Backup importiert.');
}

async function loadDemo() {
  const now = new Date().toISOString();
  const projects = [
    createProject({ name: 'ProjectLog', description: 'Lokale Projektzentrale für Projekte, Bugs, Ideen und Referenzen.', status: 'active', priority: 'strategic', favorite: true }, { id: 'PRJ-DEMO01', now }),
    createProject({ name: 'PlasmaLog', description: 'Bestands- und Planungsapp für Plasma.', status: 'active', priority: 'high', favorite: false }, { id: 'PRJ-DEMO02', now }),
    createProject({ name: 'CortexOS', description: 'Persönliches System- und Automationsprojekt.', status: 'planned', priority: 'strategic', favorite: false }, { id: 'PRJ-DEMO03', now }),
  ];
  for (const project of projects) await repository.saveEntity('project', project);
  await repository.saveEntity('bug', createBug({ projectId: projects[0].id, title: 'Datenexport schlägt fehl', description: 'Backupablauf auf iOS prüfen.', status: 'review', severity: 'critical', tags: ['quality'] }, { sequence: await repository.nextSequence('bug'), now }));
  await repository.saveEntity('bug', createBug({ projectId: projects[1].id, title: 'Heatmap reagiert träge', status: 'active', severity: 'major', tags: ['feature'] }, { sequence: await repository.nextSequence('bug'), now }));
  await repository.saveEntity('idea', createIdea({ projectId: projects[0].id, title: 'Referenzbibliothek', description: 'Projektübergreifende Sicht auf Material.', status: 'planned', value: 'strategic', tags: ['design'] }, { sequence: await repository.nextSequence('idea'), now }));
  const reference = createReference({ type: 'link', title: 'Apple Human Interface Guidelines', body: 'Referenz für Navigation und gruppierte Listen.', url: 'https://developer.apple.com/design/human-interface-guidelines/', projectIds: [projects[0].id, projects[1].id], tags: ['design'] }, { id: 'REF-DEMO01', now });
  await repository.saveReference(reference);
  await repository.saveInboxItem(createInboxItem({ type: 'note', title: 'Homegym-App vereinfachen', body: 'Nur Tagesplan und Übungsprotokoll.', tags: ['feature'] }, { id: 'INB-DEMO01', now }));
  await repository.saveInboxItem(createInboxItem({ type: 'link', title: 'Inspiration für Animationen', url: 'https://developer.apple.com/design/', tags: ['design'] }, { id: 'INB-DEMO02', now }));
  await refresh({ renderView: false });
  state.navigation = createNavigationState('projects');
  render();
  showToast('Demodaten hinzugefügt.');
}

async function clearAll() {
  await repository.clearAll();
  await refresh({ renderView: false });
  state.navigation = createNavigationState('projects');
  render();
  showToast('Alle lokalen Daten gelöscht.');
}

async function executeDelete(context) {
  if (context.kind === 'project') {
    await repository.removeProjectCascade(context.id);
    await refresh({ renderView: false });
    state.navigation = createNavigationState('projects');
  } else if (context.kind === 'bug' || context.kind === 'idea') {
    await repository.deleteEntity(context.kind, context.id);
    await refresh({ renderView: false });
  } else if (context.kind === 'inbox') {
    await repository.deleteInboxItem(context.id);
    await refresh({ renderView: false });
    state.navigation = createNavigationState('inbox');
  } else if (context.kind === 'reference') {
    await repository.deleteReference(context.id);
    await refresh({ renderView: false });
    state.navigation = pushView(createNavigationState('projects'), 'library');
  }
  closeEditor();
  render();
  showToast('Gelöscht.');
}

function requestDelete(kind, id, label) {
  openSheet(confirmSheet({ title: `${label} löschen?`, message: 'Diese Aktion kann nicht rückgängig gemacht werden.', confirmLabel: 'Löschen', action: 'confirm-delete' }), { type: 'confirm-delete', kind, id });
}

async function toggleFavorite() {
  const project = currentProjectForView(state);
  if (!project) return;
  await repository.saveEntity('project', updateEntity('project', project, { favorite: !project.favorite }, new Date().toISOString()));
  await refresh();
}

async function handleAction(action, target) {
  switch (action) {
    case 'new-project': openEditor('project'); break;
    case 'open-compose': openCompose(); break;
    case 'open-global-menu': openGlobalMenu(); break;
    case 'navigate-back': navigateBack(); break;
    case 'open-project': navigatePush('project', { projectId: target.dataset.id }); break;
    case 'open-project-bugs': navigatePush('bugs', { projectId: currentProjectForView(state).id }); break;
    case 'open-project-ideas': navigatePush('ideas', { projectId: currentProjectForView(state).id }); break;
    case 'open-project-references': navigatePush('project-references', { projectId: currentProjectForView(state).id }); break;
    case 'open-project-history': navigatePush('history', { projectId: currentProjectForView(state).id }); break;
    case 'open-project-menu': openProjectMenu(); break;
    case 'new-bug': openEditor('bug', null, { projectId: currentProjectForView(state).id }); break;
    case 'new-idea': openEditor('idea', null, { projectId: currentProjectForView(state).id }); break;
    case 'edit-bug': openEditor('bug', state.bugs.find((item) => item.id === target.dataset.id)); break;
    case 'edit-idea': openEditor('idea', state.ideas.find((item) => item.id === target.dataset.id)); break;
    case 'open-bug-filter': openFilter('bugs'); break;
    case 'open-idea-filter': openFilter('ideas'); break;
    case 'open-library-filter': openFilter('library'); break;
    case 'open-inbox-item': navigatePush('inbox-detail', { inboxId: target.dataset.inboxId }); break;
    case 'edit-inbox-item': openEditor('inbox', currentInboxForView(state)); break;
    case 'open-inbox-menu': openInboxMenu(); break;
    case 'process-inbox': openProcessSheet(); break;
    case 'open-reference': navigatePush('reference-detail', { referenceId: target.dataset.referenceId }); break;
    case 'edit-reference': openEditor('reference', currentReferenceForView(state)); break;
    case 'open-reference-menu': openReferenceMenu(); break;
    case 'assign-reference-projects': {
      const reference = currentReferenceForView(state);
      openProjectPicker({ purpose: 'reference-projects', multiple: true, selected: reference.projectIds, title: 'Projekte zuordnen' });
      state.sheet.referenceId = reference.id;
      break;
    }
    case 'open-reference-link': window.open(currentReferenceForView(state).url, '_blank', 'noopener'); break;
    case 'open-material-attachment': await openMaterialAttachment(); break;
    case 'assign-existing-reference': openExistingReferencePicker(); break;
    case 'choose-import': importInput.click(); break;
    case 'share-backup': await shareBackup(); break;
    case 'open-shortcuts': navigatePush('shortcuts'); break;
    case 'load-demo': await loadDemo(); break;
    case 'request-clear-all': openSheet(confirmSheet({ title: 'Alle Daten löschen?', message: 'Projekte, Eingang, Referenzen und Anhänge werden lokal entfernt.', confirmLabel: 'Alle Daten löschen', action: 'confirm-clear-all' }), { type: 'confirm-clear-all' }); break;
    case 'copy-shortcut': showToast(await copyToClipboard(target.dataset.url) ? 'URL kopiert.' : 'Kopieren ist nicht verfügbar.'); break;
  }
}

async function handleSheetAction(action, target) {
  const context = state.sheet;
  if (action === 'cancel') { closeSheet(); return; }
  if (action === 'quick-capture-image') { closeSheet(); imageInput.click(); return; }
  if (action === 'quick-capture-file') { closeSheet(); attachmentInput.click(); return; }
  if (action === 'go-library') { closeSheet(); navigatePush('library'); return; }
  if (action === 'go-archive') { closeSheet(); navigatePush('archive'); return; }
  if (action === 'go-settings') { closeSheet(); navigatePush('settings'); return; }
  if (action === 'project-new-bug') { const id = context.projectId; closeSheet(); openEditor('bug', null, { projectId: id }); return; }
  if (action === 'project-new-idea') { const id = context.projectId; closeSheet(); openEditor('idea', null, { projectId: id }); return; }
  if (action === 'project-assign-reference') { closeSheet(); openExistingReferencePicker(); return; }
  if (action === 'project-toggle-favorite') { closeSheet(); await toggleFavorite(); return; }
  if (action === 'project-edit') { const project = state.projects.find((item) => item.id === context.projectId); closeSheet(); openEditor('project', project); return; }
  if (action === 'project-delete-request') { const id = context.projectId; closeSheet(); requestDelete('project', id, 'Projekt'); return; }
  if (action === 'inbox-process') { closeSheet(); openProcessSheet(); return; }
  if (action === 'inbox-share') { const item = state.inboxItems.find((entry) => entry.id === context.inboxId); closeSheet(); await shareMaterial(item); return; }
  if (action === 'inbox-delete-request') { const id = context.inboxId; closeSheet(); requestDelete('inbox', id, 'Eingangseintrag'); return; }
  if (action === 'process-project') { const id = context.inboxId; closeSheet(); await processInboxToProject(id); return; }
  if (['process-idea', 'process-bug', 'process-reference'].includes(action)) {
    const purpose = action.replace('process-', '');
    const inboxId = context.inboxId;
    closeSheet();
    openProjectPicker({ purpose, multiple: purpose === 'reference', title: purpose === 'reference' ? 'Projekte für Referenz' : 'Projekt auswählen' });
    state.sheet.inboxId = inboxId;
    return;
  }
  if (action === 'reference-share') { const reference = state.references.find((item) => item.id === context.referenceId); closeSheet(); await shareMaterial(reference); return; }
  if (action === 'reference-return') { const reference = state.references.find((item) => item.id === context.referenceId); closeSheet(); await returnReferenceToInbox(reference); return; }
  if (action === 'reference-toggle-archive') {
    const reference = state.references.find((item) => item.id === context.referenceId);
    closeSheet();
    await repository.saveReference(updateMaterial('reference', reference, { archived: !reference.archived }, new Date().toISOString()));
    await refresh({ renderView: false });
    state.navigation = pushView(createNavigationState('projects'), reference.archived ? 'library' : 'archive');
    render();
    return;
  }
  if (action === 'reference-delete-request') { const id = context.referenceId; closeSheet(); requestDelete('reference', id, 'Referenz'); return; }
  if (action === 'assign-existing-reference') { const referenceId = target.dataset.value; const projectId = context.projectId; closeSheet(); await assignExistingReference(referenceId, projectId); return; }
  if (action === 'confirm-delete') { closeSheet(); await executeDelete(context); return; }
  if (action === 'confirm-clear-all') { closeSheet(); await clearAll(); return; }
  if (action === 'confirm-import') { closeSheet(); await executeImport(); return; }
}

async function handleSheetSubmit(event) {
  event.preventDefault();
  const context = state.sheet;
  const data = new FormData(event.target);
  if (context.type === 'quick-capture') {
    await saveQuickCapture(data.get('captureText') ?? '');
    return;
  }
  if (context.type === 'tag-picker') {
    state.editor.tags = data.getAll('tags');
    closeSheet();
    renderEditor();
    return;
  }
  if (context.type === 'filter') {
    state.filters[context.filterType] = data.get('filter');
    closeSheet();
    render();
    return;
  }
  if (context.type === 'project-picker') {
    const projectIds = data.getAll('projectIds');
    if (!projectIds.length) { showToast('Wähle mindestens ein Projekt.'); return; }
    const purpose = context.purpose;
    const inboxId = context.inboxId;
    const referenceId = context.referenceId;
    closeSheet();
    if (purpose === 'reference-projects') await assignReferenceProjects(referenceId, projectIds);
    else {
      state.sheet = { inboxId };
      await processInboxWithProjects(purpose, projectIds);
      state.sheet = null;
    }
  }
}

function delegatedAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  handleAction(target.dataset.action, target).catch((error) => showToast(error.message, 4800));
}

header.addEventListener('click', delegatedAction);
main.addEventListener('click', delegatedAction);
main.addEventListener('input', (event) => {
  const keys = { 'project-search': 'projects', 'inbox-search': 'inbox', 'library-search': 'library' };
  const key = keys[event.target.id];
  if (!key) return;
  state.search[key] = event.target.value;
  const selection = [event.target.selectionStart, event.target.selectionEnd];
  main.innerHTML = renderMain(state);
  const input = main.querySelector(`#${event.target.id}`);
  input?.focus();
  input?.setSelectionRange(...selection);
});
nav.addEventListener('click', (event) => {
  const target = event.target.closest('[data-nav]');
  if (!target) return;
  navigateRoot(target.dataset.nav);
});
editorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  editorError.hidden = true;
  saveEditor(new FormData(editorForm)).catch((error) => {
    editorError.textContent = error.message;
    editorError.hidden = false;
  });
});
editorDialog.addEventListener('click', (event) => {
  const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
  if (action === 'cancel') closeEditor();
  if (action === 'choose-tags') openTagPicker();
  if (action === 'request-delete') {
    const entity = state.editor.entity;
    const kind = state.editor.type;
    closeEditor();
    requestDelete(kind, entity.id, kind === 'project' ? 'Projekt' : kind === 'inbox' ? 'Eingangseintrag' : kind === 'reference' ? 'Referenz' : 'Eintrag');
  }
});
editorDialog.addEventListener('close', () => {
  if (!actionDialog.open) document.documentElement.classList.remove('modal-open');
  if (!editorDialog.open && !actionDialog.open) state.editor = null;
});
actionDialog.addEventListener('click', (event) => {
  if (event.target === actionDialog) { closeSheet(); return; }
  const target = event.target.closest('[data-sheet-action]');
  if (!target) return;
  handleSheetAction(target.dataset.sheetAction, target).catch((error) => showToast(error.message, 4800));
});
actionDialog.addEventListener('submit', (event) => handleSheetSubmit(event).catch((error) => showToast(error.message, 4800)));
actionDialog.addEventListener('close', () => {
  if (!editorDialog.open) document.documentElement.classList.remove('modal-open');
  if (!actionDialog.open) state.sheet = null;
});
imageInput.addEventListener('change', () => {
  if (imageInput.files.length) captureFiles(imageInput.files, 'image').catch((error) => showToast(error.message, 4800));
  imageInput.value = '';
});
attachmentInput.addEventListener('change', () => {
  if (attachmentInput.files.length) captureFiles(attachmentInput.files, 'file').catch((error) => showToast(error.message, 4800));
  attachmentInput.value = '';
});
importInput.addEventListener('change', () => {
  const [file] = importInput.files;
  if (file) {
    state.pendingImport = file;
    openSheet(confirmSheet({ title: 'Backup importieren?', message: 'Der aktuelle lokale Bestand wird erst nach erfolgreicher Prüfung ersetzt.', confirmLabel: 'Importieren', action: 'confirm-import' }), { type: 'confirm-import' });
  }
  importInput.value = '';
});

async function applyLaunchCommand() {
  const command = parseLaunchCommand(window.location.href);
  if (command.type === 'invalid') showToast(command.message, 4800);
  if (command.type === 'new-project') openEditor('project');
  if (['open-project', 'new-bug', 'new-idea'].includes(command.type)) {
    const project = state.projects.find((item) => item.id === command.projectId);
    if (!project) showToast('Das angegebene Projekt wurde nicht gefunden.', 4800);
    else if (command.type === 'open-project') {
      state.navigation = pushView(createNavigationState('projects'), 'project', { projectId: project.id });
      render();
    } else {
      state.navigation = pushView(createNavigationState('projects'), command.type === 'new-bug' ? 'bugs' : 'ideas', { projectId: project.id });
      render();
      openEditor(command.type === 'new-bug' ? 'bug' : 'idea', null, { projectId: project.id, prefill: { title: command.title } });
    }
  }
  if (window.location.search) history.replaceState(null, '', window.location.pathname);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`, { updateViaCache: 'none' }); }
  catch (error) { console.warn('Service Worker konnte nicht registriert werden:', error); }
}

async function bootstrap() {
  try {
    syncStatusBarStyle();
    await repository.init();
    await repository.compactHistory();
    await refresh({ renderView: false });
    await migrateLegacyExtras();
    state.navigation = createNavigationState(state.settings.startView);
    render();
    await applyLaunchCommand();
    await registerServiceWorker();
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="fatal-error"><h2>ProjectLog konnte nicht starten</h2><p>${escapeHtml(error.message)}</p><p>Prüfe HTTPS und erlaube lokalen Speicher.</p></section>`;
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncStatusBarStyle);
window.addEventListener('beforeunload', () => {
  for (const value of state.attachmentUrls.values()) URL.revokeObjectURL?.(value);
});
bootstrap();
