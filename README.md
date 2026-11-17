# Fiesta Gozleme

Live site: https://omeryilmazlar.github.io/fiesta-gozleme/
Repository: https://github.com/OmerYilmazlar/fiesta-gozleme

GitHub Pages deployed successfully on 17 November 2026. The first runner-side Instagram refresh returned HTTP 302, so the existing saved posts were deployed. Daily attempts are enabled at 06:17 UTC; successful automatic refreshes from GitHub remain unverified. No redirect/login bypass was attempted.

Open http://127.0.0.1:8000 while the preview server is running.
To restart from this folder: `python -m http.server 8000 --bind 127.0.0.1`

Technology: static HTML5, CSS, vanilla JavaScript and inline SVG. No React. The Instagram updater and Pages packaging use Node.js; the published site has no server-side runtime.
Original assets recovered from https://fiesta-gozleme-artisan.bronzeloach21.chatgpt.site

## Image inventory
- assets/fiesta-logo.png: header/footer logo, favicon and Apple touch icon
- assets/photo-49.jpg: hero
- assets/photo-01.jpg: menu food photo
- assets/photo-07.jpg: menu branded food photo
- assets/photo-06.jpg: menu cheese-pull photo
- assets/photo-17.jpg: team/story photo
- assets/photo-08.jpg: gallery customer photo
- assets/photo-42.jpg: gallery stall photo
- assets/photo-09.jpg: gallery KERB community photo
- assets/photo-34.jpg: gallery trailer photo
- assets/photo-43.jpg: gallery outdoor lunch photo
- assets/tile.svg: CSS decorative background

The menu icon is inline SVG in index.html and needs no separate download.
style.css and script.js were recovered alongside the images.
index.original.html preserves the supplied file. The local index.html removes the hosting-only ChatGPT Sites widget, whose platform URL is unavailable on localhost.

Validation: the page and all 14 file dependencies return HTTP 200 locally; all 11 raster images decode successfully. Browser visual verification was unavailable because the browser access host could not connect.

## Instagram news and GitHub Pages

**A real, unauthenticated public-page fetch succeeded on 17 November 2026**, saving three real posts and local preview images. GitHub deployment is verified; the first runner-side fetch failed safely with HTTP 302. The daily schedule is enabled. This folder initially had no `.git`, remote, workflow, lockfile or custom domain. There are no invented production announcements. If no saved valid feed exists, the section immediately above the family story shows a compact Instagram profile link.

### Current connection: public HTML (personal account)

Fiesta uses a personal Instagram account. `instagram.config.json` therefore selects `"provider": "public-html"`; this requires **no Meta credentials or GitHub Instagram Secrets**. `scripts/providers/public-instagram.mjs` requests the public profile and its publicly exposed post pages with no login, cookies or private API endpoints. It reads embedded JSON, validates account ownership, obtains each candidate's actual publication timestamp, sorts and selects the newest three. It supports the public image, album and video structures and preserves full captions as returned. Refresh with `npm.cmd run update:instagram`, then `npm.cmd run build`.

This is a **best-effort scraper**, not an official API or a guaranteed complete account feed. Instagram exposes only a subset of posts in signed-out HTML; this provider can establish the newest three within that subset, but cannot prove no newer post has been withheld. Pinned grid positions do not determine ordering. Markup changes, rate limits, login walls or different access from GitHub runner IPs can break it. Redirects/access blocks and incomplete candidate records fail safely; there is no cookie extraction, CAPTCHA bypass, proxy rotation or hidden fallback to older photos. Existing committed posts remain available after failures. Monitor failed daily workflows and manually verify the first GitHub-hosted run.

The previously implemented official provider remains available by changing `provider` to `"meta-facebook"`, after converting to a professional account and completing the optional setup below. The carousel, saved feed format and deployment workflow are shared by both providers.

### How it works

The optional `scripts/providers/meta-facebook.mjs` verifies the account username, exhausts API media pagination (up to 100 pages; fails safely beyond that), sorts by publication timestamp, deduplicates IDs and selects three posts. Pinned profile positions are irrelevant. Both providers reread caption/media data on every run. Neither classifies events, filters hashtags or expires posts. Stories are outside this posts feed.

`scripts/update-instagram.mjs` downloads each required cover from a Meta CDN and fully decodes it with Sharp. It saves a WebP copy without cropping, with a content hash in its filename. Albums use the first image, or the first video's thumbnail for video-only albums. Reels/videos use thumbnails and are never replaced by older photos. Missing required previews fail the entire refresh. Captionless API posts are valid; absent captions become empty strings, while malformed caption values are rejected.

