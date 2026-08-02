import { calculateProjectHealth } from './analytics.js?v=3.2.0';
import { icon } from './icons.js?v=3.2.0';
import {
  bugSeverityMeta,
  bugStatusMeta,
  healthMeta,
  ideaStatusMeta,
  ideaValueMeta,
  projectPriorityMeta,
  projectStatusMeta,
  tagMeta,
} from './presentation.js?v=3.2.0';
import { currentView, isRootView } from './navigation.js?v=3.2.0';
import { escapeHtml, formatDateTime, formatRelativeDay } from './view-helpers.js?v=3.2.0';

const materialMeta = Object.freeze({
  note: { label: 'Notiz', icon: 'document' },
  link: { label: 'Link', icon: 'link' },
  image: { label: 'Bild', icon: 'photo' },
  file: { label: 'Datei', icon: 'paperclip' },
});

function projectById(state, id) {
  return state.projects.find((project) => project.id === id) ?? null;
}

function inboxById(state, id) {
  return state.inboxItems.find((item) => item.id === id) ?? null;
}

function referenceById(state, id) {
  return state.references.find((item) => item.id === id) ?? null;
}

function projectBugs(state, projectId) {
  return state.bugs.filter((bug) => bug.projectId === projectId);
}

function projectIdeas(state, projectId) {
  return state.ideas.filter((idea) => idea.projectId === projectId);
}

function projectReferences(state, projectId) {
  return state.references.filter((reference) => !reference.archived && reference.projectIds.includes(projectId));
}

function lastProjectActivity(state, project) {
  return [
    project.updatedAt,
    ...projectBugs(state, project.id).map((item) => item.updatedAt),
    ...projectIdeas(state, project.id).map((item) => item.updatedAt),
    ...projectReferences(state, project.id).map((item) => item.updatedAt),
  ].sort().at(-1) ?? project.updatedAt;
}

function safeHost(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); }
  catch { return value ?? ''; }
}

function relative(value) {
  return formatRelativeDay(value);
}

function buttonIcon(action, iconName, label, className = '') {
  return `<button class="toolbar-button ${className}" type="button" data-action="${escapeHtml(action)}" aria-label="${escapeHtml(label)}">${icon(iconName)}</button>`;
}

function projectHeaderSubtitle(project) {
  return `${projectStatusMeta[project.status].label} · ${projectPriorityMeta[project.priority].label}`;
}

