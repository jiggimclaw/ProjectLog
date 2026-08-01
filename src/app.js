import {
  createBug,
  createIdea,
  createProject,
  deriveActivity,
  touchEntity,
} from './domain.js';
import { buildBackupFilename } from './backup.js';
import { icon } from './icons.js';
import { parseLaunchCommand } from './router.js';
import { ProjectLogRepository } from './storage.js';

const APP_VERSION = '1.2.2';
const repository = new ProjectLogRepository();

const state = {
  tab: 'projects',
  projectId: null,
  projectView: 'overview',
  search: '',
  bugFilter: 'active',
  ideaFilter: 'all',
  projects: [],
  bugs: [],
  ideas: [],
  editor: null,
};

const header = document.querySelector('#app-header');
const main = document.querySelector('#app-main');
const nav = document.querySelector('.tab-bar');
const editorDialog = document.querySelector('#editor-dialog');
const editorForm = document.querySelector('#editor-form');
const editorTitle = document.querySelector('#editor-title');
const editorFields = document.querySelector('#editor-fields');
const editorError = document.querySelector('#editor-error');
const editorDeleteSlot = document.querySelector('#editor-delete-slot');
const importInput = document.querySelector('#import-file');
const toast = document.querySelector('#toast');
const statusBarMeta = document.querySelector('#status-bar-style');

const navIconNames = { projects: 'folder', activity: 'clock', settings: 'gear' };
for (const button of nav.querySelectorAll('[data-nav]')) {
  const slot = button.querySelector('.tab-icon');
  if (slot) slot.innerHTML = icon(navIconNames[button.dataset.nav]);
}

const tabTitles = {
  projects: 'Projekte',
  activity: 'Aktivität',
  settings: 'Einstellungen',
};

const bugStatusLabels = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  resolved: 'Behoben',
  rejected: 'Verworfen',
};

const ideaStatusLabels = {
  new: 'Neu',
  planned: 'Geplant',
  implemented: 'Umgesetzt',
  rejected: 'Verworfen',
};

const priorityLabels = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};

const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const shortDateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit', minute: '2-digit',
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  try { return dateTimeFormatter.format(new Date(value)); } catch { return 'Unbekannt'; }
}

