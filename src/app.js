import { buildBackupFilename } from './backup.js?v=3.1.0';
import {
  createBug,
  createIdea,
  createProject,
  TAG_VALUES,
  updateEntity,
} from './domain.js?v=3.1.0';
import { icon } from './icons.js?v=3.1.0';
import {
  bugSeverityMeta,
  bugStatusMeta,
  healthMeta,
  ideaStatusMeta,
  ideaValueMeta,
  projectPriorityMeta,
  projectStatusMeta,
  tagMeta,
} from './presentation.js?v=3.1.0';
import { parseLaunchCommand } from './router.js?v=3.1.0';
import { ProjectLogRepository } from './storage.js?v=3.1.0';
import { calculateProjectHealth } from './analytics.js?v=3.1.0';
import {
  escapeHtml,
  formatDateTime,
  formatRelative,
  optionList,
  plural,
} from './view-helpers.js?v=3.1.0';

export const APP_VERSION = '3.1.0';

const repository = new ProjectLogRepository();
const EXTRA_STORAGE_KEY = 'projectlog.extras.v3';

const state = {
  tab: 'projects',
  projectId: null,
  projectView: 'overview',
  search: '',
  menuOpen: false,
  projectFilter: 'all',
  projects: [],
  bugs: [],
  ideas: [],
  events: [],
  monthlySummaries: [],
  settings: { startView: 'projects', includeArchived: false },
  inbox: [],
  references: [],
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

const navMeta = {
  projects: { label: 'Projekte', icon: 'folder' },
  inbox: { label: 'Eingang', icon: 'tray' },
  library: { label: 'Bibliothek', icon: 'document' },
  archive: { label: 'Archiv', icon: 'archive' },
  settings: { label: 'Einstellungen', icon: 'gear' },
};

for (const button of nav.querySelectorAll('[data-nav]')) {
  const meta = navMeta[button.dataset.nav];
  const slot = button.querySelector('.tab-icon');
  if (slot && meta) slot.innerHTML = icon(meta.icon);
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

function loadExtras() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXTRA_STORAGE_KEY) ?? '{}');
    return {
      inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
      references: Array.isArray(parsed.references) ? parsed.references : [],
    };
  } catch {
    return { inbox: [], references: [] };
  }
}

function saveExtras() {
  localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify({ inbox: state.inbox, references: state.references }));
}

