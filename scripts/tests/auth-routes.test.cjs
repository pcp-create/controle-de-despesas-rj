const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');

function route(name, client) {
  const source = readFileSync(resolve(__dirname, '../../app/api', name, 'route.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, console,
    process: { env: {} }, // No service role or environment credentials available.
    require(name) {
      if (name === 'next/server') return { NextResponse };
      if (name === '@supabase/supabase-js') return { createClient() { throw new Error('Administrative client must not be used'); } };
      if (name === '@/lib/supabase/server') return { createClient: async () => client };
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return exports;
}
function client({ user = { id: 'owner' }, profile = { id: 'owner', email: 'test@example.invalid', ativo: true }, authError = null } = {}) {
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    async single() { return { data: profile, error: profile ? null : { code: 'PGRST116' } }; },
  };
  return {
    calls,
    from(table) { calls.push(['from', table]); return query; },
    auth: {
      async getUser() { return { data: { user }, error: null }; },
      async signInWithPassword(credentials) {
        calls.push(['signIn', credentials.email, credentials.password]);
        return { data: { user, session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: authError };
      },
    },
  };
}
const request = (body) => ({ json: async () => body });

test('profile uses the authenticated user ID without an administrative key', async () => {
  const c = client();
  const res = await route('get-profile', c).GET();
  assert.equal(res.status, 200);
  assert.deepEqual(c.calls.find(c => c[0] === 'eq'), ['eq', 'id', 'owner']);
  assert.equal((await res.json()).profile.id, 'owner');
});
test('unauthenticated requests do not query profiles', async () => {
  const c = client({ user: null });
  assert.equal((await route('get-profile', c).GET()).status, 401);
  assert.equal(c.calls.length, 0);
});
test('a missing profile returns 404', async () => {
  assert.equal((await route('get-profile', client({ profile: null })).GET()).status, 404);
});
test('login resolves username and authenticates without an administrative key', async () => {
  const c = client();
  const res = await route('login', c).POST(request({ usuario: ' Teste ', senha: 'test-password' }));
  assert.equal(res.status, 200);
  assert.deepEqual(c.calls.find(c => c[0] === 'eq'), ['eq', 'usuario', 'teste']);
  assert.deepEqual(c.calls.find(c => c[0] === 'signIn'), ['signIn', 'test@example.invalid', 'test-password']);
});
test('inactive profiles cannot sign in', async () => {
  const c = client({ profile: { email: 'test@example.invalid', ativo: false } });
  assert.equal((await route('login', c).POST(request({ usuario: 'teste', senha: 'test' }))).status, 403);
  assert.equal(c.calls.some(c => c[0] === 'signIn'), false);
});
test('invalid passwords remain unauthorized', async () => {
  const c = client({ authError: { message: 'Invalid login credentials' } });
  assert.equal((await route('login', c).POST(request({ usuario: 'teste', senha: 'wrong' }))).status, 401);
});

function fleetClient({ user = { id: 'owner' }, error = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table) {
      calls.push(table);
      return { select: () => ({ order: async () => ({ data: error ? null : [{ id: 'fleet-1', placa: 'TEST123' }], error }) }) };
    },
  };
}
test('fleets use the authenticated session without a service key', async () => {
  const c = fleetClient();
  const res = await route('frotas', c).GET();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data[0].id, 'fleet-1');
  assert.deepEqual(c.calls, ['frotas']);
});
test('fleets reject unauthenticated requests before querying', async () => {
  const c = fleetClient({ user: null });
  assert.equal((await route('frotas', c).GET()).status, 401);
  assert.equal(c.calls.length, 0);
});
test('fleet query failures are reported instead of an empty list', async () => {
  const res = await route('frotas', fleetClient({ error: { message: 'Query failed' } })).GET();
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'Query failed');
});
