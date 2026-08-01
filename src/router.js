const ALLOWED_VIEWS = new Set(['overview', 'bugs', 'ideas', 'history']);
const SAFE_PROJECT_ID = /^[A-Za-z0-9._:-]{1,120}$/;

function invalid(message) {
  return { type: 'invalid', message };
}

function cleanProjectId(value) {
  const id = (value ?? '').trim();
  return SAFE_PROJECT_ID.test(id) ? id : '';
}

function cleanTitle(value) {
  const title = (value ?? '').trim();
  if (title.length > 120) return null;
  return title;
}

export function parseLaunchCommand(input) {
  let url;
  try {
    url = new URL(input, 'https://projectlog.local/');
  } catch {
    return invalid('Die Start-URL ist ungültig.');
  }

  const action = (url.searchParams.get('action') ?? '').trim();
  const projectId = cleanProjectId(url.searchParams.get('project'));

  if (!action) {
    if (!projectId) return { type: 'none' };
    const requestedView = url.searchParams.get('view') ?? 'overview';
    return {
      type: 'open-project',
      projectId,
      view: ALLOWED_VIEWS.has(requestedView) ? requestedView : 'overview',
    };
  }

  if (action === 'new-project') return { type: 'new-project' };

  if (action === 'new-bug' || action === 'new-idea') {
    if (!projectId) {
      return invalid(action === 'new-bug'
        ? 'Für einen neuen Bug fehlt das Projekt.'
        : 'Für eine neue Idee fehlt das Projekt.');
    }
    const title = cleanTitle(url.searchParams.get('title'));
    if (title === null) return invalid('Der vorausgefüllte Titel ist zu lang.');
    return {
      type: action,
      projectId,
      title,
    };
  }

  return invalid('Diese URL-Aktion wird nicht unterstützt.');
}