All records and images must validate before the updater atomically replaces `data/instagram.json`. Failed fetches/downloads leave the previous JSON and images intact. Immutable image generations remain in `assets/instagram/` so cached pages and rollbacks still work; storage grows only when images change or new posts arrive. Periodically remove unreferenced old generations if needed, retaining images used by the current and previous deployment. If a post must be removed for rights/privacy reasons, remove its local copies and history as appropriate as well as refreshing the feed.

The workflow commits generated data/assets to the default branch, providing durable storage across runners. It then builds and deploys in the **same workflow**; it does not depend on a bot commit triggering a second workflow. Non-fast-forward pushes or disallowed bot writes stop deployment safely. Overlapping deployments are serialized. Commit the locally fetched `data/instagram.json` and `assets/instagram/` with the initial project upload so the first deployment can retain them even if a runner cannot access Instagram.

`instagram-feed.js` renders captions as plain text, with expandable captions, dates, links and video/album badges. Desktop uses three columns; narrower screens use native touch scrolling with circular Previous/Next arrows, clickable position dots, arrow keys, Home/End, and reduced-motion handling. The native mobile scrollbar is hidden; swiping still works. Cards stretch to equal heights with aligned footer links. No automatic sliding. Cover images use `object-fit: contain` and reserved square space. The build pre-renders saved cards to avoid a large feed-related layout shift; the browser adds interactions. No third-party widget or tracking script is used. Public-page extraction runs in Node, never in visitors' browsers.

### Run locally on Windows

Install Node.js 22 LTS or newer, then run in PowerShell from this folder:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
npm.cmd start
```

Open http://127.0.0.1:8000. If that port is occupied, use `$env:PORT = '8001'` before `npm.cmd start`. Stop the server with Ctrl+C. Rebuild after edits. `dist/` contains only public website files; tests, tools, backups, logs, secrets and configuration are excluded. A `CNAME` file, if supplied, is preserved. All site/feed/media paths are relative, so both `https://owner.github.io/repo/` and a custom-domain root work.

`npm.cmd run update:instagram` is the updater command. With `public-html` it works without credentials when Instagram exposes the public data. With `meta-facebook` it requires Actions Secrets and fails safely if they are missing. Do not put tokens into shell history, `.env` files, the repository, captions, screenshots or chat. Tests use synthetic fixtures and mocked network responses in temporary directories, never production announcements.

### Optional official provider: Meta account authorization

Documentation checked on 17 November 2026. This implementation uses **Instagram API with Facebook Login**, pinned to `v27.0`. The [IG Media reference](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media) documents captions, permalinks, timestamps, image URLs, album children and video thumbnails. Its current caption entry explicitly lists Facebook Login, which is why this provider was selected. No public profile URL alone guarantees API access. The [platform overview](https://developers.facebook.com/documentation/instagram-platform/overview) now recommends Unified Login for new integrations; that is a possible provider replacement if the account cannot use the Page-linked route. It is not silently assumed compatible or enabled here.

Owner setup for the selected route:

1. Use a Business/Creator Instagram account linked to a Facebook Page. The authorizing Facebook user needs admin-equivalent Page access and a role on the Meta app for Standard Access.
2. In Meta for Developers, create/select a Business app, add Instagram, and choose **API setup with Facebook login**. Configure **Facebook Login for Business**. Complete Basic settings (app contact, domain, privacy policy and data-deletion information). For a custom OAuth flow, register its exact HTTPS callback under **Valid OAuth Redirect URIs**; GitHub Pages cannot securely exchange authorization codes. For this single-account setup, use Meta's Graph API Explorer with your own app instead of building a public OAuth page.
3. Authorize `instagram_basic`, `pages_read_engagement`, and `pages_show_list` (the latter is used to discover the linked Page). If the user's Page role was granted through Business Manager, Meta's user/media endpoint requirements additionally allow `ads_management`; request that only for this conditional role setup, or use a directly assigned qualifying Page role. No publishing, comments or messaging permission is requested by this updater.
4. In Graph API Explorer, use your app's User token to query `me/accounts?fields=id,name`, then `{PAGE_ID}?fields=instagram_business_account`. The nested account ID is the required Instagram ID; do not use the Facebook Page ID or username. See Meta's [Facebook Login getting-started guide](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/get-started).
5. Obtain a long-lived **Facebook User access token**, then put it directly in the GitHub Secret below. Use Meta's token tooling/server-side exchange; never run the exchange in website JavaScript. Only republish media the business is permitted to copy.

Standard Access is suitable for an account you own/manage with the required app roles. Serving unrelated accounts requires Advanced Access, App Review and Business Verification; complete the dashboard's applicable requirements before production use. See [access levels](https://developers.facebook.com/documentation/instagram-platform/overview).

### GitHub Secrets and credential renewal

In the chosen repository: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value/source |
| --- | --- |
| `INSTAGRAM_ACCESS_TOKEN` | Long-lived Facebook **User** access token for your Meta app, granted by the account owner with the permissions above. Not an Instagram Login token or app token. |
| `INSTAGRAM_USER_ID` | Numeric `instagram_business_account.id` returned for Fiesta's linked Facebook Page. |

These two Instagram Secrets are **only for the optional `meta-facebook` provider**; leave them unset for `public-html`. The workflow uses GitHub's automatic `GITHUB_TOKEN` for commits and Pages; do not create a personal access token for this workflow. The updater needs no app secret. Keep app secrets used during token issuance in Meta's tooling or a secured server, never frontend code or Actions logs.

Long-lived Facebook User tokens generally last about **60 days**. Inspect the actual expiration in Meta's Access Token Debugger and set an owner reminder before expiry (for example, day 45). Obtain a fresh authorized token, exchange it using Meta's tooling, replace `INSTAGRAM_ACCESS_TOKEN`, and manually refresh. Expired or revoked tokens require reauthorization; daily read requests in this Node workflow do **not** implement automatic token renewal. This is the Facebook token flow, not Instagram Login's `ig_refresh_token` flow. See [Meta's long-lived token guide](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived).

