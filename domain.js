const BUG_STATUSES = new Set(['open', 'in_progress', 'resolved', 'rejected']);
const BUG_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const IDEA_STATUSES = new Set(['new', 'planned', 'implemented', 'rejected']);

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

function defaultProjectId() {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `PRJ-${raw.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export function formatSequenceId(prefix, sequence) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Sequence must be a positive integer');
  }
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export function createProject(input, options = {}) {
  const now = assertIsoTimestamp(options.now ?? new Date().toISOString(), 'now');
  return {
    id: assertId(options.id ?? defaultProjectId(), 'project id'),
    name: assertText(input?.name ?? '', 'Project name', { min: 1, max: 80 }),
    description: assertText(input?.description ?? '', 'Project description', { max: 2000 }),
    createdAt: now,
    updatedAt: now,
  };
}

export function createBug(input, options = {}) {
  const now = assertIsoTimestamp(options.now ?? new Date().toISOString(), 'now');
  const status = input?.status ?? 'open';
  const priority = input?.priority ?? 'medium';
  if (!BUG_STATUSES.has(status)) throw new Error('Invalid bug status');
  if (!BUG_PRIORITIES.has(priority)) throw new Error('Invalid bug priority');

  return {
    id: formatSequenceId('BUG', options.sequence),
    projectId: assertId(input?.projectId ?? '', 'Project id'),
    title: assertText(input?.title ?? '', 'Bug title', { min: 1, max: 120 }),
    description: assertText(input?.description ?? '', 'Bug description', { max: 4000 }),
    status,
    priority,
    createdAt: now,
    updatedAt: now,
  };
}

export function createIdea(input, options = {}) {
  const now = assertIsoTimestamp(options.now ?? new Date().toISOString(), 'now');
  const status = input?.status ?? 'new';
  if (!IDEA_STATUSES.has(status)) throw new Error('Invalid idea status');

  return {
    id: formatSequenceId('IDEA', options.sequence),
    projectId: assertId(input?.projectId ?? '', 'Project id'),
    title: assertText(input?.title ?? '', 'Idea title', { min: 1, max: 120 }),
    description: assertText(input?.description ?? '', 'Idea description', { max: 4000 }),
    status,
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

function validateProject(project) {
  const normalized = createProject(
    { name: project?.name, description: project?.description ?? '' },
    { id: project?.id, now: project?.createdAt },
  );
  normalized.updatedAt = assertIsoTimestamp(project?.updatedAt, 'project.updatedAt');
  return normalized;
}

function sequenceFromId(value, prefix) {
  const match = new RegExp(`^${prefix}-(\\d{4,})$`).exec(value ?? '');
  if (!match) throw new Error(`Invalid ${prefix.toLowerCase()} id`);
  return Number(match[1]);
}

function validateBug(bug) {
  const normalized = createBug(
    {
      projectId: bug?.projectId,
      title: bug?.title,
      description: bug?.description ?? '',
      status: bug?.status,
      priority: bug?.priority,
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
    },
    { sequence: sequenceFromId(idea?.id, 'IDEA'), now: idea?.createdAt },
  );
  normalized.updatedAt = assertIsoTimestamp(idea?.updatedAt, 'idea.updatedAt');
  return normalized;
}

export function buildBackup(data, exportedAt = new Date().toISOString()) {
  const backup = {
    schema: 'projectlog.backup.v1',
    exportedAt: assertIsoTimestamp(exportedAt, 'exportedAt'),
    data: structuredClone(data),
  };
  return validateBackup(backup);
}

export function validateBackup(value) {
  if (!value || typeof value !== 'object') throw new Error('Backup must be an object');
  if (value.schema !== 'projectlog.backup.v1') throw new Error('Unsupported backup schema');
  const exportedAt = assertIsoTimestamp(value.exportedAt, 'exportedAt');
  const projects = (value.data?.projects ?? []).map(validateProject);
  const projectIds = new Set(projects.map((project) => project.id));
  const bugs = (value.data?.bugs ?? []).map(validateBug);
  const ideas = (value.data?.ideas ?? []).map(validateIdea);

  for (const entity of [...bugs, ...ideas]) {
    if (!projectIds.has(entity.projectId)) {
      throw new Error(`${entity.id} references unknown project ${entity.projectId}`);
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
    schema: 'projectlog.backup.v1',
    exportedAt,
    data: {
      projects,
      bugs,
      ideas,
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
