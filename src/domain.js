export const TAG_VALUES = Object.freeze([
  'feature',
  'design',
  'technology',
  'quality',
  'documentation',
  'other',
]);

export const PROJECT_STATUSES = Object.freeze(['planned', 'active', 'paused', 'completed', 'archived']);
export const PROJECT_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'strategic']);
export const BUG_STATUSES = Object.freeze(['new', 'review', 'active', 'resolved', 'rejected']);
export const BUG_SEVERITIES = Object.freeze(['minor', 'major', 'critical']);
export const IDEA_STATUSES = Object.freeze(['new', 'reviewed', 'planned', 'implemented', 'rejected']);
export const IDEA_VALUES = Object.freeze(['small', 'relevant', 'strategic']);
export const START_VIEWS = Object.freeze(['dashboard', 'projects']);

const PROJECT_STATUS_SET = new Set(PROJECT_STATUSES);
const PROJECT_PRIORITY_SET = new Set(PROJECT_PRIORITIES);
const BUG_STATUS_SET = new Set(BUG_STATUSES);
const BUG_SEVERITY_SET = new Set(BUG_SEVERITIES);
const IDEA_STATUS_SET = new Set(IDEA_STATUSES);
const IDEA_VALUE_SET = new Set(IDEA_VALUES);
const TAG_SET = new Set(TAG_VALUES);
const START_VIEW_SET = new Set(START_VIEWS);

function assertText(value, field, { min = 0, max = Infinity } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length < min) throw new Error(`${field} is required`);
  if (normalized.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return normalized;
}

function assertIsoTimestamp(value, field) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return value;
}

function assertId(value, field) {
  return assertText(value, field, { min: 1, max: 120 });
}

function assertEnum(value, allowed, field) {
  if (!allowed.has(value)) throw new Error(`Invalid ${field}`);
  return value;
}

function assertBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function normalizeTags(value = []) {
  if (!Array.isArray(value)) throw new Error('Tags must be an array');
  const unique = [];
  for (const tag of value) {
    if (!TAG_SET.has(tag)) throw new Error(`Invalid tag: ${tag}`);
    if (!unique.includes(tag)) unique.push(tag);
  }
  return unique;
}

function defaultProjectId() {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `PRJ-${raw.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

function eventId(prefix = 'EVT') {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${raw.replaceAll('-', '').slice(0, 16).toUpperCase()}`;
}

export function formatSequenceId(prefix, sequence) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Sequence must be a positive integer');
  }
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export function createProject(input, options = {}) {
  const now = assertIsoTimestamp(options.now ?? new Date().toISOString(), 'now');
  const status = input?.status ?? 'active';
  const priority = input?.priority ?? 'normal';
  const favorite = input?.favorite ?? false;
  return {
    id: assertId(options.id ?? defaultProjectId(), 'project id'),
    name: assertText(input?.name ?? '', 'Project name', { min: 1, max: 80 }),
    description: assertText(input?.description ?? '', 'Project description', { max: 2000 }),
    status: assertEnum(status, PROJECT_STATUS_SET, 'project status'),
    priority: assertEnum(priority, PROJECT_PRIORITY_SET, 'project priority'),
    favorite: assertBoolean(favorite, 'Project favorite'),
    createdAt: now,
    updatedAt: now,
  };
}

export function createBug(input, options = {}) {
  const now = assertIsoTimestamp(options.now ?? new Date().toISOString(), 'now');
  const status = input?.status ?? 'new';
  const severity = input?.severity ?? 'major';
  return {
    id: formatSequenceId('BUG', options.sequence),
    projectId: assertId(input?.projectId ?? '', 'Project id'),
    title: assertText(input?.title ?? '', 'Bug title', { min: 1, max: 120 }),
    description: assertText(input?.description ?? '', 'Bug description', { max: 4000 }),
    status: assertEnum(status, BUG_STATUS_SET, 'bug status'),
    severity: assertEnum(severity, BUG_SEVERITY_SET, 'bug severity'),
    tags: normalizeTags(input?.tags ?? []),
    createdAt: now,
    updatedAt: now,
  };
}

export function createIdea(input, options = {}) {
  const now = assertIsoTimestamp(options.now ?? new Date().toISOString(), 'now');
  const status = input?.status ?? 'new';
  const value = input?.value ?? 'relevant';
  return {
    id: formatSequenceId('IDEA', options.sequence),
    projectId: assertId(input?.projectId ?? '', 'Project id'),
    title: assertText(input?.title ?? '', 'Idea title', { min: 1, max: 120 }),
    description: assertText(input?.description ?? '', 'Idea description', { max: 4000 }),
    status: assertEnum(status, IDEA_STATUS_SET, 'idea status'),
    value: assertEnum(value, IDEA_VALUE_SET, 'idea value'),
    tags: normalizeTags(input?.tags ?? []),
    createdAt: now,
    updatedAt: now,
  };
}

