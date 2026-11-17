import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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
	JSON.parse(readFileSync(fileURLToPath(new URL(`../../api/${file}`, import.meta.url)), "utf8")) as T;
const collection = read<Collection>("webhook.collection.json");
const environment = read<Environment>("webhook.environment.json");

const SECRET = "whsec_requests_test";
const VARIABLES: Record<string, string> = {
	...Object.fromEntries(collection.variable.map((v) => [v.key, v.value])),
	webhookSecret: SECRET,
};
const fill = (text: string) =>
	text.replace(/\{\{([^}]+)\}\}/g, (_, name: string) => VARIABLES[name] ?? "00000000-0000-4000-8000-000000000000");

/** Runs a folder's pre-request script in a stand-in for the collection format's script sandbox (`pm`, `CryptoJS`) and returns the headers it set. */
function sign(folder: Item, request: NonNullable<Item["request"]>): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const h of request.header) headers[h.key.toLowerCase()] = fill(h.value);
	const exec = folder.event?.find((e) => e.listen === "prerequest")?.script.exec;
	if (!exec) return headers;
	const pm = {
		variables: { get: (name: string) => VARIABLES[name], replaceIn: fill },
		environment: { get: (name: string) => VARIABLES[name] },
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

describe("Sentinel's requests", () => {
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

describe("the environment files", () => {
	interface EnvironmentFile {
		name: string;
		values: Array<{ key: string; value: string; type: string }>;
	}
	const dir = fileURLToPath(new URL("../../api/", import.meta.url));
	const files = readdirSync(dir)
		.filter((file) => /^webhook\.environment(\.[a-z]+)?\.json$/.test(file))
		.sort();
	const load = (file: string) => JSON.parse(readFileSync(`${dir}${file}`, "utf8")) as EnvironmentFile;
	const byName = Object.fromEntries(files.map((file) => [load(file).name, load(file)]));

	it("are a local, a dev and a prod environment", () => {
		expect(files).toEqual([
			"webhook.environment.dev.json",
			"webhook.environment.json",
			"webhook.environment.prod.json",
		]);
		expect(Object.keys(byName).sort()).toEqual(["Sentinel (dev)", "Sentinel (local)", "Sentinel (prod)"]);
	});

	it("define the same variables, so a request runs in any of them", () => {
		const keys = files.map((file) => load(file).values.map((value) => value.key));
		for (const names of keys) expect(names).toEqual(keys[0]);
	});

	it("hold the webhook secret as an empty secret-type variable, never a value", () => {
		for (const file of files) {
			const secret = load(file).values.find((value) => value.key === "webhookSecret");
			expect([secret?.type, secret?.value]).toEqual(["secret", ""]);
		}
	});

	it("point baseUrl at this machine, the dev tunnel and production", () => {
		const base = (name: string) => byName[name]?.values.find((value) => value.key === "baseUrl")?.value;
		expect(base("Sentinel (local)")).toBe("http://127.0.0.1:3000");
		expect(base("Sentinel (dev)")).toBe("https://sentinel-dev.theholocron.dev");
		expect(base("Sentinel (prod)")).toBe("https://sentinel.theholocron.dev");
	});

	it("are kept out of the deploy by .vercelignore, as they sit beside the function", () => {
		const ignore = readFileSync(fileURLToPath(new URL("../../.vercelignore", import.meta.url)), "utf8");
		expect(ignore.split("\n")).toContain("api/*.json");
	});

	it("are the ones the root config exports for Sentinel", () => {
		const config = readFileSync(fileURLToPath(new URL("../../../../holocron.config.ts", import.meta.url)), "utf8");
		for (const file of files) expect(config).toContain(`apps/sentinel/api/${file}`);
	});
});
