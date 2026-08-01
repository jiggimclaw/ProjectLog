import { buildBackup, validateBackup } from './domain.js?v=2.1.0';
import { compactEvents, createEntityCreatedEvent, deriveEntityEvents } from './events.js?v=2.1.0';

const ENTITY_STORES = new Set(['projects', 'bugs', 'ideas']);
const DATA_STORES = new Set(['projects', 'bugs', 'ideas', 'events', 'monthlySummaries']);
const ALL_STORES = ['projects', 'bugs', 'ideas', 'events', 'monthlySummaries', 'meta'];
const META_DEFAULTS = {
  bugSequence: 0,
  ideaSequence: 0,
  schemaVersion: 2,
  appSettings: { startView: 'dashboard', includeArchived: false },
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
  const startView = value.startView ?? 'dashboard';
  if (!['dashboard', 'projects'].includes(startView)) throw new Error('Invalid start view');
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

  async replaceHistory(events, summaries) {
    this.stores.events = new Map(events.map((item) => [item.id, clone(item)]));
    this.stores.monthlySummaries = new Map(summaries.map((item) => [item.id, clone(item)]));
  }

  async replaceAll(data) {
    this.stores = {
      projects: new Map(data.projects.map((item) => [item.id, clone(item)])),
      bugs: new Map(data.bugs.map((item) => [item.id, clone(item)])),
      ideas: new Map(data.ideas.map((item) => [item.id, clone(item)])),
      events: new Map((data.events ?? []).map((item) => [item.id, clone(item)])),
      monthlySummaries: new Map((data.monthlySummaries ?? []).map((item) => [item.id, clone(item)])),
      meta: new Map([
        ['bugSequence', { key: 'bugSequence', value: data.meta.bugSequence }],
        ['ideaSequence', { key: 'ideaSequence', value: data.meta.ideaSequence }],
        ['schemaVersion', { key: 'schemaVersion', value: 2 }],
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
  for (const [indexName, keyPath] of indexes) store.createIndex(indexName, keyPath, { unique: false });
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
    const request = this.indexedDB.open(this.databaseName, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      ensureStore(database, 'projects', { keyPath: 'id' }, [['updatedAt', 'updatedAt']]);
      ensureStore(database, 'bugs', { keyPath: 'id' }, [['projectId', 'projectId'], ['updatedAt', 'updatedAt']]);
      ensureStore(database, 'ideas', { keyPath: 'id' }, [['projectId', 'projectId'], ['updatedAt', 'updatedAt']]);
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
    for (const project of data.projects) transaction.objectStore('projects').put(project);
    for (const bug of data.bugs) transaction.objectStore('bugs').put(bug);
    for (const idea of data.ideas) transaction.objectStore('ideas').put(idea);
    for (const event of data.events ?? []) transaction.objectStore('events').put(event);
    for (const summary of data.monthlySummaries ?? []) transaction.objectStore('monthlySummaries').put(summary);
    transaction.objectStore('meta').put({ key: 'bugSequence', value: data.meta.bugSequence });
    transaction.objectStore('meta').put({ key: 'ideaSequence', value: data.meta.ideaSequence });
    transaction.objectStore('meta').put({ key: 'schemaVersion', value: 2 });
    transaction.objectStore('meta').put({ key: 'appSettings', value: data.settings ?? META_DEFAULTS.appSettings });
    await transactionDone(transaction);
  }

  async removeProjectCascade(projectId) {
    const stores = ['projects', 'bugs', 'ideas', 'events', 'monthlySummaries'];
    const transaction = this.database.transaction(stores, 'readwrite');
    transaction.objectStore('projects').delete(projectId);
    for (const storeName of ['bugs', 'ideas', 'events', 'monthlySummaries']) {
      const index = transaction.objectStore(storeName).index('projectId');
      const keys = await requestAsPromise(index.getAllKeys(projectId));
      for (const key of keys) transaction.objectStore(storeName).delete(key);
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
    const requiresMigration = projects.some((item) => item.status == null || item.priority == null || item.favorite == null)
      || bugs.some((item) => item.severity == null || item.priority != null)
      || ideas.some((item) => item.value == null || item.tags == null);

    if (requiresMigration) {
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
      await this.driver.replaceAll(migrated.data);
    } else {
      for (const [key, value] of Object.entries(META_DEFAULTS)) {
        if (!(await this.driver.get('meta', key))) await this.driver.put('meta', { key, value: clone(value) });
      }
      if (schemaVersion?.value !== 2) await this.driver.put('meta', { key: 'schemaVersion', value: 2 });
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
    const [projects, bugs, ideas, events, monthlySummaries, settings, bugMeta, ideaMeta] = await Promise.all([
      this.list('projects'),
      this.list('bugs'),
      this.list('ideas'),
      this.driver.getAll('events'),
      this.driver.getAll('monthlySummaries'),
      this.getSettings(),
      this.driver.get('meta', 'bugSequence'),
      this.driver.get('meta', 'ideaSequence'),
    ]);
    return buildBackup({
      projects,
      bugs,
      ideas,
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
    await this.driver.replaceAll(validated.data);
    return validated;
  }

  async clearAll() {
    await this.driver.clearAll();
    await this.init();
  }
}
