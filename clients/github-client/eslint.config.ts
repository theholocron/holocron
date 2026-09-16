import { library } from "@theholocron/eslint-config/bundles/library";
import type { Linter } from "eslint";

const config = [
	...library(),
	{
		// src/app-auth: Web Crypto (globalThis.crypto/CryptoKey) is deliberate
		// here, not an oversight — it's what lets GitHub App JWT signing run
		// unchanged on Cloudflare Workers (no node:crypto, no nodejs_compat
		// flag) and in Node. eslint-plugin-n's node-builtins compat table
		// still flags the global as experimental on this repo's engines floor
		// even though it's been stable and verified working.
		// src/__tests__ included too — that dir only ever runs under
		// vitest/Node, never Workers, so the engines-floor compat concern
		// doesn't apply to it at all, not just to the files exercising
		// crypto.subtle directly.
		name: "github-client/app-auth-browser-apis",
		files: ["src/app-auth/**", "src/__tests__/**"],
		rules: {
			"n/no-unsupported-features/node-builtins": "off",
		},
	},
	{ ignores: ["dist/**", "coverage/**"] },
] satisfies Linter.Config[];

export default config;
