import { escapeHtml } from './view-helpers.js?v=2.1.0';

const fullDateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});

function linePath(values, width, height, padding, maxValue) {
  if (!values.length) return '';
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  return values.map((value, index) => {
    const x = padding.left + (values.length === 1 ? usableWidth / 2 : (index / (values.length - 1)) * usableWidth);
    const y = padding.top + usableHeight - (value / maxValue) * usableHeight;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function axisTicks(maxValue) {
  const midpoint = Math.ceil(maxValue / 2);
  return [...new Set([0, midpoint, maxValue])].sort((a, b) => a - b);
}

function summarySentence(point) {
  const date = fullDateFormatter.format(new Date(`${point.date}T00:00:00.000Z`));
  const bugs = `${point.openBugs} ${point.openBugs === 1 ? 'offener Bug' : 'offene Bugs'}`;
  const ideas = `${point.implementedIdeas} ${point.implementedIdeas === 1 ? 'umgesetzte Idee' : 'umgesetzte Ideen'}`;
  return `Am ${date}: ${bugs} und ${ideas}.`;
}

export function renderTrendChart(series = []) {
  if (!series.length) {
    return `<section class="chart-empty" aria-label="30-Tage-Entwicklung"><h3>30-Tage-Entwicklung</h3><p>Noch keine Verlaufsdaten. Der Verlauf beginnt mit den nächsten relevanten Änderungen.</p></section>`;
  }

  const width = 360;
  const height = 176;
  const padding = { top: 18, right: 12, bottom: 28, left: 30 };
  const maximum = Math.max(1, ...series.flatMap((point) => [point.openBugs, point.implementedIdeas]));
  const bugPath = linePath(series.map((point) => point.openBugs), width, height, padding, maximum);
  const ideaPath = linePath(series.map((point) => point.implementedIdeas), width, height, padding, maximum);
  const last = series.at(-1);
  const first = series[0];
  const summary = summarySentence(last);
  const hiddenDetails = series.map(summarySentence).join(' ');
  const usableHeight = height - padding.top - padding.bottom;
  const ticks = axisTicks(maximum);

  return `
    <figure class="trend-chart" aria-labelledby="trend-title" aria-describedby="trend-summary trend-details">
      <figcaption class="chart-heading">
        <div>
          <h3 id="trend-title">30-Tage-Entwicklung</h3>
          <p id="trend-summary">${escapeHtml(summary)}</p>
        </div>
        <div class="chart-legend" aria-label="Legende">
          <span><i class="legend-line legend-bugs"></i>Offene Bugs</span>
          <span><i class="legend-line legend-ideas"></i>Umgesetzte Ideen</span>
        </div>
      </figcaption>
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Linienchart für offene Bugs und umgesetzte Ideen">
        ${ticks.map((tick) => {
          const y = padding.top + usableHeight - (tick / maximum) * usableHeight;
          return `<g class="chart-grid"><line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line><text x="${padding.left - 8}" y="${(y + 4).toFixed(2)}">${tick}</text></g>`;
        }).join('')}
        <path class="chart-line chart-line-bugs" d="${bugPath}"></path>
        <path class="chart-line chart-line-ideas" d="${ideaPath}"></path>
        <text class="chart-date" x="${padding.left}" y="${height - 6}">${escapeHtml(first.date.slice(5).replace('-', '.'))}</text>
        <text class="chart-date" text-anchor="end" x="${width - padding.right}" y="${height - 6}">${escapeHtml(last.date.slice(5).replace('-', '.'))}</text>
      </svg>
      <p id="trend-details" class="visually-hidden">${escapeHtml(hiddenDetails)}</p>
    </figure>`;
}
