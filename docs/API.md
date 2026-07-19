# ControlOps API guide

## Resources

- Production API: `https://controlops.co.uk/api`
- Swagger UI: `https://controlops.co.uk/swagger/`
- OpenAPI schema: `https://controlops.co.uk/swagger/openapi.json`
- Postman collection: `docs/ControlOps.postman_collection.json`
- Complete endpoint index: `docs/API_REFERENCE.md`

The OpenAPI schema is the source of truth. Swagger, Postman, this reference, and
mobile client models should all be generated from it.

## Authentication

Send a JSON request to `POST /auth/login`:

```json
{
  "email": "user@example.com",
  "password": "your-password",
  "remember_me": false
}
```

The response contains:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

Send the token on protected requests:

```text
Authorization: Bearer <jwt>
```

There is currently no refresh-token or server-side logout endpoint. Clients
must sign in again after expiry. Native apps should keep the token in Keychain
or Android Keystore, never in ordinary preferences or logs.

In Postman, run **Auth > Login** first. The collection test automatically saves
the returned token in the collection's `token` variable.

In Swagger, select **Authorize**, enter the user's email in the **Username**
field and enter their password. Swagger signs in through the internal
`/auth/swagger-login` adapter and automatically sends the resulting Bearer
token with protected requests.

## Response conventions

- JSON success responses use the schema shown for each Swagger operation.
- Creation usually returns HTTP `201`.
- Deletion usually returns HTTP `204` with no body.
- Files and exports return binary PDF, XLSX, CSV, image, or document content.
- Errors use `{"detail": ...}`.
- Validation errors return HTTP `422` with field-level details.
- Protected requests can return:
  - `401` for a missing, expired, or invalid token.
  - `402` when subscription payment blocks the company.
  - `403` for a deactivated account, unverified email, or missing permission.
  - `404` when a tenant-scoped resource does not exist.

The generated OpenAPI and Postman files contain examples for every documented
response status.

## Mobile integration

Use one shared HTTP client configured with:

1. Base URL `https://controlops.co.uk/api`.
2. JSON request and response handling.
3. A Bearer-token interceptor.
4. Structured handling for `401`, `402`, `403`, and `422`.
5. Authenticated multipart upload and binary download support.

Preserve the API's `snake_case` property names. Dates use ISO `YYYY-MM-DD`;
timestamps use ISO 8601. Use `/auth/me` after login to load permissions,
enabled modules, plan features, and subscription state.

Authenticated images and documents must be downloaded through the HTTP client
with an Authorization header. Do not pass their URL directly to an image
widget that cannot attach headers.

## Regenerating artifacts

From an environment with the backend dependencies installed:

```bash
cd backend
PYTHONPATH=. python scripts/generate_api_artifacts.py
```

When using the existing Docker image:

```bash
docker compose run --rm --no-deps --entrypoint python \
  -w /workspace/backend \
  -e PYTHONPATH=/workspace/backend \
  -v "$PWD:/workspace" \
  backend scripts/generate_api_artifacts.py
```

The generator does not initialize or migrate the database. It rewrites:

- `docs/openapi.json`
- `docs/ControlOps.postman_collection.json`
- `docs/API_REFERENCE.md`
