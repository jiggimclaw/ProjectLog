function defaultEventId() {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `EVT-${raw.replaceAll('-', '').slice(0, 16).toUpperCase()}`;
}

function eventBase(kind, entity, timestamp, idFactory = defaultEventId) {
  return {
    id: idFactory(),
    timestamp,
    entityType: kind,
    entityId: entity.id,
    projectId: kind === 'project' ? entity.id : entity.projectId,
  };
}

export function createEntityCreatedEvent(kind, entity, options = {}) {
  const base = eventBase(kind, entity, entity.createdAt, () => options.id ?? defaultEventId());
  const to = kind === 'project'
    ? { status: entity.status, priority: entity.priority, favorite: entity.favorite }
    : kind === 'bug'
      ? { status: entity.status, severity: entity.severity, tags: [...entity.tags] }
      : { status: entity.status, value: entity.value, tags: [...entity.tags] };
  return { ...base, kind: 'created', to };
}

function scalarEvent(kind, before, after, field, timestamp, idFactory) {
  if (before[field] === after[field]) return null;
  return {
    ...eventBase(kind, after, timestamp, idFactory),
    kind: field,
    from: before[field],
    to: after[field],
  };
}

function tagEvents(kind, before, after, timestamp, idFactory) {
  const beforeTags = new Set(before.tags ?? []);
  const afterTags = new Set(after.tags ?? []);
  const removed = [...beforeTags].filter((tag) => !afterTags.has(tag)).sort();
  const added = [...afterTags].filter((tag) => !beforeTags.has(tag)).sort();
  return [
    ...removed.map((tag) => ({
      ...eventBase(kind, after, timestamp, idFactory), kind: 'tag_removed', from: tag,
    })),
    ...added.map((tag) => ({
      ...eventBase(kind, after, timestamp, idFactory), kind: 'tag_added', to: tag,
    })),
  ];
}

export function deriveEntityEvents(kind, before, after, options = {}) {
  if (!before || !after) throw new Error('Both before and after entities are required');
  const timestamp = after.updatedAt;
  const idFactory = options.idFactory ?? defaultEventId;
  const fields = kind === 'project'
    ? ['status', 'priority', 'favorite']
    : kind === 'bug'
      ? ['status', 'severity']
      : kind === 'idea'
        ? ['status', 'value']
        : null;
  if (!fields) throw new Error(`Unknown entity kind: ${kind}`);
  const events = fields
    .map((field) => scalarEvent(kind, before, after, field, timestamp, idFactory))
    .filter(Boolean);
  if (kind !== 'project') events.push(...tagEvents(kind, before, after, timestamp, idFactory));
  return events;
}

function summaryContribution(event) {
  const counts = { [event.kind]: 1 };
  if (event.entityType === 'bug' && event.kind === 'status' && event.to === 'resolved') counts.bugResolved = 1;
  if (event.entityType === 'idea' && event.kind === 'status' && event.to === 'implemented') counts.ideaImplemented = 1;
  return counts;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
}

export function compactEvents(events, monthlySummaries = [], now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
  const recent = [];
  const buckets = new Map();

  for (const summary of monthlySummaries) {
    buckets.set(summary.id, structuredClone(summary));
  }

  for (const event of events) {
    if (new Date(event.timestamp) >= cutoff) {
      recent.push(structuredClone(event));
      continue;
    }
    const month = event.timestamp.slice(0, 7);
    const projectId = event.projectId ?? null;
    const projectKey = projectId ?? 'GLOBAL';
    const id = `SUM-${projectKey}-${month}`;
    const summary = buckets.get(id) ?? { id, projectId, month, counts: {} };
    mergeCounts(summary.counts, summaryContribution(event));
    buckets.set(id, summary);
  }

  return {
    events: recent.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    monthlySummaries: [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id)),
  };
}
