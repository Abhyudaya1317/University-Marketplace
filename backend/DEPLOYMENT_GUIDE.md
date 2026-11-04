# CampusX Backend Deployment Guide

## Deployment status

The backend is prepared for a Vercel Node.js function and Supabase PostgreSQL configuration. No Supabase database was contacted, and no production migrations or deployment were run.

The backend currently stores listing photos, profile photos, and private message attachments on local disk. Vercel function filesystems are not durable, and Express static files are not served by Vercel's Express integration. Before production, move these three upload flows to persistent object storage and retain the existing file validation and private access checks. Do not use the current local upload storage for production data.

The Angular app sends relative `/api/...` requests. Its existing Vercel rewrite currently targets a previously configured Vercel hostname. After creating the backend deployment, point that rewrite at the real backend hostname so the browser continues using the Angular origin for cookie-backed requests.

The working tree already contained uncommitted product, Prisma, and frontend changes before this deployment preparation. Keep those changes when reviewing or committing.

## Architecture

- `src/app.js` configures the existing Express middleware, static upload paths, and route modules. It exports the app without opening a listener.
- `src/server.js` starts the same app for local development.
- Vercel recognizes the default Express app export at `src/app.js` and serves the existing `/api/*` routes through its Express function.
- Prisma 7.10.1 generates the client into `src/generated/prisma` and uses `@prisma/adapter-pg` with `pg`.
- The current app uses opaque, database-backed browser sessions, password-reset email, and optional Google OAuth. It does not use JWTs or an in-memory session store.

## Local development

1. Install Node.js 22 and npm.
2. From `backend`, install dependencies with `npm ci`.
3. Copy `.env.example` to `.env` and set local PostgreSQL connection details and authentication secrets. Configure mail and Google OAuth only if using those features.
4. Generate Prisma Client with `npm run prisma:generate`.
5. Start the local server with `npm run dev` or `npm start`. The API listens on port 5000 unless `PORT` is set.
6. Check `GET http://localhost:5000/api/health` for process health.

`npm run db:migrate` is for an explicitly selected development database. Do not use it against production.

## Prisma and Supabase

Prisma is version 7.10.1. `prisma.config.ts` supplies the CLI connection URL, preferring `DIRECT_URL`, then `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`. Runtime Prisma Client reads `DATABASE_URL` and connects through the PostgreSQL driver adapter. Keep the Supabase transaction pooler URL in `DATABASE_URL` for Vercel and use `DIRECT_URL` for migrations. Supabase commonly provides a transaction pooler on port 6543 and a direct connection on port 5432; use the values and pooler options shown by your project's Supabase dashboard.

For pooled runtime connections, use Supabase's generated URI and its required pooler options (often `pgbouncer=true` and a low `connection_limit`). Do not edit or invent the host, username, password, database, or SSL parameters. The exact URI format depends on the selected Supabase connection mode.

Prisma schema: `prisma/schema.prisma`. Migration history currently contains 22 ordered migration directories, including two uncommitted migrations already present in this working tree. The migration set has not been applied to Supabase, and its state has not been compared with any live database.

## Safe migration procedure

1. Create the Supabase project and provide the direct and transaction-pooler connection URLs securely through Vercel/local environment settings, never in Git or chat logs.
2. Before migration, determine whether this is a new empty database or contains data. For an existing database, take and verify an approved backup and compare its schema and `_prisma_migrations` records against the checked-in migration history.
3. For an empty database, review all checked-in migrations, then run `npx prisma migrate deploy` with `DIRECT_URL` set. This applies the migrations in order; it does not create a baseline from an existing schema.
4. If the database already has tables or data without matching migration history, stop and prepare a separate reviewed baseline/data-transfer plan. Do not apply migrations until that plan is approved.
5. Verify migration status, tables, records, and application reads/writes after explicit production approval.

Never run `prisma migrate reset`, drop, truncate, or destructive schema commands against production.

## Environment variables

Set these in Vercel's backend project settings. `.env.example` contains placeholders only.

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | Required runtime connection; Supabase transaction pooler URL. |
| `DIRECT_URL` | Required for production migrations; Supabase direct connection or suitable session pooler URL. |
| `SESSION_SECRET` | Required, at least 32 characters; signs stored session-token hashes. |
| `OTP_SECRET` | Required, independent value of at least 32 characters; protects password-reset code hashes. |
| `FRONTEND_URL` | Exact Angular production origin, including scheme and no path; used for CORS and OAuth failure redirects. |
| `NODE_ENV` | Set to `production` in Vercel. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Required only for password-reset email delivery. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Required only for Google sign-in; callback must match the URL registered with Google. |

`PORT` is set by local hosting and is not a production Vercel setting. There is no `JWT_SECRET`, payment provider, Cloudinary, or frontend database variable used by the inspected backend. Never expose database or authentication secrets to Angular.

## Vercel deployment

1. Import the existing Git repository in Vercel and set the project Root Directory to `backend`.
2. Select Node.js 22.x. The `build` and `vercel-build` scripts generate Prisma Client; the function bundle includes that generated client.
3. Add the production environment variables above in Vercel. Use Preview and Production values appropriate to each environment.
4. Confirm the external upload-storage migration is complete before serving users who can upload or access media.
5. Deploy a Preview first. Verify its health endpoint and API, database, CORS, cookies, authentication, email/OAuth configuration, and upload permissions before promoting it.

Vercel deployment and account authorization remain manual because no Vercel account action was authorized or available in this workspace.

The Angular project is deployed separately. Update its existing `/api/:path*` rewrite to the backend's actual Vercel hostname after that hostname exists; keep the rewrite on the Angular origin so its current relative API calls and session cookies use one browser origin. Set backend `FRONTEND_URL` to the deployed Angular origin. The backend hostname cannot be entered in the frontend configuration until Vercel assigns it.

## Production verification checklist

- [ ] Vercel project root is `backend`, using Node.js 22.x.
- [ ] Secrets are set in Vercel and are absent from commits and build logs.
- [ ] The Supabase runtime pooler and migration URLs are correct and kept separate.
- [ ] Migration history is reviewed, database state is known, backup is approved where needed, and production migration is explicitly approved.
- [ ] Uploads use durable object storage with private message-file authorization preserved.
- [ ] `GET /api/health` returns success.
- [ ] Production CORS allows only the exact Angular origin and credentials are enabled.
- [ ] Signup/login, cookie-backed session read/logout, and authorization are verified from the Angular domain.
- [ ] Google sign-in and password-reset email are verified if configured.
- [ ] Listing creation, image handling, order flows, messaging, and private attachment access are verified.
- [ ] No payment processing or webhook integration exists in the inspected backend.
