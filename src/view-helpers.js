const relativeDateFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short', hour: '2-digit', minute: '2-digit',
});
const shortDateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium', timeStyle: 'short',
});

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unbekannt' : dateTimeFormatter.format(date);
}

export function formatRelative(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unbekannt';
  if (date.toDateString() === now.toDateString()) {
    return `heute, ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `gestern, ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
  }
  const diff = now.getTime() - date.getTime();
  if (diff >= 0 && diff < 7 * 86400000) return relativeDateFormatter.format(date);
  return shortDateFormatter.format(date);
}

export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function optionList(meta, selected) {
  return Object.entries(meta)
    .map(([value, item]) => `<option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
}