function formatRelative(value) {
  const date = new Date(value);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `heute, ${timeFormatter.format(date)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `gestern, ${timeFormatter.format(date)}`;
  if (diff >= 0 && diff < 7 * 86400000) {
    return new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return shortDateFormatter.format(date);
}

function syncStatusBarStyle() {
  if (!statusBarMeta) return;
  statusBarMeta.content = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'black-translucent'
    : 'default';
}

function showToast(message, timeout = 2800) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), timeout);
}

function currentProject() {
  return state.projects.find((project) => project.id === state.projectId);
}

function projectBugs(projectId) {
  return state.bugs.filter((bug) => bug.projectId === projectId);
}

function projectIdeas(projectId) {
  return state.ideas.filter((idea) => idea.projectId === projectId);
}

function lastProjectActivity(project) {
  return [
    project.updatedAt,
    ...projectBugs(project.id).map((item) => item.updatedAt),
    ...projectIdeas(project.id).map((item) => item.updatedAt),
  ].sort().at(-1);
}

function setNavigationState() {
  for (const button of nav.querySelectorAll('[data-nav]')) {
    const active = button.dataset.nav === state.tab && !state.projectId;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function renderHeader() {
  const project = currentProject();
  if (project) {
    header.innerHTML = `
      <div class="header-row">
        <button class="toolbar-button" type="button" data-action="back-projects" aria-label="Zurück zu Projekte">
          ${icon('back')}
        </button>
        <div class="header-title-group">
          <p class="header-kicker">${escapeHtml(project.id)}</p>
          <h1>${escapeHtml(project.name)}</h1>
        </div>
        <button class="toolbar-button" type="button" data-action="edit-project" aria-label="Projekt bearbeiten">
          ${icon('edit')}
        </button>
      </div>`;
    return;
  }

  const action = state.tab === 'projects'
    ? `<button class="toolbar-button primary" type="button" data-action="new-project" aria-label="Neues Projekt">${icon('plus')}</button>`
    : '<span class="toolbar-button" aria-hidden="true"></span>';
  header.innerHTML = `
    <div class="header-row">
      <div class="header-title-group">
        <p class="header-kicker">ProjectLog</p>
        <h1>${tabTitles[state.tab]}</h1>
      </div>
      ${action}
    </div>`;
}

function renderEmpty({ iconName, title, copy, action, actionLabel }) {
  return `
    <section class="empty-state">
      <div class="empty-symbol">${icon(iconName)}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(copy)}</p>
      ${action ? `<button class="primary-action" type="button" data-action="${action}">${escapeHtml(actionLabel)}</button>` : ''}
    </section>`;
}

function renderProjects() {
  const query = state.search.trim().toLocaleLowerCase('de-DE');
  const projects = [...state.projects]
    .filter((project) => !query || `${project.name} ${project.description}`.toLocaleLowerCase('de-DE').includes(query))
    .sort((a, b) => lastProjectActivity(b).localeCompare(lastProjectActivity(a)));

  const rows = projects.map((project) => {
    const bugs = projectBugs(project.id);
    const activeBugs = bugs.filter((bug) => !['resolved', 'rejected'].includes(bug.status)).length;
    const ideas = projectIdeas(project.id).length;
    return `
      <li>
        <button class="list-button list-row" type="button" data-action="open-project" data-id="${escapeHtml(project.id)}">
          <span class="list-icon">${icon('folder')}</span>
          <span class="list-content">
            <span class="list-title">${escapeHtml(project.name)}</span>
            <span class="list-subtitle project-summary">
              <span>${activeBugs} offene Bugs</span>
              <span class="meta-dot">${ideas} Ideen</span>
            </span>
            <span class="list-subtitle">Geändert ${escapeHtml(formatRelative(lastProjectActivity(project)))}</span>
          </span>
          <span class="chevron">${icon('chevron')}</span>
        </button>
      </li>`;
  }).join('');

  return `
    <div class="search-field">
      ${icon('search')}
      <label class="visually-hidden" for="project-search">Projekte durchsuchen</label>
      <input id="project-search" type="search" placeholder="Projekte durchsuchen" value="${escapeHtml(state.search)}" autocomplete="off">
    </div>
    ${projects.length
      ? `<div class="section-meta-row"><p class="section-heading">Alle Projekte</p><p class="section-count">${projects.length}</p></div><ul class="grouped-list project-list" aria-label="Projektliste">${rows}</ul>`
      : renderEmpty({
          iconName: 'folder',
          title: query ? 'Nichts gefunden' : 'Noch keine Projekte',
          copy: query ? 'Passe den Suchbegriff an.' : 'Lege dein erstes Projekt an und erfasse Bugs sowie Änderungsideen.',
          action: query ? '' : 'new-project',
          actionLabel: 'Projekt anlegen',
        })}`;
}

function statusPill(status, kind) {
  const labels = kind === 'bug' ? bugStatusLabels : ideaStatusLabels;
  return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(labels[status] ?? status)}</span>`;
}

function priorityPill(priority) {
  return `<span class="priority-pill priority-${escapeHtml(priority)}">${escapeHtml(priorityLabels[priority] ?? priority)}</span>`;
}

function renderBugRows(items) {
  return items.map((bug) => `
    <li>
      <button class="list-button list-row" type="button" data-action="edit-bug" data-id="${escapeHtml(bug.id)}">
        <span class="list-icon bug">${icon('bug')}</span>
        <span class="list-content">
          <span class="list-title">${escapeHtml(bug.title)}</span>
          <span class="badge-row">${statusPill(bug.status, 'bug')}${priorityPill(bug.priority)}</span>
          <span class="list-subtitle">${escapeHtml(bug.id)} · ${escapeHtml(formatRelative(bug.updatedAt))}</span>
        </span>
        <span class="chevron">${icon('chevron')}</span>
      </button>
    </li>`).join('');
}

