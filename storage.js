import { buildBackup, validateBackup } from './domain.js';

const ENTITY_STORES = new Set(['projects', 'bugs', 'ideas']);
const META_DEFAULTS = { bugSequence: 0, ideaSequence: 0 };

function assertStore(store) {
  if (!ENTITY_STORES.has(store)) throw new Error(`Unknown store: ${store}`);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export class MemoryProjectLogDriver {
  constructor() {
    this.stores = {
      projects: new Map(),
      bugs: new Map(),
      ideas: new Map(),
      meta: new Map(),
    };
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

  async replaceAll(data) {
    const replacement = {
      projects: new Map(data.projects.map((item) => [item.id, clone(item)])),
      bugs: new Map(data.bugs.map((item) => [item.id, clone(item)])),
      ideas: new Map(data.ideas.map((item) => [item.id, clone(item)])),
      meta: new Map([
        ['bugSequence', { key: 'bugSequence', value: data.meta.bugSequence }],
        ['ideaSequence', { key: 'ideaSequence', value: data.meta.ideaSequence }],
      ]),
    };
    this.stores = replacement;
  }

  async removeProjectCascade(projectId) {
    this.stores.projects.delete(projectId);
    for (const store of ['bugs', 'ideas']) {
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

export class IndexedDBProjectLogDriver {
  constructor({ indexedDB = globalThis.indexedDB, databaseName = 'projectlog-db' } = {}) {
    if (!indexedDB) throw new Error('IndexedDB is not available in this browser');
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.database = null;
  }

  async open() {
    if (this.database) return;
    const request = this.indexedDB.open(this.databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of ['projects', 'bugs', 'ideas']) {
        if (!database.objectStoreNames.contains(store)) {
          const objectStore = database.createObjectStore(store, { keyPath: 'id' });
          if (store !== 'projects') objectStore.createIndex('projectId', 'projectId', { unique: false });
          objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      }
      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta', { keyPath: 'key' });
      }
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

  async replaceAll(data) {
    const transaction = this.database.transaction(['projects', 'bugs', 'ideas', 'meta'], 'readwrite');
    for (const storeName of ['projects', 'bugs', 'ideas', 'meta']) {
      transaction.objectStore(storeName).clear();
    }
    for (const project of data.projects) transaction.objectStore('projects').put(project);
    for (const bug of data.bugs) transaction.objectStore('bugs').put(bug);
    for (const idea of data.ideas) transaction.objectStore('ideas').put(idea);
    transaction.objectStore('meta').put({ key: 'bugSequence', value: data.meta.bugSequence });
    transaction.objectStore('meta').put({ key: 'ideaSequence', value: data.meta.ideaSequence });
    await transactionDone(transaction);
  }

  async removeProjectCascade(projectId) {
    const transaction = this.database.transaction(['projects', 'bugs', 'ideas'], 'readwrite');
    transaction.objectStore('projects').delete(projectId);
    for (const storeName of ['bugs', 'ideas']) {
      const index = transaction.objectStore(storeName).index('projectId');
      const keys = await requestAsPromise(index.getAllKeys(projectId));
      for (const key of keys) transaction.objectStore(storeName).delete(key);
    }
    await transactionDone(transaction);
  }

  async clearAll() {
    const transaction = this.database.transaction(['projects', 'bugs', 'ideas', 'meta'], 'readwrite');
    for (const storeName of ['projects', 'bugs', 'ideas', 'meta']) {
      transaction.objectStore(storeName).clear();
    }
    await transactionDone(transaction);
  }
}

export class ProjectLogRepository {
  constructor({ driver, now = () => new Date().toISOString() } = {}) {
    this.driver = driver ?? new IndexedDBProjectLogDriver();
    this.now = now;
  }

  async init() {
    await this.driver.open();
    for (const [key, value] of Object.entries(META_DEFAULTS)) {
      if (!(await this.driver.get('meta', key))) {
        await this.driver.put('meta', { key, value });
      }
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

  async removeProjectCascade(projectId) {
    await this.driver.removeProjectCascade(projectId);
  }

  async nextSequence(kind) {
    const key = kind === 'bug' ? 'bugSequence' : kind === 'idea' ? 'ideaSequence' : null;
    if (!key) throw new Error(`Unknown sequence kind: ${kind}`);
    return this.driver.incrementMeta(key);
  }

  async exportBackup() {
    const [projects, bugs, ideas, bugMeta, ideaMeta] = await Promise.all([
      this.list('projects'),
      this.list('bugs'),
      this.list('ideas'),
      this.driver.get('meta', 'bugSequence'),
      this.driver.get('meta', 'ideaSequence'),
    ]);
    return buildBackup({
      projects,
      bugs,
      ideas,
      meta: {
        bugSequence: bugMeta?.value ?? 0,
        ideaSequence: ideaMeta?.value ?? 0,
      },
    }, this.now());
  }

  async importBackup(value) {
    const validated = validateBackup(value);
    await this.driver.replaceAll(validated.data);
    return validated;
  }

  async clearAll() {
    await this.driver.clearAll();
    await this.init();
  }
}