export function touchEntity(entity, changes, now = new Date().toISOString()) {
  assertIsoTimestamp(now, 'updatedAt');
  const protectedKeys = new Set(['id', 'createdAt']);
  const filtered = Object.fromEntries(
    Object.entries(changes ?? {}).filter(([key]) => !protectedKeys.has(key)),
  );
  return {
    ...entity,
    ...filtered,
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: now,
  };
}

function sequenceFromId(value, prefix) {
  const match = new RegExp(`^${prefix}-(\\d{4,})$`).exec(value ?? '');
  if (!match) throw new Error(`Invalid ${prefix.toLowerCase()} id`);
  return Number(match[1]);
}

function validateProject(project) {
  const normalized = createProject(
    {
      name: project?.name,
      description: project?.description ?? '',
      status: project?.status,
      priority: project?.priority,
      favorite: project?.favorite,
    },
    { id: project?.id, now: project?.createdAt },
  );
  normalized.updatedAt = assertIsoTimestamp(project?.updatedAt, 'project.updatedAt');
  return normalized;
}

function validateBug(bug) {
  const normalized = createBug(
    {
      projectId: bug?.projectId,
      title: bug?.title,
      description: bug?.description ?? '',
      status: bug?.status,
      severity: bug?.severity,
      tags: bug?.tags ?? [],
    },
    { sequence: sequenceFromId(bug?.id, 'BUG'), now: bug?.createdAt },
  );
  normalized.updatedAt = assertIsoTimestamp(bug?.updatedAt, 'bug.updatedAt');
  return normalized;
}

function validateIdea(idea) {
  const normalized = createIdea(
    {
      projectId: idea?.projectId,
      title: idea?.title,
      description: idea?.description ?? '',
      status: idea?.status,
      value: idea?.value,
      tags: idea?.tags ?? [],
    },
    { sequence: sequenceFromId(idea?.id, 'IDEA'), now: idea?.createdAt },
  );
  normalized.updatedAt = assertIsoTimestamp(idea?.updatedAt, 'idea.updatedAt');
  return normalized;
}

export function updateEntity(kind, entity, changes, now = new Date().toISOString()) {
  const candidate = touchEntity(entity, changes, now);
  if (kind === 'project') return validateProject(candidate);
  if (kind === 'bug') return validateBug(candidate);
  if (kind === 'idea') return validateIdea(candidate);
  throw new Error(`Unknown entity kind: ${kind}`);
}

function validateSettings(settings = {}) {
  const startView = settings.startView ?? 'dashboard';
  if (!START_VIEW_SET.has(startView)) throw new Error('Invalid start view');
  const includeArchived = settings.includeArchived ?? false;
  return {
    startView,
    includeArchived: assertBoolean(includeArchived, 'includeArchived'),
  };
}

function validateEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('Event must be an object');
  const entityType = assertText(event.entityType ?? '', 'event.entityType', { min: 1, max: 20 });
  if (!['project', 'bug', 'idea', 'system'].includes(entityType)) throw new Error('Invalid event entity type');
  return {
    id: assertId(event.id ?? eventId(), 'event.id'),
    timestamp: assertIsoTimestamp(event.timestamp, 'event.timestamp'),
    entityType,
    entityId: assertId(event.entityId ?? (entityType === 'system' ? 'SYSTEM' : ''), 'event.entityId'),
    projectId: event.projectId == null ? null : assertId(event.projectId, 'event.projectId'),
    kind: assertText(event.kind ?? '', 'event.kind', { min: 1, max: 40 }),
    ...(event.from !== undefined ? { from: structuredClone(event.from) } : {}),
    ...(event.to !== undefined ? { to: structuredClone(event.to) } : {}),
  };
}

