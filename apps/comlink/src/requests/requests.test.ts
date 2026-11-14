import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRelay } from "../relay/relay.js";
import { sentry } from "../sources/sentry/sentry.js";

interface Header {
	key: string;
	value: string;
}
interface Item {
	name: string;
	event?: Array<{ listen: string; script: { exec: string[] } }>;
	item?: Item[];
	request?: { method: string; header: Header[]; body?: { raw: string }; url: { path: string[] } };
}
interface Collection {
	item: Item[];
	variable: Array<{ key: string; value: string }>;
}
interface Environment {
	values: Array<{ key: string; value: string; type: string }>;
}

const read = <T>(file: string) =>
	JSON.parse(readFileSync(fileURLToPath(new URL(`../../requests/${file}`, import.meta.url)), "utf8")) as T;
const collection = read<Collection>("collection.json");
const environment = read<Environment>("environment.json");

const SECRET = "client_secret_requests_test";
const HOOK = "https://discord.com/api/webhooks/1/token";
const VARIABLES: Record<string, string> = { sentrySecret: SECRET };
const fill = (text: string) => text.replace(/\{\{([^}]+)\}\}/g, (_, name: string) => VARIABLES[name] ?? "");

/** Runs a folder's pre-request script in a stand-in for the collection format's script sandbox (`pm`, `CryptoJS`) and returns the headers it set. */
function sign(folder: Item, request: NonNullable<Item["request"]>): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const h of request.header) headers[h.key] = h.value;
	const exec = folder.event?.find((e) => e.listen === "prerequest")?.script.exec;
	if (!exec) return headers;
	const pm = {
		variables: { get: (name: string) => VARIABLES[name], replaceIn: fill },
		request: {
			body: { raw: request.body?.raw ?? "" },
			headers: { upsert: ({ key, value }: Header) => void (headers[key] = value) },
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

const expectedStatus = (item: Item) =>
	Number(/have\.status\((\d+)\)/.exec(item.event!.find((e) => e.listen === "test")!.script.exec.join("\n"))![1]);

afterEach(() => vi.unstubAllGlobals());

describe("Comlink's requests", () => {
	it("keeps the secret out of the committed environment", () => {
		expect(environment.values.find((v) => v.key === "sentrySecret")).toMatchObject({ type: "secret", value: "" });
	});

	it("is not aimed at the production host", () => {
		expect(JSON.stringify([collection, environment])).not.toContain("comlink.theholocron.dev");
	});

	it("gets the answer each request says it expects from the relay", async () => {
		const discord = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", discord);
		const relay = createRelay([sentry]);
		const env = { COMLINK_SENTRY_SECRET: SECRET, COMLINK_SENTRY_WEBHOOK: HOOK };

		const seen: Array<{ name: string; status: number; posted: boolean }> = [];
		for (const folder of collection.item) {
			for (const item of folder.item!) {
				const request = item.request!;
				const before = discord.mock.calls.length;
				const method = request.method;
				const response = await relay(
					new Request(`https://comlink.example/${request.url.path.join("/")}`, {
						method,
						headers: sign(folder, request),
						...(method === "GET" ? {} : { body: fill(request.body?.raw ?? "") }),
					}),
					env
				);
				expect({ name: item.name, status: response.status }).toEqual({
					name: item.name,
					status: expectedStatus(item),
				});
				seen.push({ name: item.name, status: response.status, posted: discord.mock.calls.length > before });
			}
		}

		// Only the last folder is meant to reach Discord, and only one request in it does.
		expect(seen.filter((s) => s.posted).map((s) => s.name)).toEqual(["event_alert: posts an embed"]);
	});
});