export function renderHeader(state) {
  const view = currentView(state.navigation);
  const root = isRootView(state.navigation);
  let title = '';
  let subtitle = '';
  let leading = '';
  let actions = '';

  if (view.name === 'projects') {
    title = 'ProjectLog';
    actions = `${buttonIcon('new-project', 'plus', 'Neues Projekt', 'primary')}${buttonIcon('open-global-menu', 'ellipsis', 'Mehr Optionen')}`;
  } else if (view.name === 'inbox') {
    title = 'Eingang';
    actions = `${buttonIcon('open-compose', 'plus', 'Neuer Eingangseintrag', 'primary')}${buttonIcon('open-global-menu', 'ellipsis', 'Mehr Optionen')}`;
  } else {
    leading = buttonIcon('navigate-back', 'back', 'Zurück');
    if (view.name === 'project') {
      const project = projectById(state, view.params.projectId);
      title = project?.name ?? 'Projekt';
      subtitle = project ? projectHeaderSubtitle(project) : '';
      actions = `${buttonIcon('toggle-favorite', project?.favorite ? 'pin-filled' : 'pin', 'Favorit umschalten', project?.favorite ? 'is-selected' : '')}${buttonIcon('open-project-menu', 'ellipsis', 'Projektoptionen')}`;
    } else if (view.name === 'bugs') {
      title = 'Bugs';
      subtitle = projectById(state, view.params.projectId)?.name ?? '';
      actions = `${buttonIcon('open-bug-filter', 'sliders', 'Bugs filtern')}${buttonIcon('new-bug', 'plus', 'Neuer Bug', 'primary')}`;
    } else if (view.name === 'ideas') {
      title = 'Ideen';
      subtitle = projectById(state, view.params.projectId)?.name ?? '';
      actions = `${buttonIcon('open-idea-filter', 'sliders', 'Ideen filtern')}${buttonIcon('new-idea', 'plus', 'Neue Idee', 'primary')}`;
    } else if (view.name === 'project-references') {
      title = 'Referenzen';
      subtitle = projectById(state, view.params.projectId)?.name ?? '';
      actions = buttonIcon('assign-existing-reference', 'plus', 'Referenz zuordnen', 'primary');
    } else if (view.name === 'history') {
      title = 'Verlauf';
      subtitle = projectById(state, view.params.projectId)?.name ?? '';
    } else if (view.name === 'inbox-detail') {
      const item = inboxById(state, view.params.inboxId);
      title = item?.title ?? 'Eingangseintrag';
      subtitle = item ? materialMeta[item.type].label : '';
      actions = `${buttonIcon('edit-inbox-item', 'edit', 'Eingangseintrag bearbeiten')}${buttonIcon('open-inbox-menu', 'ellipsis', 'Weitere Aktionen')}`;
    } else if (view.name === 'reference-detail') {
      const reference = referenceById(state, view.params.referenceId);
      title = reference?.title ?? 'Referenz';
      subtitle = reference ? materialMeta[reference.type].label : '';
      actions = `${buttonIcon('edit-reference', 'edit', 'Referenz bearbeiten')}${buttonIcon('open-reference-menu', 'ellipsis', 'Weitere Aktionen')}`;
    } else if (view.name === 'library') {
      title = 'Bibliothek';
      actions = buttonIcon('open-library-filter', 'sliders', 'Bibliothek filtern');
    } else if (view.name === 'archive') {
      title = 'Archiv';
    } else if (view.name === 'settings') {
      title = 'Einstellungen';
    } else if (view.name === 'shortcuts') {
      title = 'Kurzbefehle';
    }
  }

  return `
    <div class="header-row ${root ? 'root-header' : 'detail-header'}">
      <div class="header-leading">${leading}</div>
      <div class="header-title-group">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="header-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div class="toolbar-actions">${actions}</div>
    </div>`;
}

function emptyState({ iconName, title, copy, action, actionLabel }) {
  return `<section class="empty-state">
    <div class="empty-symbol">${icon(iconName)}</div>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(copy)}</p>
    ${action ? `<button class="primary-action" type="button" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>` : ''}
  </section>`;
}

function searchField(id, placeholder, value) {
  return `<label class="search-field" for="${escapeHtml(id)}">${icon('search')}<input id="${escapeHtml(id)}" type="search" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false"></label>`;
}

function sectionHeading(title, accessory = '') {
  return `<div class="section-heading-row"><h2>${escapeHtml(title)}</h2>${accessory ? `<span>${escapeHtml(accessory)}</span>` : ''}</div>`;
}

function groupedSection(title, content, accessory = '') {
  if (!content) return '';
  return `<section class="content-section">${sectionHeading(title, accessory)}<div class="grouped-list">${content}</div></section>`;
}

function priorityClass(priority) {
  return projectPriorityMeta[priority]?.className ?? 'priority-normal';
}

function projectMeta(state, project) {
  const open = projectBugs(state, project.id).filter((bug) => !['resolved', 'rejected'].includes(bug.status));
  const critical = open.filter((bug) => bug.severity === 'critical').length;
  const major = open.filter((bug) => bug.severity === 'major').length;
  const when = relative(lastProjectActivity(state, project));
  if (critical === 1) return { text: `1 kritischer Bug · ${when}`, tone: 'critical' };
  if (critical > 1) return { text: `${critical} kritische Bugs · ${when}`, tone: 'critical' };
  if (major === 1) return { text: `1 wesentlicher Bug · ${when}`, tone: 'major' };
  if (major > 1) return { text: `${major} wesentliche Bugs · ${when}`, tone: 'major' };
  if (project.status === 'planned') return { text: `Geplant · ${projectPriorityMeta[project.priority].label}`, tone: 'planned' };
  return { text: `${projectStatusMeta[project.status].label} · zuletzt ${when}`, tone: 'neutral' };
}

