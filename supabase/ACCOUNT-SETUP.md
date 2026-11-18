# Enable owner-only account management

This feature changes Supabase Auth users through an Edge Function. The website never receives an admin credential. It is separate from the Supabase dashboard/GitHub account itself.

Deployment status (18 November 2026): `manage-accounts` is already deployed to the Fiesta project and rejects unauthenticated requests. The database migration still needs to be run in the SQL Editor. Steps 2–4 below are retained for future redeployment; they do not need repeating now.

1. Run `005-account-management.sql` once in this project's SQL Editor. It grants account-management permission only to the existing owner UID `b9168623-38f2-49a4-b835-6fe51ea0d098`. Other editors cannot list accounts or change credentials. Do not use this migration with a different project/owner without updating that explicit UID first.
2. In Supabase → Edge Functions, create a function named **manage-accounts**. Copy the entire contents of `functions/manage-accounts/index.js` into its entry file (the dashboard may name that file `index.ts`; the JavaScript is valid there). Deploy it.
3. Set this function's **Verify JWT with legacy secret** option off. The function itself verifies every bearer token with Supabase Auth, checks the owner permission and current session, and rejects anonymous/non-owner calls. Disabling that legacy gateway check does not make this handler public. CLI deployment uses the supplied `config.toml`:

   ```powershell
   supabase functions deploy manage-accounts --project-ref hcdbvsgjuzcwlnwpgvxc
   ```

4. The hosted function normally uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables with no extra secret setup. If this project has legacy keys disabled, add its secret API key as an Edge Function secret named `FIESTA_AUTH_ADMIN_KEY`; the handler prefers this override. Never paste a secret key into chat, `supabase-config.js`, or frontend files.
5. Refresh the admin panel and sign in. The owner sees **User accounts**. Choose a user, change the email and/or password, and supply the owner's current password to authorise the save. Empty new-password fields keep the existing password. Email changes are applied using the Auth Admin API and `email_confirm: true`; no verification-link flow is used. Optional project-wide security notification emails are separate from verification and are not disabled by this feature.

Changes require a new login by the affected user. Existing sessions are blocked from accessing editor data and storage by restrictive database policies, even if a token has not yet expired or an old session refreshes. The panel checks every 30 seconds and when the tab becomes visible, and returns the affected user to sign-in. Editing your own account immediately returns you to sign-in after success. Accounts keep the same UUID and editing permissions after email changes.

The SQL only reads `auth.sessions`; it does not modify Supabase's internal Auth tables. Session cutoffs are stored in our private schema. If a credential update fails after its initial session cutoff, the affected user may need to sign in using their previous credentials. A network timeout can leave the result uncertain: check the account before retrying. At most five credential-change attempts per owner are accepted in each 15-minute window.

No passwords or bearer tokens are logged or stored by this function. Existing passwords are never shown. The server error responses are deliberately limited to safe messages.

## Verify after deployment

- Use a non-owner editor and confirm the User accounts tab is absent and the endpoint returns 403.
- Using the owner account, change a test editor's email and confirm no verification link is required, its UUID is unchanged, and it can sign in with the new email.
- Change that editor's password and confirm the old password no longer works.
- Keep its panel open in another browser: it should return to sign-in within 30 seconds; old-session writes should fail immediately after the update.
- Check incorrect owner passwords, duplicate emails, and password-policy errors without altering the target's credentials.
- Only after those checks, change the owner's own email/password if desired. Keep Supabase dashboard access available for recovery.

Local mocked tests cover permission checks and request flow; live credential changes and database policy enforcement require the deployed function and migration. No account credentials have been changed by Codex during implementation.
