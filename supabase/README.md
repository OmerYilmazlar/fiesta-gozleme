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

Only the market section is editable in this first version. Other website content and design still use GitHub. The separate Instagram updater is unchanged.
