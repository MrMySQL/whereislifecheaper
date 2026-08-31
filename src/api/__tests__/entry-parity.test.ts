import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * `api/index.ts` (the Vercel serverless entry) and `src/api/server.ts` (the
 * local/long-running entry) each build their own Express app and register
 * routes by hand. They drift silently: the rent feature was mounted only in
 * server.ts, so `/api/rent` 404'd in production for three months while every
 * test and every local run passed. `/sitemap.xml` had drifted the same way.
 *
 * This locks two invariants:
 *   1. every route registered by one entry point is registered by the other,
 *      with the same method - `/api` prefixes and root paths alike;
 *   2. no `/api` route is registered after the `/api/*` catch-all, where it
 *      would be unreachable.
 *
 * The routes are read out of the source rather than off a running app:
 * importing server.ts starts a listener, and Express does not expose mount
 * paths in a form that survives a version bump. The reading is done with the
 * TypeScript parser rather than a regex, so a commented-out mount does not
 * count as a mount and a URL inside a string is never mistaken for one.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const ENTRIES = ['api/index.ts', 'src/api/server.ts'] as const;

const ROUTE_METHODS = new Set(['use', 'get', 'post', 'put', 'patch', 'delete', 'all']);

/**
 * Routes that legitimately live in one entry only. Anything not listed here
 * must exist in both.
 */
const ENTRY_SPECIFIC: Record<string, string[]> = {
  'api/index.ts': [],
  // Vercel serves the built SPA and its assets straight from outputDirectory
  // via the `/((?!api/).*)` rewrite, so only the long-running server needs its
  // own static handler and SPA fallback.
  //
  // `/health` for the same reason: that rewrite claims every non-`/api/` path
  // before the function is invoked, so a root-level `/health` mounted in
  // api/index.ts is unreachable in production. The function answers
  // `/api/health`; the long-running server answers both.
  'src/api/server.ts': ['*', '/health'],
};

interface Registration {
  /** `use`, `get`, `post`, ... - a path registered with a different verb in
   * each entry does not behave the same way, so the method is part of the key. */
  method: string;
  /** The mount path, or null for middleware registered without one. */
  path: string | null;
  /** True when the first argument is a path the parser cannot resolve. */
  unreadable: boolean;
  text: string;
  pos: number;
}

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

/**
 * Every `<object>.<method>(...)` route registration in a file, in source order.
 *
 * `objectName` is 'app' for the entry points and 'router' for a route module -
 * the sitemap invariant below needs the same parser rather than a regex, for
 * the same reason the entries do.
 */
function registrations(relPath: string, objectName = 'app'): Registration[] {
  const src = read(relPath);
  const sourceFile = ts.createSourceFile(relPath, src, ts.ScriptTarget.Latest, true);
  const found: Registration[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === objectName &&
      ROUTE_METHODS.has(node.expression.name.text)
    ) {
      const [first] = node.arguments;
      const method = node.expression.name.text;
      const text = node.getText().split('\n')[0];
      const at = { method, text, pos: node.getStart(sourceFile) };
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
        found.push({ ...at, path: first.text, unreadable: false });
      } else if (
        first &&
        (ts.isCallExpression(first) ||
          ts.isArrowFunction(first) ||
          ts.isFunctionExpression(first))
      ) {
        // Middleware with no mount path: app.use(cors(...)), app.use((err, …) => …)
        found.push({ ...at, path: null, unreadable: false });
      } else {
        // An array of paths, a template with substitutions, a variable - the
        // path cannot be compared, so flag it rather than skip it silently.
        found.push({ ...at, path: null, unreadable: true });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return found;
}

/**
 * The comparable routes of an entry, as `<method> <path>`.
 *
 * The method is in the key because `app.get('/api/foo')` and
 * `app.use('/api/foo')` are not the same route: a POST that the long-running
 * server handles would 404 in production if the function mounted the path with
 * `.get`. Comparing paths alone would call that pair parity.
 */
function routeSet(relPath: string): string[] {
  const specific = ENTRY_SPECIFIC[relPath] ?? [];
  const keys = registrations(relPath)
    .filter((r) => r.path !== null && !specific.includes(r.path))
    .map((r) => `${r.method} ${r.path}`);
  return [...new Set(keys)].sort();
}

describe('API entry point parity', () => {
  test.each(ENTRIES)('%s registers routes this guard can read', (relPath) => {
    // If this fails, a route was registered in a form the reader cannot resolve
    // to a path - teach it that form rather than deleting the case, or the
    // parity check below silently stops covering that route.
    expect(registrations(relPath).filter((r) => r.unreadable).map((r) => r.text)).toEqual([]);
  });

  test('both entry points register the same routes', () => {
    expect(routeSet('api/index.ts')).toEqual(routeSet('src/api/server.ts'));
  });

  test.each(ENTRIES)('%s registers the /api/* 404 handler last', (relPath) => {
    const regs = registrations(relPath);
    const notFound = regs.find((r) => r.path === '/api/*');
    expect(notFound).toBeDefined();

    // A route mounted after the catch-all is unreachable - it 404s instead.
    const after = regs.filter(
      (r) => r.path?.startsWith('/api/') && r.path !== '/api/*' && r.pos > notFound!.pos,
    );
    expect(after.map((r) => r.path)).toEqual([]);
  });
});

/**
 * Mounting a root-level route in the function is only half the fix: Vercel's
 * `/((?!api/).*)` rewrite hands the request to the SPA shell before the
 * function is ever invoked, unless a more specific rewrite claims the path
 * first. That is what kept `/sitemap.xml` serving text/html.
 */
describe('vercel.json routing', () => {
  const vercel = JSON.parse(read('vercel.json')) as {
    rewrites: { source: string; destination: string }[];
  };

  test('/api/(.*) reaches the function', () => {
    expect(vercel.rewrites).toContainEqual({ source: '/api/(.*)', destination: '/api' });
  });

  // Every path the sitemap router serves; it is mounted at '/', so these are
  // root paths that the SPA rewrite would otherwise claim.
  const sitemapRoutes = registrations('src/api/routes/sitemap.ts', 'router');
  const sitemapPaths = [...new Set(sitemapRoutes.map((r) => r.path))].filter(
    (p): p is string => p !== null,
  );

  test('every path the sitemap router serves can be read', () => {
    // Read with the parser, not a regex, and asserted non-empty: `test.each([])`
    // generates no tests and passes silently, so a route the reader cannot
    // resolve - a double-quoted path, a variable, a loop - would quietly drop
    // out of the check below instead of failing. That is the same silent drift
    // this file exists to catch.
    expect(sitemapRoutes.filter((r) => r.unreadable).map((r) => r.text)).toEqual([]);
    expect(sitemapPaths.length).toBeGreaterThan(0);
  });

  test.each(sitemapPaths)('%s is not swallowed by the SPA rewrite', (routePath) => {
    const rewrittenToFunction = vercel.rewrites.some(
      (r) => r.source === routePath && r.destination === '/api',
    );
    // A file present in the build output beats any rewrite, so it needs none
    // (robots.txt ships as a static asset).
    const servedStatically = fs.existsSync(path.join(ROOT, 'frontend', 'public', routePath));
    expect(rewrittenToFunction || servedStatically).toBe(true);
  });

  test('the SPA catch-all is the last rewrite', () => {
    const spaFallbackAt = vercel.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(spaFallbackAt).toBe(vercel.rewrites.length - 1);
  });
});
