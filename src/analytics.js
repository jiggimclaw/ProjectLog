const CLOSED_BUG_STATUSES = new Set(['resolved', 'rejected']);
const PRIORITY_WEIGHT = { low: 0, normal: 1, high: 2, strategic: 3 };
const HEALTH_WEIGHT = { neutral: 0, stable: 1, watch: 2, critical: 3 };

function projectEntities(projectId, entities) {
  return entities.filter((entity) => entity.projectId === projectId);
}

function lastActivity(project, bugs, ideas) {
  return [project.updatedAt, ...bugs.map((item) => item.updatedAt), ...ideas.map((item) => item.updatedAt)]
    .sort()
    .at(-1);
}

function daysBetween(earlier, later) {
  return Math.floor((later.getTime() - new Date(earlier).getTime()) / 86400000);
}

export function calculateProjectHealth(project, bugs = [], ideas = [], now = new Date()) {
  if (['planned', 'completed', 'archived'].includes(project.status)) {
    return { level: 'neutral', reason: project.status === 'planned' ? 'Noch nicht begonnen' : project.status === 'completed' ? 'Projekt abgeschlossen' : 'Projekt archiviert' };
  }

  const open = bugs.filter((bug) => !CLOSED_BUG_STATUSES.has(bug.status));
  const critical = open.filter((bug) => bug.severity === 'critical').length;
  if (critical > 0) return { level: 'critical', reason: `${critical} ${critical === 1 ? 'kritischer Bug' : 'kritische Bugs'}` };

  const major = open.filter((bug) => bug.severity === 'major').length;
  if (major >= 2) return { level: 'watch', reason: `${major} wesentliche Bugs` };

  const latest = lastActivity(project, bugs, ideas);
  const staleDays = daysBetween(latest, now);
  if (project.status === 'active' && staleDays >= 30) {
    return { level: 'watch', reason: `Seit ${staleDays} Tagen unverändert` };
  }

  return { level: 'stable', reason: open.length ? `${open.length} offene ${open.length === 1 ? 'Abweichung' : 'Abweichungen'}` : 'Keine offenen Bugs' };
}

function projectModel(project, bugs, ideas, now) {
  const projectBugs = projectEntities(project.id, bugs);
  const projectIdeas = projectEntities(project.id, ideas);
  const openBugs = projectBugs.filter((bug) => !CLOSED_BUG_STATUSES.has(bug.status));
  return {
    project,
    health: calculateProjectHealth(project, projectBugs, projectIdeas, now),
    openBugs: openBugs.length,
    criticalBugs: openBugs.filter((bug) => bug.severity === 'critical').length,
    ideas: projectIdeas.length,
    implementedIdeas: projectIdeas.filter((idea) => idea.status === 'implemented').length,
    lastActivity: lastActivity(project, projectBugs, projectIdeas),
  };
}

function attentionComparator(a, b) {
  return HEALTH_WEIGHT[b.health.level] - HEALTH_WEIGHT[a.health.level]
    || PRIORITY_WEIGHT[b.project.priority] - PRIORITY_WEIGHT[a.project.priority]
    || b.lastActivity.localeCompare(a.lastActivity);
}

export function buildDashboardModel({ projects = [], bugs = [], ideas = [], events = [], now = new Date(), includeArchived = false } = {}) {
  const visibleProjects = projects.filter((project) => includeArchived || project.status !== 'archived');
  const visibleIds = new Set(visibleProjects.map((project) => project.id));
  const visibleBugs = bugs.filter((bug) => visibleIds.has(bug.projectId));
  const visibleIdeas = ideas.filter((idea) => visibleIds.has(idea.projectId));
  const cutoff = new Date(now.getTime() - 30 * 86400000);
  const models = visibleProjects.map((project) => projectModel(project, visibleBugs, visibleIdeas, now));
  const openBugs = visibleBugs.filter((bug) => !CLOSED_BUG_STATUSES.has(bug.status));
  const implementedIdeas30d = visibleIdeas.filter((idea) => idea.status === 'implemented' && new Date(idea.updatedAt) >= cutoff).length;

  return {
    metrics: {
      activeProjects: visibleProjects.filter((project) => project.status === 'active').length,
      openBugs: openBugs.length,
      criticalBugs: openBugs.filter((bug) => bug.severity === 'critical').length,
      implementedIdeas30d,
    },
    projects: models.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)),
    favorites: models.filter((item) => item.project.favorite).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)),
    attention: models
      .filter((item) => ['critical', 'watch'].includes(item.health.level) || ['high', 'strategic'].includes(item.project.priority))
      .sort(attentionComparator)
      .slice(0, 6),
    recentEvents: [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8),
  };
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function endOfUtcDay(date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return result;
}

function reverseEvent(event, bugStates, ideaStates) {
  if (event.entityType === 'bug') {
    if (event.kind === 'created') bugStates.delete(event.entityId);
    if (event.kind === 'status') bugStates.set(event.entityId, event.from);
  }
  if (event.entityType === 'idea') {
    if (event.kind === 'created') ideaStates.delete(event.entityId);
    if (event.kind === 'status') ideaStates.set(event.entityId, event.from);
  }
}

export function buildThirtyDaySeries({ bugs = [], ideas = [], events = [], now = new Date(), days = 30 } = {}) {
  const sortedEvents = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const result = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const dayEnd = endOfUtcDay(date);
    const bugStates = new Map(bugs.map((bug) => [bug.id, bug.status]));
    const ideaStates = new Map(ideas.map((idea) => [idea.id, idea.status]));
    for (const event of sortedEvents) {
      if (new Date(event.timestamp) > dayEnd) reverseEvent(event, bugStates, ideaStates);
    }
    result.push({
      date: dayKey(date),
      openBugs: [...bugStates.values()].filter((status) => !CLOSED_BUG_STATUSES.has(status)).length,
      implementedIdeas: [...ideaStates.values()].filter((status) => status === 'implemented').length,
    });
  }
  return result;
}
