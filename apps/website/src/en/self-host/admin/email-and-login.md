# Email and Login

Email and login settings decide how users enter the instance and how the system sends verification or notification emails.

## Login Methods

The instance can use password login and OAuth login. OAuth availability depends on client configuration, such as GitHub, Linux Do, or Google.

If an OAuth client ID and secret are missing, that provider will not be shown as an available login method.

## Email

Email is used for verification codes, registration verification, password reset, and notification flows. Administrators should configure SMTP or the system email service.

After configuration, send a test email to verify sender, port, secure connection, and credentials.

## Registration Governance

Admins can control whether registration is open, whether invite codes are required, and whether users can bind or disconnect third-party accounts.

For public instances, disable open registration and use invite codes or administrator-created accounts.

## Troubleshooting Login

If a user cannot sign in, check:

- The login method is enabled.
- OAuth callback URLs match provider settings.
- Email codes are not going to spam.
- System time is accurate.
- `APP_SECRET` is stable across deployments.
