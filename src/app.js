import { buildDashboardModel, buildThirtyDaySeries, calculateProjectHealth } from './analytics.js?v=2.1.0';
import { buildBackupFilename } from './backup.js?v=2.1.0';
import { renderTrendChart } from './chart.js?v=2.1.0';
import {
  createBug,
  createIdea,
  createProject,
  TAG_VALUES,
  updateEntity,
} from './domain.js?v=2.1.0';
import { icon } from './icons.js?v=2.1.0';
import {
  bugSeverityMeta,
  bugStatusMeta,
  healthMeta,
  ideaStatusMeta,
  ideaValueMeta,
  projectPriorityMeta,
  projectStatusMeta,
  tagMeta,
} from './presentation.js?v=2.1.0';
import { parseLaunchCommand } from './router.js?v=2.1.0';
import { ProjectLogRepository } from './storage.js?v=2.1.0';
import {
  escapeHtml,
  formatDateTime,
  formatRelative,
  optionList,
  plural,
} from './view-helpers.js?v=2.1.0';

export const APP_VERSION = '2.1.0';

const repository = new ProjectLogRepository();

const state = {
  tab: 'dashboard',
  projectId: null,
  projectView: 'overview',
  search: '',
  projectFilter: 'all',
  bugFilter: 'active',
  ideaFilter: 'all',
  tagFilter: 'all',
  projects: [],
  bugs: [],
  ideas: [],
  events: [],
  monthlySummaries: [],
  settings: { startView: 'dashboard', includeArchived: false },
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
  dashboard: { label: 'Dashboard', icon: 'dashboard' },
  projects: { label: 'Projekte', icon: 'folder' },
  activity: { label: 'Aktivität', icon: 'clock' },
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

function currentProject() {
  return state.projects.find((project) => project.id === state.projectId) ?? null;
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
  ].sort().at(-1) ?? project.updatedAt;
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

function setNavigationState() {
  const activeTab = state.projectId ? 'projects' : state.tab;
  for (const button of nav.querySelectorAll('[data-nav]')) {
    const active = button.dataset.nav === activeTab;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function renderHeader() {
  const project = currentProject();
  if (project) {
    header.innerHTML = `
      <div class="header-row project-header-row">
        <button class="toolbar-button" type="button" data-action="back-projects" aria-label="Zurück zu Projekte">${icon('back')}</button>
        <div class="header-title-group">
          <p class="header-kicker">${escapeHtml(project.id)}</p>
          <h1>${escapeHtml(project.name)}</h1>
        </div>
        <div class="toolbar-actions">
          <button class="toolbar-button ${project.favorite ? 'is-selected' : ''}" type="button" data-action="toggle-favorite" aria-label="${project.favorite ? 'Favorit lösen' : 'Als Favorit markieren'}">${icon(project.favorite ? 'pin-filled' : 'pin')}</button>
          <button class="toolbar-button" type="button" data-action="edit-project" aria-label="Projekt bearbeiten">${icon('edit')}</button>
        </div>
      </div>`;
    return;
  }

  const addAction = ['dashboard', 'projects'].includes(state.tab)
    ? `<button class="toolbar-button primary" type="button" data-action="new-project" aria-label="Neues Projekt">${icon('plus')}</button>`
    : '<span class="toolbar-spacer" aria-hidden="true"></span>';
  header.innerHTML = `
    <div class="header-row">
      <div class="header-title-group">
        <p class="header-kicker">ProjectLog</p>
        <h1>${navMeta[state.tab].label}</h1>
      </div>
      ${addAction}
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
  return `<span class="tag-row">${tags.map((tag) => {
    const meta = tagMeta[tag];
    return `<span class="tag-chip">${icon(meta.icon)}${escapeHtml(meta.label)}</span>`;
  }).join('')}</span>`;
}

function healthBadge(project) {
  const health = calculateProjectHealth(project, projectBugs(project.id), projectIdeas(project.id));
  const meta = healthMeta[health.level];
  return `${badge(meta.label, `health-badge ${meta.className}`, meta.icon)}<span class="health-reason">${escapeHtml(health.reason)}</span>`;
}

function projectCard(project, { compact = false } = {}) {
  const bugs = projectBugs(project.id);
  const ideas = projectIdeas(project.id);
  const openBugs = bugs.filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  const critical = openBugs.filter((bug) => bug.severity === 'critical').length;
  const health = calculateProjectHealth(project, bugs, ideas);
  const priority = projectPriorityMeta[project.priority];
  const status = projectStatusMeta[project.status];
  return `
    <button class="project-card priority-rail ${priority.className} ${compact ? 'is-compact' : ''}" type="button" data-action="open-project" data-id="${escapeHtml(project.id)}">
      <span class="project-card-icon">${icon('folder')}</span>
      <span class="project-card-body">
        <span class="project-card-title-row">
          <strong>${escapeHtml(project.name)}</strong>
          ${project.favorite ? `<span class="favorite-mark" aria-label="Favorit">${icon('pin-filled')}</span>` : ''}
        </span>
        <span class="project-card-meta">${escapeHtml(status.label)} · ${escapeHtml(priority.label)} · ${escapeHtml(formatRelative(lastProjectActivity(project)))}</span>
        <span class="project-card-stats">
          <span>${plural(openBugs.length, 'offener Bug', 'offene Bugs')}</span>
          <span>${plural(ideas.length, 'Idee', 'Ideen')}</span>
          ${critical ? `<span class="critical-count">${critical} kritisch</span>` : ''}
        </span>
        <span class="project-card-health ${healthMeta[health.level].className}">${icon(healthMeta[health.level].icon)}${escapeHtml(healthMeta[health.level].label)} · ${escapeHtml(health.reason)}</span>
      </span>
      <span class="chevron">${icon('chevron')}</span>
    </button>`;
}

function renderMetric(value, label, iconName, className = '') {
  return `
    <article class="metric-card ${className}">
      <span class="metric-icon">${icon(iconName)}</span>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>`;
}

function renderHeroMetric(value, label, tone = '') {
  return `<article class="hero-metric ${escapeHtml(tone)}"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></article>`;
}

function renderSpotlight(project) {
  if (!project) return '';
  const bugs = projectBugs(project.id);
  const ideas = projectIdeas(project.id);
  const openBugs = bugs.filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  const critical = openBugs.filter((bug) => bug.severity === 'critical').length;
  const priority = projectPriorityMeta[project.priority];
  const status = projectStatusMeta[project.status];
  const health = calculateProjectHealth(project, bugs, ideas);
  const healthInfo = healthMeta[health.level];
  return `
    <article class="spotlight-card priority-rail ${priority.className}">
      <p class="spotlight-kicker">Im Fokus</p>
      <div class="spotlight-title-row">
        <h3>${escapeHtml(project.name)}</h3>
        ${project.favorite ? `<span class="favorite-mark" aria-label="Favorit">${icon('pin-filled')}</span>` : ''}
      </div>
      <div class="spotlight-meta-row">
        ${badge(status.label, 'status-badge', status.icon)}
        ${badge(priority.label, 'priority-badge', 'flag')}
      </div>
      <p class="spotlight-summary">${escapeHtml(health.reason)}</p>
      <div class="spotlight-stats">
        <span>${plural(openBugs.length, 'offener Bug', 'offene Bugs')}</span>
        <span>${plural(ideas.length, 'Idee', 'Ideen')}</span>
        ${critical ? `<span class="critical-count">${critical} kritisch</span>` : ''}
      </div>
      <button class="inline-link" type="button" data-action="open-project" data-id="${escapeHtml(project.id)}">Projekt öffnen</button>
      <span class="spotlight-health ${healthInfo.className}">${icon(healthInfo.icon)}${escapeHtml(healthInfo.label)}</span>
    </article>`;
}

function renderProjectSection(title, models, emptyCopy, options = {}) {
  const { className = '', description = '' } = options;
  return `
    <section class="dashboard-section ${escapeHtml(className)}">
      <div class="section-heading-row"><div><h2>${escapeHtml(title)}</h2>${description ? `<p class="section-subtitle">${escapeHtml(description)}</p>` : ''}</div><span>${models.length}</span></div>
      ${models.length
        ? `<div class="dashboard-project-list">${models.map((model) => projectCard(model.project, { compact: true })).join('')}</div>`
        : `<p class="section-empty">${escapeHtml(emptyCopy)}</p>`}
    </section>`;
}

function renderDashboard() {
  const model = buildDashboardModel({
    projects: state.projects,
    bugs: state.bugs,
    ideas: state.ideas,
    events: state.events,
    includeArchived: state.settings.includeArchived,
  });
  const visibleIds = new Set(model.projects.map((entry) => entry.project.id));
  const chartSeries = buildThirtyDaySeries({
    bugs: state.bugs.filter((bug) => visibleIds.has(bug.projectId)),
    ideas: state.ideas.filter((idea) => visibleIds.has(idea.projectId)),
    events: state.events.filter((event) => !event.projectId || visibleIds.has(event.projectId)),
  });

  if (!state.projects.length) {
    return renderEmpty({
      iconName: 'dashboard',
      title: 'Deine Projektzentrale ist bereit',
      copy: 'Lege ein Projekt an. Dashboard, Trends und Projektgesundheit entstehen aus deinen echten Einträgen.',
      action: 'new-project',
      actionLabel: 'Erstes Projekt anlegen',
    });
  }

  const spotlight = model.favorites[0]?.project ?? model.attention[0]?.project ?? model.projects[0]?.project ?? null;

  return `
    <section class="dashboard-hero dashboard-overview">
      <div class="dashboard-overview-main">
        <p>Portfolio</p>
        <h2>${model.metrics.activeProjects} ${model.metrics.activeProjects === 1 ? 'aktives Projekt' : 'aktive Projekte'}</h2>
        <span>${model.metrics.criticalBugs ? `${model.metrics.criticalBugs} kritische Bugs benötigen Aufmerksamkeit` : 'Keine kritischen Bugs im sichtbaren Portfolio.'}</span>
        <div class="hero-metric-row" aria-label="Portfolio-Kurzüberblick">
          ${renderHeroMetric(model.metrics.openBugs, 'offene Bugs')}
          ${renderHeroMetric(model.metrics.criticalBugs, 'kritisch', model.metrics.criticalBugs ? 'is-critical' : '')}
          ${renderHeroMetric(model.metrics.implementedIdeas30d, 'Ideen · 30 T.')}
        </div>
      </div>
      <div class="dashboard-overview-side">
        ${renderSpotlight(spotlight)}
      </div>
    </section>

    <section class="dashboard-grid" aria-label="Portfolio-Kennzahlen">
      ${renderMetric(model.metrics.activeProjects, 'aktive Projekte', 'folder')}
      ${renderMetric(model.metrics.openBugs, 'offene Bugs', 'bug')}
      ${renderMetric(model.metrics.criticalBugs, 'kritische Bugs', 'severity-critical', model.metrics.criticalBugs ? 'metric-critical' : '')}
      ${renderMetric(model.metrics.implementedIdeas30d, 'umgesetzte Ideen · 30 T.', 'sparkles')}
    </section>

    <section class="dashboard-story-grid">
      <div class="dashboard-story-column">
        ${renderProjectSection('Favoriten', model.favorites, 'Noch keine Projekte angeheftet.', { description: 'Deine manuell markierten Projekte – automatisch nach letzter Aktivität sortiert.' })}
        ${renderProjectSection('Projektlage', model.attention.filter((item) => !item.project.favorite), 'Alle übrigen sichtbaren Projekte sind stabil und ohne besondere Priorität.', { description: 'Automatisch hervorgehobene Projekte mit erhöhter Relevanz, Beobachtungsbedarf oder strategischer Bedeutung.' })}
      </div>
      <div class="dashboard-story-column">
        <section class="dashboard-section chart-section dashboard-panel-section">
          ${renderTrendChart(chartSeries)}
        </section>

        <section class="dashboard-section dashboard-panel-section">
          <div class="section-heading-row"><div><h2>Letzte Aktivität</h2><p class="section-subtitle">Wichtige Änderungen der letzten Einträge – ohne endlosen Feed.</p></div><button type="button" class="link-button" data-action="open-activity">Alle anzeigen</button></div>
          ${model.recentEvents.length
            ? `<ol class="activity-list compact-activity">${model.recentEvents.slice(0, 5).map(renderEventItem).join('')}</ol>`
            : '<p class="section-empty">Relevante Änderungen erscheinen hier automatisch.</p>'}
        </section>
      </div>
    </section>`;
}

function matchesProjectSearch(project, query) {
  if (!query) return true;
  const related = [
    ...projectBugs(project.id).flatMap((bug) => [bug.id, bug.title, bug.description, ...bug.tags]),
    ...projectIdeas(project.id).flatMap((idea) => [idea.id, idea.title, idea.description, ...idea.tags]),
  ];
  return [project.id, project.name, project.description, ...related]
    .join(' ')
    .toLocaleLowerCase('de-DE')
    .includes(query);
}

function projectFilterMatches(project) {
  if (state.projectFilter === 'favorites') return project.favorite;
  if (state.projectFilter === 'active') return ['active', 'paused'].includes(project.status);
  if (state.projectFilter === 'planned') return project.status === 'planned';
  if (state.projectFilter === 'archived') return project.status === 'archived';
  return state.settings.includeArchived || project.status !== 'archived';
}

function renderFilterButton(label, value, active, action = 'project-filter') {
  return `<button class="filter-chip ${active ? 'is-active' : ''}" type="button" data-action="${action}" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function renderProjects() {
  const query = state.search.trim().toLocaleLowerCase('de-DE');
  const projects = [...state.projects]
    .filter((project) => projectFilterMatches(project) && matchesProjectSearch(project, query))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || lastProjectActivity(b).localeCompare(lastProjectActivity(a)));

  return `
    <div class="search-field">
      ${icon('search')}
      <label class="visually-hidden" for="project-search">Projekte, Bugs und Ideen durchsuchen</label>
      <input id="project-search" type="search" placeholder="Projekte, Bugs und Ideen" value="${escapeHtml(state.search)}" autocomplete="off">
    </div>
    <div class="filter-row" aria-label="Projektfilter">
      ${renderFilterButton('Alle', 'all', state.projectFilter === 'all')}
      ${renderFilterButton('Favoriten', 'favorites', state.projectFilter === 'favorites')}
      ${renderFilterButton('Aktiv', 'active', state.projectFilter === 'active')}
      ${renderFilterButton('Geplant', 'planned', state.projectFilter === 'planned')}
      ${renderFilterButton('Archiviert', 'archived', state.projectFilter === 'archived')}
    </div>
    <div class="section-heading-row list-heading"><h2>Projekte</h2><span>${projects.length}</span></div>
    ${projects.length
      ? `<div class="project-list">${projects.map((project) => projectCard(project)).join('')}</div>`
      : renderEmpty({
          iconName: query ? 'search' : 'folder',
          title: query ? 'Nichts gefunden' : 'Keine Projekte in diesem Filter',
          copy: query ? 'Passe Suche oder Filter an.' : 'Lege ein neues Projekt an oder ändere den Filter.',
          action: query ? '' : 'new-project',
          actionLabel: 'Projekt anlegen',
        })}`;
}

function severityBadge(severity) {
  const meta = bugSeverityMeta[severity];
  return badge(meta.label, `severity-badge ${meta.className}`, meta.icon);
}

function ideaValueBadge(value) {
  const meta = ideaValueMeta[value];
  return badge(meta.label, `idea-value-badge ${meta.className}`, meta.icon);
}

function statusBadge(status, type) {
  const meta = type === 'bug' ? bugStatusMeta[status] : ideaStatusMeta[status];
  return badge(meta?.label ?? status, 'status-badge');
}

function renderBugRows(items) {
  if (!items.length) return renderEmpty({ iconName: 'bug', title: 'Keine Bugs', copy: 'Für diesen Filter sind keine Bugs vorhanden.', action: 'new-bug', actionLabel: 'Bug erfassen' });
  return `<div class="entry-list">${items.map((bug) => `
    <button class="entry-card" type="button" data-action="edit-bug" data-id="${escapeHtml(bug.id)}">
      <span class="entry-icon bug-icon">${icon('bug')}</span>
      <span class="entry-body">
        <span class="entry-title-row"><strong>${escapeHtml(bug.title)}</strong><span>${escapeHtml(bug.id)}</span></span>
        <span class="badge-row">${severityBadge(bug.severity)}${statusBadge(bug.status, 'bug')}</span>
        ${renderTags(bug.tags)}
        <span class="entry-meta">Geändert ${escapeHtml(formatRelative(bug.updatedAt))}</span>
      </span>
      <span class="chevron">${icon('chevron')}</span>
    </button>`).join('')}</div>`;
}

function renderIdeaRows(items) {
  if (!items.length) return renderEmpty({ iconName: 'bulb', title: 'Keine Ideen', copy: 'Für diesen Filter sind keine Ideen vorhanden.', action: 'new-idea', actionLabel: 'Idee erfassen' });
  return `<div class="entry-list">${items.map((idea) => `
    <button class="entry-card" type="button" data-action="edit-idea" data-id="${escapeHtml(idea.id)}">
      <span class="entry-icon idea-icon ${ideaValueMeta[idea.value].className}">${icon(ideaValueMeta[idea.value].icon)}</span>
      <span class="entry-body">
        <span class="entry-title-row"><strong>${escapeHtml(idea.title)}</strong><span>${escapeHtml(idea.id)}</span></span>
        <span class="badge-row">${ideaValueBadge(idea.value)}${statusBadge(idea.status, 'idea')}</span>
        ${renderTags(idea.tags)}
        <span class="entry-meta">Geändert ${escapeHtml(formatRelative(idea.updatedAt))}</span>
      </span>
      <span class="chevron">${icon('chevron')}</span>
    </button>`).join('')}</div>`;
}

function renderProjectOverview(project) {
  const bugs = projectBugs(project.id);
  const ideas = projectIdeas(project.id);
  const openBugs = bugs.filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  const resolved = bugs.filter((bug) => bug.status === 'resolved').length;
  const implemented = ideas.filter((idea) => idea.status === 'implemented').length;
  const status = projectStatusMeta[project.status];
  const priority = projectPriorityMeta[project.priority];
  return `
    <section class="project-summary-panel priority-rail ${priority.className}">
      <div class="project-summary-top">
        <div class="project-summary-badges">
          ${badge(status.label, 'project-status-badge', status.icon)}
          ${badge(priority.label, 'project-priority-badge')}
        </div>
        <span class="project-favorite-label">${project.favorite ? `${icon('pin-filled')} Favorit` : ''}</span>
      </div>
      <div class="health-panel">${healthBadge(project)}</div>
      ${project.description ? `<p>${escapeHtml(project.description)}</p>` : '<p class="muted">Noch keine Projektbeschreibung.</p>'}
    </section>

    <section class="dashboard-grid project-metrics" aria-label="Projektkennzahlen">
      ${renderMetric(openBugs.length, 'offene Bugs', 'bug')}
      ${renderMetric(resolved, 'behoben', 'check-circle')}
      ${renderMetric(ideas.length, 'Ideen', 'bulb')}
      ${renderMetric(implemented, 'umgesetzt', 'sparkles')}
    </section>

    <div class="quick-actions">
      <button class="quick-action bug-action" type="button" data-action="new-bug">${icon('bug')}Neuer Bug</button>
      <button class="quick-action idea-action" type="button" data-action="new-idea">${icon('bulb')}Neue Idee</button>
    </div>

    <section class="content-section">
      <div class="section-heading-row"><h2>Zuletzt geändert</h2><span>${escapeHtml(formatRelative(lastProjectActivity(project)))}</span></div>
      ${renderRecentProjectEntries(project.id)}
    </section>`;
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

function filterByTag(items) {
  if (state.tagFilter === 'all') return items;
  return items.filter((item) => item.tags.includes(state.tagFilter));
}

function renderProjectBugs(project) {
  let items = projectBugs(project.id);
  if (state.bugFilter === 'active') items = items.filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  if (state.bugFilter === 'critical') items = items.filter((bug) => bug.severity === 'critical' && !['resolved', 'rejected'].includes(bug.status));
  if (state.bugFilter === 'resolved') items = items.filter((bug) => bug.status === 'resolved');
  items = filterByTag(items).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `
    <div class="content-toolbar">
      <div class="filter-row">
        ${renderFilterButton('Offen', 'active', state.bugFilter === 'active', 'bug-filter')}
        ${renderFilterButton('Kritisch', 'critical', state.bugFilter === 'critical', 'bug-filter')}
        ${renderFilterButton('Behoben', 'resolved', state.bugFilter === 'resolved', 'bug-filter')}
        ${renderFilterButton('Alle', 'all', state.bugFilter === 'all', 'bug-filter')}
      </div>
      <button class="circle-action" type="button" data-action="new-bug" aria-label="Neuer Bug">${icon('plus')}</button>
    </div>
    ${renderTagFilters()}
    ${renderBugRows(items)}`;
}

function renderProjectIdeas(project) {
  let items = projectIdeas(project.id);
  if (state.ideaFilter === 'open') items = items.filter((idea) => !['implemented', 'rejected'].includes(idea.status));
  if (state.ideaFilter === 'strategic') items = items.filter((idea) => idea.value === 'strategic');
  if (state.ideaFilter === 'implemented') items = items.filter((idea) => idea.status === 'implemented');
  items = filterByTag(items).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `
    <div class="content-toolbar">
      <div class="filter-row">
        ${renderFilterButton('Offen', 'open', state.ideaFilter === 'open', 'idea-filter')}
        ${renderFilterButton('Strategisch', 'strategic', state.ideaFilter === 'strategic', 'idea-filter')}
        ${renderFilterButton('Umgesetzt', 'implemented', state.ideaFilter === 'implemented', 'idea-filter')}
        ${renderFilterButton('Alle', 'all', state.ideaFilter === 'all', 'idea-filter')}
      </div>
      <button class="circle-action" type="button" data-action="new-idea" aria-label="Neue Idee">${icon('plus')}</button>
    </div>
    ${renderTagFilters()}
    ${renderIdeaRows(items)}`;
}

function renderTagFilters() {
  return `<div class="tag-filter-row" aria-label="Tags filtern">
    ${renderFilterButton('Alle Tags', 'all', state.tagFilter === 'all', 'tag-filter')}
    ${TAG_VALUES.map((tag) => renderFilterButton(tagMeta[tag].label, tag, state.tagFilter === tag, 'tag-filter')).join('')}
  </div>`;
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
  const summaries = state.monthlySummaries
    .filter((summary) => summary.projectId === project.id)
    .sort((a, b) => b.month.localeCompare(a.month));
  return `
    <section class="history-intro">
      ${icon('history')}
      <div><h2>Verlauf</h2><p>Nur relevante Status-, Bewertungs-, Prioritäts- und Tagänderungen. Einzelereignisse werden nach zwölf Monaten monatlich verdichtet.</p></div>
    </section>
    ${events.length ? `<ol class="activity-list">${events.map(renderEventItem).join('')}</ol>` : '<p class="section-empty">Noch keine protokollierten Änderungen.</p>'}
    ${summaries.length ? `<section class="monthly-summary"><h2>Verdichtete Monate</h2>${summaries.map((summary) => `<article><strong>${escapeHtml(summary.month)}</strong><span>${Object.values(summary.counts).reduce((sum, count) => sum + count, 0)} relevante Änderungen</span></article>`).join('')}</section>` : ''}`;
}

function renderProject() {
  const project = currentProject();
  if (!project) {
    state.projectId = null;
    return renderProjects();
  }
  const views = [
    ['overview', 'Übersicht'],
    ['bugs', 'Bugs'],
    ['ideas', 'Ideen'],
    ['history', 'Verlauf'],
  ];
  const content = state.projectView === 'bugs'
    ? renderProjectBugs(project)
    : state.projectView === 'ideas'
      ? renderProjectIdeas(project)
      : state.projectView === 'history'
        ? renderProjectHistory(project)
        : renderProjectOverview(project);
  return `
    <div class="segmented-control project-segments" role="tablist" aria-label="Projektbereiche">
      ${views.map(([value, label]) => `<button type="button" role="tab" aria-selected="${state.projectView === value}" class="${state.projectView === value ? 'is-active' : ''}" data-action="project-view" data-view="${value}">${label}</button>`).join('')}
    </div>
    ${content}`;
}

function renderActivity() {
  const events = [...state.events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (!events.length) return renderEmpty({ iconName: 'clock', title: 'Noch keine Aktivität', copy: 'Relevante Änderungen werden datensparend lokal protokolliert.' });
  const groups = new Map();
  for (const event of events) {
    const key = new Date(event.timestamp).toLocaleDateString('de-DE');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.entries()].map(([date, items], index) => `
    <section class="activity-group">
      <h2>${index === 0 && new Date(items[0].timestamp).toDateString() === new Date().toDateString() ? 'Heute' : escapeHtml(date)}</h2>
      <ol class="activity-list">${items.map(renderEventItem).join('')}</ol>
    </section>`).join('');
}

function appBaseUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function settingsRow({ iconName, title, subtitle, action = '', accessory = '', extra = '', className = '' }) {
  const content = `
      <span class="settings-icon">${icon(iconName)}</span>
      <span class="settings-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></span>
      ${action ? `<span class="settings-accessory">${accessory || icon('chevron')}</span>` : extra}`;
  return action
    ? `<button type="button" class="settings-row settings-action-row ${className}" data-action="${action}" aria-label="${escapeHtml(title)}">${content}</button>`
    : `<div class="settings-row ${className}">${content}</div>`;
}

function renderSettings() {
  const base = appBaseUrl();
  const sampleProject = state.projects[0]?.id ?? 'PRJ-DEINE-ID';
  const commands = [
    ['Neues Projekt', `${base}?action=new-project`],
    ['Neuer Bug', `${base}?action=new-bug&project=${encodeURIComponent(sampleProject)}`],
    ['Neue Idee', `${base}?action=new-idea&project=${encodeURIComponent(sampleProject)}`],
  ];
  return `
    <section class="settings-section">
      <h2>Darstellung</h2>
      <div class="settings-group">
        <div class="settings-row">
          <span class="settings-icon">${icon('dashboard')}</span>
          <span class="settings-copy"><strong>Startansicht</strong><span>Welche Übersicht beim normalen Start erscheint</span></span>
          <select class="inline-select" data-setting="startView" aria-label="Startansicht">
            <option value="dashboard" ${state.settings.startView === 'dashboard' ? 'selected' : ''}>Dashboard</option>
            <option value="projects" ${state.settings.startView === 'projects' ? 'selected' : ''}>Projekte</option>
          </select>
        </div>
        <label class="settings-row toggle-row">
          <span class="settings-icon">${icon('archive')}</span>
          <span class="settings-copy"><strong>Archivierte standardmäßig anzeigen</strong><span>Bezieht archivierte Projekte in Dashboard und Übersichten ein</span></span>
          <input class="switch-input" type="checkbox" data-setting="includeArchived" ${state.settings.includeArchived ? 'checked' : ''}>
          <span class="switch-control" aria-hidden="true"></span>
        </label>
      </div>
    </section>

    <section class="settings-section">
      <h2>Datensicherung</h2>
      <div class="settings-group">
        ${settingsRow({ iconName: 'export', title: 'Backup in Dateien sichern', subtitle: 'JSON über das iOS-Teilen-Menü ablegen', action: 'share-backup', accessory: 'Teilen' })}
        ${settingsRow({ iconName: 'import', title: 'JSON-Backup importieren', subtitle: 'Prüft und migriert v1- sowie v2-Backups vor dem Ersetzen', action: 'import-backup' })}
      </div>
      <p class="settings-note">Vor einem Import erstellt ProjectLog intern eine Sicherheitskopie des aktuellen Bestands.</p>
    </section>

    <section class="settings-section">
      <h2>Kurzbefehle und URLs</h2>
      <div class="settings-group">
        ${commands.map(([label, url]) => settingsRow({
          iconName: 'copy', title: label, subtitle: 'Sicheren HTTPS-Link kopieren', action: 'copy-url', accessory: 'Kopieren',
        }).replace('data-action="copy-url"', `data-action="copy-url" data-url="${escapeHtml(url)}"`)).join('')}
      </div>
    </section>

    <section class="settings-section">
      <h2>Lokale Daten</h2>
      <div class="settings-group">
        ${settingsRow({ iconName: 'sparkles', title: 'Demodaten hinzufügen', subtitle: 'Erzeugt ein kleines Portfolio zum Testen von Dashboard und Filtern', action: 'load-demo' })}
        ${settingsRow({ iconName: 'trash', title: 'Alle lokalen Daten löschen', subtitle: 'Entfernt Projekte, Einträge, Verlauf und Monatswerte', action: 'clear-all', className: 'danger-row' })}
      </div>
    </section>

    <footer class="version-footer">
      <strong>ProjectLog ${APP_VERSION}</strong>
      <span>Backup-Schema 2 · lokal · ohne Telemetrie</span>
    </footer>`;
}

function render() {
  renderHeader();
  setNavigationState();
  main.innerHTML = state.projectId
    ? renderProject()
    : state.tab === 'dashboard'
      ? renderDashboard()
      : state.tab === 'projects'
        ? renderProjects()
        : state.tab === 'activity'
          ? renderActivity()
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
  Object.assign(state, { projects, bugs, ideas, events, monthlySummaries, settings });
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
    <label class="editor-toggle"><input type="checkbox" name="favorite" ${entity?.favorite ? 'checked' : ''}><span>${icon('pin')}Im Dashboard als Favorit anheften</span></label>`;
}

function entityHistory(entity, type) {
  if (!entity) return '';
  const events = state.events
    .filter((event) => event.entityId === entity.id && event.entityType === type)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
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
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast('Backup heruntergeladen.');
}

async function importBackup(file) {
  const parsed = JSON.parse(await file.text());
  if (!window.confirm('Der Import ersetzt den aktuellen lokalen Bestand. Fortfahren?')) return;
  await repository.importBackup(parsed);
  state.projectId = null;
  await refresh({ renderView: false });
  state.tab = state.settings.startView;
  render();
  showToast('Backup geprüft und importiert.');
}

async function loadDemo() {
  const now = new Date().toISOString();
  const projects = [
    createProject({ name: 'ProjectLog 2.0', description: 'Lokale Projektzentrale mit Dashboard und Verlauf.', status: 'active', priority: 'strategic', favorite: true }, { now }),
    createProject({ name: 'Foto-Workflow', description: 'Natürlicher iPhone- und Photomator-Workflow.', status: 'planned', priority: 'high', favorite: false }, { now }),
  ];
  for (const project of projects) await repository.saveEntity('project', project);
  await repository.saveEntity('bug', createBug({ projectId: projects[0].id, title: 'PWA-Cache aktualisieren', description: 'Neue Releases müssen zuverlässig erscheinen.', status: 'review', severity: 'critical', tags: ['technology', 'quality'] }, { sequence: await repository.nextSequence('bug'), now }));
  await repository.saveEntity('bug', createBug({ projectId: projects[0].id, title: 'Abstände im Detail prüfen', status: 'active', severity: 'minor', tags: ['design'] }, { sequence: await repository.nextSequence('bug'), now }));
  await repository.saveEntity('bug', createBug({ projectId: projects[1].id, title: 'Export-Rückmeldung verbessern', status: 'new', severity: 'major', tags: ['feature', 'quality'] }, { sequence: await repository.nextSequence('bug'), now }));
  await repository.saveEntity('idea', createIdea({ projectId: projects[0].id, title: 'Portfolio-Dashboard', status: 'planned', value: 'strategic', tags: ['feature', 'design'] }, { sequence: await repository.nextSequence('idea'), now }));
  await repository.saveEntity('idea', createIdea({ projectId: projects[1].id, title: 'Bearbeitungsrezepte speichern', status: 'reviewed', value: 'relevant', tags: ['feature', 'documentation'] }, { sequence: await repository.nextSequence('idea'), now }));
  await repository.saveEntity('idea', createIdea({ projectId: projects[1].id, title: 'Leerer Zustand mit Hinweis', status: 'new', value: 'small', tags: ['design'] }, { sequence: await repository.nextSequence('idea'), now }));
  state.projectId = null;
  state.tab = 'dashboard';
  await refresh();
  main.scrollTop = 0;
  showToast('Demodaten hinzugefügt.');
}

async function clearAll() {
  if (!window.confirm('Alle lokalen Projekte, Einträge und Verläufe unwiderruflich löschen?')) return;
  await repository.clearAll();
  state.projectId = null;
  await refresh({ renderView: false });
  state.tab = state.settings.startView;
  render();
  showToast('Alle lokalen Daten gelöscht.');
}

async function toggleFavorite() {
  const project = currentProject();
  if (!project) return;
  const updated = updateEntity('project', project, { favorite: !project.favorite }, new Date().toISOString());
  await repository.saveEntity('project', updated);
  await refresh();
  showToast(updated.favorite ? 'Als Favorit angeheftet.' : 'Favorit gelöst.');
}

async function handleAction(action, target) {
  switch (action) {
    case 'new-project': openEditor('project'); break;
    case 'open-project': state.projectId = target.dataset.id; state.projectView = 'overview'; state.tagFilter = 'all'; render(); main.scrollTop = 0; break;
    case 'back-projects': state.projectId = null; state.tab = 'projects'; render(); main.scrollTop = 0; break;
    case 'toggle-favorite': await toggleFavorite(); break;
    case 'project-view': state.projectView = target.dataset.view; state.tagFilter = 'all'; render(); main.scrollTop = 0; break;
    case 'edit-project': openEditor('project', currentProject()); break;
    case 'new-bug': openEditor('bug'); break;
    case 'new-idea': openEditor('idea'); break;
    case 'edit-bug': openEditor('bug', state.bugs.find((item) => item.id === target.dataset.id)); break;
    case 'edit-idea': openEditor('idea', state.ideas.find((item) => item.id === target.dataset.id)); break;
    case 'project-filter': state.projectFilter = target.dataset.value; render(); break;
    case 'bug-filter': state.bugFilter = target.dataset.value; render(); break;
    case 'idea-filter': state.ideaFilter = target.dataset.value; render(); break;
    case 'tag-filter': state.tagFilter = target.dataset.value; render(); break;
    case 'open-activity': state.projectId = null; state.tab = 'activity'; render(); main.scrollTop = 0; break;
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
  if (target) handleAction(target.dataset.action, target).catch((error) => showToast(error.message, 4800));
}

header.addEventListener('click', delegatedAction);
main.addEventListener('click', delegatedAction);
main.addEventListener('input', (event) => {
  if (event.target.id !== 'project-search') return;
  state.search = event.target.value;
  const selection = [event.target.selectionStart, event.target.selectionEnd];
  main.innerHTML = renderProjects();
  const input = main.querySelector('#project-search');
  input?.focus();
  input?.setSelectionRange(...selection);
});
main.addEventListener('change', (event) => {
  const setting = event.target.dataset.setting;
  if (!setting) return;
  const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
  repository.saveSettings({ [setting]: value })
    .then((settings) => { state.settings = settings; render(); showToast('Einstellung gespeichert.'); })
    .catch((error) => showToast(error.message, 4800));
});
nav.addEventListener('click', (event) => {
  const target = event.target.closest('[data-nav]');
  if (!target) return;
  state.tab = target.dataset.nav;
  state.projectId = null;
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
      state.projectView = command.view;
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
    state.tab = state.settings.startView;
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