function renderIdeaRows(items) {
  return items.map((idea) => `
    <li>
      <button class="list-button list-row" type="button" data-action="edit-idea" data-id="${escapeHtml(idea.id)}">
        <span class="list-icon idea">${icon('bulb')}</span>
        <span class="list-content">
          <span class="list-title">${escapeHtml(idea.title)}</span>
          <span class="badge-row">${statusPill(idea.status, 'idea')}</span>
          <span class="list-subtitle">${escapeHtml(idea.id)} · ${escapeHtml(formatRelative(idea.updatedAt))}</span>
        </span>
        <span class="chevron">${icon('chevron')}</span>
      </button>
    </li>`).join('');
}

function renderProjectOverview(project) {
  const bugs = projectBugs(project.id);
  const ideas = projectIdeas(project.id);
  const openBugs = bugs.filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  const plannedIdeas = ideas.filter((idea) => ['new', 'planned'].includes(idea.status));
  const recent = [
    ...bugs.map((entity) => ({ ...entity, kind: 'bug' })),
    ...ideas.map((entity) => ({ ...entity, kind: 'idea' })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return `
    <div class="metrics">
      <div class="metric"><span class="metric-value">${openBugs.length}</span><span class="metric-label">Offene Bugs</span></div>
      <div class="metric"><span class="metric-value">${plannedIdeas.length}</span><span class="metric-label">Aktive Ideen</span></div>
    </div>
    ${project.description ? `<p class="project-description">${escapeHtml(project.description)}</p>` : ''}
    <div class="quick-actions">
      <button class="quick-action" type="button" data-action="new-bug">${icon('bug')} Bug erfassen</button>
      <button class="quick-action" type="button" data-action="new-idea">${icon('bulb')} Idee erfassen</button>
    </div>
    <p class="section-label">Zuletzt geändert</p>
    ${recent.length
      ? `<ul class="grouped-list">${recent.map((item) => item.kind === 'bug' ? renderBugRows([item]) : renderIdeaRows([item])).join('')}</ul>`
      : renderEmpty({ iconName: 'clock', title: 'Noch keine Einträge', copy: 'Bugs und Ideen erscheinen hier chronologisch.' })}
    <p class="settings-note">Erstellt ${escapeHtml(formatDateTime(project.createdAt))} · zuletzt geändert ${escapeHtml(formatDateTime(project.updatedAt))}</p>`;
}

function renderProjectBugs(project) {
  const all = projectBugs(project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filtered = all.filter((bug) => {
    if (state.bugFilter === 'all') return true;
    if (state.bugFilter === 'active') return !['resolved', 'rejected'].includes(bug.status);
    return bug.status === state.bugFilter;
  });
  const chips = [
    ['active', 'Aktiv'], ['all', 'Alle'], ['open', 'Offen'], ['in_progress', 'In Arbeit'], ['resolved', 'Behoben'],
  ].map(([value, label]) => `<button class="filter-chip ${state.bugFilter === value ? 'is-active' : ''}" type="button" data-action="bug-filter" data-value="${value}">${label}</button>`).join('');
  return `
    <div class="filter-row" aria-label="Bugfilter">${chips}</div>
    ${filtered.length
      ? `<ul class="grouped-list">${renderBugRows(filtered)}</ul>`
      : renderEmpty({ iconName: 'bug', title: 'Keine passenden Bugs', copy: 'Erfasse einen Bug oder ändere den Filter.', action: 'new-bug', actionLabel: 'Bug erfassen' })}`;
}

function renderProjectIdeas(project) {
  const all = projectIdeas(project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filtered = all.filter((idea) => state.ideaFilter === 'all' || idea.status === state.ideaFilter);
  const chips = [
    ['all', 'Alle'], ['new', 'Neu'], ['planned', 'Geplant'], ['implemented', 'Umgesetzt'], ['rejected', 'Verworfen'],
  ].map(([value, label]) => `<button class="filter-chip ${state.ideaFilter === value ? 'is-active' : ''}" type="button" data-action="idea-filter" data-value="${value}">${label}</button>`).join('');
  return `
    <div class="filter-row" aria-label="Ideenfilter">${chips}</div>
    ${filtered.length
      ? `<ul class="grouped-list">${renderIdeaRows(filtered)}</ul>`
      : renderEmpty({ iconName: 'bulb', title: 'Keine passenden Ideen', copy: 'Erfasse eine Änderungsidee oder ändere den Filter.', action: 'new-idea', actionLabel: 'Idee erfassen' })}`;
}

function renderProject() {
  const project = currentProject();
  if (!project) {
    state.projectId = null;
    return renderProjects();
  }
  const tabs = [
    ['overview', 'Übersicht'], ['bugs', 'Bugs'], ['ideas', 'Ideen'],
  ].map(([value, label]) => `<button type="button" data-action="project-view" data-view="${value}" class="${state.projectView === value ? 'is-active' : ''}">${label}</button>`).join('');
  const body = state.projectView === 'bugs'
    ? renderProjectBugs(project)
    : state.projectView === 'ideas'
      ? renderProjectIdeas(project)
      : renderProjectOverview(project);
  return `<div class="segmented-control" aria-label="Projektbereich">${tabs}</div>${body}`;
}

function groupActivity(items) {
  const groups = new Map();
  for (const item of items) {
    const key = new Date(item.timestamp).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()];
}

function renderActivity() {
  const activity = deriveActivity({ projects: state.projects, bugs: state.bugs, ideas: state.ideas });
  if (!activity.length) return renderEmpty({ iconName: 'clock', title: 'Noch keine Aktivität', copy: 'Änderungen erscheinen hier automatisch mit Zeitstempel.' });
  return groupActivity(activity).map((group) => {
    const date = new Date(group[0].timestamp);
    const heading = date.toDateString() === new Date().toDateString() ? 'Heute' : shortDateFormatter.format(date);
    return `
      <section>
        <h2 class="activity-date">${heading}</h2>
        <ol class="grouped-list activity-list">
          ${group.map((item) => `
            <li class="activity-item">
              <time class="activity-time" datetime="${escapeHtml(item.timestamp)}">${timeFormatter.format(new Date(item.timestamp))}</time>
              <div class="activity-content">
                <p class="activity-sentence"><strong>${escapeHtml(item.title)}</strong> <span class="activity-action">wurde ${item.action === 'created' ? 'erstellt' : 'geändert'}</span></p>
                <p class="activity-meta">${escapeHtml(item.projectName)} · ${escapeHtml(item.entityId)}</p>
              </div>
            </li>`).join('')}
        </ol>
      </section>`;
  }).join('');
}

function appBaseUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function renderSettings() {
  const base = appBaseUrl();
  const sampleProject = state.projects[0]?.id ?? 'PRJ-DEINE-ID';
  const commands = [
    ['Neues Projekt', 'Öffnet ein leeres Projektformular', `${base}?action=new-project`],
    ['Neuer Bug', `Öffnet das Bugformular für ${sampleProject}`, `${base}?action=new-bug&project=${encodeURIComponent(sampleProject)}`],
    ['Neue Idee', `Öffnet das Ideenformular für ${sampleProject}`, `${base}?action=new-idea&project=${encodeURIComponent(sampleProject)}`],
  ];
  return `
    <p class="section-label">Datensicherung</p>
    <ul class="grouped-list">
      <li>
        <button class="settings-action" type="button" data-action="share-backup">
          <span class="list-icon">${icon('export')}</span>
          <span class="settings-copy"><span class="settings-title">Backup in Dateien sichern</span><span class="settings-subtitle">JSON über Teilen in iCloud Drive oder „Dateien“ ablegen</span></span>
          <span class="settings-accessory">Teilen</span>
        </button>
      </li>
      <li>
        <button class="settings-action" type="button" data-action="import-backup">
          <span class="list-icon">${icon('import')}</span>
          <span class="settings-copy"><span class="settings-title">JSON-Backup importieren</span><span class="settings-subtitle">Ersetzt den lokalen Bestand erst nach vollständiger Prüfung</span></span>
          <span class="settings-accessory">${icon('chevron')}</span>
        </button>
      </li>
    </ul>
    <p class="settings-note">Backups erhalten einen Zeitstempel bis auf die Sekunde. Das eigentliche Speichern in einen Ordner muss iOS aus Sicherheitsgründen über das Teilen-Menü bestätigen.</p>

    <p class="section-label">Kurzbefehle und URLs</p>
    <ul class="grouped-list">
      ${commands.map(([label, description, url]) => `
        <li>
          <button class="settings-action" type="button" data-action="copy-url" data-url="${escapeHtml(url)}">
            <span class="list-icon">${icon('copy')}</span>
            <span class="settings-copy"><span class="settings-title">${label}</span><span class="settings-subtitle">${escapeHtml(description)}</span></span>
            <span class="settings-accessory">Kopieren</span>
          </button>
        </li>`).join('')}
    </ul>
    <p class="settings-note">iOS-PWAs können kein eigenes <code>projectlog://</code>-Schema registrieren. Die HTTPS-Links öffnen ausschließlich Ansichten oder vorausgefüllte Formulare.</p>

    <p class="section-label">Installation</p>
    <div class="grouped-list">
      <div class="list-row settings-static"><span class="list-icon">${icon('info')}</span><div class="list-content"><p class="list-title">Auf dem iPhone installieren</p><p class="list-subtitle">In Safari öffnen → Teilen → Zum Home-Bildschirm. Nach dem ersten Laden ist die App-Shell offline verfügbar.</p></div></div>
    </div>

    <p class="section-label">Testdaten</p>
    <ul class="grouped-list">
      <li><button class="settings-action" type="button" data-action="load-demo"><span class="list-icon idea">${icon('bulb')}</span><span class="settings-copy"><span class="settings-title">Demodaten hinzufügen</span><span class="settings-subtitle">Legt ein Beispielprojekt mit Bug und Idee an</span></span><span class="settings-accessory">${icon('chevron')}</span></button></li>
      <li><button class="settings-action" type="button" data-action="clear-all"><span class="list-icon bug">${icon('trash')}</span><span class="settings-copy"><span class="settings-title is-danger">Alle lokalen Daten löschen</span><span class="settings-subtitle">Entfernt Projekte, Bugs und Ideen auf diesem Gerät</span></span></button></li>
    </ul>
    <p class="settings-note">ProjectLog speichert ausschließlich lokal in diesem Browserprofil. Ein aktuelles Backup bleibt daher die Rückfallebene.</p><p class="settings-note app-version">ProjectLog ${APP_VERSION}</p>`;
}
function render() {
  renderHeader();
  setNavigationState();
  main.innerHTML = state.projectId
    ? renderProject()
    : state.tab === 'activity'
      ? renderActivity()
      : state.tab === 'settings'
        ? renderSettings()
        : renderProjects();
}

async function refresh() {
  const [projects, bugs, ideas] = await Promise.all([
    repository.list('projects'), repository.list('bugs'), repository.list('ideas'),
  ]);
  state.projects = projects;
  state.bugs = bugs;
  state.ideas = ideas;
  render();
}

function projectFields(entity) {
  return `
    <div class="field-group"><label for="field-name">Name</label><input class="field-control" id="field-name" name="name" maxlength="80" required value="${escapeHtml(entity?.name ?? '')}" autocomplete="off"></div>
    <div class="field-group"><label for="field-description">Beschreibung</label><textarea class="field-control" id="field-description" name="description" maxlength="2000" placeholder="Optional">${escapeHtml(entity?.description ?? '')}</textarea></div>`;
}

function bugFields(entity, prefill) {
  return `
    <div class="field-group"><label for="field-title">Titel</label><input class="field-control" id="field-title" name="title" maxlength="120" required value="${escapeHtml(entity?.title ?? prefill?.title ?? '')}" autocomplete="off"></div>
    <div class="field-group"><label for="field-description">Beschreibung</label><textarea class="field-control" id="field-description" name="description" maxlength="4000" placeholder="Schritte, Erwartung und tatsächliches Verhalten">${escapeHtml(entity?.description ?? '')}</textarea></div>
    <div class="field-grid">
      <div class="field-group"><label for="field-status">Status</label><select class="field-control" id="field-status" name="status">${Object.entries(bugStatusLabels).map(([value,label]) => `<option value="${value}" ${(entity?.status ?? 'open') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field-group"><label for="field-priority">Priorität</label><select class="field-control" id="field-priority" name="priority">${Object.entries(priorityLabels).map(([value,label]) => `<option value="${value}" ${(entity?.priority ?? 'medium') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    </div>`;
}

function ideaFields(entity, prefill) {
  return `
    <div class="field-group"><label for="field-title">Titel</label><input class="field-control" id="field-title" name="title" maxlength="120" required value="${escapeHtml(entity?.title ?? prefill?.title ?? '')}" autocomplete="off"></div>
    <div class="field-group"><label for="field-description">Beschreibung</label><textarea class="field-control" id="field-description" name="description" maxlength="4000" placeholder="Nutzen, Umfang und mögliche Umsetzung">${escapeHtml(entity?.description ?? '')}</textarea></div>
    <div class="field-group"><label for="field-status">Status</label><select class="field-control" id="field-status" name="status">${Object.entries(ideaStatusLabels).map(([value,label]) => `<option value="${value}" ${(entity?.status ?? 'new') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
}

function openEditor(type, entity = null, prefill = {}) {
  if ((type === 'bug' || type === 'idea') && !prefill.projectId && !entity?.projectId && !state.projectId) {
    showToast('Öffne zuerst ein Projekt.');
    return;
  }
  state.editor = {
    type,
    entity,
    projectId: entity?.projectId ?? prefill.projectId ?? state.projectId,
  };
  const titles = {
    project: entity ? 'Projekt bearbeiten' : 'Neues Projekt',
    bug: entity ? 'Bug bearbeiten' : 'Neuer Bug',
    idea: entity ? 'Idee bearbeiten' : 'Neue Idee',
  };
  editorTitle.textContent = titles[type];
  editorFields.innerHTML = type === 'project'
    ? projectFields(entity)
    : type === 'bug'
      ? bugFields(entity, prefill)
      : ideaFields(entity, prefill);
  editorError.hidden = true;
  editorError.textContent = '';
  editorDeleteSlot.innerHTML = entity
    ? `<button class="danger-button" type="button" data-dialog-action="delete">${type === 'project' ? 'Projekt und Einträge löschen' : 'Eintrag löschen'}</button>`
    : '';
  document.documentElement.classList.add('modal-open');
  editorDialog.showModal();
  window.setTimeout(() => editorFields.querySelector('input, textarea, select')?.focus(), 30);
}

function validateUpdatedProject(entity, values, now) {
  const normalized = createProject(values, { id: entity.id, now: entity.createdAt });
  return touchEntity(normalized, {}, now);
}

function validateUpdatedBug(entity, values, now) {
  const sequence = Number(entity.id.split('-').at(-1));
  const normalized = createBug({ ...values, projectId: entity.projectId }, { sequence, now: entity.createdAt });
  return touchEntity(normalized, {}, now);
}

function validateUpdatedIdea(entity, values, now) {
  const sequence = Number(entity.id.split('-').at(-1));
  const normalized = createIdea({ ...values, projectId: entity.projectId }, { sequence, now: entity.createdAt });
  return touchEntity(normalized, {}, now);
}

async function saveEditor(formData) {
  const { type, entity, projectId } = state.editor;
  const now = new Date().toISOString();
  let saved;
  if (type === 'project') {
    const values = { name: formData.get('name'), description: formData.get('description') };
    saved = entity ? validateUpdatedProject(entity, values, now) : createProject(values, { now });
    await repository.put('projects', saved);
    state.projectId = saved.id;
    state.projectView = 'overview';
  } else if (type === 'bug') {
    const values = {
      title: formData.get('title'), description: formData.get('description'),
      status: formData.get('status'), priority: formData.get('priority'),
    };
    if (entity) saved = validateUpdatedBug(entity, values, now);
    else saved = createBug({ ...values, projectId }, { sequence: await repository.nextSequence('bug'), now });
    await repository.put('bugs', saved);
    state.projectId = projectId;
    state.projectView = 'bugs';
  } else {
    const values = {
      title: formData.get('title'), description: formData.get('description'), status: formData.get('status'),
    };
    if (entity) saved = validateUpdatedIdea(entity, values, now);
    else saved = createIdea({ ...values, projectId }, { sequence: await repository.nextSequence('idea'), now });
    await repository.put('ideas', saved);
    state.projectId = projectId;
    state.projectView = 'ideas';
  }
  editorDialog.close();
  state.editor = null;
  await refresh();
  showToast('Gesichert.');
}

async function deleteEditorEntity() {
  const { type, entity } = state.editor ?? {};
  if (!entity) return;
  const label = type === 'project' ? 'dieses Projekt samt aller Einträge' : 'diesen Eintrag';
  if (!window.confirm(`Möchtest du ${label} wirklich löschen?`)) return;
  if (type === 'project') {
    await repository.removeProjectCascade(entity.id);
    state.projectId = null;
    state.tab = 'projects';
  } else {
    await repository.remove(type === 'bug' ? 'bugs' : 'ideas', entity.id);
  }
  editorDialog.close();
  state.editor = null;
  await refresh();
  showToast('Gelöscht.');
}

async function shareBackup() {
  const backup = await repository.exportBackup();
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
  const filename = buildBackupFilename(new Date());
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'ProjectLog Backup' });
      showToast('Backup an das Teilen-Menü übergeben.');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Backup heruntergeladen.');
}

async function importBackup(file) {
  const parsed = JSON.parse(await file.text());
  if (!window.confirm('Der Import ersetzt alle aktuellen Daten. Fortfahren?')) return;
  await repository.importBackup(parsed);
  state.projectId = null;
  state.tab = 'projects';
  await refresh();
  showToast('Backup importiert.');
}

async function loadDemo() {
  const project = createProject({
    name: 'ProjectLog Test',
    description: 'Lokales Testprojekt für Bugs, Ideen und URL-Aktionen.',
  }, { now: new Date().toISOString() });
  await repository.put('projects', project);
  const bug = createBug({
    projectId: project.id,
    title: 'Homescreen-Start prüfen',
    description: 'Nach der Installation muss die App im Standalone-Modus öffnen.',
    priority: 'high',
  }, { sequence: await repository.nextSequence('bug'), now: new Date().toISOString() });
  await repository.put('bugs', bug);
  const idea = createIdea({
    projectId: project.id,
    title: 'Kurzbefehle anbinden',
    description: 'URL-Aktionen für neue Bugs und Ideen aus einem Kurzbefehl öffnen.',
    status: 'planned',
  }, { sequence: await repository.nextSequence('idea'), now: new Date().toISOString() });
  await repository.put('ideas', idea);
  state.projectId = project.id;
  state.projectView = 'overview';
  await refresh();
  showToast('Demodaten hinzugefügt.');
}

async function clearAll() {
  if (!window.confirm('Alle Projekte, Bugs und Ideen unwiderruflich löschen?')) return;
  await repository.clearAll();
  state.projectId = null;
  state.tab = 'projects';
  await refresh();
  showToast('Alle lokalen Daten gelöscht.');
}

async function handleAction(action, target) {
  switch (action) {
    case 'new-project': openEditor('project'); break;
    case 'open-project': state.projectId = target.dataset.id; state.projectView = 'overview'; render(); break;
    case 'back-projects': state.projectId = null; state.tab = 'projects'; render(); break;
    case 'project-view': state.projectView = target.dataset.view; render(); break;
    case 'edit-project': openEditor('project', currentProject()); break;
    case 'new-bug': openEditor('bug'); break;
    case 'new-idea': openEditor('idea'); break;
    case 'edit-bug': openEditor('bug', state.bugs.find((item) => item.id === target.dataset.id)); break;
    case 'edit-idea': openEditor('idea', state.ideas.find((item) => item.id === target.dataset.id)); break;
    case 'bug-filter': state.bugFilter = target.dataset.value; render(); break;
    case 'idea-filter': state.ideaFilter = target.dataset.value; render(); break;
    case 'share-backup': await shareBackup(); break;
    case 'import-backup': importInput.click(); break;
    case 'copy-url':
      try { await navigator.clipboard.writeText(target.dataset.url); showToast('URL kopiert.'); }
      catch { window.prompt('URL kopieren:', target.dataset.url); }
      break;
    case 'load-demo': await loadDemo(); break;
    case 'clear-all': await clearAll(); break;
  }
}

function delegatedAction(event) {
  const target = event.target.closest('[data-action]');
  if (target) handleAction(target.dataset.action, target).catch((error) => showToast(error.message, 4500));
}

header.addEventListener('click', delegatedAction);
main.addEventListener('click', delegatedAction);
main.addEventListener('input', (event) => {
  if (event.target.id === 'project-search') {
    state.search = event.target.value;
    const selection = [event.target.selectionStart, event.target.selectionEnd];
    main.innerHTML = renderProjects();
    const input = main.querySelector('#project-search');
    input.focus();
    input.setSelectionRange(...selection);
  }
});
nav.addEventListener('click', (event) => {
  const target = event.target.closest('[data-nav]');
  if (!target) return;
  state.tab = target.dataset.nav;
  state.projectId = null;
  render();
  main.focus({ preventScroll: true });
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
  const action = event.target.closest('[data-dialog-action]')?.dataset.dialogAction;
  if (action === 'cancel') editorDialog.close();
  if (action === 'delete') deleteEditorEntity().catch((error) => showToast(error.message, 4500));
});
editorDialog.addEventListener('close', () => {
  document.documentElement.classList.remove('modal-open');
  editorError.hidden = true;
  if (!editorDialog.open) state.editor = null;
});
importInput.addEventListener('change', () => {
  const [file] = importInput.files;
  if (file) importBackup(file).catch((error) => showToast(`Import fehlgeschlagen: ${error.message}`, 5200));
  importInput.value = '';
});

async function applyLaunchCommand() {
  const command = parseLaunchCommand(window.location.href);
  if (command.type === 'invalid') showToast(command.message, 4800);
  if (command.type === 'new-project') openEditor('project');
  if (command.type === 'open-project' || command.type === 'new-bug' || command.type === 'new-idea') {
    const project = state.projects.find((item) => item.id === command.projectId);
    if (!project) {
      showToast('Das angegebene Projekt wurde nicht gefunden.', 4800);
    } else if (command.type === 'open-project') {
      state.projectId = project.id;
      state.projectView = command.view;
      render();
    } else {
      state.projectId = project.id;
      render();
      openEditor(command.type === 'new-bug' ? 'bug' : 'idea', null, {
        projectId: project.id,
        title: command.title,
      });
    }
  }
  if (window.location.search) history.replaceState(null, '', window.location.pathname);
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js?v=1.2.2', { updateViaCache: 'none' }); }
    catch (error) { console.warn('Service Worker konnte nicht registriert werden:', error); }
  }
}

async function bootstrap() {
  try {
    syncStatusBarStyle();
    await repository.init();
    await refresh();
    await applyLaunchCommand();
    await registerServiceWorker();
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="fatal-error"><h2>ProjectLog konnte nicht starten</h2><p>${escapeHtml(error.message)}</p><p>Prüfe, ob die App über HTTPS oder localhost geöffnet wurde und lokaler Speicher erlaubt ist.</p></section>`;
  }
}

const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
colorSchemeQuery.addEventListener?.('change', syncStatusBarStyle);

bootstrap();
