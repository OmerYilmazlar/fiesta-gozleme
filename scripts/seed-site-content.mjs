import { readFile, writeFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { sections, extractContent, validateContent } from '../section-content.js';
const { document } = parseHTML(await readFile('index.html', 'utf8'));
const defaults = Object.fromEntries(sections.map(s => [s.id, validateContent(s, extractContent(document, s))]));
await writeFile('data/site-content.json', JSON.stringify(defaults, null, 2) + '\n');
