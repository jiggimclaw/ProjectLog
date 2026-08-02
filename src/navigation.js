export const ROOT_VIEWS = Object.freeze(['projects', 'inbox']);

const ROOT_SET = new Set(ROOT_VIEWS);

function frame(name, params = {}) {
  if (typeof name !== 'string' || !name) throw new Error('View name is required');
  return { name, params: structuredClone(params ?? {}) };
}

export function createNavigationState(root = 'projects') {
  if (!ROOT_SET.has(root)) throw new Error('Invalid root view');
  return { stack: [frame(root)] };
}

export function currentView(state) {
  const value = state?.stack?.at(-1);
  if (!value) throw new Error('Navigation stack is empty');
  return value;
}

export function isRootView(state) {
  return state?.stack?.length === 1 && ROOT_SET.has(currentView(state).name);
}

export function pushView(state, name, params = {}) {
  return { stack: [...state.stack, frame(name, params)] };
}

export function popView(state) {
  if (state.stack.length <= 1) return state;
  return { stack: state.stack.slice(0, -1) };
}

export function replaceView(state, name, params = {}) {
  if (!state?.stack?.length) return { stack: [frame(name, params)] };
  return { stack: [...state.stack.slice(0, -1), frame(name, params)] };
}

export function resetRootView(state, root) {
  if (!ROOT_SET.has(root)) throw new Error('Invalid root view');
  return { stack: [frame(root)] };
}
