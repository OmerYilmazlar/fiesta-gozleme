import { cp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateFeed } from '../instagram-feed.js';
import { renderFeed } from '../instagram-feed.js';
import { parseHTML } from 'linkedom';

export async function build(root = process.cwd()) {
  const out = join(root, 'dist');
  // Only this known generated directory is removed.
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const file of ['index.html', 'style.css', 'script.js', 'instagram-feed.js', 'markets.js', 'market-data.js', 'supabase-config.js', 'admin.html', 'admin.css', 'admin.js', 'admin-sections.js', 'section-content.js', 'site-content.js', 'staged-images.js', 'image-storage.js', 'admin-accounts.js']) await cp(join(root, file), join(out, file));
  await cp(join(root, 'assets'), join(out, 'assets'), { recursive: true });
  await mkdir(join(out, 'data'));
  await cp(join(root, 'data/markets.json'), join(out, 'data/markets.json'));
  await cp(join(root, 'data/site-content.json'), join(out, 'data/site-content.json'));
  let raw;
  try { raw = await readFile(join(root, 'data/instagram.json'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (raw !== undefined) {
    const feed = JSON.parse(raw);
    const posts = validateFeed(feed);
    for (const post of posts) await access(join(out, post.image));
    await writeFile(join(out, 'data/instagram.json'), JSON.stringify(feed, null, 2) + '\n');
    // Pre-render the same cards so fetching JSON cannot suddenly push the markets down.
    const { document } = parseHTML(await readFile(join(out, 'index.html'), 'utf8'));
    renderFeed(document.querySelector('#instagram'), posts, null, { addEventListener() {} });
    await writeFile(join(out, 'index.html'), document.toString());
  } else {
    // No production feed has ever been fetched. This marker is only in the build output.
    await writeFile(join(out, 'data/instagram.json'), '{"version":1,"posts":[]}\n');
  }
  // An explicit allowlist keeps credentials, fixtures, scripts and backups off Pages.
  try { await cp(join(root, 'CNAME'), join(out, 'CNAME')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(join(out, '.nojekyll'), '');
  console.log('Built static site in dist/ using relative URLs (project/custom-domain compatible).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await build();
