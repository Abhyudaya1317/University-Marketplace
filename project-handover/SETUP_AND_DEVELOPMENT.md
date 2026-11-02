# Setup and Development

## Verified environment snapshot

- Node.js reported by local shell: v24.17.0.
- npm reported by local shell: 11.13.0; frontend package declares npm@11.13.0.
- Angular framework/CLI: package ranges Angular 21.2.x / CLI 21.2.7.
- Backend: Express 5.3.x, Prisma 7.10.x and PostgreSQL adapter.
- PostgreSQL expected on localhost:5432. On 2026-11-01, backend health and product reads succeeded against the local database.
- Frontend dev URL http://localhost:4200; backend default is port 5000. Current ignored backend/.env overrides PORT=5002 and frontend/proxy.conf.json targets 127.0.0.1:5002.

## Install

Run separately:

~~~powershell
cd backend
npm ci

cd ../frontend
npm ci
~~~

Do not copy backend/.env into handoff, Git or chat. Create it from backend/.env.example and provide private values only on the developer machine. The checked-in example has a database-name mismatch with known setup context; confirm the intended existing DB before using it.

## Environment variable names

Backend variables referenced by source:

| Variable | Purpose |
|---|---|
| DATABASE_URL | PostgreSQL connection used by Prisma config and runtime driver. |
| PORT | Express port; defaults to 5000. |
| NODE_ENV | Production cookie Secure flag. |
| FRONTEND_URL | OAuth callback success/failure redirect target; defaults to localhost:4200. |
| GOOGLE_CLIENT_ID | OAuth audience/client identifier. |
| GOOGLE_CLIENT_SECRET | OAuth code exchange secret. |
| GOOGLE_CALLBACK_URL | Registered callback URI, typically local API callback in dev. |
| OTP_SECRET | At least 32 characters; HMAC key for reset-code hashes. |
| SESSION_SECRET | At least 32 characters; HMAC key for session token hashes. |
| SMTP_HOST | Mail server hostname. |
| SMTP_PORT | SMTP port. |
| SMTP_USER | SMTP login. |
| SMTP_PASSWORD | SMTP credential/app password. |
| SMTP_FROM | Approved sender address. |
| SMTP_SECURE | Set literal true for implicit TLS mode in current code; otherwise false. |

No Razorpay variable appears in current application source. Do not put secrets into Angular environment because they are browser-visible.

## Database safe-start procedure

1. Start PostgreSQL Windows service and pgAdmin if appropriate.
2. Confirm the existing database and port without creating a duplicate database.
3. Check private backend/.env locally; do not paste its connection URL into chat.
4. From backend run npm run db:check (read-only SELECT 1).
5. Run npx prisma migrate status to inspect pending migrations. Current handoff attempt failed after resolving campusx_dev at localhost:5432; investigate connection/schema-engine failure before proceeding.
6. After confirming correct DB and backup/safe target, use npx prisma migrate deploy to apply checked-in pending migrations. It does not reset data. Avoid migrate reset, DROP, or recreation.
7. Use npm run prisma:generate after schema/client change. npm run db:migrate invokes prisma migrate dev and is for local schema authoring; review any prompt before accepting.

Migration run must never be claimed successful unless the command returns success against the confirmed intended DB.

## Run local app

Backend terminal:

~~~powershell
cd backend
npm run dev
~~~

Frontend terminal:

~~~powershell
cd frontend
npm start
~~~

Open http://localhost:4200. Current Angular proxy configuration is frontend/proxy.conf.json mapping /api to http://127.0.0.1:5002. Health endpoint is http://localhost:5002/api/health (or through proxy at http://localhost:4200/api/health).

If PORT changes, update frontend/proxy.conf.json target and restart both backend and Angular. Ports 5000 and 5001 were occupied by unidentified Node processes during the 2026-11-01 repair; CampusX was moved to 5002. Do not stop unknown processes.

## Verify and build

~~~powershell
cd backend
npm test
npm run db:check
npx prisma migrate status

cd ../frontend
npm test
npm run build
~~~

Earlier handoff/chat-integration evidence on 2026-10-30: backend npm test passed 16/16; Angular npm test passed 9/9; Prisma schema validate passed. On 2026-11-01, Angular production build succeeded after increasing the anyComponentStyle maximumError budget from 8kB to 10kB. Local health and Explore product reads succeeded through the proxy; the page rendered five listings. Prisma migration status and database-backed write/message flows were not checked in that repair.

## Photo files

Uploads reside under backend/uploads/listings and are ignored by Git. Static URL is /api/uploads/listings/<opaque name>. These files are local developer data; do not remove during cleanup. Production needs durable storage/backups before deployment.

## Common failure notes

- DB check fails: verify service, port 5432, database name/user, private DATABASE_URL; don't reset database.
- Prisma config loads .env from backend; run Prisma commands from backend.
- CORS/cookies: local frontend should use proxy; API uses HttpOnly cookie and localhost same-site. Check browser network request includes credentials/cookie policy and both services' origins.
- Google OAuth: callback URL must match Google Cloud exactly, and GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL must belong to CampusX project. Never log secret/code.
- SMTP: code is not sent without all SMTP settings; provider may need app password/verified sender.
- API response mismatch: current Explore expects {listings,suggestions}; older README described {products}. Verify current controller rather than stale docs.
- Angular reactive UI: use signals for asynchronous page state updates; current app is signal-heavy.
- Port collision: PORT can override API default, but proxy target must match.

## Deployment

No deployment environment, CI/CD, production URLs or hosting setup were found. Do not infer production readiness. Before deployment define PostgreSQL managed service, environment secrets, explicit CORS origins, secure cookies/domain, email/OAuth URLs, durable image hosting, migration procedure, logging/monitoring and backup/restore plan.
