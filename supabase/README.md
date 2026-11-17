# Fiesta market editor setup

Project: https://supabase.com/dashboard/project/hcdbvsgjuzcwlnwpgvxc

The project URL and publishable key are configured. No database changes have been applied remotely by Codex.

1. In the project's SQL Editor, run `001-markets.sql`, then `002-seed-markets.sql`. Run the first file only once. The seed file will not overwrite existing edits.
2. In Authentication, disable public user signups. Keep email/password authentication enabled.
3. In Authentication → Users, create the first editor with an email and a strong password using the dashboard's Add user / Create user option. Confirm the email in the dashboard if needed. Your Supabase dashboard/GitHub login is separate from this website account.
4. Copy that user's UUID and run this SQL, replacing the placeholder:

   ```sql
   insert into public.market_editors (user_id)
   values ('REPLACE_WITH_AUTH_USER_UUID')
   on conflict do nothing;
   ```

5. Open `https://omeryilmazlar.github.io/fiesta-gozleme/admin.html` after deployment and sign in with the editor email/password.
6. Verify a draft is absent from the public website, then publish it and check it appears. Verify a non-editor cannot save changes. Remove the test listing when finished.

The database applies row-level access rules. The public key does not grant editing rights. Only the project owner can approve editors through SQL. Never put database passwords, service-role keys, or secret API keys in website files.

The editor keeps its login token only in memory. Refreshing or closing the panel requires another sign-in. An expired session asks you to sign in again. Password recovery can initially be handled by the project owner in Supabase; outgoing reset emails require configuring Supabase email delivery.

Trading times use Europe/London. Individual dated rows disappear at closing time. A listing's optional last display date expires at the following London midnight; repeating weekdays continue until that deadline or until unpublished. All elapsed dated rows leave the listing hidden. The public page refreshes market content every minute and when reopened. Editing published content applies on Save; an unpublished listing is a draft, not a separate staged copy of a published listing.

If Supabase is unavailable, the site keeps its last successfully fetched listings for that page session. On an initial fetch failure it uses the committed original market data, still filtering expired dates. This fallback may be outdated compared with later editor changes. The HTML remains available without JavaScript, but automatic expiry and live updates require JavaScript.

## Website sections and image uploads

Run `003-site-sections.sql` once in the same project's SQL Editor. This adds a separate content table and a public `site-images` storage bucket. It leaves markets and existing editor accounts unchanged. The same approved editors can update section content and upload images; anonymous visitors can only read. Published website images are public, including uploads that have not yet been selected for publication. Do not upload private material.

In the admin panel, choose **Website sections**, then choose the section. Edit text, button labels and destinations, image descriptions, or upload replacement photos. The existing layout and accent styling are preserved. Menu prices and existing gallery photos are editable; adding entirely new layout blocks or changing the number of menu/gallery slots still requires a code change. Instagram posts continue to come from the existing feed updater; only that section's heading/follow button are edited here.

Use the preview to check the selected section, then **Publish changes**. The preview is a script-disabled copy of the site with this section's current form values applied; other sections show their original defaults. Unsaved text changes exist only in this tab. Published changes appear on refresh or within a minute for an open public page. Conflicting saves are rejected rather than overwriting another editor's changes.

Images accept JPG, PNG and WebP up to 5 MB. They are resized to at most 2000 pixels on the longest side and converted to WebP. Trying an image keeps it in browser memory only. Replacing it, reverting to the original, discarding the form, signing out or closing the tab releases that preview without uploading it. Pressing Publish uploads only the selected images, each with a unique filename, before saving their URLs.

Run `004-image-cleanup.sql` once to enable automatic deletion of unused uploads. After a successful publication, the panel rechecks every section and deletes any previous image that is no longer referenced anywhere. Original GitHub images are never deleted. An image used by another section is retained. The Storage delete policy independently prevents removal of referenced images.

Opening Website sections also sweeps unused files older than one hour, including uploads from the previous implementation or interrupted/failed publication attempts. The sweep repeats hourly while the section editor remains open and visible. The one-hour grace period protects uploads that another editor is in the middle of publishing. This is editor-driven cleanup, not an unattended cloud cron: if nobody opens the panel, interrupted uploads remain until the next eligible sweep. Closing a tab during a network request cannot reliably perform cleanup, so this recovery sweep is necessary. Failed cleanup shows a notice and retries on the next editor visit. An already-open visitor page may retain an old image URL until its next refresh (up to one minute).

Only active uploaded images normally remain in Supabase Storage. The database stores URL strings, not image bytes. Saved content is not rolled back if cleanup fails.

The public page falls back to its original HTML when Supabase is unavailable on first load. Section updates are applied in the browser, so social/link-preview crawlers that do not execute JavaScript may see the original copy. The original defaults are in `data/site-content.json`; the live database is the source for published edits.

After setup, verify a harmless text edit and an image upload using the approved account, and confirm them in a signed-out visitor window. Database/storage policy enforcement requires this live verification; local rendering tests do not substitute for it.
