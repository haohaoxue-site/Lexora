# Document Collaboration

Document collaboration means signed-in users accessing product pages under `/docs`. It is different from public publishing: collaborators may edit, while public visitors are always read-only.

## Invite a User

To invite a specific user, enter the full user code. User codes start with `SP-` and do not rely on public usernames or editable display names.

After the invited user accepts, they receive collaboration access to the document.

## Collaboration Links

Collaboration links let signed-in users join through a short link. A link can carry permission, scope, and an optional password.

`/r/:code` is only for resolving collaboration invites or collaboration links. Public publishing links do not use this route.

## Permissions

Collaboration permissions are:

- Edit: read and edit the document body.
- Read: read only, without joining the collaborative editing runtime.

The document owner can manage collaborators and publish the document.

## Scope

Access scope can be:

- Current page only.
- Current page and descendants.

Child-page access can override ancestor access. The system uses the nearest grant that covers the current document.

## Permission Changes

When collaboration permission is revoked or downgraded, the server notifies the collaboration runtime to close or downgrade existing connections.