function validateMonthlySummary(summary) {
  if (!summary || typeof summary !== 'object') throw new Error('Monthly summary must be an object');
  if (!/^\\d{4}-\\d{2}$/.test(summary.month ?? '')) throw new Error('Invalid summary month');
  const counts = summary.counts ?? {};
  const normalizedCounts = {};
  for (const [key, value] of Object.entries(counts)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid summary count: ${key}`);
    normalizedCounts[key] = value;
  }
  return {
    id: assertId(summary.id, 'summary.id'),
    projectId: summary.projectId == null ? null : assertId(summary.projectId, 'summary.projectId'),
    month: summary.month,
    counts: normalizedCounts,
  };
}

function legacyBugStatus(status) {
  return ({ open: 'new', in_progress: 'active', resolved: 'resolved', rejected: 'rejected' })[status] ?? 'new';
}

function legacyBugSeverity(priority) {
  return priority === 'critical' ? 'critical' : priority === 'low' ? 'minor' : 'major';
}

function legacyIdeaStatus(status) {
  return ({ new: 'new', planned: 'planned', implemented: 'implemented', rejected: 'rejected' })[status] ?? 'new';
}

export function migrateBackupV1(value) {
  if (!value || value.schema !== 'projectlog.backup.v1') throw new Error('Not a v1 backup');
  const exportedAt = assertIsoTimestamp(value.exportedAt, 'exportedAt');
  const projects = (value.data?.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    status: 'active',
    priority: 'normal',
    favorite: false,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
  const bugs = (value.data?.bugs ?? []).map((bug) => ({
    id: bug.id,
    projectId: bug.projectId,
    title: bug.title,
    description: bug.description ?? '',
    status: legacyBugStatus(bug.status),
    severity: legacyBugSeverity(bug.priority),
    tags: [],
    createdAt: bug.createdAt,
    updatedAt: bug.updatedAt,
  }));
  const ideas = (value.data?.ideas ?? []).map((idea) => ({
    id: idea.id,
    projectId: idea.projectId,
    title: idea.title,
    description: idea.description ?? '',
    status: legacyIdeaStatus(idea.status),
    value: 'relevant',
    tags: [],
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  }));
  const migrationEvent = {
    id: eventId('MIG'),
    timestamp: exportedAt,
    entityType: 'system',
    entityId: 'SYSTEM',
    projectId: null,
    kind: 'migration',
    from: 'projectlog.backup.v1',
    to: 'projectlog.backup.v2',
  };
  return validateBackup({
    schema: 'projectlog.backup.v2',
    exportedAt,
    data: {
      projects,
      bugs,
      ideas,
      events: [migrationEvent],
      monthlySummaries: [],
      settings: { startView: 'dashboard', includeArchived: false },
      meta: {
        bugSequence: Number(value.data?.meta?.bugSequence ?? 0),
        ideaSequence: Number(value.data?.meta?.ideaSequence ?? 0),
      },
    },
  });
}

export function buildBackup(data, exportedAt = new Date().toISOString()) {
  return validateBackup({
    schema: 'projectlog.backup.v2',
    exportedAt: assertIsoTimestamp(exportedAt, 'exportedAt'),
    data: structuredClone(data),
  });
}

export function validateBackup(value) {
  if (!value || typeof value !== 'object') throw new Error('Backup must be an object');
  if (value.schema === 'projectlog.backup.v1') return migrateBackupV1(value);
  if (value.schema !== 'projectlog.backup.v2') throw new Error('Unsupported backup schema');

  const exportedAt = assertIsoTimestamp(value.exportedAt, 'exportedAt');
  const projects = (value.data?.projects ?? []).map(validateProject);
  const projectIds = new Set(projects.map((project) => project.id));
  const bugs = (value.data?.bugs ?? []).map(validateBug);
  const ideas = (value.data?.ideas ?? []).map(validateIdea);
  const events = (value.data?.events ?? []).map(validateEvent);
  const monthlySummaries = (value.data?.monthlySummaries ?? []).map(validateMonthlySummary);
  const settings = validateSettings(value.data?.settings ?? {});

  for (const entity of [...bugs, ...ideas]) {
    if (!projectIds.has(entity.projectId)) {
      throw new Error(`${entity.id} references unknown project ${entity.projectId}`);
    }
  }
  for (const event of events) {
    if (event.projectId != null && !projectIds.has(event.projectId)) {
      throw new Error(`${event.id} references unknown project ${event.projectId}`);
    }
  }
  for (const summary of monthlySummaries) {
    if (summary.projectId != null && !projectIds.has(summary.projectId)) {
      throw new Error(`${summary.id} references unknown project ${summary.projectId}`);
    }
  }

  const meta = value.data?.meta ?? {};
  const bugSequence = Number(meta.bugSequence ?? 0);
  const ideaSequence = Number(meta.ideaSequence ?? 0);
  if (!Number.isInteger(bugSequence) || bugSequence < 0) throw new Error('Invalid bug sequence');
  if (!Number.isInteger(ideaSequence) || ideaSequence < 0) throw new Error('Invalid idea sequence');

  const maxBug = bugs.reduce((max, item) => Math.max(max, sequenceFromId(item.id, 'BUG')), 0);
  const maxIdea = ideas.reduce((max, item) => Math.max(max, sequenceFromId(item.id, 'IDEA')), 0);
  if (bugSequence < maxBug || ideaSequence < maxIdea) {
    throw new Error('Backup sequence metadata is behind stored IDs');
  }

  return {
    schema: 'projectlog.backup.v2',
    exportedAt,
    data: {
      projects,
      bugs,
      ideas,
      events,
      monthlySummaries,
      settings,
      meta: { bugSequence, ideaSequence },
    },
  };
}

export function deriveActivity({ projects = [], bugs = [], ideas = [] }) {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const entries = [
    ...projects.map((entity) => ({ entity, type: 'project', projectName: entity.name })),
    ...bugs.map((entity) => ({ entity, type: 'bug', projectName: projectNames.get(entity.projectId) ?? 'Unbekanntes Projekt' })),
    ...ideas.map((entity) => ({ entity, type: 'idea', projectName: projectNames.get(entity.projectId) ?? 'Unbekanntes Projekt' })),
  ];

  return entries
    .map(({ entity, type, projectName }) => ({
      entityId: entity.id,
      entityType: type,
      projectId: type === 'project' ? entity.id : entity.projectId,
      projectName,
      title: type === 'project' ? entity.name : entity.title,
      action: entity.updatedAt === entity.createdAt ? 'created' : 'updated',
      timestamp: entity.updatedAt,
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.entityId.localeCompare(b.entityId));
}
