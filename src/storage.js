import { buildBackup, validateBackup } from './domain.js?v=3.2.0';
import { compactEvents, createEntityCreatedEvent, deriveEntityEvents } from './events.js?v=3.2.0';
import { deserializeAttachment, serializeAttachment } from './materials.js?v=3.2.0';

const ENTITY_STORES = new Set(['projects', 'bugs', 'ideas']);
const MATERIAL_STORES = new Set(['inboxItems', 'references', 'attachments']);
const DATA_STORES = new Set([
  'projects', 'bugs', 'ideas', 'inboxItems', 'references', 'attachments', 'events', 'monthlySummaries',
]);
const ALL_STORES = [
  'projects', 'bugs', 'ideas', 'inboxItems', 'references', 'attachments', 'events', 'monthlySummaries', 'meta',
];
const META_DEFAULTS = {
  bugSequence: 0,
  ideaSequence: 0,
  schemaVersion: 3,
  appSettings: { startView: 'projects', includeArchived: false },
};

function assertStore(store) {
  if (!DATA_STORES.has(store)) throw new Error(`Unknown store: ${store}`);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function entityStore(kind) {
  if (kind === 'project') return 'projects';
  if (kind === 'bug') return 'bugs';
  if (kind === 'idea') return 'ideas';
  throw new Error(`Unknown entity kind: ${kind}`);
}

function normalizeSettings(value = {}) {
  const requested = value.startView ?? 'projects';
  const startView = requested === 'dashboard' ? 'projects' : requested;
  if (!['projects', 'inbox'].includes(startView)) throw new Error('Invalid start view');
  const includeArchived = value.includeArchived ?? false;
  if (typeof includeArchived !== 'boolean') throw new Error('includeArchived must be a boolean');
  return { startView, includeArchived };
}

export class MemoryProjectLogDriver {
  constructor() {
    this.stores = Object.fromEntries(ALL_STORES.map((store) => [store, new Map()]));
  }

  async open() {}

  async getAll(store) {
    return [...this.stores[store].values()].map(clone);
  }

  async get(store, key) {
    return clone(this.stores[store].get(key));
  }

  async put(store, value) {
    const key = store === 'meta' ? value.key : value.id;
    this.stores[store].set(key, clone(value));
  }

  async delete(store, key) {
    this.stores[store].delete(key);
  }

  async incrementMeta(key) {
    const current = this.stores.meta.get(key)?.value ?? 0;
    const next = current + 1;
    this.stores.meta.set(key, { key, value: next });
    return next;
  }

  async saveEntity(store, entity, events) {
    this.stores[store].set(entity.id, clone(entity));
    for (const event of events) this.stores.events.set(event.id, clone(event));
  }

  async processInboxItem(inboxId, storeName, entity, events = [], reference = null) {
    if (!this.stores.inboxItems.has(inboxId)) throw new Error('Inbox item not found');
    this.stores.inboxItems.delete(inboxId);
    this.stores[storeName].set(entity.id, clone(entity));
    if (reference) this.stores.references.set(reference.id, clone(reference));
    for (const event of events) this.stores.events.set(event.id, clone(event));
  }

  async replaceHistory(events, summaries) {
    this.stores.events = new Map(events.map((item) => [item.id, clone(item)]));
    this.stores.monthlySummaries = new Map(summaries.map((item) => [item.id, clone(item)]));
  }

  async replaceAll(data) {
    this.stores = {
      projects: new Map((data.projects ?? []).map((item) => [item.id, clone(item)])),
      bugs: new Map((data.bugs ?? []).map((item) => [item.id, clone(item)])),
      ideas: new Map((data.ideas ?? []).map((item) => [item.id, clone(item)])),
      inboxItems: new Map((data.inboxItems ?? []).map((item) => [item.id, clone(item)])),
      references: new Map((data.references ?? []).map((item) => [item.id, clone(item)])),
      attachments: new Map((data.attachments ?? []).map((item) => [item.id, clone(item)])),
      events: new Map((data.events ?? []).map((item) => [item.id, clone(item)])),
      monthlySummaries: new Map((data.monthlySummaries ?? []).map((item) => [item.id, clone(item)])),
      meta: new Map([
        ['bugSequence', { key: 'bugSequence', value: data.meta?.bugSequence ?? 0 }],
        ['ideaSequence', { key: 'ideaSequence', value: data.meta?.ideaSequence ?? 0 }],
        ['schemaVersion', { key: 'schemaVersion', value: 3 }],
        ['appSettings', { key: 'appSettings', value: clone(data.settings ?? META_DEFAULTS.appSettings) }],
      ]),
    };
  }

  async removeProjectCascade(projectId) {
    this.stores.projects.delete(projectId);
    for (const store of ['bugs', 'ideas', 'events', 'monthlySummaries']) {
      for (const [id, entity] of this.stores[store]) {
        if (entity.projectId === projectId) this.stores[store].delete(id);
      }
    }
    for (const [id, reference] of this.stores.references) {
      if (!reference.projectIds.includes(projectId)) continue;
      const remaining = reference.projectIds.filter((idValue) => idValue !== projectId);
      if (remaining.length === 0) this.stores.references.delete(id);
      else this.stores.references.set(id, { ...clone(reference), projectIds: remaining });
    }
  }

  async clearAll() {
    for (const store of Object.values(this.stores)) store.clear();
  }
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function ensureStore(database, name, options, indexes = []) {
  const store = database.objectStoreNames.contains(name)
    ? null
    : database.createObjectStore(name, options);
  if (!store) return;
  for (const [indexName, keyPath, indexOptions = { unique: false }] of indexes) {
    store.createIndex(indexName, keyPath, indexOptions);
  }
}

export class IndexedDBProjectLogDriver {
  constructor({ indexedDB = globalThis.indexedDB, databaseName = 'projectlog-db' } = {}) {
    if (!indexedDB) throw new Error('IndexedDB is not available in this browser');
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.database = null;
  }

  async open() {
    if (this.database) return;
    const request = this.indexedDB.open(this.databaseName, 3);
    request.onupgradeneeded = () => {
      const database = request.result;
      ensureStore(database, 'projects', { keyPath: 'id' }, [['updatedAt', 'updatedAt']]);
      ensureStore(database, 'bugs', { keyPath: 'id' }, [['projectId', 'projectId'], ['updatedAt', 'updatedAt']]);
      ensureStore(database, 'ideas', { keyPath: 'id' }, [['projectId', 'projectId'], ['updatedAt', 'updatedAt']]);
      ensureStore(database, 'inboxItems', { keyPath: 'id' }, [['type', 'type'], ['updatedAt', 'updatedAt'], ['attachmentId', 'attachmentId']]);
      ensureStore(database, 'references', { keyPath: 'id' }, [
        ['type', 'type'], ['updatedAt', 'updatedAt'], ['archived', 'archived'],
        ['projectIds', 'projectIds', { unique: false, multiEntry: true }], ['attachmentId', 'attachmentId'],
      ]);
      ensureStore(database, 'attachments', { keyPath: 'id' }, [['createdAt', 'createdAt']]);
      ensureStore(database, 'events', { keyPath: 'id' }, [['projectId', 'projectId'], ['entityId', 'entityId'], ['timestamp', 'timestamp']]);
      ensureStore(database, 'monthlySummaries', { keyPath: 'id' }, [['projectId', 'projectId'], ['month', 'month']]);
      ensureStore(database, 'meta', { keyPath: 'key' });
    };
    this.database = await requestAsPromise(request);
  }

  store(store, mode = 'readonly') {
    if (!this.database) throw new Error('Database has not been opened');
    return this.database.transaction(store, mode).objectStore(store);
  }

  async getAll(store) {
    return requestAsPromise(this.store(store).getAll());
  }

  async get(store, key) {
    return requestAsPromise(this.store(store).get(key));
  }

  async put(store, value) {
    const transaction = this.database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value);
    await transactionDone(transaction);
  }

  async delete(store, key) {
    const transaction = this.database.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(key);
    await transactionDone(transaction);
  }

  async incrementMeta(key) {
    const transaction = this.database.transaction('meta', 'readwrite');
    const store = transaction.objectStore('meta');
    const current = await requestAsPromise(store.get(key));
    const next = (current?.value ?? 0) + 1;
    store.put({ key, value: next });
    await transactionDone(transaction);
    return next;
  }

  async saveEntity(storeName, entity, events) {
    const transaction = this.database.transaction([storeName, 'events'], 'readwrite');
    transaction.objectStore(storeName).put(entity);
    const eventStore = transaction.objectStore('events');
    for (const event of events) eventStore.put(event);
    await transactionDone(transaction);
  }

  async processInboxItem(inboxId, storeName, entity, events = [], reference = null) {
    const storeNames = [...new Set(['inboxItems', storeName, ...(reference ? ['references'] : []), ...(events.length ? ['events'] : [])])];
    const transaction = this.database.transaction(storeNames, 'readwrite');
    const inboxStore = transaction.objectStore('inboxItems');
    const source = await requestAsPromise(inboxStore.get(inboxId));
    if (!source) {
      transaction.abort();
      throw new Error('Inbox item not found');
    }
    inboxStore.delete(inboxId);
    transaction.objectStore(storeName).put(entity);
    if (reference) transaction.objectStore('references').put(reference);
    if (events.length) {
      const eventStore = transaction.objectStore('events');
      for (const event of events) eventStore.put(event);
    }
    await transactionDone(transaction);
  }

  async replaceHistory(events, summaries) {
    const transaction = this.database.transaction(['events', 'monthlySummaries'], 'readwrite');
    const eventStore = transaction.objectStore('events');
    const summaryStore = transaction.objectStore('monthlySummaries');
    eventStore.clear();
    summaryStore.clear();
    for (const event of events) eventStore.put(event);
    for (const summary of summaries) summaryStore.put(summary);
    await transactionDone(transaction);
  }

  async replaceAll(data) {
    const transaction = this.database.transaction(ALL_STORES, 'readwrite');
    for (const storeName of ALL_STORES) transaction.objectStore(storeName).clear();
    for (const storeName of ['projects', 'bugs', 'ideas', 'inboxItems', 'references', 'attachments', 'events', 'monthlySummaries']) {
      for (const item of data[storeName] ?? []) transaction.objectStore(storeName).put(item);
    }
    transaction.objectStore('meta').put({ key: 'bugSequence', value: data.meta?.bugSequence ?? 0 });
    transaction.objectStore('meta').put({ key: 'ideaSequence', value: data.meta?.ideaSequence ?? 0 });
    transaction.objectStore('meta').put({ key: 'schemaVersion', value: 3 });
    transaction.objectStore('meta').put({ key: 'appSettings', value: data.settings ?? META_DEFAULTS.appSettings });
    await transactionDone(transaction);
  }

  async removeProjectCascade(projectId) {
    const stores = ['projects', 'bugs', 'ideas', 'events', 'monthlySummaries', 'references'];
    const transaction = this.database.transaction(stores, 'readwrite');
    transaction.objectStore('projects').delete(projectId);
    for (const storeName of ['bugs', 'ideas', 'events', 'monthlySummaries']) {
      const index = transaction.objectStore(storeName).index('projectId');
      const keys = await requestAsPromise(index.getAllKeys(projectId));
      for (const key of keys) transaction.objectStore(storeName).delete(key);
    }
    const referenceStore = transaction.objectStore('references');
    const references = await requestAsPromise(referenceStore.index('projectIds').getAll(projectId));
    for (const reference of references) {
      const remaining = reference.projectIds.filter((id) => id !== projectId);
      if (remaining.length === 0) referenceStore.delete(reference.id);
      else referenceStore.put({ ...reference, projectIds: remaining });
    }
    await transactionDone(transaction);
  }

  async clearAll() {
    const transaction = this.database.transaction(ALL_STORES, 'readwrite');
    for (const storeName of ALL_STORES) transaction.objectStore(storeName).clear();
    await transactionDone(transaction);
  }
}

export class ProjectLogRepository {
  constructor({ driver, now = () => new Date().toISOString() } = {}) {
    this.driver = driver ?? new IndexedDBProjectLogDriver();
    this.now = now;
    this.lastSafetyBackup = null;
  }

  async init() {
    await this.driver.open();
    const schemaVersion = await this.driver.get('meta', 'schemaVersion');
    const projects = await this.driver.getAll('projects');
    const bugs = await this.driver.getAll('bugs');
    const ideas = await this.driver.getAll('ideas');
    const requiresLegacyMigration = projects.some((item) => item.status == null || item.priority == null || item.favorite == null)
      || bugs.some((item) => item.severity == null || item.priority != null)
      || ideas.some((item) => item.value == null || item.tags == null);

    if (requiresLegacyMigration) {
      const bugMeta = await this.driver.get('meta', 'bugSequence');
      const ideaMeta = await this.driver.get('meta', 'ideaSequence');
      const migrated = validateBackup({
        schema: 'projectlog.backup.v1',
        exportedAt: this.now(),
        data: {
          projects,
          bugs,
          ideas,
          meta: { bugSequence: bugMeta?.value ?? 0, ideaSequence: ideaMeta?.value ?? 0 },
        },
      });
      await this.driver.replaceAll({ ...migrated.data, attachments: [] });
    } else {
      for (const [key, value] of Object.entries(META_DEFAULTS)) {
        if (!(await this.driver.get('meta', key))) await this.driver.put('meta', { key, value: clone(value) });
      }
      if (schemaVersion?.value !== 3) await this.driver.put('meta', { key: 'schemaVersion', value: 3 });
      const settings = await this.driver.get('meta', 'appSettings');
      if (settings) await this.driver.put('meta', { key: 'appSettings', value: normalizeSettings(settings.value) });
    }
    return this;
  }

  async list(store) {
    assertStore(store);
    return this.driver.getAll(store);
  }

  async get(store, id) {
    assertStore(store);
    return this.driver.get(store, id);
  }

  async put(store, entity) {
    assertStore(store);
    if (!entity?.id) throw new Error('Entity requires an id');
    await this.driver.put(store, entity);
    return entity;
  }

  async remove(store, id) {
    assertStore(store);
    await this.driver.delete(store, id);
  }

  async saveEntity(kind, entity) {
    const store = entityStore(kind);
    const before = await this.driver.get(store, entity.id);
    const events = before
      ? deriveEntityEvents(kind, before, entity)
      : [createEntityCreatedEvent(kind, entity)];
    await this.driver.saveEntity(store, entity, events);
    return entity;
  }

  async deleteEntity(kind, id) {
    await this.driver.delete(entityStore(kind), id);
  }

  async saveInboxItem(item) {
    await this.driver.put('inboxItems', item);
    return item;
  }

  async saveReference(reference) {
    await this.driver.put('references', reference);
    return reference;
  }

  async saveAttachment(attachment) {
    await this.driver.put('attachments', attachment);
    return attachment;
  }

  async getAttachment(id) {
    return this.driver.get('attachments', id);
  }

  async cleanupAttachment(attachmentId) {
    if (!attachmentId) return;
    const inUse = [...await this.driver.getAll('inboxItems'), ...await this.driver.getAll('references')]
      .some((item) => item.attachmentId === attachmentId);
    if (!inUse) await this.driver.delete('attachments', attachmentId);
  }

  async deleteInboxItem(id) {
    const item = await this.driver.get('inboxItems', id);
    await this.driver.delete('inboxItems', id);
    await this.cleanupAttachment(item?.attachmentId);
  }

  async deleteReference(id) {
    const reference = await this.driver.get('references', id);
    await this.driver.delete('references', id);
    await this.cleanupAttachment(reference?.attachmentId);
  }

  async processInboxItem({ inboxId, kind, entity, reference = null }) {
    const source = await this.driver.get('inboxItems', inboxId);
    if (!source) throw new Error('Inbox item not found');
    const store = kind === 'reference' ? 'references' : entityStore(kind);
    const events = kind === 'reference' ? [] : [createEntityCreatedEvent(kind, entity)];
    if (reference && reference.attachmentId !== source.attachmentId) {
      throw new Error('Companion reference must preserve the source attachment');
    }
    await this.driver.processInboxItem(inboxId, store, entity, events, reference);
    return entity;
  }

  async setReferenceProjects(reference) {
    return this.saveReference(reference);
  }

  async listEvents({ projectId, entityId, entityType } = {}) {
    return (await this.driver.getAll('events'))
      .filter((event) => !projectId || event.projectId === projectId)
      .filter((event) => !entityId || event.entityId === entityId)
      .filter((event) => !entityType || event.entityType === entityType)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async listMonthlySummaries(projectId = null) {
    return (await this.driver.getAll('monthlySummaries'))
      .filter((summary) => !projectId || summary.projectId === projectId)
      .sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  }

  async getSettings() {
    const record = await this.driver.get('meta', 'appSettings');
    return normalizeSettings(record?.value ?? META_DEFAULTS.appSettings);
  }

  async saveSettings(changes) {
    const current = await this.getSettings();
    const value = normalizeSettings({ ...current, ...changes });
    await this.driver.put('meta', { key: 'appSettings', value });
    return value;
  }

  async compactHistory(now = new Date()) {
    const result = compactEvents(
      await this.driver.getAll('events'),
      await this.driver.getAll('monthlySummaries'),
      now,
    );
    await this.driver.replaceHistory(result.events, result.monthlySummaries);
    return result;
  }

  async removeProjectCascade(projectId) {
    await this.driver.removeProjectCascade(projectId);
  }

  async nextSequence(kind) {
    const key = kind === 'bug' ? 'bugSequence' : kind === 'idea' ? 'ideaSequence' : null;
    if (!key) throw new Error(`Unknown sequence kind: ${kind}`);
    return this.driver.incrementMeta(key);
  }

  async exportBackup() {
    const [projects, bugs, ideas, inboxItems, references, attachments, events, monthlySummaries, settings, bugMeta, ideaMeta] = await Promise.all([
      this.list('projects'),
      this.list('bugs'),
      this.list('ideas'),
      this.list('inboxItems'),
      this.list('references'),
      this.list('attachments'),
      this.driver.getAll('events'),
      this.driver.getAll('monthlySummaries'),
      this.getSettings(),
      this.driver.get('meta', 'bugSequence'),
      this.driver.get('meta', 'ideaSequence'),
    ]);
    const serializedAttachments = await Promise.all(attachments.map(serializeAttachment));
    return buildBackup({
      projects,
      bugs,
      ideas,
      inboxItems,
      references,
      attachments: serializedAttachments,
      events,
      monthlySummaries,
      settings,
      meta: {
        bugSequence: bugMeta?.value ?? 0,
        ideaSequence: ideaMeta?.value ?? 0,
      },
    }, this.now());
  }

  async importBackup(value) {
    const validated = validateBackup(value);
    this.lastSafetyBackup = await this.exportBackup();
    const attachments = await Promise.all(validated.data.attachments.map(deserializeAttachment));
    await this.driver.replaceAll({ ...validated.data, attachments });
    return validated;
  }

  async clearAll() {
    await this.driver.clearAll();
    await this.init();
  }
}
