import { TAG_VALUES } from './domain.js?v=3.2.0';
import {
  bugSeverityMeta,
  bugStatusMeta,
  ideaStatusMeta,
  ideaValueMeta,
  projectPriorityMeta,
  projectStatusMeta,
  tagMeta,
} from './presentation.js?v=3.2.0';
import { escapeHtml, optionList } from './view-helpers.js?v=3.2.0';
import { icon } from './icons.js?v=3.2.0';

function textField({ id, name, label, value = '', placeholder = '', max = 160, required = false, type = 'text' }) {
  return `<label class="form-row text-form-row" for="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" maxlength="${max}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} autocomplete="off"></label>`;
}


function titleField({ id, name, label, value = '', placeholder = '', max = 160, required = false, type = 'text' }) {
  return `<label class="form-block compact-text-block" for="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" maxlength="${max}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} autocomplete="off"></label>`;
}

function textArea({ id, name, label, value = '', placeholder = '', max = 8000 }) {
  return `<label class="form-block" for="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><textarea id="${escapeHtml(id)}" name="${escapeHtml(name)}" maxlength="${max}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea></label>`;
}

function selectRow({ id, name, label, meta, selected }) {
  return `<label class="form-row select-form-row" for="${escapeHtml(id)}"><span>${escapeHtml(label)}</span><span class="select-accessory"><select id="${escapeHtml(id)}" name="${escapeHtml(name)}">${optionList(meta, selected)}</select>${icon('chevron')}</span></label>`;
}

function tagSummary(selected) {
  if (!selected.length) return 'Keine';
  return selected.map((tag) => tagMeta[tag]?.label ?? tag).join(', ');
}

function tagRow(selected) {
  return `<button class="form-row navigation-form-row" type="button" data-editor-action="choose-tags"><span>Tags</span><span class="form-row-value">${escapeHtml(tagSummary(selected))}${icon('chevron')}</span></button>`;
}

function grouped(content) {
  return `<div class="form-group">${content}</div>`;
}

function favoriteRow(value) {
  return `<label class="form-row toggle-form-row"><span>Favorit</span><input type="checkbox" name="favorite" ${value ? 'checked' : ''}><span class="switch-control" aria-hidden="true"></span></label>`;
}

export function editorTitle(editor) {
  const editing = Boolean(editor.entity);
  const labels = {
    project: editing ? 'Projekt bearbeiten' : 'Neues Projekt',
    bug: editing ? 'Bug bearbeiten' : 'Neuer Bug',
    idea: editing ? 'Idee bearbeiten' : 'Neue Idee',
    inbox: editing ? 'Eingangseintrag bearbeiten' : editor.materialType === 'link' ? 'Neuer Link' : 'Neue Notiz',
    reference: 'Referenz bearbeiten',
  };
  return labels[editor.type] ?? 'Eintrag';
}

export function renderEditorFields(editor) {
  const entity = { ...(editor.entity ?? {}), ...(editor.draft ?? {}) };
  const selectedTags = editor.tags ?? entity.tags ?? [];
  if (editor.type === 'project') {
    return `${titleField({ id: 'field-name', name: 'name', label: 'Name', value: entity.name, max: 80, required: true })}${textArea({ id: 'field-description', name: 'description', label: 'Beschreibung', value: entity.description, placeholder: 'Ziel, Umfang und Kontext', max: 2000 })}${grouped(`${selectRow({ id: 'field-status', name: 'status', label: 'Status', meta: projectStatusMeta, selected: entity.status ?? 'active' })}${selectRow({ id: 'field-priority', name: 'priority', label: 'Priorität', meta: projectPriorityMeta, selected: entity.priority ?? 'normal' })}${favoriteRow(entity.favorite)}`)}`;
  }
  if (editor.type === 'bug') {
    return `${titleField({ id: 'field-title', name: 'title', label: 'Titel', value: entity.title ?? editor.prefill?.title, max: 120, required: true })}${textArea({ id: 'field-description', name: 'description', label: 'Beschreibung', value: entity.description, placeholder: 'Beobachtung, Auswirkung und Reproduktion', max: 4000 })}${grouped(`${selectRow({ id: 'field-status', name: 'status', label: 'Status', meta: bugStatusMeta, selected: entity.status ?? 'new' })}${selectRow({ id: 'field-severity', name: 'severity', label: 'Schweregrad', meta: bugSeverityMeta, selected: entity.severity ?? 'major' })}${tagRow(selectedTags)}`)}`;
  }
  if (editor.type === 'idea') {
    return `${titleField({ id: 'field-title', name: 'title', label: 'Titel', value: entity.title ?? editor.prefill?.title, max: 120, required: true })}${textArea({ id: 'field-description', name: 'description', label: 'Beschreibung', value: entity.description, placeholder: 'Nutzen, Kontext und mögliche Ausgestaltung', max: 4000 })}${grouped(`${selectRow({ id: 'field-status', name: 'status', label: 'Status', meta: ideaStatusMeta, selected: entity.status ?? 'new' })}${selectRow({ id: 'field-value', name: 'value', label: 'Nutzen', meta: ideaValueMeta, selected: entity.value ?? 'relevant' })}${tagRow(selectedTags)}`)}`;
  }
  if (editor.type === 'inbox') {
    const materialType = entity.type ?? editor.materialType ?? 'note';
    return `<input type="hidden" name="materialType" value="${escapeHtml(materialType)}">${titleField({ id: 'field-title', name: 'title', label: 'Titel', value: entity.title, max: 160, required: true })}${materialType === 'link' ? grouped(textField({ id: 'field-url', name: 'url', label: 'URL', value: entity.url, placeholder: 'https://', max: 2000, required: true, type: 'url' })) : ''}${textArea({ id: 'field-body', name: 'body', label: 'Notiz', value: entity.body, placeholder: materialType === 'link' ? 'Warum ist der Link relevant?' : 'Gedanke oder Konzeptfragment', max: 8000 })}${grouped(tagRow(selectedTags))}`;
  }
  if (editor.type === 'reference') {
    return `${titleField({ id: 'field-title', name: 'title', label: 'Titel', value: entity.title, max: 160, required: true })}${entity.type === 'link' ? grouped(textField({ id: 'field-url', name: 'url', label: 'URL', value: entity.url, max: 2000, required: true, type: 'url' })) : ''}${textArea({ id: 'field-body', name: 'body', label: 'Notiz', value: entity.body, placeholder: 'Kontext zur Referenz', max: 8000 })}${grouped(tagRow(selectedTags))}`;
  }
  return '';
}

export function selectedTagsFromEditor(editor) {
  return (editor.tags ?? []).filter((tag) => TAG_VALUES.includes(tag));
}
