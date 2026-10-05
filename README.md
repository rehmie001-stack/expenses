# Mall Expenses Desktop

## Shared team setup

The Render blueprint in `render.yaml` provisions the installable web app and API service. Supabase provides the shared PostgreSQL database.

1. Push this project to a GitHub repository.
2. In Render, create a new Blueprint and connect that repository. Review the services from `render.yaml` and deploy them.
3. In Supabase, open **Connect** and copy the PostgreSQL **Session pooler** URI. Keep it private.
4. Set that URI as `DATABASE_URL` on the `mall-expenses-api` service in Render. For a new Blueprint, Render prompts for this value because it is marked `sync: false`.
5. Open the `mall-expenses-app` static site's public URL. Team members can use the browser's **Install app** option to add it to their desktop or phone home screen.

The PWA build gets the API URL directly from the deployed API service. Keep `DATABASE_URL` private and configure it only on the hosted backend. The existing Windows Electron build remains available separately.

## Local development

Run `npm install`, then `npm run dev`. Without `DATABASE_URL`, the local API uses a SQL.js database stored under `server/data`. Set `VITE_API_URL` to the local API URL for development; the sample value is `http://localhost:4000`. The service worker is generated for production builds and caches the app shell only; API data requires a network connection.

Local database records are not automatically copied to the hosted PostgreSQL database. Arrange a data migration before switching if you need to keep existing local expenses or tasks.

## Demo accounts and security

The database seeds demo accounts (`admin@rhemie.com`, `manager@rhemie.com`, and `accountant@rhemie.com`) on first startup. These are development credentials, not secure production accounts. Passwords are currently stored as plain text and the demo token format is predictable; do not use this app for sensitive production data until authentication is hardened and the demo passwords are replaced.
