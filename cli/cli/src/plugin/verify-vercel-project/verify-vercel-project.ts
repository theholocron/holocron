/**
 * Confirms a deployment URL actually belongs to a specific, trusted
 * Vercel project before any caller attaches a credential (e.g. the
 * Deployment Protection bypass secret, holocron#1030/#1032 review) to a
 * request against it.
 *
 * Why this exists: a URL merely ending in `.vercel.app` proves nothing —
 * Vercel hosting is open to anyone, so an attacker can register their own
 * `*.vercel.app` project and, if they can get a caller to target it (e.g.
 * a crafted `deployment_status` event — anyone with `deployments: write`
 * can create one), receive whatever credential that caller attaches.
 * Calling Vercel's own "get a deployment" API with a trusted token and
 * comparing the returned `projectId` against an expected value is the
 * actual authority here — not a hostname pattern.
 *
 * Deliberately a plain `fetch` call, not `@theholocron/vercel-client`:
 * that client's typed `deployments.get()` takes a deployment ID, not a
 * URL, and extending it is cross-repo work (clients lives in
 * `theholocron/clients`) out of scope for this one-off, read-only check.
 */

import type { VerifyVercelDeploymentProjectOptions } from "./verify-vercel-project.type.js";

/**
 * `true` only when Vercel's API confirms `url` resolves to a deployment
 * whose `projectId` matches `expectedProjectId` exactly. `false` for any
 * other outcome — a non-matching project, a non-2xx response, a
 * malformed body, or a transport failure — never throws, since every one
 * of those outcomes means the same thing to a caller: don't attach the
 * credential.
 */
export async function verifyVercelDeploymentProject(
	url: string,
	expectedProjectId: string,
	token: string,
	opts: VerifyVercelDeploymentProjectOptions = {}
): Promise<boolean> {
	const doFetch = opts.fetch ?? fetch;
	const baseUrl = opts.baseUrl ?? "https://api.vercel.com";

	let host: string;
	try {
		host = new URL(url).host;
	} catch {
		return false;
	}

	const params = new URLSearchParams({ url: host });
	if (opts.teamId) params.set("teamId", opts.teamId);

	let response: Response;
	try {
		response = await doFetch(`${baseUrl}/v13/deployments/get?${params}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
	} catch {
		return false;
	}
	if (!response.ok) return false;

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return false;
	}

	const projectId =
		typeof body === "object" && body !== null && "projectId" in body
			? (body as { projectId?: unknown }).projectId
			: undefined;
	return projectId === expectedProjectId;
}