function nextExtraId(prefix) {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${raw.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

function currentProject() {
  return state.projects.find((project) => project.id === state.projectId) ?? null;
}

function projectBugs(projectId) {
  return state.bugs.filter((bug) => bug.projectId === projectId);
}

function projectIdeas(projectId) {
  return state.ideas.filter((idea) => idea.projectId === projectId);
}

function projectReferences(projectId) {
  return state.references.filter((reference) => reference.projectIds.includes(projectId));
}

function lastProjectActivity(project) {
  return [
    project.updatedAt,
    ...projectBugs(project.id).map((item) => item.updatedAt),
    ...projectIdeas(project.id).map((item) => item.updatedAt),
    ...projectReferences(project.id).map((item) => item.updatedAt),
  ].sort().at(-1) ?? project.updatedAt;
}


function safeHost(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function currentTopLevelTab() {
  return state.projectId ? 'projects' : ['projects', 'inbox'].includes(state.tab) ? state.tab : 'projects';
}

function setNavigationState() {
  const activeTab = currentTopLevelTab();
  for (const button of nav.querySelectorAll('[data-nav]')) {
    const active = button.dataset.nav === activeTab;
    button.classList.toggle('is-active', active);
    const iconName = button.dataset.nav === 'projects'
      ? (active ? 'folder-filled' : 'folder')
      : (active ? 'tray-filled' : 'tray');
    const slot = button.querySelector('.tab-icon');
    if (slot) slot.innerHTML = icon(iconName);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function menuMarkup() {
  if (!state.menuOpen) return '';
  return `
    <div class="header-menu" role="menu" aria-label="Mehr Optionen">
      <button type="button" role="menuitem" data-action="open-library">${icon('document')}<span>Bibliothek</span></button>
      <button type="button" role="menuitem" data-action="open-archive">${icon('archive')}<span>Archiv</span></button>
      <button type="button" role="menuitem" data-action="share-backup">${icon('export')}<span>Backup exportieren</span></button>
      <button type="button" role="menuitem" data-action="import-backup">${icon('import')}<span>Backup importieren</span></button>
      <button type="button" role="menuitem" data-action="open-settings">${icon('gear')}<span>Einstellungen</span></button>
    </div>`;
}

function headerButton(action, iconName, label, extraClass = '') {
  return `<button class="toolbar-button ${extraClass}" type="button" data-action="${escapeHtml(action)}" aria-label="${escapeHtml(label)}">${icon(iconName)}</button>`;
}

function renderHeader() {
  const project = currentProject();
  if (project) {
    const title = state.projectView === 'overview'
      ? project.name
      : state.projectView === 'bugs'
        ? 'Bugs'
        : state.projectView === 'ideas'
          ? 'Ideen'
          : state.projectView === 'references'
            ? 'Referenzen'
            : 'Verlauf';
    const kicker = state.projectView === 'overview' ? project.id : project.name;
    const backAction = state.projectView === 'overview' ? 'back-projects' : 'back-project-overview';
    const backLabel = state.projectView === 'overview' ? 'Zurück zu Projekte' : 'Zurück zur Projektübersicht';
    header.innerHTML = `
      <div class="header-row project-header-row">
        ${headerButton(backAction, 'back', backLabel)}
        <div class="header-title-group">
          <p class="header-kicker">${escapeHtml(kicker)}</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="toolbar-actions">
          ${state.projectView === 'overview' ? headerButton('toggle-favorite', project.favorite ? 'pin-filled' : 'pin', 'Favorit umschalten', project.favorite ? 'is-selected' : '') : '<span class="toolbar-spacer"></span>'}
          ${state.projectView === 'overview' ? headerButton('edit-project', 'edit', 'Projekt bearbeiten') : headerButton('project-plus-menu', 'plus', 'Neuen Eintrag anlegen')}
        </div>
      </div>`;
    return;
  }

  const meta = navMeta[state.tab] ?? navMeta.projects;
  const backToProjects = ['library', 'archive', 'settings'].includes(state.tab);
  const leading = backToProjects
    ? headerButton('back-home', 'back', 'Zurück')
    : '';
  const primaryAction = state.tab === 'projects'
    ? headerButton('new-project', 'plus', 'Neues Projekt', 'primary')
    : state.tab === 'inbox'
      ? headerButton('new-inbox', 'plus', 'Neuer Eingangseintrag', 'primary')
      : '<span class="toolbar-spacer"></span>';
  const topLevelTitle = state.tab === 'projects' ? 'ProjectLog' : meta.label;
  header.innerHTML = `
    <div class="header-row ${state.menuOpen ? 'is-menu-open' : ''}">
      ${leading}
      <div class="header-title-group">
        <h1>${escapeHtml(topLevelTitle)}</h1>
      </div>
      <div class="toolbar-actions">${backToProjects ? '' : primaryAction}${headerButton('toggle-menu', 'ellipsis', 'Menü')}</div>
      ${menuMarkup()}
    </div>`;
}

function renderEmpty({ iconName, title, copy, action = '', actionLabel = '' }) {
  return `
    <section class="empty-state">
      <div class="empty-symbol">${icon(iconName)}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(copy)}</p>
      ${action ? `<button class="primary-action" type="button" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>` : ''}
    </section>`;
}

function badge(label, className = '', iconName = '') {
  return `<span class="badge ${escapeHtml(className)}">${iconName ? icon(iconName, 'badge-icon') : ''}<span>${escapeHtml(label)}</span></span>`;
}

function renderTags(tags = []) {
  if (!tags.length) return '';
  const visible = tags.slice(0, 2);
  const hidden = tags.length - visible.length;
  return `<span class="tag-row">${visible.map((tag) => `<span class="tag-chip">${escapeHtml(tagMeta[tag]?.label ?? tag)}</span>`).join('')}${hidden > 0 ? `<span class="tag-chip is-muted">+${hidden}</span>` : ''}</span>`;
}

function healthBadge(project) {
  const health = calculateProjectHealth(project, projectBugs(project.id), projectIdeas(project.id));
  const meta = healthMeta[health.level];
  return `${badge(meta.label, `health-badge ${meta.className}`, meta.icon)}<span class="health-reason">${escapeHtml(health.reason)}</span>`;
}

function importantProjectMeta(project) {
  const bugs = projectBugs(project.id).filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  const critical = bugs.filter((bug) => bug.severity === 'critical').length;
  const major = bugs.filter((bug) => bug.severity === 'major').length;
  if (critical) return { text: `${critical} kritischer ${critical === 1 ? 'Bug' : 'Bugs'} · ${formatRelative(lastProjectActivity(project))}`, tone: 'critical' };
  if (major) return { text: `${major} wesentliche ${major === 1 ? 'Bug' : 'Bugs'} · ${formatRelative(lastProjectActivity(project))}`, tone: 'major' };
  if (project.status === 'planned') return { text: `${projectStatusMeta[project.status].label} · ${projectPriorityMeta[project.priority].label}`, tone: 'planned' };
  return { text: `${projectStatusMeta[project.status].label} · zuletzt ${formatRelative(lastProjectActivity(project))}`, tone: 'neutral' };
}

function projectRow(project) {
  const priority = project.priority;
  const meta = importantProjectMeta(project);
  return `
    <button class="project-row priority-rail ${projectPriorityMeta[priority].className}" type="button" data-action="open-project" data-id="${escapeHtml(project.id)}">
      <span class="project-row-main">
        <span class="project-row-title-line">
          <strong>${escapeHtml(project.name)}</strong>
          ${project.favorite ? `<span class="favorite-mark" aria-label="Favorit">${icon('pin-filled')}</span>` : ''}
        </span>
        <span class="project-row-meta ${escapeHtml(meta.tone)}">${escapeHtml(meta.text)}</span>
      </span>
      <span class="chevron">${icon('chevron')}</span>
    </button>`;
}

function sectionBlock(title, items, emptyCopy) {
  if (!items.length) return '';
  return `
    <section class="list-section">
      <div class="section-heading-row"><h2>${escapeHtml(title)}</h2></div>
      <div class="project-row-list">${items.map(projectRow).join('')}</div>
    </section>`;
}

function searchField(id, placeholder, value) {
  return `
    <label class="search-field" for="${escapeHtml(id)}">
      ${icon('search')}
      <input id="${escapeHtml(id)}" type="search" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}">
    </label>`;
}

function matchesProjectSearch(project, query) {
  if (!query) return true;
  const related = [
    ...projectBugs(project.id).flatMap((bug) => [bug.id, bug.title, bug.description, ...bug.tags]),
    ...projectIdeas(project.id).flatMap((idea) => [idea.id, idea.title, idea.description, ...idea.tags]),
    ...projectReferences(project.id).flatMap((reference) => [reference.id, reference.title, reference.description ?? '', reference.url ?? '', ...(reference.tags ?? [])]),
  ];
  return [project.id, project.name, project.description, ...related].join(' ').toLocaleLowerCase('de-DE').includes(query);
}

function renderProjects() {
  if (!state.projects.length) {
    return renderEmpty({
      iconName: 'folder',
      title: 'ProjectLog ist bereit',
      copy: 'Lege dein erstes Projekt an. Danach bündelt die Ansicht Favoriten, aktive Projekte und relevante Problemstellen automatisch.',
      action: 'new-project',
      actionLabel: 'Projekt anlegen',
    });
  }

  const query = state.search.trim().toLocaleLowerCase('de-DE');
  const projects = [...state.projects]
    .filter((project) => (state.settings.includeArchived || project.status !== 'archived'))
    .filter((project) => matchesProjectSearch(project, query))
    .sort((a, b) => lastProjectActivity(b).localeCompare(lastProjectActivity(a)));

  const favorites = projects.filter((project) => project.favorite && project.status !== 'archived');
  const attention = projects.filter((project) => !project.favorite && importantProjectMeta(project).tone !== 'neutral' && project.status !== 'archived' && project.status !== 'planned');
  const active = projects.filter((project) => !project.favorite && !attention.includes(project) && ['active', 'paused', 'completed'].includes(project.status));
  const planned = projects.filter((project) => project.status === 'planned');

  const sections = [
    sectionBlock('Favoriten', favorites),
    sectionBlock('Benötigt Aufmerksamkeit', attention),
    sectionBlock('Aktiv', active),
    sectionBlock('Geplant', planned),
  ].filter(Boolean).join('');

  return `
    ${searchField('project-search', 'Projekte durchsuchen', state.search)}
    ${sections || '<p class="section-empty">Keine passenden Projekte gefunden.</p>'}`;
}

function inboxItemRow(item) {
  const typeLabel = item.type === 'link' ? 'Link' : item.type === 'file' ? 'Datei' : item.type === 'image' ? 'Bild' : 'Notiz';
  const detail = item.type === 'link' && item.url ? safeHost(item.url) : (item.description || '').slice(0, 76);
  return `
    <article class="inbox-row">
      <div class="inbox-row-icon ${escapeHtml(item.type)}">${icon(item.type === 'link' ? 'tag' : item.type === 'file' ? 'document' : item.type === 'image' ? 'square-grid' : 'document')}</div>
      <div class="inbox-row-main">
        <strong>${escapeHtml(item.title)}</strong>
        ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
        <span class="inbox-meta">${escapeHtml(typeLabel)} · ${escapeHtml(formatDateTime(item.createdAt))}</span>
      </div>
    </article>`;
}

function renderInbox() {
  const query = state.search.trim().toLocaleLowerCase('de-DE');
  const items = [...state.inbox]
    .filter((item) => !query || [item.title, item.description ?? '', item.url ?? ''].join(' ').toLocaleLowerCase('de-DE').includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (!items.length) {
    return `
      ${searchField('inbox-search', 'Eingang durchsuchen', state.search)}
      ${renderEmpty({
        iconName: 'archive',
        title: 'Der Eingang ist leer',
        copy: 'Hier landen rohe Notizen, Links und Referenzen, bevor sie einem Projekt zugeordnet werden.',
        action: 'new-inbox',
        actionLabel: 'Schnelle Notiz anlegen',
      })}`;
  }

  return `
    ${searchField('inbox-search', 'Eingang durchsuchen', state.search)}
    <section class="list-section">
      <div class="project-row-list inbox-list">${items.map(inboxItemRow).join('')}</div>
    </section>`;
}

function projectContentRow(label, count, action) {
  return `<button class="content-row" type="button" data-action="${escapeHtml(action)}"><span>${escapeHtml(label)}</span><span class="content-row-end"><strong>${escapeHtml(String(count))}</strong>${icon('chevron')}</span></button>`;
}

function projectAlert(project) {
  const criticalBugs = projectBugs(project.id).filter((bug) => !['resolved', 'rejected'].includes(bug.status) && bug.severity === 'critical');
  if (!criticalBugs.length) return '';
  return `<article class="alert-panel critical">${icon('warning')}<div><strong>Kritischer Bug benötigt Aufmerksamkeit.</strong><p>${escapeHtml(criticalBugs[0].title)}</p></div></article>`;
}

function renderRecentProjectEntries(projectId) {
  const entries = [...projectBugs(projectId), ...projectIdeas(projectId)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  if (!entries.length) return '<p class="section-empty">Noch keine Bugs oder Ideen.</p>';
  return `<div class="entry-list compact-entries">${entries.map((entry) => {
    const isBug = entry.id.startsWith('BUG-');
    return `
      <button class="entry-card" type="button" data-action="${isBug ? 'edit-bug' : 'edit-idea'}" data-id="${escapeHtml(entry.id)}">
        <span class="entry-icon ${isBug ? 'bug-icon' : 'idea-icon'}">${icon(isBug ? 'bug' : 'bulb')}</span>
        <span class="entry-body"><strong>${escapeHtml(entry.title)}</strong><span class="entry-meta">${escapeHtml(entry.id)} · ${escapeHtml(formatRelative(entry.updatedAt))}</span></span>
        <span class="chevron">${icon('chevron')}</span>
      </button>`;
  }).join('')}</div>`;
}

function renderProjectOverview(project) {
  const bugs = projectBugs(project.id);
  const ideas = projectIdeas(project.id);
  const references = projectReferences(project.id);
  const health = calculateProjectHealth(project, bugs, ideas);
  const healthInfo = healthMeta[health.level];
  return `
    ${projectAlert(project)}
    <section class="project-summary-panel priority-rail ${projectPriorityMeta[project.priority].className}">
      <div class="project-summary-top">
        <div class="project-summary-badges">
          ${badge(projectStatusMeta[project.status].label, 'project-status-badge', projectStatusMeta[project.status].icon)}
          ${badge(projectPriorityMeta[project.priority].label, 'project-priority-badge')}
        </div>
        <span class="project-favorite-label">${project.favorite ? `${icon('pin-filled')} Favorit` : ''}</span>
      </div>
      <div class="health-panel ${escapeHtml(healthInfo.className)}">${healthBadge(project)}</div>
    </section>

    <section class="content-section project-description-section">
      <div class="section-heading-row"><h2>Beschreibung</h2></div>
      <p class="project-description-copy">${project.description ? escapeHtml(project.description) : 'Noch keine Projektbeschreibung.'}</p>
    </section>

    <section class="content-section">
      <div class="section-heading-row"><h2>Inhalte</h2></div>
      <div class="content-link-list">
        ${projectContentRow('Bugs', bugs.length, 'open-project-bugs')}
        ${projectContentRow('Ideen', ideas.length, 'open-project-ideas')}
        ${projectContentRow('Referenzen', references.length, 'open-project-references')}
        ${projectContentRow('Verlauf', state.events.filter((event) => event.projectId === project.id).length, 'open-project-history')}
      </div>
    </section>

    <section class="content-section">
      <div class="section-heading-row"><h2>Zuletzt geändert</h2><span>${escapeHtml(formatRelative(lastProjectActivity(project)))}</span></div>
      ${renderRecentProjectEntries(project.id)}
    </section>`;
}

function renderTagFilters() {
  return `<div class="tag-filter-row" aria-label="Tags filtern">
    <button class="filter-chip ${state.search === '' ? 'is-active' : ''}" type="button" data-action="clear-search">Alle</button>
    ${TAG_VALUES.map((tag) => `<span class="filter-chip is-static">${escapeHtml(tagMeta[tag].label)}</span>`).join('')}
  </div>`;
}

function renderBugRows(items) {
  if (!items.length) return '<p class="section-empty">Keine passenden Bugs.</p>';
  return `<div class="entry-list">${items.map((bug) => `
      <button class="entry-card" type="button" data-action="edit-bug" data-id="${escapeHtml(bug.id)}">
        <span class="entry-icon bug-icon">${icon(bugSeverityMeta[bug.severity].icon)}</span>
        <span class="entry-body">
          <strong>${escapeHtml(bug.title)}</strong>
          <span class="entry-meta">${escapeHtml(bugStatusMeta[bug.status].label)} · ${escapeHtml(bugSeverityMeta[bug.severity].label)} · ${escapeHtml(formatRelative(bug.updatedAt))}</span>
          ${renderTags(bug.tags)}
        </span>
        <span class="chevron">${icon('chevron')}</span>
      </button>`).join('')}</div>`;
}

function renderIdeaRows(items) {
  if (!items.length) return '<p class="section-empty">Keine passenden Ideen.</p>';
  return `<div class="entry-list">${items.map((idea) => `
      <button class="entry-card" type="button" data-action="edit-idea" data-id="${escapeHtml(idea.id)}">
        <span class="entry-icon idea-icon">${icon(ideaValueMeta[idea.value].icon)}</span>
        <span class="entry-body">
          <strong>${escapeHtml(idea.title)}</strong>
          <span class="entry-meta">${escapeHtml(ideaStatusMeta[idea.status].label)} · ${escapeHtml(ideaValueMeta[idea.value].label)} · ${escapeHtml(formatRelative(idea.updatedAt))}</span>
          ${renderTags(idea.tags)}
        </span>
        <span class="chevron">${icon('chevron')}</span>
      </button>`).join('')}</div>`;
}

function filterByTag(items) {
  return items;
}

function renderProjectBugs(project) {
  let items = projectBugs(project.id);
  if (state.projectFilter === 'active') items = items.filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  if (state.projectFilter === 'critical') items = items.filter((bug) => bug.severity === 'critical' && !['resolved', 'rejected'].includes(bug.status));
  if (state.projectFilter === 'resolved') items = items.filter((bug) => bug.status === 'resolved');
  items = filterByTag(items).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `
    <div class="content-toolbar">
      <div class="filter-row">
        <button class="filter-chip ${state.projectFilter === 'active' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="active">Offen</button>
        <button class="filter-chip ${state.projectFilter === 'critical' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="critical">Kritisch</button>
        <button class="filter-chip ${state.projectFilter === 'resolved' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="resolved">Behoben</button>
        <button class="filter-chip ${state.projectFilter === 'all' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="all">Alle</button>
      </div>
      <button class="circle-action" type="button" data-action="new-bug" aria-label="Neuer Bug">${icon('plus')}</button>
    </div>
    ${renderBugRows(items)}`;
}

function renderProjectIdeas(project) {
  let items = projectIdeas(project.id);
  if (state.projectFilter === 'open') items = items.filter((idea) => !['implemented', 'rejected'].includes(idea.status));
  if (state.projectFilter === 'strategic') items = items.filter((idea) => idea.value === 'strategic');
  if (state.projectFilter === 'implemented') items = items.filter((idea) => idea.status === 'implemented');
  items = filterByTag(items).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `
    <div class="content-toolbar">
      <div class="filter-row">
        <button class="filter-chip ${state.projectFilter === 'open' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="open">Offen</button>
        <button class="filter-chip ${state.projectFilter === 'strategic' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="strategic">Strategisch</button>
        <button class="filter-chip ${state.projectFilter === 'implemented' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="implemented">Umgesetzt</button>
        <button class="filter-chip ${state.projectFilter === 'all' ? 'is-active' : ''}" type="button" data-action="set-subfilter" data-filter="all">Alle</button>
      </div>
      <button class="circle-action" type="button" data-action="new-idea" aria-label="Neue Idee">${icon('plus')}</button>
    </div>
    ${renderIdeaRows(items)}`;
}

function referenceRow(reference) {
  const detail = reference.type === 'link' && reference.url ? safeHost(reference.url) : (reference.description || '');
  return `
    <article class="reference-row">
      <div class="reference-icon">${icon(reference.type === 'link' ? 'tag' : 'document')}</div>
      <div class="reference-main">
        <strong>${escapeHtml(reference.title)}</strong>
        ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
        <div class="reference-meta-row">
          <span>${escapeHtml(reference.type === 'link' ? 'Link' : 'Referenz')} · ${escapeHtml(formatRelative(reference.updatedAt))}</span>
          ${renderTags(reference.tags ?? [])}
        </div>
      </div>
    </article>`;
}

function renderProjectReferences(project) {
  const items = projectReferences(project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return items.length
    ? `<section class="list-section"><div class="project-row-list">${items.map(referenceRow).join('')}</div></section>`
    : '<p class="section-empty">Noch keine Referenzen zugeordnet.</p>';
}

function entityTitle(event) {
  if (event.entityType === 'project') return state.projects.find((item) => item.id === event.entityId)?.name ?? event.entityId;
  if (event.entityType === 'bug') return state.bugs.find((item) => item.id === event.entityId)?.title ?? event.entityId;
  if (event.entityType === 'idea') return state.ideas.find((item) => item.id === event.entityId)?.title ?? event.entityId;
  return 'ProjectLog';
}

function projectName(projectId) {
  return state.projects.find((project) => project.id === projectId)?.name ?? 'Unbekanntes Projekt';
}

function metaLabel(kind, value) {
  if (value === undefined || value === null) return '';
  const maps = {
    projectStatus: projectStatusMeta,
    projectPriority: projectPriorityMeta,
    bugStatus: bugStatusMeta,
    severity: bugSeverityMeta,
    ideaStatus: ideaStatusMeta,
    value: ideaValueMeta,
    tag: tagMeta,
  };
  return maps[kind]?.[value]?.label ?? String(value);
}

function eventDescription(event) {
  if (event.kind === 'created') return 'wurde erstellt';
  if (event.kind === 'favorite') return event.to ? 'wurde angeheftet' : 'wurde von Favoriten entfernt';
  if (event.kind === 'tag_added') return `Tag „${metaLabel('tag', event.to)}“ hinzugefügt`;
  if (event.kind === 'tag_removed') return `Tag „${metaLabel('tag', event.from)}“ entfernt`;
  if (event.kind === 'status') {
    const group = event.entityType === 'bug' ? 'bugStatus' : event.entityType === 'idea' ? 'ideaStatus' : 'projectStatus';
    return `Status: ${metaLabel(group, event.from)} → ${metaLabel(group, event.to)}`;
  }
  if (event.kind === 'severity') return `Schweregrad: ${metaLabel('severity', event.from)} → ${metaLabel('severity', event.to)}`;
  if (event.kind === 'value') return `Nutzen: ${metaLabel('value', event.from)} → ${metaLabel('value', event.to)}`;
  if (event.kind === 'priority') return `Priorität: ${metaLabel('projectPriority', event.from)} → ${metaLabel('projectPriority', event.to)}`;
  if (event.kind === 'migration') return 'wurde auf das aktuelle Datenmodell migriert';
  return 'wurde geändert';
}

function renderEventItem(event) {
  return `
    <li class="activity-item">
      <time datetime="${escapeHtml(event.timestamp)}">${escapeHtml(formatDateTime(event.timestamp))}</time>
      <div>
        <strong>${escapeHtml(entityTitle(event))}</strong>
        <p>${escapeHtml(eventDescription(event))}</p>
        <span>${escapeHtml(projectName(event.projectId))} · ${escapeHtml(event.entityId)}</span>
      </div>
    </li>`;
}

function renderProjectHistory(project) {
  const events = state.events
    .filter((event) => event.projectId === project.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return events.length
    ? `<ol class="activity-list">${events.map(renderEventItem).join('')}</ol>`
    : '<p class="section-empty">Noch keine protokollierten Änderungen.</p>';
}

function renderProject() {
  const project = currentProject();
  if (!project) {
    state.projectId = null;
    return renderProjects();
  }
  if (state.projectView === 'bugs') return renderProjectBugs(project);
  if (state.projectView === 'ideas') return renderProjectIdeas(project);
  if (state.projectView === 'references') return renderProjectReferences(project);
  if (state.projectView === 'history') return renderProjectHistory(project);
  return renderProjectOverview(project);
}

function renderLibrary() {
  const query = state.search.trim().toLocaleLowerCase('de-DE');
  const references = [...state.references]
    .filter((item) => !query || [item.title, item.description ?? '', item.url ?? '', ...(item.tags ?? [])].join(' ').toLocaleLowerCase('de-DE').includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return `
    ${searchField('library-search', 'Suche in Bibliothek', state.search)}
    <div class="tag-filter-row library-filter-row">
      <span class="filter-chip is-active">Alle</span>
      <span class="filter-chip is-static">Links</span>
      <span class="filter-chip is-static">Bilder</span>
      <span class="filter-chip is-static">Dateien</span>
      <span class="filter-chip is-static">Notizen</span>
    </div>
    ${references.length
      ? `<section class="list-section"><div class="project-row-list reference-list">${references.map(referenceRow).join('')}</div></section>`
      : '<p class="section-empty">Noch keine verarbeiteten Referenzen.</p>'}`;
}

function renderArchive() {
  const archived = state.projects.filter((project) => project.status === 'archived');
  return archived.length
    ? `<section class="list-section"><div class="project-row-list">${archived.map(projectRow).join('')}</div></section>`
    : '<p class="section-empty">Noch kein archiviertes Projekt.</p>';
}

function appBaseUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function settingsRow({ iconName, title, subtitle, action = '', accessory = '', className = '' }) {
  const content = `
      <span class="settings-icon">${icon(iconName)}</span>
      <span class="settings-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></span>
      ${action ? `<span class="settings-accessory">${accessory || icon('chevron')}</span>` : ''}`;
  return action
    ? `<button type="button" class="settings-row settings-action-row ${className}" data-action="${action}" aria-label="${escapeHtml(title)}">${content}</button>`
    : `<div class="settings-row ${className}">${content}</div>`;
}

function renderSettings() {
  const base = appBaseUrl();
  const sampleProject = state.projects[0]?.id ?? 'PRJ-DEINE-ID';
  return `
    <section class="settings-section">
      <h2>Datensicherung</h2>
      <div class="settings-group">
        ${settingsRow({ iconName: 'export', title: 'Backup in Dateien sichern', subtitle: 'Exportiert Projekte, Einträge, Verlauf sowie Eingang und Referenzen.', action: 'share-backup', accessory: 'Teilen' })}
        ${settingsRow({ iconName: 'import', title: 'JSON-Backup importieren', subtitle: 'Prüft das Backup und stellt den lokalen Bestand wieder her.', action: 'import-backup' })}
      </div>
    </section>

    <section class="settings-section">
      <h2>URLs</h2>
      <div class="settings-group">
        ${settingsRow({ iconName: 'copy', title: 'Neues Projekt', subtitle: `${base}?action=new-project`, action: 'copy-url-project' })}
        ${settingsRow({ iconName: 'copy', title: 'Neuer Bug', subtitle: `${base}?action=new-bug&project=${sampleProject}`, action: 'copy-url-bug' })}
        ${settingsRow({ iconName: 'copy', title: 'Neue Idee', subtitle: `${base}?action=new-idea&project=${sampleProject}`, action: 'copy-url-idea' })}
      </div>
    </section>

    <section class="settings-section">
      <h2>Lokale Daten</h2>
      <div class="settings-group">
        ${settingsRow({ iconName: 'sparkles', title: 'Demodaten hinzufügen', subtitle: 'Legt ein kleines Testportfolio mit Eingang und Referenzen an.', action: 'load-demo' })}
        ${settingsRow({ iconName: 'trash', title: 'Alle lokalen Daten löschen', subtitle: 'Entfernt Projekte, Einträge, Verlauf, Eingang und Referenzen.', action: 'clear-all', className: 'danger-row' })}
      </div>
    </section>

    <footer class="version-footer">
      <strong>ProjectLog ${APP_VERSION}</strong>
      <span>lokal · Apple-orientiertes Projektprotokoll</span>
    </footer>`;
}

function render() {
  renderHeader();
  setNavigationState();
  main.innerHTML = state.projectId
    ? renderProject()
    : state.tab === 'projects'
      ? renderProjects()
      : state.tab === 'inbox'
        ? renderInbox()
        : state.tab === 'library'
          ? renderLibrary()
          : state.tab === 'archive'
            ? renderArchive()
            : renderSettings();
}

async function refresh({ renderView = true } = {}) {
  const [projects, bugs, ideas, events, monthlySummaries, settings] = await Promise.all([
    repository.list('projects'),
    repository.list('bugs'),
    repository.list('ideas'),
    repository.listEvents(),
    repository.listMonthlySummaries(),
    repository.getSettings(),
  ]);
  const extras = loadExtras();
  Object.assign(state, {
    projects,
    bugs,
    ideas,
    events,
    monthlySummaries,
    settings: { ...settings, startView: 'projects' },
    inbox: extras.inbox,
    references: extras.references,
  });
  if (renderView) render();
}

function tagCheckboxes(selected = []) {
  return `<fieldset class="field-group tag-fieldset"><legend>Tags</legend><div class="tag-options">${TAG_VALUES.map((tag) => {
    const meta = tagMeta[tag];
    return `<label class="tag-option"><input type="checkbox" name="tags" value="${tag}" ${selected.includes(tag) ? 'checked' : ''}><span>${icon(meta.icon)}${escapeHtml(meta.label)}</span></label>`;
  }).join('')}</div></fieldset>`;
}

function projectFields(entity) {
  return `
    <div class="field-group"><label for="field-name">Name</label><input class="field-control" id="field-name" name="name" maxlength="80" required value="${escapeHtml(entity?.name ?? '')}" autocomplete="off"></div>
    <div class="field-group"><label for="field-description">Beschreibung</label><textarea class="field-control" id="field-description" name="description" maxlength="2000" placeholder="Ziel, Umfang oder Kontext">${escapeHtml(entity?.description ?? '')}</textarea></div>
    <div class="field-grid">
      <div class="field-group"><label for="field-status">Status</label><select class="field-control" id="field-status" name="status">${optionList(projectStatusMeta, entity?.status ?? 'active')}</select></div>
      <div class="field-group"><label for="field-priority">Priorität</label><select class="field-control" id="field-priority" name="priority">${optionList(projectPriorityMeta, entity?.priority ?? 'normal')}</select></div>
    </div>
    <label class="editor-toggle"><input type="checkbox" name="favorite" ${entity?.favorite ? 'checked' : ''}><span>${icon('pin')}Als Favorit markieren</span></label>`;
}

function entityHistory(entity, type) {
  if (!entity) return '';
  const events = state.events.filter((event) => event.entityId === entity.id && event.entityType === type).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return `
    <details class="entry-history">
      <summary>${icon('history')}Verlauf <span>${events.length}</span></summary>
      ${events.length ? `<ol>${events.map((event) => `<li><time>${escapeHtml(formatDateTime(event.timestamp))}</time><span>${escapeHtml(eventDescription(event))}</span></li>`).join('')}</ol>` : '<p>Noch keine relevanten Änderungen.</p>'}
    </details>`;
}

function bugFields(entity, prefill) {
  return `
    <div class="field-group"><label for="field-title">Titel</label><input class="field-control" id="field-title" name="title" maxlength="120" required value="${escapeHtml(entity?.title ?? prefill?.title ?? '')}" autocomplete="off"></div>
    <div class="field-group"><label for="field-description">Beschreibung</label><textarea class="field-control" id="field-description" name="description" maxlength="4000" placeholder="Beobachtung, Auswirkung und mögliche Reproduktion">${escapeHtml(entity?.description ?? '')}</textarea></div>
    <div class="field-grid">
      <div class="field-group"><label for="field-status">Status</label><select class="field-control" id="field-status" name="status">${optionList(bugStatusMeta, entity?.status ?? 'new')}</select></div>
      <div class="field-group"><label for="field-severity">Schweregrad</label><select class="field-control" id="field-severity" name="severity">${optionList(bugSeverityMeta, entity?.severity ?? 'major')}</select></div>
    </div>
    ${tagCheckboxes(entity?.tags ?? [])}
    ${entityHistory(entity, 'bug')}`;
}

function ideaFields(entity, prefill) {
  return `
    <div class="field-group"><label for="field-title">Titel</label><input class="field-control" id="field-title" name="title" maxlength="120" required value="${escapeHtml(entity?.title ?? prefill?.title ?? '')}" autocomplete="off"></div>
    <div class="field-group"><label for="field-description">Beschreibung</label><textarea class="field-control" id="field-description" name="description" maxlength="4000" placeholder="Nutzen, Kontext und mögliche Ausgestaltung">${escapeHtml(entity?.description ?? '')}</textarea></div>
    <div class="field-grid">
      <div class="field-group"><label for="field-status">Status</label><select class="field-control" id="field-status" name="status">${optionList(ideaStatusMeta, entity?.status ?? 'new')}</select></div>
      <div class="field-group"><label for="field-value">Nutzen</label><select class="field-control" id="field-value" name="value">${optionList(ideaValueMeta, entity?.value ?? 'relevant')}</select></div>
    </div>
    ${tagCheckboxes(entity?.tags ?? [])}
    ${entityHistory(entity, 'idea')}`;
}

function openEditor(type, entity = null, prefill = {}) {
  const projectId = entity?.projectId ?? prefill.projectId ?? state.projectId;
  if (['bug', 'idea'].includes(type) && !projectId) {
    showToast('Öffne zuerst ein Projekt.');
    return;
  }
  state.editor = { type, entity, projectId };
  editorTitle.textContent = entity
    ? type === 'project' ? 'Projekt bearbeiten' : type === 'bug' ? 'Bug bearbeiten' : 'Idee bearbeiten'
    : type === 'project' ? 'Neues Projekt' : type === 'bug' ? 'Neuer Bug' : 'Neue Idee';
  editorFields.innerHTML = type === 'project'
    ? projectFields(entity)
    : type === 'bug'
      ? bugFields(entity, prefill)
      : ideaFields(entity, prefill);
  editorError.hidden = true;
  editorError.textContent = '';
  editorDeleteSlot.innerHTML = entity
    ? `<button class="danger-button" type="button" data-dialog-action="delete">${type === 'project' ? 'Projekt und alle Einträge löschen' : 'Eintrag löschen'}</button>`
    : '';
  document.documentElement.classList.add('modal-open');
  editorDialog.showModal();
  window.setTimeout(() => editorFields.querySelector('input:not([type="checkbox"]), textarea, select')?.focus(), 40);
}

async function saveEditor(formData) {
  const { type, entity, projectId } = state.editor;
  const now = new Date().toISOString();
  let saved;
  if (type === 'project') {
    const values = {
      name: formData.get('name'),
      description: formData.get('description'),
      status: formData.get('status'),
      priority: formData.get('priority'),
      favorite: formData.get('favorite') === 'on',
    };
    saved = entity ? updateEntity('project', entity, values, now) : createProject(values, { now });
    await repository.saveEntity('project', saved);
    state.projectId = saved.id;
    state.projectView = 'overview';
  } else if (type === 'bug') {
    const values = {
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status'),
      severity: formData.get('severity'),
      tags: formData.getAll('tags'),
    };
    saved = entity
      ? updateEntity('bug', entity, values, now)
      : createBug({ ...values, projectId }, { sequence: await repository.nextSequence('bug'), now });
    await repository.saveEntity('bug', saved);
    state.projectId = projectId;
    state.projectView = 'bugs';
  } else {
    const values = {
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status'),
      value: formData.get('value'),
      tags: formData.getAll('tags'),
    };
    saved = entity
      ? updateEntity('idea', entity, values, now)
      : createIdea({ ...values, projectId }, { sequence: await repository.nextSequence('idea'), now });
    await repository.saveEntity('idea', saved);
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
  const wording = type === 'project' ? 'dieses Projekt einschließlich aller Einträge und Verläufe' : 'diesen Eintrag';
  if (!window.confirm(`Möchtest du ${wording} wirklich löschen?`)) return;
  if (type === 'project') {
    await repository.removeProjectCascade(entity.id);
    state.projectId = null;
    state.tab = 'projects';
  } else {
    await repository.deleteEntity(type, entity.id);
  }
  editorDialog.close();
  state.editor = null;
  await refresh();
  showToast('Gelöscht.');
}

async function shareBackup() {
  const backup = await repository.exportBackup();
  backup.data.extras = { inbox: state.inbox, references: state.references };
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
  const filename = buildBackupFilename(new Date()).replace('.json', '-v3.json');
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
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('Backup heruntergeladen.');
}

async function importBackup(file) {
  const parsed = JSON.parse(await file.text());
  if (!window.confirm('Der Import ersetzt den aktuellen lokalen Bestand. Fortfahren?')) return;
  await repository.importBackup(parsed);
  state.inbox = Array.isArray(parsed.data?.extras?.inbox) ? parsed.data.extras.inbox : [];
  state.references = Array.isArray(parsed.data?.extras?.references) ? parsed.data.extras.references : [];
  saveExtras();
  state.projectId = null;
  await refresh({ renderView: false });
  state.tab = 'projects';
  render();
  showToast('Backup geprüft und importiert.');
}

function seedExtraData(now, projects) {
  const references = [
    {
      id: nextExtraId('REF'),
      type: 'link',
      title: 'Apple Human Interface Guidelines',
      description: 'Designreferenz für Navigation, Listen und klare Hierarchien.',
      url: 'https://developer.apple.com/design/human-interface-guidelines/',
      tags: ['design'],
      projectIds: projects.length ? [projects[0].id] : [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const inbox = [
    {
      id: nextExtraId('INB'),
      type: 'note',
      title: 'Navigation noch weiter vereinfachen',
      description: 'Mögliche Feinschliffe für Tab-Bar und Tiefenstaffelung sammeln.',
      createdAt: now,
      updatedAt: now,
    },
  ];
  state.references = references;
  state.inbox = inbox;
  saveExtras();
}

async function loadDemo() {
  const now = new Date().toISOString();
  const projects = [
    createProject({ name: 'ProjectLog', description: 'Lokale Projektzentrale für Projekte, Bugs, Ideen und Referenzen.', status: 'active', priority: 'strategic', favorite: true }, { now }),
    createProject({ name: 'PlasmaLog', description: 'Bestands- und Planungsapp für Plasma.', status: 'active', priority: 'high', favorite: false }, { now }),
    createProject({ name: 'CortexOS', description: 'Persönliches System- und Automationsprojekt.', status: 'planned', priority: 'strategic', favorite: false }, { now }),
  ];
  for (const project of projects) await repository.saveEntity('project', project);
  await repository.saveEntity('bug', createBug({ projectId: projects[0].id, title: 'Kritischer Bug benötigt Aufmerksamkeit', description: 'Feinschliff im Detailscreen prüfen.', status: 'review', severity: 'critical', tags: ['design', 'quality'] }, { sequence: await repository.nextSequence('bug'), now }));
  await repository.saveEntity('bug', createBug({ projectId: projects[1].id, title: 'Heatmap prüfen', description: 'Visuelle Dichte im Dashboard reduzieren.', status: 'active', severity: 'major', tags: ['feature'] }, { sequence: await repository.nextSequence('bug'), now }));
  await repository.saveEntity('idea', createIdea({ projectId: projects[0].id, title: 'Referenzbibliothek', description: 'Projektübergreifende Sicht auf verarbeitete Materialien.', status: 'planned', value: 'strategic', tags: ['design', 'feature'] }, { sequence: await repository.nextSequence('idea'), now }));
  await repository.saveEntity('idea', createIdea({ projectId: projects[2].id, title: 'Dateistruktur überdenken', description: 'CortexOS-Ziele sauberer gliedern.', status: 'reviewed', value: 'relevant', tags: ['technology'] }, { sequence: await repository.nextSequence('idea'), now }));
  seedExtraData(now, projects);
  state.projectId = null;
  state.tab = 'projects';
  await refresh();
  main.scrollTop = 0;
  showToast('Demodaten hinzugefügt.');
}

async function clearAll() {
  if (!window.confirm('Alle lokalen Projekte, Einträge, Verläufe, Referenzen und Eingangseinträge unwiderruflich löschen?')) return;
  await repository.clearAll();
  state.inbox = [];
  state.references = [];
  saveExtras();
  state.projectId = null;
  await refresh({ renderView: false });
  state.tab = 'projects';
  render();
  showToast('Alle lokalen Daten gelöscht.');
}

async function toggleFavorite() {
  const project = currentProject();
  if (!project) return;
  const updated = updateEntity('project', project, { favorite: !project.favorite }, new Date().toISOString());
  await repository.saveEntity('project', updated);
  await refresh();
  showToast(updated.favorite ? 'Als Favorit markiert.' : 'Favorit entfernt.');
}

function createInboxNote() {
  const title = window.prompt('Titel für den Eingangseintrag:');
  if (!title) return;
  const description = window.prompt('Kurze Notiz (optional):') ?? '';
  const now = new Date().toISOString();
  state.inbox.unshift({
    id: nextExtraId('INB'),
    type: 'note',
    title: title.trim(),
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
  });
  saveExtras();
  render();
  showToast('Eingangseintrag angelegt.');
}

function copyText(value) {
  return navigator.clipboard.writeText(value);
}

async function handleAction(action, target) {
  state.menuOpen = false;
  switch (action) {
    case 'new-project': openEditor('project'); break;
    case 'new-inbox': createInboxNote(); break;
    case 'open-project': state.projectId = target.dataset.id; state.projectView = 'overview'; state.projectFilter = 'all'; render(); main.scrollTop = 0; break;
    case 'back-projects': state.projectId = null; state.tab = 'projects'; render(); main.scrollTop = 0; break;
    case 'back-project-overview': state.projectView = 'overview'; state.projectFilter = 'all'; render(); main.scrollTop = 0; break;
    case 'back-home': state.tab = 'projects'; render(); main.scrollTop = 0; break;
    case 'toggle-favorite': await toggleFavorite(); break;
    case 'edit-project': openEditor('project', currentProject()); break;
    case 'project-plus-menu':
      if (window.confirm('Bug anlegen? Abbrechen für Idee.')) openEditor('bug');
      else openEditor('idea');
      break;
    case 'new-bug': openEditor('bug'); break;
    case 'new-idea': openEditor('idea'); break;
    case 'edit-bug': openEditor('bug', state.bugs.find((item) => item.id === target.dataset.id)); break;
    case 'edit-idea': openEditor('idea', state.ideas.find((item) => item.id === target.dataset.id)); break;
    case 'open-project-bugs': state.projectView = 'bugs'; state.projectFilter = 'active'; render(); main.scrollTop = 0; break;
    case 'open-project-ideas': state.projectView = 'ideas'; state.projectFilter = 'open'; render(); main.scrollTop = 0; break;
    case 'open-project-references': state.projectView = 'references'; render(); main.scrollTop = 0; break;
    case 'open-project-history': state.projectView = 'history'; render(); main.scrollTop = 0; break;
    case 'set-subfilter': state.projectFilter = target.dataset.filter; render(); break;
    case 'toggle-menu': state.menuOpen = !state.menuOpen; render(); break;
    case 'open-library': state.tab = 'library'; render(); main.scrollTop = 0; break;
    case 'open-archive': state.tab = 'archive'; render(); main.scrollTop = 0; break;
    case 'open-settings': state.tab = 'settings'; render(); main.scrollTop = 0; break;
    case 'share-backup': await shareBackup(); break;
    case 'import-backup': importInput.click(); break;
    case 'load-demo': await loadDemo(); break;
    case 'clear-all': await clearAll(); break;
    case 'clear-search': state.search = ''; render(); break;
    case 'copy-url-project': await copyText(`${appBaseUrl()}?action=new-project`); showToast('URL kopiert.'); break;
    case 'copy-url-bug': await copyText(`${appBaseUrl()}?action=new-bug&project=${encodeURIComponent(state.projects[0]?.id ?? 'PRJ-DEINE-ID')}`); showToast('URL kopiert.'); break;
    case 'copy-url-idea': await copyText(`${appBaseUrl()}?action=new-idea&project=${encodeURIComponent(state.projects[0]?.id ?? 'PRJ-DEINE-ID')}`); showToast('URL kopiert.'); break;
  }
}

function delegatedAction(event) {
  const target = event.target.closest('[data-action]');
  if (target) handleAction(target.dataset.action, target).catch((error) => showToast(error.message, 4800));
}

header.addEventListener('click', delegatedAction);
main.addEventListener('click', delegatedAction);
main.addEventListener('input', (event) => {
  if (!['project-search', 'inbox-search', 'library-search'].includes(event.target.id)) return;
  state.search = event.target.value;
  const selection = [event.target.selectionStart, event.target.selectionEnd];
  render();
  const input = main.querySelector(`#${event.target.id}`);
  input?.focus();
  input?.setSelectionRange(...selection);
});
nav.addEventListener('click', (event) => {
  const target = event.target.closest('[data-nav]');
  if (!target) return;
  state.tab = target.dataset.nav;
  state.projectId = null;
  state.projectView = 'overview';
  state.search = '';
  render();
  main.scrollTop = 0;
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
  if (action === 'delete') deleteEditorEntity().catch((error) => showToast(error.message, 4800));
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
  if (['open-project', 'new-bug', 'new-idea'].includes(command.type)) {
    const project = state.projects.find((item) => item.id === command.projectId);
    if (!project) showToast('Das angegebene Projekt wurde nicht gefunden.', 4800);
    else if (command.type === 'open-project') {
      state.projectId = project.id;
      state.projectView = 'overview';
      render();
    } else {
      state.projectId = project.id;
      render();
      openEditor(command.type === 'new-bug' ? 'bug' : 'idea', null, { projectId: project.id, title: command.title });
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
    state.tab = 'projects';
    render();
    await applyLaunchCommand();
    await registerServiceWorker();
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="fatal-error"><h2>ProjectLog konnte nicht starten</h2><p>${escapeHtml(error.message)}</p><p>Prüfe HTTPS beziehungsweise localhost und erlaube lokalen Speicher.</p></section>`;
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncStatusBarStyle);
bootstrap();
