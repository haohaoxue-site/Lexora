# FAQ

## What if users cannot sign in?

First confirm that at least one login method is configured. For OAuth, check client ID, client secret, callback URL, and the public domain behind your reverse proxy.

## What if AI chat cannot generate?

Check:

- A model provider is configured.
- Models are synchronized or manually added.
- The user selected default models.
- The provider API key is valid.
- The `agent` service is healthy.
- Redis is available.

## What if document collaboration cannot connect?

Check:

- The `collab` service is healthy.
- WebSocket traffic is correctly forwarded by the reverse proxy.
- The current user has edit access.
- The document is not in trash.
- `API_INTERNAL_URL` points to the API origin.

## What if images or attachments cannot load?

Check object storage:

- `STORAGE_ENDPOINT` is reachable.
- Access keys are correct.
- RustFS or S3 is healthy.
- The reverse proxy allows asset requests.

## Can admin access be kept private?

Yes. Public deployments should expose only the normal Web entry and keep database, Redis, object storage consoles, and internal service ports private.
