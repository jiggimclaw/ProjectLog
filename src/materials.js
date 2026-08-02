export const INBOX_ITEM_TYPES = Object.freeze(['note', 'link', 'image', 'file']);
export const REFERENCE_TYPES = INBOX_ITEM_TYPES;
export const ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;

const TYPE_SET = new Set(INBOX_ITEM_TYPES);
const TAG_SET = new Set(['feature', 'design', 'technology', 'quality', 'documentation', 'other']);

function randomId(prefix) {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${raw.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function text(value, field, { min = 0, max = Infinity } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length < min) throw new Error(`${field} is required`);
  if (normalized.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return normalized;
}

function timestamp(value, field) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be an ISO timestamp`);
  return value;
}

function identifier(value, field) {
  return text(value, field, { min: 1, max: 120 });
}

function typeValue(value) {
  if (!TYPE_SET.has(value)) throw new Error('Invalid material type');
  return value;
}

function tags(value = []) {
  if (!Array.isArray(value)) throw new Error('Tags must be an array');
  return [...new Set(value.map((tag) => {
    if (!TAG_SET.has(tag)) throw new Error(`Invalid tag: ${tag}`);
    return tag;
  }))];
}

function projectIds(value = []) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('At least one project is required');
  return [...new Set(value.map((id) => identifier(id, 'Project id')))];
}

function urlValue(value, required) {
  const normalized = text(value ?? '', 'URL', { min: required ? 1 : 0, max: 2000 });
  if (!normalized) return '';
  let parsed;
  try { parsed = new URL(normalized); }
  catch { throw new Error('URL must be valid'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL must use HTTP or HTTPS');
  return parsed.toString();
}

function attachmentIdFor(type, value) {
  if (['image', 'file'].includes(type)) return identifier(value ?? '', 'Attachment id');
  return value == null || value === '' ? null : identifier(value, 'Attachment id');
}

function normalizeBase(input, options, { reference = false } = {}) {
  const now = timestamp(options.now ?? new Date().toISOString(), 'now');
  const type = typeValue(input?.type ?? 'note');
  const title = text(input?.title ?? '', 'Title', { min: 1, max: 160 });
  const body = text(input?.body ?? '', 'Body', { max: 8000 });
  const url = urlValue(input?.url ?? '', type === 'link');
  const attachmentId = attachmentIdFor(type, input?.attachmentId);
  return {
    id: identifier(options.id ?? randomId(reference ? 'REF' : 'INB'), 'Material id'),
    type,
    title,
    body,
    url,
    attachmentId,
    tags: tags(input?.tags ?? []),
    ...(reference ? { projectIds: projectIds(input?.projectIds ?? []), archived: Boolean(input?.archived ?? false) } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function createInboxItem(input, options = {}) {
  return normalizeBase(input, options);
}

export function createReference(input, options = {}) {
  return normalizeBase(input, options, { reference: true });
}

function validateExisting(kind, value) {
  const create = kind === 'inbox' ? createInboxItem : createReference;
  const normalized = create(value, { id: value?.id, now: value?.createdAt });
  normalized.updatedAt = timestamp(value?.updatedAt, `${kind}.updatedAt`);
  return normalized;
}

export function updateMaterial(kind, entity, changes, now = new Date().toISOString()) {
  if (!['inbox', 'reference'].includes(kind)) throw new Error(`Unknown material kind: ${kind}`);
  const candidate = {
    ...entity,
    ...changes,
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: timestamp(now, 'updatedAt'),
  };
  return validateExisting(kind, candidate);
}

export function createAttachment(fileLike, options = {}) {
  const now = timestamp(options.now ?? new Date().toISOString(), 'now');
  const blob = fileLike?.blob;
  if (!(blob instanceof Blob)) throw new Error('Attachment requires a Blob');
  const size = Number(fileLike?.size ?? blob.size);
  if (!Number.isInteger(size) || size < 0) throw new Error('Attachment size is invalid');
  if (size > ATTACHMENT_MAX_BYTES) throw new Error('Attachment is too large');
  if (blob.size !== size) throw new Error('Attachment size does not match Blob');
  return {
    id: identifier(options.id ?? randomId('ATT'), 'Attachment id'),
    name: text(fileLike?.name ?? 'Datei', 'Attachment name', { min: 1, max: 240 }),
    mimeType: text(fileLike?.type ?? blob.type ?? 'application/octet-stream', 'MIME type', { min: 1, max: 160 }),
    size,
    blob,
    createdAt: now,
  };
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function serializeAttachment(attachment) {
  const normalized = createAttachment({
    name: attachment.name,
    type: attachment.mimeType,
    size: attachment.size,
    blob: attachment.blob,
  }, { id: attachment.id, now: attachment.createdAt });
  const bytes = new Uint8Array(await normalized.blob.arrayBuffer());
  return {
    id: normalized.id,
    name: normalized.name,
    mimeType: normalized.mimeType,
    size: normalized.size,
    dataUrl: `data:${normalized.mimeType};base64,${bytesToBase64(bytes)}`,
    createdAt: normalized.createdAt,
  };
}

function validateBackupAttachment(value) {
  const id = identifier(value?.id, 'Attachment id');
  const name = text(value?.name ?? '', 'Attachment name', { min: 1, max: 240 });
  const mimeType = text(value?.mimeType ?? '', 'MIME type', { min: 1, max: 160 });
  const size = Number(value?.size);
  if (!Number.isInteger(size) || size < 0 || size > ATTACHMENT_MAX_BYTES) throw new Error('Attachment size is invalid');
  const dataUrl = text(value?.dataUrl ?? '', 'Attachment data', { min: 1, max: Math.ceil(ATTACHMENT_MAX_BYTES * 1.5) + 512 });
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) throw new Error('Attachment data URL does not match MIME type');
  return { id, name, mimeType, size, dataUrl, createdAt: timestamp(value?.createdAt, 'attachment.createdAt') };
}

export async function deserializeAttachment(value) {
  const normalized = validateBackupAttachment(value);
  const marker = ';base64,';
  const encoded = normalized.dataUrl.slice(normalized.dataUrl.indexOf(marker) + marker.length);
  const bytes = base64ToBytes(encoded);
  const blob = new Blob([bytes], { type: normalized.mimeType });
  if (blob.size !== normalized.size) throw new Error('Attachment backup size does not match data');
  return createAttachment({
    name: normalized.name,
    type: normalized.mimeType,
    size: normalized.size,
    blob,
  }, { id: normalized.id, now: normalized.createdAt });
}

export function validateMaterialBackupData(data = {}, knownProjectIds = new Set()) {
  const attachments = (data.attachments ?? []).map(validateBackupAttachment);
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const inboxItems = (data.inboxItems ?? []).map((item) => validateExisting('inbox', item));
  const references = (data.references ?? []).map((reference) => validateExisting('reference', reference));

  for (const material of [...inboxItems, ...references]) {
    if (material.attachmentId && !attachmentIds.has(material.attachmentId)) {
      throw new Error(`${material.id} references unknown attachment ${material.attachmentId}`);
    }
  }
  for (const reference of references) {
    for (const projectId of reference.projectIds) {
      if (!knownProjectIds.has(projectId)) throw new Error(`${reference.id} references unknown project ${projectId}`);
    }
  }
  return { inboxItems, references, attachments };
}
