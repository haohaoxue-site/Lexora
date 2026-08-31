# Initial Admin

The admin area is used to operate a self-hosted instance. Only system administrators can access it.

## Configure the Initial Admin

Set `SYSTEM_ADMIN` before deployment. This value identifies the initial system administrator account. The exact format follows the current instance configuration.

After the instance starts, sign in with that account to access admin pages.

## Admin Entry

System administrators can open the admin area after signing in. It includes overview, users, email, model providers, and audit pages.

Non-admin users are redirected back to the workspace when they request admin routes.

## First Configuration Order

Recommended order:

1. Configure `APP_SECRET`, database, Redis, and object storage.
2. Configure at least one login method.
3. Configure the initial system admin.
4. Sign in to admin and verify users and login policy.
5. Configure platform-level AI providers and models.
6. Configure email for verification, invitation, or notification flows.

## Security Tips

- Use a strong random value for `APP_SECRET`.
- Do not expose database, Redis, or object storage admin ports publicly.
- Put provider-side usage limits on platform model keys.
- Review audit records for critical configuration changes.
