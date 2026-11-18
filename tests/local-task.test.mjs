import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { command, feedOnly, publishFeedChanges, refreshSlot, alreadyRefreshed } from '../scripts/local-instagram-task.mjs';

test('morning and 9 PM checks are distinct, deduplicated and follow London daylight saving', () => {
  const slot = iso => refreshSlot(new Date(iso));
  assert.equal(slot('2026-11-18T06:16:00Z'), '2026-11-17@21:00');
  assert.equal(slot('2026-11-18T06:17:00Z'), '2026-11-18@06:17');
  assert.equal(slot('2026-11-18T12:00:00Z'), '2026-11-18@06:17');
  assert.equal(slot('2026-11-18T20:59:00Z'), '2026-11-18@06:17');
  assert.equal(slot('2026-11-18T21:00:00Z'), '2026-11-18@21:00');
  assert.equal(slot('2026-11-19T01:00:00Z'), '2026-11-18@21:00');
  assert.equal(slot('2026-07-18T20:00:00Z'), '2026-07-18@21:00');
  assert.equal(slot('2026-07-18T05:17:00Z'), '2026-07-18@06:17');
  const legacy = { successDate: '2026-11-18', completedAt: '2026-11-18T12:00:00Z' };
  assert.equal(alreadyRefreshed(legacy, '2026-11-18@06:17'), true);
  assert.equal(alreadyRefreshed(legacy, '2026-11-18@21:00'), false);
  assert.equal(alreadyRefreshed({ successSlot: '2026-11-18@21:00' }, '2026-11-18@21:00'), true);
  assert.equal(alreadyRefreshed({}, '2026-11-18@21:00'), false);
});

test('scheduled publisher commits only changed feed files and pushes without skipping deployment', async t => {
  const root = await mkdtemp(join(tmpdir(), 'fiesta-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const origin = join(root, 'origin.git');
  const repo = join(root, 'repo');
  const git = (args, cwd = repo) => command('git', args, cwd, 'Test git');
  git(['init', '--bare', '--initial-branch=main', origin], root);
  git(['clone', origin, repo], root);
  git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.invalid']);
  await mkdir(join(repo, 'data')); await mkdir(join(repo, 'assets/instagram'), { recursive: true });
  await writeFile(join(repo, 'data/instagram.json'), '{"initial":true}\n');
  await writeFile(join(repo, 'assets/instagram/.gitkeep'), '');
  git(['add', '.']); git(['commit', '-m', 'Fixture initial']); git(['push', '-u', 'origin', 'main']);
  const before = git(['rev-parse', 'HEAD']);
  assert.deepEqual(publishFeedChanges(repo), { changed: false, pushed: false });
  assert.equal(git(['rev-parse', 'HEAD']), before);
  await writeFile(join(repo, 'data/instagram.json'), '{"updated":true}\n');
  assert.deepEqual(publishFeedChanges(repo), { changed: true, pushed: true });
  assert.equal(git(['rev-parse', 'HEAD']), git(['rev-parse', 'main'], origin));
  assert.ok(!git(['log', '-1', '--format=%s']).includes('[skip ci]'));
  await writeFile(join(repo, 'unrelated.txt'), 'do not publish');
  assert.throws(() => publishFeedChanges(repo), /outside/);
  assert.equal(git(['rev-parse', 'HEAD']), git(['rev-parse', 'main'], origin));
});

test('feed allowlist rejects source changes, secrets and path traversal', () => {
  assert.equal(feedOnly(['data/instagram.json', `assets/instagram/123-${'a'.repeat(24)}.webp`]), true);
  for (const path of ['.env', 'index.html', 'assets/instagram/../secret', 'assets/instagram/token.json']) assert.equal(feedOnly([path]), false);
});
