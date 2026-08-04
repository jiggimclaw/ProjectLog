export const projectStatusMeta = Object.freeze({
  planned: { label: 'Geplant', icon: 'calendar' },
  active: { label: 'Aktiv', icon: 'play' },
  paused: { label: 'Pausiert', icon: 'pause' },
  completed: { label: 'Abgeschlossen', icon: 'check-circle' },
  archived: { label: 'Archiviert', icon: 'archive' },
});

export const projectPriorityMeta = Object.freeze({
  low: { label: 'Niedrig', className: 'priority-low' },
  normal: { label: 'Normal', className: 'priority-normal' },
  high: { label: 'Hoch', className: 'priority-high' },
  strategic: { label: 'Strategisch', className: 'priority-strategic' },
});


export const projectIconMeta = Object.freeze({
  folder: { label: 'Ordner', icon: 'folder' },
  bulb: { label: 'Idee', icon: 'bulb' },
  cpu: { label: 'Technik', icon: 'cpu' },
  paintbrush: { label: 'Design', icon: 'paintbrush' },
  sparkles: { label: 'Konzept', icon: 'sparkles' },
  'check-badge': { label: 'Qualität', icon: 'check-badge' },
});

export const projectColorMeta = Object.freeze({
  purple: { label: 'Lila', className: 'project-color-purple' },
  blue: { label: 'Blau', className: 'project-color-blue' },
  teal: { label: 'Türkis', className: 'project-color-teal' },
  green: { label: 'Grün', className: 'project-color-green' },
  orange: { label: 'Orange', className: 'project-color-orange' },
  red: { label: 'Rot', className: 'project-color-red' },
  graphite: { label: 'Graphit', className: 'project-color-graphite' },
});

export const bugStatusMeta = Object.freeze({
  new: { label: 'Neu' },
  review: { label: 'In Prüfung' },
  active: { label: 'In Arbeit' },
  resolved: { label: 'Behoben' },
  rejected: { label: 'Verworfen' },
});

export const bugSeverityMeta = Object.freeze({
  minor: { label: 'Gering', icon: 'severity-minor', className: 'severity-minor' },
  major: { label: 'Wesentlich', icon: 'severity-major', className: 'severity-major' },
  critical: { label: 'Kritisch', icon: 'severity-critical', className: 'severity-critical' },
});

export const ideaStatusMeta = Object.freeze({
  new: { label: 'Neu' },
  reviewed: { label: 'Geprüft' },
  planned: { label: 'Geplant' },
  implemented: { label: 'Umgesetzt' },
  rejected: { label: 'Verworfen' },
});

export const ideaValueMeta = Object.freeze({
  small: { label: 'Klein', icon: 'bulb', className: 'idea-small' },
  relevant: { label: 'Relevant', icon: 'bulb-filled', className: 'idea-relevant' },
  strategic: { label: 'Strategisch', icon: 'flame-filled', className: 'idea-strategic' },
});

export const tagMeta = Object.freeze({
  feature: { label: 'Funktion', icon: 'square-grid' },
  design: { label: 'Design', icon: 'paintbrush' },
  technology: { label: 'Technik', icon: 'cpu' },
  quality: { label: 'Qualität', icon: 'check-badge' },
  documentation: { label: 'Dokumentation', icon: 'document' },
  other: { label: 'Sonstiges', icon: 'tag' },
});

export const healthMeta = Object.freeze({
  neutral: { label: 'Neutral', icon: 'minus-circle', className: 'health-neutral' },
  stable: { label: 'Stabil', icon: 'check-circle', className: 'health-stable' },
  watch: { label: 'Beobachten', icon: 'eye', className: 'health-watch' },
  critical: { label: 'Kritisch', icon: 'warning', className: 'health-critical' },
});