function projectRow(state, project) {
  const meta = projectMeta(state, project);
  return `<button class="list-row project-row priority-rail ${priorityClass(project.priority)}" type="button" data-action="open-project" data-id="${escapeHtml(project.id)}">
    <span class="row-main">
      <span class="row-title-line"><strong>${escapeHtml(project.name)}</strong>${project.favorite ? `<span class="favorite-mark">${icon('pin-filled')}</span>` : ''}</span>
      <span class="row-meta ${escapeHtml(meta.tone)}">${escapeHtml(meta.text)}</span>
    </span>
    <span class="row-chevron">${icon('chevron')}</span>
  </button>`;
}

function matchesProject(state, project, query) {
  if (!query) return true;
  const text = [
    project.name,
    project.description,
    ...projectBugs(state, project.id).flatMap((item) => [item.title, item.description, ...item.tags]),
    ...projectIdeas(state, project.id).flatMap((item) => [item.title, item.description, ...item.tags]),
    ...projectReferences(state, project.id).flatMap((item) => [item.title, item.body, item.url, ...item.tags]),
  ].join(' ').toLocaleLowerCase('de-DE');
  return text.includes(query);
}

function renderProjects(state) {
  if (!state.projects.length) {
    return emptyState({
      iconName: 'folder',
      title: 'Dein erstes Projekt',
      copy: 'Lege ein Projekt an. Bugs, Ideen und Referenzen bleiben anschließend sauber an einem Ort.',
      action: 'new-project',
      actionLabel: 'Projekt anlegen',
    });
  }
  const query = state.search.projects.trim().toLocaleLowerCase('de-DE');
  const projects = [...state.projects]
    .filter((project) => project.status !== 'archived')
    .filter((project) => matchesProject(state, project, query))
    .sort((a, b) => lastProjectActivity(state, b).localeCompare(lastProjectActivity(state, a)));
  const favorites = projects.filter((project) => project.favorite);
  const attention = projects.filter((project) => !project.favorite && ['critical', 'major'].includes(projectMeta(state, project).tone));
  const active = projects.filter((project) => !project.favorite && !attention.includes(project) && ['active', 'paused', 'completed'].includes(project.status));
  const planned = projects.filter((project) => project.status === 'planned');
  const groups = [
    ['Favoriten', favorites],
    ['Benötigt Aufmerksamkeit', attention],
    ['Aktiv', active],
    ['Geplant', planned],
  ].filter(([, items]) => items.length);
  return `${searchField('project-search', 'Projekte durchsuchen', state.search.projects)}${groups.map(([title, items]) => groupedSection(title, items.map((project) => projectRow(state, project)).join(''))).join('')}${!groups.length ? '<p class="empty-copy">Keine passenden Projekte.</p>' : ''}`;
}

function materialIcon(item, state) {
  if (item.type === 'image' && item.attachmentId && state.attachmentUrls.has(item.attachmentId)) {
    return `<img class="material-thumbnail" src="${escapeHtml(state.attachmentUrls.get(item.attachmentId))}" alt="">`;
  }
  return `<span class="material-icon type-${escapeHtml(item.type)}">${icon(materialMeta[item.type].icon)}</span>`;
}

function materialDetail(item) {
  if (item.type === 'link') return safeHost(item.url);
  if (item.body) return item.body;
  return materialMeta[item.type].label;
}

function materialRow(item, state, action, idAttribute) {
  return `<button class="list-row material-row" type="button" data-action="${escapeHtml(action)}" ${idAttribute}="${escapeHtml(item.id)}">
    ${materialIcon(item, state)}
    <span class="row-main">
      <strong class="two-line-title">${escapeHtml(item.title)}</strong>
      <span class="row-description">${escapeHtml(materialDetail(item))}</span>
      <span class="row-meta">${escapeHtml(materialMeta[item.type].label)} · ${escapeHtml(relative(item.updatedAt))}</span>
    </span>
    <span class="row-chevron">${icon('chevron')}</span>
  </button>`;
}

function matchesMaterial(item, query) {
  if (!query) return true;
  return [item.title, item.body, item.url, ...(item.tags ?? [])].join(' ').toLocaleLowerCase('de-DE').includes(query);
}

