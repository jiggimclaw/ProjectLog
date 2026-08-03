import { icon } from './icons.js?v=4.0.0';
import { tagMeta } from './presentation.js?v=4.0.0';
import { escapeHtml } from './view-helpers.js?v=4.0.0';
import { TAG_VALUES } from './domain.js?v=4.0.0';

function shell({ title, message = '', body = '', footer = '' }) {
  return `
    <div class="sheet-handle" aria-hidden="true"></div>
    <header class="action-sheet-header">
      <h2 id="action-sheet-title">${escapeHtml(title)}</h2>
      ${message ? `<p>${escapeHtml(message)}</p>` : ''}
    </header>
    <div class="action-sheet-body">${body}</div>
    ${footer}`;
}

export function actionSheet({ title, message = '', actions = [] }) {
  const body = `<div class="sheet-action-list">${actions.map((entry) => `
    <button type="button" class="sheet-action ${entry.destructive ? 'sheet-action-danger' : ''}" data-sheet-action="${escapeHtml(entry.action)}" ${entry.value != null ? `data-value="${escapeHtml(String(entry.value))}"` : ''}>
      ${entry.iconName ? `<span class="sheet-action-icon">${icon(entry.iconName)}</span>` : ''}
      <span class="sheet-action-copy"><strong>${escapeHtml(entry.label)}</strong>${entry.detail ? `<span>${escapeHtml(entry.detail)}</span>` : ''}</span>
      ${entry.accessory ? `<span class="sheet-action-accessory">${escapeHtml(entry.accessory)}</span>` : ''}
    </button>`).join('')}</div>`;
  const footer = '<button type="button" class="sheet-cancel" data-sheet-action="cancel">Abbrechen</button>';
  return shell({ title, message, body, footer });
}

export function quickCaptureSheet({ value = '' } = {}) {
  const body = `<form id="sheet-form" class="quick-capture-form" data-purpose="quick-capture">
    <label class="quick-capture-field">
      <span class="visually-hidden">Gedanke, Link oder Notiz</span>
      <textarea name="captureText" maxlength="8000" placeholder="Gedanke, Link oder Notiz …">${escapeHtml(value)}</textarea>
    </label>
    <div class="quick-capture-actions">
      <button type="button" class="quick-capture-action" data-sheet-action="quick-capture-image">${icon('photo')}<span>Foto hinzufügen</span></button>
      <button type="button" class="quick-capture-action" data-sheet-action="quick-capture-file">${icon('paperclip')}<span>Datei hinzufügen</span></button>
    </div>
    <div class="quick-capture-footer">
      <button type="button" class="sheet-secondary" data-sheet-action="cancel">Abbrechen</button>
      <button type="submit" class="sheet-primary">Festhalten</button>
    </div>
  </form>`;
  return shell({ title: 'Festhalten', message: 'Text und Links werden automatisch erkannt.', body });
}

export function projectPickerSheet({ projects, selected = [], multiple = false, purpose = 'reference', title = 'Projekt auswählen' }) {
  const type = multiple ? 'checkbox' : 'radio';
  const body = `<form id="sheet-form" class="sheet-selection-form" data-purpose="${escapeHtml(purpose)}">
    <div class="sheet-option-list">${projects.map((project) => `
      <label class="sheet-option">
        <input type="${type}" name="projectIds" value="${escapeHtml(project.id)}" ${selected.includes(project.id) ? 'checked' : ''}>
        <span class="sheet-option-main"><strong>${escapeHtml(project.name)}</strong></span>
        <span class="sheet-checkmark">${icon('check')}</span>
      </label>`).join('')}</div>
    <button class="sheet-primary" type="submit">Übernehmen</button>
  </form>`;
  const footer = '<button type="button" class="sheet-cancel" data-sheet-action="cancel">Abbrechen</button>';
  return shell({ title, body, footer });
}

export function tagPickerSheet({ selected = [] }) {
  const body = `<form id="sheet-form" class="sheet-selection-form" data-purpose="tags">
    <div class="sheet-option-list">${TAG_VALUES.map((tag) => `
      <label class="sheet-option">
        <input type="checkbox" name="tags" value="${escapeHtml(tag)}" ${selected.includes(tag) ? 'checked' : ''}>
        <span class="sheet-option-main"><strong>${escapeHtml(tagMeta[tag].label)}</strong></span>
        <span class="sheet-checkmark">${icon('check')}</span>
      </label>`).join('')}</div>
    <button class="sheet-primary" type="submit">Übernehmen</button>
  </form>`;
  return shell({ title: 'Tags', body, footer: '<button type="button" class="sheet-cancel" data-sheet-action="cancel">Abbrechen</button>' });
}

export function filterSheet({ title, options, selected }) {
  const body = `<form id="sheet-form" class="sheet-selection-form" data-purpose="filter">
    <div class="sheet-option-list">${options.map((option) => `
      <label class="sheet-option">
        <input type="radio" name="filter" value="${escapeHtml(option.value)}" ${selected === option.value ? 'checked' : ''}>
        <span class="sheet-option-main"><strong>${escapeHtml(option.label)}</strong>${option.detail ? `<span>${escapeHtml(option.detail)}</span>` : ''}</span>
        <span class="sheet-checkmark">${icon('check')}</span>
      </label>`).join('')}</div>
    <button class="sheet-primary" type="submit">Anwenden</button>
  </form>`;
  return shell({ title, body, footer: '<button type="button" class="sheet-cancel" data-sheet-action="cancel">Abbrechen</button>' });
}

export function confirmSheet({ title, message, confirmLabel, action }) {
  return shell({
    title,
    message,
    body: `<div class="sheet-confirm-actions">
      <button type="button" class="sheet-primary sheet-action-danger" data-sheet-action="${escapeHtml(action)}">${escapeHtml(confirmLabel)}</button>
      <button type="button" class="sheet-secondary" data-sheet-action="cancel">Abbrechen</button>
    </div>`,
  });
}
