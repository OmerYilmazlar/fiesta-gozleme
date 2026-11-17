import { supabaseUrl } from './supabase-config.js';
export const imagePrefix = `${supabaseUrl}/storage/v1/object/public/site-images/`;
export function storagePath(url) {
  if (typeof url !== 'string' || !url.startsWith(imagePrefix)) return null;
  const path = url.slice(imagePrefix.length);
  return /^[a-z0-9-]+\/[a-z0-9-]+\.webp$/i.test(path) ? path : null;
}
export function referencedImages(rows) {
  return new Set(rows.flatMap(row => Object.values(row.content || {}).map(storagePath).filter(Boolean)));
}
// Re-read every published section immediately before deletion. A matching RLS
// policy also rejects deletion of an image referenced by any section.
export async function cleanupImages(api, candidates) {
  const paths = [...new Set(candidates.map(storagePath).filter(Boolean))];
  if (!paths.length) return { deleted: 0, failed: false };
  try {
    const rows = await api('/rest/v1/site_sections?select=content');
    if (!Array.isArray(rows)) throw Error('Could not verify image usage.');
    const used = referencedImages(rows), unused = paths.filter(path => !used.has(path));
    for (let i = 0; i < unused.length; i += 50) {
      const batch = unused.slice(i, i + 50);
      const deleted = await api('/storage/v1/object/site-images', { method: 'DELETE', body: JSON.stringify({ prefixes: batch }) });
      // Storage may return an empty list when a delete policy has not been installed.
      if (!Array.isArray(deleted) || deleted.length < batch.length) return { deleted: i, failed: true };
    }
    return { deleted: unused.length, failed: false };
  } catch { return { deleted: 0, failed: true }; }
}
// Recover abandoned publication attempts and uploads left by older versions.
// The grace period avoids racing another editor's upload-and-publish operation.
export async function sweepImages(api, folders, now = Date.now()) {
  const candidates = [];
  try {
    for (const prefix of folders) {
      for (let offset = 0; ; offset += 100) {
        const files = await api('/storage/v1/object/list/site-images', { method: 'POST', body: JSON.stringify({ prefix: `${prefix}/`, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }) });
        if (!Array.isArray(files)) throw Error('Could not list images.');
        for (const file of files) {
          if (file.id && Date.parse(file.created_at) <= now - 3600000) candidates.push(`${imagePrefix}${prefix}/${file.name}`);
        }
        if (files.length < 100) break;
      }
    }
  } catch { return { deleted: 0, failed: true }; }
  return cleanupImages(api, candidates);
}