function groupByRelativeDate(items) {
  const groups = new Map();
  for (const item of items) {
    const label = relative(item.updatedAt);
    const key = label === 'heute' ? 'Heute' : label === 'gestern' ? 'Gestern' : 'Früher';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function renderInbox(state) {
  const query = state.search.inbox.trim().toLocaleLowerCase('de-DE');
  const items = [...state.inboxItems].filter((item) => matchesMaterial(item, query)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const search = searchField('inbox-search', 'Eingang durchsuchen', state.search.inbox);
  if (!items.length) {
    return `${search}${emptyState({
      iconName: 'tray',
      title: 'Der Eingang ist leer',
      copy: 'Sammle hier Notizen, Links, Fotos und Dateien. Verarbeitetes Material verschwindet automatisch aus dem Eingang.',
      action: 'open-compose',
      actionLabel: 'Etwas erfassen',
    })}`;
  }
  const groups = groupByRelativeDate(items);
  return `${search}${[...groups.entries()].map(([title, group]) => groupedSection(title, group.map((item) => materialRow(item, state, 'open-inbox-item', 'data-inbox-id')).join(''))).join('')}`;
}

function criticalAlert(state, project) {
  const critical = projectBugs(state, project.id).filter((bug) => bug.severity === 'critical' && !['resolved', 'rejected'].includes(bug.status));
  if (!critical.length) return '';
  const copy = critical.length === 1 ? critical[0].title : `${critical.length} kritische Bugs sind offen.`;
  return `<button class="critical-alert" type="button" data-action="open-project-bugs"><span>${icon('warning')}</span><span><strong>Benötigt Aufmerksamkeit</strong><small>${escapeHtml(copy)}</small></span><span class="row-chevron">${icon('chevron')}</span></button>`;
}

function detailLinkRow({ action, label, count = '', iconName, tone = '' }) {
  return `<button class="list-row detail-link-row ${escapeHtml(tone)}" type="button" data-action="${escapeHtml(action)}">
    <span class="detail-row-icon">${icon(iconName)}</span><span class="row-main"><strong>${escapeHtml(label)}</strong></span>
    <span class="row-accessory">${count !== '' ? `<span>${escapeHtml(String(count))}</span>` : ''}${icon('chevron')}</span>
  </button>`;
}

function recentEntryRow(entry) {
  const isBug = entry.id.startsWith('BUG-');
  const iconName = isBug ? bugSeverityMeta[entry.severity].icon : ideaValueMeta[entry.value].icon;
  const meta = isBug
    ? `${bugStatusMeta[entry.status].label} · ${bugSeverityMeta[entry.severity].label}`
    : `${ideaStatusMeta[entry.status].label} · ${ideaValueMeta[entry.value].label}`;
  return `<button class="list-row entry-row" type="button" data-action="${isBug ? 'edit-bug' : 'edit-idea'}" data-id="${escapeHtml(entry.id)}">
    <span class="entry-symbol ${isBug ? 'bug-symbol' : 'idea-symbol'}">${icon(iconName)}</span>
    <span class="row-main"><strong class="two-line-title">${escapeHtml(entry.title)}</strong><span class="row-meta">${escapeHtml(meta)} · ${escapeHtml(relative(entry.updatedAt))}</span></span>
    <span class="row-chevron">${icon('chevron')}</span>
  </button>`;
}

function renderProject(state, projectId) {
  const project = projectById(state, projectId);
  if (!project) return emptyState({ iconName: 'folder', title: 'Projekt nicht gefunden', copy: 'Das Projekt wurde möglicherweise gelöscht.' });
  const bugs = projectBugs(state, project.id);
  const ideas = projectIdeas(state, project.id);
  const references = projectReferences(state, project.id);
  const recent = [...bugs, ...ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  return `${criticalAlert(state, project)}
    <section class="content-section project-description-section">${sectionHeading('Beschreibung')}<div class="plain-content"><p>${escapeHtml(project.description || 'Noch keine Projektbeschreibung.')}</p></div></section>
    ${groupedSection('Inhalte', [
      detailLinkRow({ action: 'open-project-bugs', label: 'Bugs', count: bugs.length, iconName: 'bug', tone: bugs.some((bug) => bug.severity === 'critical' && !['resolved', 'rejected'].includes(bug.status)) ? 'semantic-critical' : '' }),
      detailLinkRow({ action: 'open-project-ideas', label: 'Ideen', count: ideas.length, iconName: 'bulb' }),
      detailLinkRow({ action: 'open-project-references', label: 'Referenzen', count: references.length, iconName: 'link' }),
      detailLinkRow({ action: 'open-project-history', label: 'Verlauf', count: state.events.filter((event) => event.projectId === project.id).length, iconName: 'history' }),
    ].join(''))}
    ${recent.length ? groupedSection('Zuletzt geändert', recent.map(recentEntryRow).join(''), relative(lastProjectActivity(state, project))) : ''}`;
}

function neutralTags(tags) {
  if (!tags?.length) return '';
  const shown = tags.slice(0, 2);
  return `<span class="tag-row">${shown.map((tag) => `<span class="tag-chip">${escapeHtml(tagMeta[tag]?.label ?? tag)}</span>`).join('')}${tags.length > 2 ? `<span class="tag-chip">+${tags.length - 2}</span>` : ''}</span>`;
}

function entryRow(item, type) {
  const isBug = type === 'bug';
  const iconName = isBug ? bugSeverityMeta[item.severity].icon : ideaValueMeta[item.value].icon;
  const primaryMeta = isBug ? bugSeverityMeta[item.severity].label : ideaValueMeta[item.value].label;
  const secondaryMeta = isBug ? bugStatusMeta[item.status].label : ideaStatusMeta[item.status].label;
  return `<button class="list-row entry-row" type="button" data-action="edit-${type}" data-id="${escapeHtml(item.id)}">
    <span class="entry-symbol ${isBug ? `severity-${item.severity}` : `idea-${item.value}`}">${icon(iconName)}</span>
    <span class="row-main"><strong class="two-line-title">${escapeHtml(item.title)}</strong><span class="row-meta">${escapeHtml(primaryMeta)} · ${escapeHtml(secondaryMeta)} · ${escapeHtml(relative(item.updatedAt))}</span>${neutralTags(item.tags)}</span>
    <span class="row-chevron">${icon('chevron')}</span>
  </button>`;
}

function filterLabel(type, value) {
  const maps = {
    bugs: { open: 'Offene Bugs', critical: 'Kritische Bugs', resolved: 'Behobene Bugs', all: 'Alle Bugs' },
    ideas: { open: 'Offene Ideen', strategic: 'Strategische Ideen', implemented: 'Umgesetzte Ideen', all: 'Alle Ideen' },
    library: { all: 'Alle Referenzen', link: 'Links', image: 'Bilder', file: 'Dateien', note: 'Notizen' },
  };
  return maps[type][value] ?? 'Alle';
}

function renderEntryList(state, type, projectId) {
  const filter = state.filters[type];
  let items = type === 'bugs' ? projectBugs(state, projectId) : projectIdeas(state, projectId);
  if (type === 'bugs') {
    if (filter === 'open') items = items.filter((item) => !['resolved', 'rejected'].includes(item.status));
    if (filter === 'critical') items = items.filter((item) => item.severity === 'critical' && !['resolved', 'rejected'].includes(item.status));
    if (filter === 'resolved') items = items.filter((item) => item.status === 'resolved');
  } else {
    if (filter === 'open') items = items.filter((item) => !['implemented', 'rejected'].includes(item.status));
    if (filter === 'strategic') items = items.filter((item) => item.value === 'strategic');
    if (filter === 'implemented') items = items.filter((item) => item.status === 'implemented');
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="result-summary"><span>${escapeHtml(filterLabel(type, filter))}</span><strong>${items.length}</strong></div>${items.length ? `<div class="grouped-list">${items.map((item) => entryRow(item, type === 'bugs' ? 'bug' : 'idea')).join('')}</div>` : `<p class="empty-copy">Keine Einträge in diesem Filter.</p>`}`;
}

function referenceRow(reference, state) {
  return materialRow(reference, state, 'open-reference', 'data-reference-id');
}

function renderProjectReferences(state, projectId) {
  const items = projectReferences(state, projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return items.length ? `<div class="grouped-list">${items.map((item) => referenceRow(item, state)).join('')}</div>` : emptyState({ iconName: 'link', title: 'Keine Referenzen', copy: 'Ordne vorhandene Materialien aus der Bibliothek zu oder verarbeite einen Eingangseintrag als Referenz.', action: 'assign-existing-reference', actionLabel: 'Referenz zuordnen' });
}

function historyEntityTitle(state, event) {
  if (event.entityType === 'project') return projectById(state, event.entityId)?.name ?? 'Projekt';
  if (event.entityType === 'bug') return state.bugs.find((item) => item.id === event.entityId)?.title ?? 'Bug';
  if (event.entityType === 'idea') return state.ideas.find((item) => item.id === event.entityId)?.title ?? 'Idee';
  return 'ProjectLog';
}

function eventDescription(event) {
  const labels = { status: 'Status geändert', severity: 'Schweregrad geändert', value: 'Nutzen geändert', priority: 'Priorität geändert', favorite: 'Favorit geändert', tag_added: 'Tag hinzugefügt', tag_removed: 'Tag entfernt', created: 'Erstellt', migration: 'Daten migriert' };
  return labels[event.kind] ?? 'Geändert';
}

function renderHistory(state, projectId) {
  const events = state.events.filter((event) => event.projectId === projectId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (!events.length) return emptyState({ iconName: 'history', title: 'Noch kein Verlauf', copy: 'Relevante Status-, Bewertungs- und Tagänderungen erscheinen hier.' });
  return `<ol class="history-list">${events.map((event) => `<li><time>${escapeHtml(formatDateTime(event.timestamp))}</time><div><strong>${escapeHtml(eventDescription(event))}</strong><span>${escapeHtml(historyEntityTitle(state, event))}</span></div></li>`).join('')}</ol>`;
}

function renderMaterialPreview(item, state) {
  if (item.type === 'image' && item.attachmentId && state.attachmentUrls.has(item.attachmentId)) {
    return `<button class="material-preview image-preview" type="button" data-action="open-material-attachment" aria-label="Bild öffnen"><img src="${escapeHtml(state.attachmentUrls.get(item.attachmentId))}" alt="${escapeHtml(item.title)}"></button>`;
  }
  if (item.type === 'file') {
    const attachment = state.attachments.find((entry) => entry.id === item.attachmentId);
    return `<button class="material-preview file-preview" type="button" data-action="open-material-attachment">${icon('paperclip')}<div><strong>${escapeHtml(attachment?.name ?? item.title)}</strong><span>${attachment ? `${Math.max(1, Math.round(attachment.size / 1024))} KB` : 'Datei'}</span></div><span class="row-chevron">${icon('external')}</span></button>`;
  }
  if (item.type === 'link') {
    return `<a class="material-preview link-preview" href="${escapeHtml(item.url)}" target="_blank" rel="noopener"><span>${icon('link')}</span><div><strong>${escapeHtml(safeHost(item.url))}</strong><small>${escapeHtml(item.url)}</small></div>${icon('external')}</a>`;
  }
  return '';
}

function materialInfoRows(item) {
  const rows = [];
  if (item.body) rows.push(`<div class="info-row vertical"><span>Notiz</span><p>${escapeHtml(item.body)}</p></div>`);
  rows.push(`<div class="info-row"><span>Erfasst</span><strong>${escapeHtml(formatDateTime(item.createdAt))}</strong></div>`);
  if (item.tags?.length) rows.push(`<div class="info-row"><span>Tags</span>${neutralTags(item.tags)}</div>`);
  return rows.join('');
}

function renderInboxDetail(state, inboxId) {
  const item = inboxById(state, inboxId);
  if (!item) return emptyState({ iconName: 'tray', title: 'Eintrag nicht gefunden', copy: 'Der Eingangseintrag wurde bereits verarbeitet oder gelöscht.' });
  return `${renderMaterialPreview(item, state)}${groupedSection('Details', materialInfoRows(item))}<button class="primary-wide-action" type="button" data-action="process-inbox">Weiterverarbeiten</button>`;
}

function projectNames(state, projectIds) {
  return projectIds.map((id) => projectById(state, id)?.name).filter(Boolean);
}

function renderReferenceDetail(state, referenceId) {
  const reference = referenceById(state, referenceId);
  if (!reference) return emptyState({ iconName: 'link', title: 'Referenz nicht gefunden', copy: 'Die Referenz wurde möglicherweise entfernt.' });
  const projectRows = reference.projectIds.map((id) => {
    const project = projectById(state, id);
    return project ? `<button class="list-row compact-row" type="button" data-action="open-project" data-id="${escapeHtml(id)}"><span class="row-main"><strong>${escapeHtml(project.name)}</strong></span><span class="row-chevron">${icon('chevron')}</span></button>` : '';
  }).join('');
  return `${renderMaterialPreview(reference, state)}${groupedSection('Details', materialInfoRows(reference))}${groupedSection('Projekte', projectRows)}<div class="detail-button-stack"><button class="secondary-wide-action" type="button" data-action="assign-reference-projects">Projektzuordnung ändern</button>${reference.type === 'link' ? '<button class="secondary-wide-action" type="button" data-action="open-reference-link">Link öffnen</button>' : ''}</div>`;
}

function renderLibrary(state) {
  const query = state.search.library.trim().toLocaleLowerCase('de-DE');
  const filter = state.filters.library;
  const items = state.references
    .filter((item) => !item.archived)
    .filter((item) => filter === 'all' || item.type === filter)
    .filter((item) => matchesMaterial(item, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `${searchField('library-search', 'Bibliothek durchsuchen', state.search.library)}<div class="result-summary"><span>${escapeHtml(filterLabel('library', filter))}</span><strong>${items.length}</strong></div>${items.length ? `<div class="grouped-list">${items.map((item) => referenceRow(item, state)).join('')}</div>` : `<p class="empty-copy">Keine passenden Referenzen.</p>`}`;
}

function renderArchive(state) {
  const projects = state.projects.filter((project) => project.status === 'archived');
  const references = state.references.filter((reference) => reference.archived);
  return `${projects.length ? groupedSection('Projekte', projects.map((project) => projectRow(state, project)).join('')) : ''}${references.length ? groupedSection('Referenzen', references.map((reference) => referenceRow(reference, state)).join('')) : ''}${!projects.length && !references.length ? emptyState({ iconName: 'archive', title: 'Archiv ist leer', copy: 'Archivierte Projekte und Referenzen erscheinen hier.' }) : ''}`;
}

function settingsRow({ action, iconName, title, subtitle, accessory = '', destructive = false }) {
  return `<button class="list-row settings-row ${destructive ? 'destructive-row' : ''}" type="button" data-action="${escapeHtml(action)}"><span class="settings-icon">${icon(iconName)}</span><span class="row-main"><strong>${escapeHtml(title)}</strong>${subtitle ? `<span class="row-description">${escapeHtml(subtitle)}</span>` : ''}</span><span class="row-accessory">${accessory ? `<span>${escapeHtml(accessory)}</span>` : ''}${icon('chevron')}</span></button>`;
}

function formatBytes(value) {
  if (!value) return 'Keine Anhänge';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB Anhänge`;
  return `${(value / (1024 * 1024)).toFixed(1).replace('.', ',')} MB Anhänge`;
}

function staticSettingsRow({ iconName, title, subtitle, accessory = '' }) {
  return `<div class="list-row settings-row static-settings-row"><span class="settings-icon">${icon(iconName)}</span><span class="row-main"><strong>${escapeHtml(title)}</strong>${subtitle ? `<span class="row-description">${escapeHtml(subtitle)}</span>` : ''}</span>${accessory ? `<span class="row-accessory"><span>${escapeHtml(accessory)}</span></span>` : ''}</div>`;
}

function renderSettings(state) {
  return `${groupedSection('Daten & Backup', [
    settingsRow({ action: 'share-backup', iconName: 'export', title: 'Backup exportieren', subtitle: 'Projekte, Eingang, Referenzen und Anhänge' }),
    settingsRow({ action: 'choose-import', iconName: 'import', title: 'Backup importieren', subtitle: 'Bestehenden lokalen Bestand ersetzen' }),
  ].join(''))}${groupedSection('Automation', settingsRow({ action: 'open-shortcuts', iconName: 'link', title: 'Kurzbefehle', subtitle: 'Sichere URLs für schnelle Erfassung' }))}${groupedSection('Entwickleroptionen', settingsRow({ action: 'load-demo', iconName: 'sparkles', title: 'Demodaten hinzufügen', subtitle: 'Testportfolio für die Oberfläche' }))}${groupedSection('Lokale Daten', settingsRow({ action: 'request-clear-all', iconName: 'trash', title: 'Alle lokalen Daten löschen', subtitle: 'Kann nicht rückgängig gemacht werden', destructive: true }))}${groupedSection('Über ProjectLog', staticSettingsRow({ iconName: 'info', title: 'ProjectLog 3.2.0', subtitle: 'Lokal · ohne Konto · ohne Telemetrie', accessory: formatBytes(state.attachments.reduce((sum, item) => sum + item.size, 0)) }))}`;
}

function renderShortcuts(state) {
  const base = state.baseUrl;
  const projectId = state.projects[0]?.id ?? 'PRJ-DEINE-ID';
  const rows = [
    ['Neues Projekt', `${base}?action=new-project`],
    ['Neuer Bug', `${base}?action=new-bug&project=${encodeURIComponent(projectId)}`],
    ['Neue Idee', `${base}?action=new-idea&project=${encodeURIComponent(projectId)}`],
  ].map(([label, value]) => `<button class="list-row shortcut-row" type="button" data-action="copy-shortcut" data-url="${escapeHtml(value)}"><span class="row-main"><strong>${escapeHtml(label)}</strong><span class="row-description">${escapeHtml(value)}</span></span><span class="row-accessory">Kopieren</span></button>`).join('');
  return `${groupedSection('Sichere HTTPS-Links', rows)}<p class="settings-footnote">Die Links öffnen ProjectLog und starten nur die angegebene Erfassungsaktion. Lösch- oder Importaktionen sind über URLs nicht erlaubt.</p>`;
}

export function renderMain(state) {
  const view = currentView(state.navigation);
  if (view.name === 'projects') return renderProjects(state);
  if (view.name === 'inbox') return renderInbox(state);
  if (view.name === 'project') return renderProject(state, view.params.projectId);
  if (view.name === 'bugs') return renderEntryList(state, 'bugs', view.params.projectId);
  if (view.name === 'ideas') return renderEntryList(state, 'ideas', view.params.projectId);
  if (view.name === 'project-references') return renderProjectReferences(state, view.params.projectId);
  if (view.name === 'history') return renderHistory(state, view.params.projectId);
  if (view.name === 'inbox-detail') return renderInboxDetail(state, view.params.inboxId);
  if (view.name === 'reference-detail') return renderReferenceDetail(state, view.params.referenceId);
  if (view.name === 'library') return renderLibrary(state);
  if (view.name === 'archive') return renderArchive(state);
  if (view.name === 'settings') return renderSettings(state);
  if (view.name === 'shortcuts') return renderShortcuts(state);
  return emptyState({ iconName: 'info', title: 'Ansicht nicht verfügbar', copy: 'Kehre zur Projektübersicht zurück.' });
}

export function tabBarVisible(state) {
  return isRootView(state.navigation);
}

export function activeRootTab(state) {
  return currentView(state.navigation).name === 'inbox' ? 'inbox' : 'projects';
}

export function currentProjectForView(state) {
  const view = currentView(state.navigation);
  return view.params?.projectId ? projectById(state, view.params.projectId) : null;
}

export function currentInboxForView(state) {
  const view = currentView(state.navigation);
  return view.params?.inboxId ? inboxById(state, view.params.inboxId) : null;
}

export function currentReferenceForView(state) {
  const view = currentView(state.navigation);
  return view.params?.referenceId ? referenceById(state, view.params.referenceId) : null;
}

export function referenceProjectNames(state, reference) {
  return projectNames(state, reference.projectIds);
}
