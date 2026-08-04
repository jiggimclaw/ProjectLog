import { escapeHtml } from '../view-helpers.js?v=4.3.0';

const PRIORITIES = new Set(['low', 'normal', 'high', 'strategic']);

export function projectSpine(priority = 'normal', className = '') {
  const value = PRIORITIES.has(priority) ? priority : 'normal';
  return `<span class="project-spine priority-${escapeHtml(value)} ${escapeHtml(className)}" aria-hidden="true"></span>`;
}

export function groupedList(content, className = '') {
  return `<div class="grouped-list ${escapeHtml(className)}">${content}</div>`;
}

export function toolbarCluster(content, className = '') {
  if (!content) return '';
  return `<div class="toolbar-actions toolbar-cluster ${escapeHtml(className)}">${content}</div>`;
}
