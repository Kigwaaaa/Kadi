# Kadi deployment guide

Kadi runs as a Next.js application on Vercel. Supabase provides Postgres and
Realtime broadcasts; Upstash Redis provides distributed rate limits.

## Environment variables

Set these in Vercel's project environment settings. Use separate values for
Preview and Production where appropriate.

| Variable                        | Required | Visibility             | Description                                                                                                                                            |
| ------------------------------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL`          | Yes      | Public                 | Canonical site origin, such as `https://kadi.example.com`. Used for metadata, sitemap, and robots.txt.                                                 |
| `NEXT_PUBLIC_GA_ID`             | No       | Public                 | Google Analytics measurement ID. Analytics loads only in production and only when set.                                                                 |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Public                 | Supabase project URL used by the browser's Realtime client. Its hostname is allowed by the Content Security Policy for `wss:` connections.             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Public                 | Supabase publishable/anon key for subscribing to public Realtime broadcasts. Never put a service-role key here.                                        |
| `SUPABASE_URL`                  | Yes      | **Server-only**        | Supabase project URL used by server-side route handlers and data access. Usually the same URL as `NEXT_PUBLIC_SUPABASE_URL`.                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes      | **Server-only secret** | Service-role key for server-side Supabase access. It bypasses RLS; keep it in Vercel server environment variables and never expose it to browser code. |
| `CRON_SECRET`                   | Yes      | **Server-only secret** | High-entropy secret used to authorize the Vercel cleanup cron route via `Authorization: Bearer <secret>`.                                              |
| `UPSTASH_REDIS_REST_URL`        | Yes      | **Server-only**        | Upstash Redis REST endpoint used by route-handler rate limits.                                                                                         |
| `UPSTASH_REDIS_REST_TOKEN`      | Yes      | **Server-only secret** | Upstash Redis REST token used by route-handler rate limits.                                                                                            |
| `RESEND_API_KEY`                | Yes      | **Server-only secret** | Resend API key used to deliver feedback submissions.                                                                                                   |
| `FEEDBACK_FROM_EMAIL`           | Yes      | **Server-only**        | Verified sender identity in Resend, for example `Kadi <feedback@yourdomain.com>`.                                                                      |
| `FEEDBACK_TO_EMAIL`             | Yes      | **Server-only**        | Inbox that receives feedback; set to `kigwalewis@gmail.com`.                                                                                           |

`NEXT_PUBLIC_` values are compiled into browser code and are not secrets. Never
use that prefix for service-role, cron, or Redis credentials. The workspace
does not require a separate `PORT` variable for Vercel deployment.

For local development, copy `apps/web/.env.example` to
`apps/web/.env.local`, fill in the values, and do not commit the local file.

## Supabase setup

1. Create a Supabase project and configure all four Supabase variables above.
2. Apply the SQL migrations in `apps/web/supabase/migrations/` in order.
3. Keep Row Level Security enabled on `rooms`, `players`, and `chat_messages`.
   The application accesses these tables from server-only code using the
   service-role key; do not add anonymous table policies.
4. Enable Supabase Realtime for Broadcasts. The client subscribes to a channel
   named with the room UUID, and the server publishes only
   `{ type: "changed", version }`. Do not add game state, cards, hands, or chat
   content to these broadcasts.
5. Allow public/anonymous subscription to those broadcast channels. The UUID
   channel name is not an authorization credential; broadcasts contain no
   private room data. All private state remains behind authenticated same-origin
   API routes.

## Upstash setup

Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` in Vercel as server-only variables. The API fails
closed when rate-limit credentials are missing or unavailable.

## Feedback email setup

1. Create a Resend account and verify a domain you control for sending.
2. Create an API key in the Resend dashboard.
3. In Vercel, set `RESEND_API_KEY` to that key and keep it server-only.
4. Set `FEEDBACK_FROM_EMAIL` to a sender on the verified domain, such as
   `Kadi <feedback@yourdomain.com>`.
5. Set `FEEDBACK_TO_EMAIL` to `kigwalewis@gmail.com` (or another inbox you own).
6. Redeploy after setting the variables. Feedback is emailed through Resend and
   archived in Supabase when database access is available. If delivery fails,
   the form displays an error rather than showing a false success.

## Vercel setup

1. Import the repository into Vercel and set the project Root Directory to
   `apps/web`.
2. Use the Next.js framework preset and set the Production and Preview
   environment variables listed above.
3. Deploy. The configured hourly cron in `apps/web/vercel.json` calls
   `/api/cron/cleanup`; Vercel supplies the `CRON_SECRET` bearer authorization
   to scheduled invocations.
4. Configure the production domain in `NEXT_PUBLIC_SITE_URL`. Add the same
   domain to Google Analytics only if analytics is enabled.
5. Verify the deployed response's Content Security Policy includes the
   Supabase Realtime `wss://<project-host>` origin. It is derived from
   `NEXT_PUBLIC_SUPABASE_URL` at build time, so update the public URL and
   redeploy if the Supabase project changes.

## Pre-launch checklist

- Confirm migrations are applied and database RLS is enabled with no public
  table policies.
- Confirm Realtime broadcasts work for anonymous clients and contain only
  the invalidation payload.
- Confirm Upstash limits are active in the deployment environment.
- Confirm the cleanup cron is configured and `CRON_SECRET` is set.
- Run `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm audit`.
- Complete the remaining launch checklist in `docs/LAUNCH.md`.
