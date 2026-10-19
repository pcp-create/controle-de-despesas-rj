import { beforeEach, expect, it, vi } from 'vitest';
import { loadEnv } from 'vite';
import config from '../vite.config';

vi.mock('vite', async (original) => ({
  ...await original<typeof import('vite')>(),
  loadEnv: vi.fn(),
}));

let root: Record<string, string>;
let local: Record<string, string>;
beforeEach(() => {
  root = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://destination.supabase.co/',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
  };
  local = {};
  vi.mocked(loadEnv).mockImplementation((_mode, _path, prefix) =>
    prefix === 'NEXT_PUBLIC_' ? root : local);
});

it('uses the panel Supabase URL and public key in the bundle', () => {
  const result = config({ command: 'build', mode: 'production' });
  expect(result.define?.__SUPABASE_URL__).toBe('"https://destination.supabase.co"');
  expect(result.define?.__SUPABASE_KEY__).toBe('"sb_publishable_test"');
});

it('refuses a mobile override pointing to another project', () => {
  local.VITE_SUPABASE_URL = 'https://source.supabase.co';
  expect(() => config({ command: 'build', mode: 'production' })).toThrow('mesmo Supabase');
});

it('refuses secret and service role keys', () => {
  root.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_secret_test';
  expect(() => config({ command: 'build', mode: 'production' })).toThrow('service role');
  const claims = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  root.NEXT_PUBLIC_SUPABASE_ANON_KEY = `header.${claims}.signature`;
  expect(() => config({ command: 'build', mode: 'production' })).toThrow('anon/publicável');
});

it('isolates browser tests from the configured destination', () => {
  const result = config({ command: 'serve', mode: 'e2e' });
  expect(result.define?.__SUPABASE_URL__).toBe('"https://supabase.invalid"');
});

it('never allows E2E settings to bypass missing production configuration', () => {
  root = {};
  expect(() => config({ command: 'build', mode: 'e2e' })).toThrow('Configure');
});
