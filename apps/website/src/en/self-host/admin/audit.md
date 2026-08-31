# Audit

Audit records track important operations in the instance.

## When to Check Audit

Check audit records when:

- User permission or account status changes unexpectedly.
- Model provider configuration changes.
- Login governance, email settings, or system settings change.
- You need to investigate user access issues.

## Audit Content

Audit records usually include operation type, actor, target object, time, and context. Exact fields depend on the admin audit table.

## Usage Tips

- Review high-risk operations regularly.
- Filter by time range when investigating incidents.
- Protect system admin accounts with stronger login controls.
- Do not treat audit records as a business data restore mechanism. They are mainly for tracing and investigation.