### Enable GitHub Pages

1. Select/create the intended GitHub repository and upload/commit this project to its default branch, including `package-lock.json` and `.github/workflows/pages.yml`. Do not upload `node_modules`, `dist`, credentials, logs or the original HTML backup. This project is now connected to `OmerYilmazlar/fiesta-gozleme` on `main`.
2. Select **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow uses GitHub's supported configure/upload/deploy Pages actions. See [GitHub's Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
3. Ensure Actions is enabled and repository policy permits this workflow's `contents: write` to commit generated files. The default branch rules must allow the bot's feed commits; do not weaken protections without deciding the appropriate rule exception. If direct bot commits are prohibited, adapt the persistence design before enabling refreshes. Permit the default branch in the `github-pages` environment.
4. For `public-html`, no Instagram Secrets are needed. For `meta-facebook`, add the two Secrets above. Push to the default branch or open **Actions → Refresh Instagram and deploy Pages → Run workflow** and select the default branch. Confirm both refresh and deployment succeed. The deployed URL appears in the deployment environment.

Pushes to the actual default branch deploy code (no hardcoded `main` assumption). Other branches are skipped. Manual and daily runs attempt a refresh and only deploy after success. A failed scheduled/manual refresh is a failed workflow and leaves the live deployment untouched. A push still deploys code using the last committed feed if Instagram is unavailable, with a warning in the run summary. Before the first success it deploys the profile-link fallback.

The schedule is **06:17 UTC daily** (`17 6 * * *`). GitHub schedules run from the default branch and can be delayed or dropped under load; public-repository schedules can be disabled after 60 days of repository inactivity. It is not a guaranteed real-time feed. See [GitHub scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

### Maintenance and troubleshooting

- Check the **Refresh Instagram** step and workflow summary first. Messages intentionally omit remote bodies/URLs and token values. HTTP 400/401/403 usually warrants checking token validity, granted scopes, Page roles, account linkage and app access in Meta's tools. HTTP 429 or network errors warrant a later manual retry.
- Account mismatch means the configured ID/token does not resolve to `fiestagozleme`. Fix the Secrets, not the feed JSON.
- Missing thumbnails, invalid JSON/HTML, bad pagination or corrupt images fail the whole refresh. No older photo is substituted for an inaccessible newer video. Retained content remains dated so visitors can judge it.
- If commits fail, check branch rules and token permissions. If deployment fails, check Pages source, environment protections and Actions policy. Retry manually; never force-push generated content.
- Change `postCount` in `instagram.config.json` to change the count. The carousel handles the returned count; desktop remains three columns. Change the cron in `.github/workflows/pages.yml` to change refresh time. Update `apiVersion` deliberately after reviewing Meta's changelog.
- `npm.cmd test` covers chronology/pinned posts, duplicates, one/two/three posts, Unicode/multiline/long captions, albums/videos, edits, invalid responses, failed downloads, atomic preservation, safe URLs, Pages base paths, keyboard/control behavior, caption expansion and existing menu/market/filling interactions. DOM tests simulate scroll geometry; they do not establish real device rendering or touch behavior. Browser verification was stopped by the computer-use tool because it could not determine Chrome's current URL with sufficient confidence.

Acceptance still required: a successful refresh on a GitHub runner and desktop/mobile visual and touch checks against real posts. The signed-out local fetch and Pages deployment have succeeded; runner-side automatic refreshes have not.
