import { spawnSync } from 'node:child_process';
import { mkdir, rmdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const remote = 'https://github.com/OmerYilmazlar/fiesta-gozleme.git';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function command(bin, args, cwd, label) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', windowsHide: true,
    timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } });
  if (result.error || result.status !== 0) {
    const detail = label === 'Instagram refresh' ? ` ${result.stderr?.trim().split('\n').at(-1) || ''}` : '';
    throw new Error(`${label} failed (exit ${result.status ?? 'unavailable'}).${detail} Check the log and isolated checkout; no force-push attempted.`);
  }
  return result.stdout.trim();
}

export function feedOnly(paths) {
  return paths.every(path => path === 'data/instagram.json' || /^assets\/instagram\/\d+-[a-f0-9]{24}\.webp$/.test(path));
}

export function publishFeedChanges(repo, git = 'git') {
  const run = args => command(git, args, repo, 'Git ' + args[0]);
  const changed = [...run(['diff', '--name-only', 'HEAD']).split('\n'), ...run(['ls-files', '--others', '--exclude-standard']).split('\n')].filter(Boolean);
  if (!feedOnly(changed)) throw new Error('Refusing to commit files outside the generated Instagram feed.');
  if (changed.length) {
    run(['add', '--', 'data/instagram.json', 'assets/instagram/']);
    const staged = run(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
    if (!feedOnly(staged)) throw new Error('Unexpected staged files; refusing to commit.');
    if (staged.length) run(['commit', '-m', 'Update Instagram posts from local scheduled task']);
  }
  const ahead = Number(run(['rev-list', '--count', 'origin/main..HEAD']));
  if (ahead) {
    const pending = run(['diff', '--name-only', 'origin/main..HEAD']).split('\n').filter(Boolean);
    if (!feedOnly(pending)) throw new Error('Refusing to push pending changes outside the generated feed.');
    run(['push', 'origin', 'HEAD:main']);
  }
  return { changed: changed.length > 0, pushed: ahead > 0 };
}

// Identify the most recent scheduled check in London, including sign-in catch-up.
export function refreshSlot(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`, minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes >= 1260) return `${date}@21:00`;
  if (minutes >= 377) return `${date}@06:17`;
  const previousDate = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return `${previousDate}@21:00`;
}

export function alreadyRefreshed(state, slot) {
  // Preserve the last success when upgrading the old once-daily state format.
  const previous = state.successSlot || (state.completedAt ? refreshSlot(new Date(state.completedAt)) : null);
  return previous === slot;
}

export async function runLocalTask({ force = false } = {}) {
  const stateDir = join(project, '.local-automation');
  const repo = join(stateDir, 'repo');
  const git = process.env.FIESTA_GIT || 'git';
  const npm = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const slot = refreshSlot();
  await mkdir(stateDir, { recursive: true });
  const lock = join(stateDir, 'running.lock');
  try { await mkdir(lock); } catch { throw new Error('Task is already running or a previous interrupted run left running.lock. Inspect before removing it.'); }
  try {
    let state = {};
    try { state = JSON.parse(await readFile(join(stateDir, 'status.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!force && alreadyRefreshed(state, slot)) { console.log('Already refreshed successfully for this scheduled check; no duplicate fetch.'); return; }
    const run = args => command(git, args, repo, 'Git ' + args[0]);
    try { await access(join(repo, '.git')); }
    catch {
      command(git, ['clone', '--branch', 'main', '--single-branch', remote, repo], project, 'Clone automation checkout');
      run(['config', 'user.name', 'Fiesta feed updater']);
      run(['config', 'user.email', '58121818+OmerYilmazlar@users.noreply.github.com']);
    }
    if (run(['remote', 'get-url', 'origin']) !== remote || run(['branch', '--show-current']) !== 'main') throw new Error('Unexpected automation remote or branch.');
    if (run(['status', '--porcelain'])) throw new Error('Isolated checkout has uncommitted changes; inspect it before retrying. Main workspace untouched.');
    run(['fetch', 'origin', 'main']);
    run(['merge', '--ff-only', 'origin/main']);
    // Retry any previous feed-only commit whose push failed before fetching again.
    const recovered = publishFeedChanges(repo, git);
    if (recovered.pushed) console.log('Published a pending feed update from an earlier run.');
    const lockHash = createHash('sha256').update(await readFile(join(repo, 'package-lock.json'))).digest('hex');
    let installed = '';
    try { installed = await readFile(join(stateDir, 'dependencies.sha256'), 'utf8'); await access(join(repo, 'node_modules/sharp')); }
    catch { installed = ''; }
    if (installed !== lockHash) {
      command(process.execPath, [npm, 'ci', '--ignore-scripts'], repo, 'Dependency installation');
      await writeFile(join(stateDir, 'dependencies.sha256'), lockHash);
    }
    console.log(command(process.execPath, ['scripts/update-instagram.mjs'], repo, 'Instagram refresh'));
    command(process.execPath, ['scripts/build.mjs'], repo, 'Static site validation');
    const result = publishFeedChanges(repo, git);
    const nextState = { successSlot: slot, completedAt: new Date().toISOString(), ...result };
    await writeFile(join(stateDir, 'status.next.json'), JSON.stringify(nextState, null, 2));
    await rename(join(stateDir, 'status.next.json'), join(stateDir, 'status.json'));
    console.log(result.pushed ? 'Feed committed and pushed; GitHub Pages deployment triggered.' : 'No feed changes; no new commit needed.');
  } finally { await rmdir(lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runLocalTask({ force: process.argv.includes('--force') }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
