---
title: Google Client
description: TypeScript client for Google Workspace APIs (Docs and Sheets), built on @theholocron/http-client.
---

`@theholocron/google-client` is a typed wrapper around Google Workspace APIs for reading Google Docs and Sheets.

## Install

```bash
pnpm add @theholocron/google-client
```

## Usage

```ts
import { google, googleAuth } from "@theholocron/google-client";

const auth = await googleAuth({
	credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
	scopes: ["https://www.googleapis.com/auth/documents.readonly"],
});

const doc = await google.documents.getDocument(auth, "document-id");
const sheet = await google.spreadsheets.getSpreadsheet(auth, "spreadsheet-id");
```

## Namespaces

| Namespace      | Methods          |
| -------------- | ---------------- |
| `documents`    | `getDocument`    |
| `spreadsheets` | `getSpreadsheet` |

## Authentication

This client does not use a `token` option. Instead it authenticates via a **Google service account** using `googleAuth()`:

```ts
const auth = await googleAuth({
	credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
	scopes: [
		"https://www.googleapis.com/auth/documents.readonly",
		"https://www.googleapis.com/auth/spreadsheets.readonly",
	],
});
```

The returned `auth` handle is passed as the first argument to every API call. Create a service account at **Google Cloud Console → IAM & Admin → Service Accounts** and download its JSON key. The `oauth` export provides the raw OAuth2 client for custom auth flows.
