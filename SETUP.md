# Shared balance setup

The app uses a shared link backed by Supabase. Anyone with the link can add expenses and payments; the owner password is still required to edit or delete existing entries, manage people, change the group currency, or start a new month. Expenses from a reset are kept in the database archive (up to 24 resets).

## 1. Create the database table

Create a Supabase project, open **SQL Editor**, and run the contents of `supabase-schema.sql`. If the table already exists, run the updated file again to install the atomic append function used for password-free collaborator additions.

## 2. Add Vercel environment variables

In the Vercel project, open **Settings → Environment Variables** and add these variables for Production (and Preview if you use preview deployments):

- `SUPABASE_URL`: the Project URL shown in Supabase project settings.
- `SUPABASE_SECRET_KEY`: create/copy a Supabase Secret API key from **Settings → API Keys**. Keep it only in Vercel server environment variables; never add it to `index.html` or `scripts.js`. The older `service_role` key is also accepted for compatibility.
- `OWNER_PASSWORD`: a long, unique password used by the **Owner access** button.

Redeploy after adding the variables. The app's `/api/balance` function reads the database credentials on the server. The database table has no browser access policies; visitors can append validated expenses and payments through the app endpoint, while administrative changes require the owner password.

## 3. Publish the first balance

Open the deployed app on the device that has your existing local balance, choose **Owner access**, and enter `OWNER_PASSWORD`. That publishes the local data as the shared balance. Once published, other people can use **Copy share link** to open the shared balance and add expenses or payments without the owner password. They cannot edit or delete existing entries or change group settings.

Choose the settlement currency (USD, EUR, or GBP) before entering transactions. Each expense can use USD, EUR, or GBP; expenses in a different currency are converted to the settlement currency using the latest available reference rate, and that rate is saved with the expense so the balance does not drift later. The settlement currency is locked after the first expense or payment; archive the month to choose a different one.

If you want to start with a blank shared balance, clear this app's saved site data in the browser before publishing.

## 4. Start a new month

Choose **Owner access**, then **Archive and start new month**. The current people list remains; expenses and payments are cleared. The previous state is retained in the database archive. The archive is currently kept for recovery in the database and is not shown as a history screen in the app.

If `/api/balance` is not configured or unavailable, the app falls back to local-only storage and shows that status at the top.
