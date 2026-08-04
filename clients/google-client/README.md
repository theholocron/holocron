# @theholocron/google-client

TypeScript client for Google Workspace APIs — Docs and Sheets. Supports both OAuth2 (user auth) and service account auth.

## Installation

```bash
pnpm add @theholocron/google-client
```

## Usage

```ts
import { google, googleAuth } from "@theholocron/google-client";

// Service account auth (env vars — see Auth section)
const authClient = await googleAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]);

// Read a spreadsheet
const [err, data] = await google.spreadsheets.get("1BxiMVs0XRA...");
if (err) throw err;

// Read a document
const [err, doc] = await google.documents.get("1BxiMVs0XRA...");
```

## Auth

### Service Account

Set credentials via environment variables:

```bash
# Option 1 — full JSON key file
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# Option 2 — individual fields
GOOGLE_PROJECT_ID=my-project
GOOGLE_PRIVATE_KEY_ID=abc123
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
GOOGLE_CLIENT_EMAIL=my-service@my-project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=123456789
```

### OAuth2 (user auth)

```bash
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:4000/oauth2callback  # optional
```

```ts
import { oauth } from "@theholocron/google-client";

const authClient = await oauth(["https://www.googleapis.com/auth/spreadsheets"]);
```

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
