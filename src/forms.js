import { TAG_VALUES } from './domain.js?v=4.3.0';
import {
  bugSeverityMeta,
  bugStatusMeta,
  ideaValueMeta,
  projectColorMeta,
  projectIconMeta,
  projectPriorityMeta,
  projectStatusMeta,
  tagMeta,
} from './presentation.js?v=4.3.0';
import { escapeHtml, optionList } from './view-helpers.js?v=4.3.0';
import { icon } from './icons.js?v=4.3.0';

function labelCopy(label, required) {
  return `${escapeHtml(label)}${required ? '<span class="required-marker" aria-hidden="true">*</span><span class="visually-hidden"> Pflichtfeld</span>' : ''}`;
}

function fieldError(id) {
  return `<span id="${escapeHtml(id)}-error" class="field-error" data-field-error="${escapeHtml(id)}" hidden></span>`;
}

function textField({ id, name, label, value = '', placeholder = '', max = 160, required = false, type = 'text' }) {
  return `<div class="form-field"><label class="form-row text-form-row" for="${escapeHtml(id)}"><span>${labelCopy(label, required)}</span><input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" maxlength="${max}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required aria-required="true"' : ''} aria-describedby="${escapeHtml(id)}-error" autocomplete="off"></label>${fieldError(id)}</div>`;
}

function titleField({ id, name, label, value = '', placeholder = '', max = 160, required = false, type = 'text' }) {
  return `<div class="form-field"><label class="form-block compact-text-block" for="${escapeHtml(id)}"><span>${labelCopy(label, required)}</span><input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" maxlength="${max}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required aria-required="true"' : ''} aria-describedby="${escapeHtml(id)}-error" autocomplete="off"></label>${fieldError(id)}</div>`;
}

function textArea({ id, name, label, value = '', placeholder = '', max = 8000, required = false }) {
  return `<div class="form-field"><label class="form-block" for="${escapeHtml(id)}"><span>${labelCopy(label, required)}</span><textarea id="${escapeHtml(id)}" name="${escapeHtml(name)}" maxlength="${max}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required aria-required="true"' : ''} aria-describedby="${escapeHtml(id)}-error">${escapeHtml(value)}</textarea></label>${fieldError(id)}</div>`;
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

function projectIconRow(selected, color) {
  const meta = projectIconMeta[selected] ?? projectIconMeta.folder;
  const colorMeta = projectColorMeta[color] ?? projectColorMeta.purple;
  return `<button class="form-row navigation-form-row" type="button" data-editor-action="choose-project-icon"><span>Icon</span><span class="form-row-value appearance-value"><span class="project-identity-symbol ${escapeHtml(colorMeta.className)}">${icon(meta.icon)}</span><span>${escapeHtml(meta.label)}</span>${icon('chevron')}</span></button>`;
}

function projectColorRow(selected) {
  const meta = projectColorMeta[selected] ?? projectColorMeta.purple;
  return `<button class="form-row navigation-form-row" type="button" data-editor-action="choose-project-color"><span>Farbe</span><span class="form-row-value appearance-value"><span class="project-color-swatch ${escapeHtml(meta.className)}" aria-hidden="true"></span><span>${escapeHtml(meta.label)}</span>${icon('chevron')}</span></button>`;
}

function ideaValueRow(selected) {
  const meta = ideaValueMeta[selected] ?? ideaValueMeta.relevant;
  return `<button class="form-row navigation-form-row" type="button" data-editor-action="choose-idea-value"><span>Nutzen</span><span class="form-row-value idea-value-accessory"><span class="idea-value-symbol ${escapeHtml(meta.className)}">${icon(meta.icon)}</span><span>${escapeHtml(meta.label)}</span>${icon('chevron')}</span></button>`;
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
    const selectedIcon = editor.projectIcon ?? entity.icon ?? 'folder';
    const selectedColor = editor.projectColor ?? entity.color ?? 'purple';
    return `${titleField({ id: 'field-name', name: 'name', label: 'Name', value: entity.name, max: 80, required: true })}${textArea({ id: 'field-description', name: 'description', label: 'Beschreibung', value: entity.description, placeholder: 'Ziel, Umfang und Kontext', max: 2000 })}<input type="hidden" name="icon" value="${escapeHtml(selectedIcon)}"><input type="hidden" name="color" value="${escapeHtml(selectedColor)}">${grouped(`${projectIconRow(selectedIcon, selectedColor)}${projectColorRow(selectedColor)}${selectRow({ id: 'field-status', name: 'status', label: 'Status', meta: projectStatusMeta, selected: entity.status ?? 'active' })}${selectRow({ id: 'field-priority', name: 'priority', label: 'Priorität', meta: projectPriorityMeta, selected: entity.priority ?? 'normal' })}${favoriteRow(entity.favorite)}`)}`;
  }
  if (editor.type === 'bug') {
    return `${titleField({ id: 'field-title', name: 'title', label: 'Titel', value: entity.title ?? editor.prefill?.title, max: 120, required: true })}${textArea({ id: 'field-description', name: 'description', label: 'Beschreibung', value: entity.description, placeholder: 'Beobachtung, Auswirkung und Reproduktion', max: 4000 })}${grouped(`${selectRow({ id: 'field-status', name: 'status', label: 'Status', meta: bugStatusMeta, selected: entity.status ?? 'new' })}${selectRow({ id: 'field-severity', name: 'severity', label: 'Schweregrad', meta: bugSeverityMeta, selected: entity.severity ?? 'major' })}${tagRow(selectedTags)}`)}`;
  }
  if (editor.type === 'idea') {
    const selectedValue = editor.ideaValue ?? entity.value ?? 'relevant';
    return `${titleField({ id: 'field-title', name: 'title', label: 'Titel', value: entity.title ?? editor.prefill?.title, max: 120, required: true })}${textArea({ id: 'field-description', name: 'description', label: 'Beschreibung', value: entity.description, placeholder: 'Nutzen, Kontext und mögliche Ausgestaltung', max: 4000 })}<input type="hidden" name="value" value="${escapeHtml(selectedValue)}">${grouped(`${ideaValueRow(selectedValue)}${tagRow(selectedTags)}`)}`;
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
