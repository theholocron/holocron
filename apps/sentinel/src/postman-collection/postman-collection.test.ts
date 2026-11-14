import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { parseWebhookEvent, WebhookVerificationError } from "../utils/webhook/webhook.js";

interface Header {
	key: string;
	value: string;
}
interface Item {
	name: string;
	event?: Array<{ listen: string; script: { exec: string[] } }>;
	item?: Item[];
	request?: { method: string; header: Header[]; body?: { raw: string } };
}
interface Collection {
	item: Item[];
	variable: Array<{ key: string; value: string }>;
}
interface Environment {
	values: Array<{ key: string; value: string; type: string }>;
}

const read = <T>(file: string) =>
	JSON.parse(readFileSync(fileURLToPath(new URL(`../../postman/${file}`, import.meta.url)), "utf8")) as T;
const collection = read<Collection>("sentinel.postman_collection.json");
const environment = read<Environment>("sentinel.postman_environment.json");

const SECRET = "whsec_postman_test";
const VARIABLES: Record<string, string> = {
	...Object.fromEntries(collection.variable.map((v) => [v.key, v.value])),
	webhookSecret: SECRET,
};
const fill = (text: string) =>
	text.replace(/\{\{([^}]+)\}\}/g, (_, name: string) => VARIABLES[name] ?? "00000000-0000-4000-8000-000000000000");

/** Runs a folder's pre-request script in a stand-in for Postman's sandbox (`pm`, `CryptoJS`) and returns the headers it set. */
function sign(folder: Item, request: NonNullable<Item["request"]>): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const h of request.header) headers[h.key.toLowerCase()] = fill(h.value);
	const exec = folder.event?.find((e) => e.listen === "prerequest")?.script.exec;
	if (!exec) return headers;
	const pm = {
		variables: { get: (name: string) => VARIABLES[name], replaceIn: fill },
		request: {
			body: { raw: request.body?.raw ?? "" },
			headers: { upsert: ({ key, value }: Header) => void (headers[key.toLowerCase()] = value) },
		},
	};
	const CryptoJS = {
		enc: { Hex: "hex" },
		HmacSHA256: (message: string, key: string) => ({
			toString: () => createHmac("sha256", key).update(message).digest("hex"),
		}),
	};
	runInNewContext(exec.join("\n"), { pm, CryptoJS });
	return headers;
}

const folder = (name: string) => collection.item.find((f) => f.name === name)!;
const requestOf = (f: Item, name: string) => f.item!.find((i) => i.name === name)!.request!;
const deliver = (f: Item, name: string) => {
	const request = requestOf(f, name);
	return { body: fill(request.body?.raw ?? ""), headers: sign(f, request) };
};

describe("Sentinel's Postman collection", () => {
	it("keeps the secret out of the committed environment", () => {
		const secret = environment.values.find((v) => v.key === "webhookSecret");
		expect(secret).toMatchObject({ type: "secret", value: "" });
	});

	it("is not aimed at the production host", () => {
		expect(JSON.stringify([collection, environment])).not.toContain("sentinel.theholocron.dev");
	});

	it("is rejected when unsigned or wrongly signed", () => {
		for (const name of ["POST with no signature", "POST with a wrong signature"]) {
			const { body, headers } = deliver(folder("Rejected"), name);
			expect(() => parseWebhookEvent({ body, headers, secret: SECRET })).toThrow(WebhookVerificationError);
		}
	});

	it("signs every delivery the way Sentinel verifies it", () => {
		const refused: string[] = [];
		for (const name of ["Signed, no effect", "Signed, acts on GitHub"]) {
			const f = folder(name);
			for (const item of f.item!) {
				try {
					parseWebhookEvent({ ...deliver(f, item.name), secret: SECRET });
				} catch {
					refused.push(item.name);
				}
			}
		}
		expect(refused).toEqual([]);
	});

	it("reaches no handler for the no-effect deliveries, and the pull request for the acting one", () => {
		const quiet = folder("Signed, no effect");
		const results = Object.fromEntries(
			quiet.item!.map((i) => [i.name, parseWebhookEvent({ ...deliver(quiet, i.name), secret: SECRET })])
		);
		expect(results["ping"]).toMatchObject({ handled: false });
		expect(results["push to a non-default branch"]).toMatchObject({ handled: false });
		expect(results["installation created"]).toMatchObject({
			handled: true,
			event: { type: "installation.created", installationId: 1 },
		});

		const acting = folder("Signed, acts on GitHub");
		const opened = parseWebhookEvent({
			...deliver(acting, "pull_request opened: runs every check on the pull request"),
			secret: SECRET,
		});
		expect(opened).toMatchObject({
			handled: true,
			event: { type: "pull_request.opened", repo: "theholocron/sandbox", pullNumbers: [1], installationId: 1 },
		});
	});
});
