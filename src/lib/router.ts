// Hash router.
//
// Hash rather than history API because the app is served as static files with
// no server-side rewrite; a deep link to /dashboard would 404, while
// /#/dashboard always lands on index.html. Small enough not to warrant a
// routing dependency: five screens, one optional path parameter.

import { useCallback, useEffect, useState } from 'react';

export function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw || raw === '/') return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function navigate(to: string): void {
  const next = to.startsWith('/') ? to : `/${to}`;
  if (currentPath() === next) return;
  window.location.hash = next;
}

export function useRoute(): { path: string; segments: string[] } {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      // A hash change is a screen change, not a scroll position — without this
      // the new screen opens wherever the previous one was scrolled to.
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return { path, segments: path.split('/').filter(Boolean) };
}

/** `navigate` as a stable callback, for use in event handlers. */
export function useNavigate(): (to: string) => void {
  return useCallback((to: string) => navigate(to), []);
}
