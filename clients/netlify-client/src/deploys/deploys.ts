import { createHash } from "node:crypto";

import { ProviderApiError } from "@theholocron/http-client";

import type { RestClient } from "../utils.js";

/**
 * Netlify deploy. `state` is a free-form string in Netlify's own API (no
 * published enum) — known values seen in practice: `new`, `building`,
 * `uploading`, `uploaded`, `preparing`, `prepared`, `processing`, `ready`,
 * `error`, `retrying`, `current`.
 */
export interface NetlifyDeploy {
	id: string;
	site_id: string;
	state: string;
	url: string;
	ssl_url: string;
	deploy_url: string;
	branch: string | null;
	error_message?: string | null;
	created_at: string;
}

/**
 * One function to deploy. `zip` is a pre-built archive — the function's
 * own code plus, if it imports anything beyond Node builtins, a real
 * `node_modules` (Netlify's raw deploy API runs no build/install step,
 * unlike a Git-linked deploy — `src/zip.ts`'s `buildZip()` builds this
 * from `{ path: content }` entries, text or binary).
 *
 * Netlify's classic function runtime (`runtime: "js"`) expects a
 * CommonJS-style `exports.handler` or ESM `export const handler` entry
 * point — confirmed live: a V2-style `export default (req) => Response`
 * handler deploys without error but fails at invoke time with
 * `Runtime.HandlerNotFound`. The entry file's basename (minus extension)
 * inside the zip should match `name`.
 */
export interface NetlifyDeployFunctionSpec {
	/** Becomes invokable at `/.netlify/functions/<name>`. */
	name: string;
	/** Lambda runtime: `"js"` (Node.js, zipped) or `"go"` (zipped binary). */
	runtime?: "js" | "go";
	zip: Uint8Array;
}

export interface NetlifyCreateDeployInput {
	/** Static files, plain text — served as-is, no build step. */
	files?: Record<string, string>;
	/** Functions to deploy alongside (or instead of) static files. */
	functions?: NetlifyDeployFunctionSpec[];
	/** Process normally but don't make this the published deploy. */
	draft?: boolean;
}

/** Raw transport details `create()` needs beyond the generic `RestClient` — file/function uploads send a binary body, which `RestClient.request()` can't carry (always JSON-encodes a given body). */
export interface NetlifyRawTransport {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

function sha1Hex(bytes: Uint8Array): string {
	return createHash("sha1").update(bytes).digest("hex");
}

function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function deploys(rest: RestClient, raw: NetlifyRawTransport) {
	async function uploadRaw(path: string, body: Uint8Array): Promise<void> {
		const fetchImpl = raw.fetch ?? globalThis.fetch;
		let baseUrl = raw.baseUrl ?? "https://api.netlify.com/api/v1";
		while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
		const tag = `Netlify PUT ${path}`;
		let res: Response;
		try {
			res = await fetchImpl(`${baseUrl}${path}`, {
				method: "PUT",
				headers: {
					authorization: `Bearer ${raw.token}`,
					accept: "application/json",
					"content-type": "application/octet-stream",
				},
				body,
			});
		} catch (err) {
			const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
			throw new ProviderApiError(`${tag} failed: ${detail}`, 0, undefined);
		}
		if (!res.ok) {
			const resBody = await res.text().catch(() => "");
			throw new ProviderApiError(`${tag} → ${res.status}`, res.status, resBody);
		}
	}

	return {
		get: (deployId: string): Promise<NetlifyDeploy> =>
			rest.request<NetlifyDeploy>(`/deploys/${encodeURIComponent(deployId)}`),

		/**
		 * The digest-based deploy flow: send a manifest of file/function
		 * hashes, then upload only the content Netlify doesn't already have
		 * cached (`required`/`required_functions` in the response — in
		 * practice, for a fresh deploy that's everything). This is the
		 * *only* flow that deploys real, invokable functions — the
		 * single-request whole-zip method (`POST .../deploys` with
		 * `Content-Type: application/zip`) only deploys static assets; a
		 * function file placed in that zip is served as an inert static
		 * file, never wired up as a Lambda (confirmed live).
		 */
		async create(siteId: string, input: NetlifyCreateDeployInput = {}): Promise<NetlifyDeploy> {
			const files = input.files ?? {};
			const functions = input.functions ?? [];

			const fileHashes = Object.fromEntries(
				Object.entries(files).map(([path, content]) => [path, sha1Hex(new TextEncoder().encode(content))])
			);
			const functionHashes = Object.fromEntries(functions.map((f) => [f.name, sha256Hex(f.zip)]));

			const deploy = await rest.request<NetlifyDeploy & { required?: string[]; required_functions?: string[] }>(
				`/sites/${encodeURIComponent(siteId)}/deploys`,
				{
					method: "POST",
					body: {
						files: fileHashes,
						...(functions.length > 0 ? { functions: functionHashes } : {}),
						...(input.draft ? { draft: true } : {}),
					},
				}
			);

			const requiredFiles = new Set(deploy.required ?? []);
			for (const [path, hash] of Object.entries(fileHashes)) {
				if (!requiredFiles.has(hash)) continue;
				await uploadRaw(
					`/deploys/${deploy.id}/files/${path.replace(/^\//, "")}`,
					new TextEncoder().encode(files[path])
				);
			}

			const requiredFunctions = new Set(deploy.required_functions ?? []);
			for (const fn of functions) {
				if (!requiredFunctions.has(functionHashes[fn.name]!)) continue;
				await uploadRaw(
					`/deploys/${deploy.id}/functions/${encodeURIComponent(fn.name)}?runtime=${fn.runtime ?? "js"}`,
					fn.zip
				);
			}

			return deploy;
		},
	};
}
