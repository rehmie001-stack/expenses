<<<<<<< HEAD
# expenses
=======
# Mall Expenses Desktop

This project is configured for a shared multi-user desktop workflow.

## Architecture

- Desktop app runs on each laptop
- Backend API runs on a hosted server
- PostgreSQL stores shared business data
- Local SQL.js is kept only as a fallback for local testing

## Local development

1. Install dependencies:
   npm install
2. Start the backend:
   npm run server
3. Start the frontend in development mode:
   npm run build
   or use Vite in the dev workflow
4. Open the desktop app and set the API URL to:
   http://localhost:4000

## Production deployment to Render

1. Create a Render account and a new Web Service.
2. Connect this repository to Render.
3. Use the included render.yaml file.
4. Render will provision the PostgreSQL database automatically.
5. The service will start with:
   node server/index.js

## Desktop installation for company laptops

1. Use the generated installer in the release folder.
2. Install the app on each laptop.
3. Open the app and enter the hosted API URL, for example:
   https://mall-expenses-api.onrender.com
4. Sign in with:
   - admin@rhemie.com / admin123
   - manager@rhemie.com / manager123
   - accountant@rhemie.com / accountant123

## Important note

GitHub or a source repository is not a live backend. The backend must remain running on a host that is always online.

## Environment

The sample variable file is in [.env.example](.env.example).

Set the production database variable as:

DATABASE_URL=postgres://username:password@host:5432/database_name

If DATABASE_URL is empty, the app falls back to a local SQL.js file for local development only.
>>>>>>> ddafd40 (Initial project setup)
