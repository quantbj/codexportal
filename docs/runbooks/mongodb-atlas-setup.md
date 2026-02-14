# MongoDB Atlas Setup (Free Tier)

## 1. Create Atlas Account and Project

1. Go to <https://www.mongodb.com/atlas/database>.
2. Create an account (or sign in).
3. Create a new project, e.g. `codexportal`.

## 2. Create Free Cluster

1. Click `Build a Database`.
2. Choose `M0 Free`.
3. Select a cloud provider/region close to your Render region.
4. Name the cluster, e.g. `codexportal-cluster`.
5. Create cluster.

## 3. Create Database User

1. Open `Database Access`.
2. Add new database user.
3. Use username/password authentication.
4. Grant role `Read and write to any database` (for initial setup).
5. Save the username/password securely.

## 4. Configure Network Access

1. Open `Network Access`.
2. Add IP Address.
3. For Render dynamic egress, allow `0.0.0.0/0` initially.
4. If you later have static egress IPs, restrict to those IPs.

## 5. Get Connection String

1. Open cluster and click `Connect`.
2. Choose `Drivers`.
3. Copy the URI (it looks like):
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`
4. Replace `<user>` and `<password>` with real values.

## 6. Set Render Environment Variables (contracts-service)

Set these env vars in the Render `contracts-service`:

- `MONGODB_URI=<your mongodb+srv connection string>`
- `MONGODB_DB_NAME=sales_portal`
- `MONGODB_USERS_COLLECTION=users`
- `MONGODB_DRAFTS_COLLECTION=drafts`
- `SEED_DEMO_USERS=true`
- `FRONTEND_ORIGIN=https://codexportal-frontend.onrender.com`

Then redeploy `contracts-service`.

## 7. Verify

1. Open `https://<contracts-service>/health` and confirm `{"status":"ok"}`.
2. Open `https://<contracts-service>/ready` and confirm `{"status":"ok"}`.
3. Log in via portal and save a draft.
4. In Atlas `Browse Collections`, verify documents are created in:
   - `sales_portal.users`
   - `sales_portal.drafts`

## 8. Optional Hardening

1. Create a dedicated least-privilege DB role/user for production.
2. Rotate credentials regularly.
3. Restrict Atlas network access as soon as possible.
