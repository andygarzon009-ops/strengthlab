// The in-app pages visited this tab session, oldest → newest, so a back button
// can tell whether the page it would return to is the one actually behind it
// in history. If it is, a real history back restores that page exactly
// (scroll, tab, ?from=); if not (opened from a push or a link), it navigates
// to the page's parent instead of leaving the app.

const KEY = "sl:nav";
const MAX = 50;

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // Private mode / storage blocked: back buttons fall back to their parent.
  }
}

/// Record a pathname change. Arriving at the page just behind the current one
/// is a back navigation, so pop instead of push.
export function recordNav(path: string) {
  const stack = read();
  if (stack[stack.length - 1] === path) return;
  if (stack[stack.length - 2] === path) stack.pop();
  else stack.push(path);
  write(stack);
}

/// The pathname of the page behind the current one, or null.
export function previousPath(): string | null {
  const stack = read();
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}
