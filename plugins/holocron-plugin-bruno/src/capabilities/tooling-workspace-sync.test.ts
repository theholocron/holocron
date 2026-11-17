import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrunoTooling } from "./tooling.js";

type Loose = ReturnType<typeof JSON.parse>;
const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
const COLLECTION = "apps/a/requests/collection.json";
const ENVIRONMENT = "apps/a/requests/environment.json";
const PING = ".bruno/collections/app-a/Group/ping.yml";
const BASELINE = ".bruno/.sync.json";
const ENV_FILE = ".bruno/collections/app-a/environments/A (local).yml";

const collection = (name: string, ...requests: string[]) => ({
	info: { name, schema: SCHEMA, description: "Hand-written." },
	item: [
		{
			name: "Group",
			description: "A folder.",
			item: requests.map((request) => ({
				name: request,
				event: [
					{
						listen: "test",
						script: {
							type: "text/javascript",
							exec: ['pm.test("ok", () => pm.response.to.have.status(200));'],
						},
					},
				],
				request: { method: "GET", description: `Calls ${request}.`, header: [], url: `{{baseUrl}}/${request}` },
			})),
		},
	],
	variable: [{ key: "baseUrl", value: "http://x" }],
});
const environment = (name: string, repo = "theholocron/sandbox") => ({
	name,
	values: [
		{ key: "baseUrl", value: "http://x", type: "default", enabled: true },
		{ key: "repo", value: repo, type: "default", enabled: true },
		{ key: "secret", value: "never-written", type: "secret", enabled: true },
	],
});

let root: string;
const write = (path: string, text: string) => {
	mkdirSync(join(root, path, ".."), { recursive: true });
	writeFileSync(join(root, path), text);
};
const put = (path: string, value: unknown) => write(path, JSON.stringify(value));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path)) as Record<string, Loose>;
const edit = (path: string, from: string, to: string) => {
	const text = read(path);
	expect(text, `${path} holds ${from}`).toContain(from);
	write(path, text.replace(from, to));
};

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bruno-sync-"));
	put(COLLECTION, collection("App A", "ping"));
	put(ENVIRONMENT, environment("A (local)"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const input = (over: Record<string, unknown> = {}) => ({
	collectionFiles: [COLLECTION],
	envFiles: [ENVIRONMENT],
	repoRoot: root,
	...over,
});
const tool = () => new BrunoTooling({ repoRoot: root, workspaceName: "W" });
const sync = (over: Record<string, unknown> = {}) => tool().workspace(input(over));
const states = (files: { path: string; state: string }[]) =>
	Object.fromEntries(files.filter((f) => f.state !== "unchanged").map((f) => [f.path, f.state]));
const everythingInSync = (files: { state: string }[]) =>
	expect(new Set(files.map((f) => f.state))).toEqual(new Set(["unchanged"]));

describe("the baseline", () => {
	it("is written by the first sync and holds a hash of both sides of every pair", async () => {
		await sync();
		const baseline = json(BASELINE);
		expect(baseline.version).toBe(1);
		expect(
			baseline.pairs.map((p: { kind: string; source: string; workspace: string }) => [
				p.kind,
				p.source,
				p.workspace,
			])
		).toEqual([
			["collection", COLLECTION, "collections/app-a"],
			["environment", ENVIRONMENT, "collections/app-a/environments/A (local).yml"],
		]);
		for (const pair of baseline.pairs) {
			expect(pair.sourceHash).toMatch(/^[0-9a-f]{64}$/);
			expect(pair.workspaceHash).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("is rebuilt without touching either side when the two already agree", async () => {
		await sync();
		const before = { collection: read(COLLECTION), ping: read(PING) };
		unlinkSync(join(root, BASELINE));
		const result = await sync();
		expect(states(result.files)).toEqual({ [BASELINE]: "new" });
		expect({ collection: read(COLLECTION), ping: read(PING) }).toEqual(before);
		everythingInSync((await sync()).files);
	});

	it("is the same text on every run", async () => {
		await sync();
		const first = read(BASELINE);
		await sync();
		expect(read(BASELINE)).toBe(first);
	});

	it.each([
		["not JSON", "nope", /\.bruno\/\.sync\.json/],
		["not a baseline", JSON.stringify({ version: 2, pairs: [] }), /not a version 1 baseline/],
		["a malformed pair", JSON.stringify({ version: 1, pairs: [{ kind: "collection" }] }), /pair 1 is malformed/],
	])("stops with a message that names the file when it is %s", async (_label, text, message) => {
		await sync();
		write(BASELINE, text);
		await expect(sync()).rejects.toThrow(message);
	});
});

describe("a request file changed", () => {
	it("regenerates the workspace and records the new hashes", async () => {
		await sync();
		put(COLLECTION, collection("App A", "ping", "pong"));
		const result = await sync();
		expect(states(result.files)).toEqual({
			[BASELINE]: "changed",
			".bruno/collections/app-a/Group/pong.yml": "new",
		});
		everythingInSync((await sync()).files);
	});

	it("regenerates the workspace file of an environment", async () => {
		await sync();
		put(ENVIRONMENT, environment("A (local)", "theholocron/other"));
		const result = await sync();
		expect(states(result.files)[ENV_FILE]).toBe("changed");
		expect(read(ENV_FILE)).toContain("theholocron/other");
	});
});

describe("the workspace changed", () => {
	const PONG = PING;

	it("writes the edit back to the request file and leaves everything else of it as it was", async () => {
		await sync();
		const before = json(COLLECTION);
		edit(PONG, "/ping", "/ping-two");
		const result = await sync();
		expect(states(result.files)).toEqual({ [COLLECTION]: "changed", [BASELINE]: "changed" });
		const after = json(COLLECTION);
		expect(after.item[0].item[0].request.url.raw).toBe("{{baseUrl}}/ping-two");
		// What the edit did not touch keeps its own text.
		expect(after.item[0].item[0].event).toEqual(before.item[0].item[0].event);
		expect(after.item[0].description).toBe("A folder.");
		expect(after.info).toEqual(before.info);
		expect(after.variable).toEqual(before.variable);
		everythingInSync((await sync()).files);
		expect(existsSync(join(root, PONG))).toBe(true);
	});

	it("writes a request added in the workspace to the request file", async () => {
		await sync();
		write(
			".bruno/collections/app-a/Group/added.yml",
			read(PONG).replace("name: ping", "name: added").replace("seq: 1", "seq: 2").replace("/ping", "/added")
		);
		await sync();
		expect(json(COLLECTION).item[0].item.map((i: { name: string }) => i.name)).toEqual(["ping", "added"]);
		everythingInSync((await sync()).files);
	});

	it("writes a request deleted in the workspace as gone from the request file", async () => {
		put(COLLECTION, collection("App A", "ping", "pong"));
		await sync();
		unlinkSync(join(root, ".bruno/collections/app-a/Group/pong.yml"));
		await sync();
		expect(json(COLLECTION).item[0].item.map((i: { name: string }) => i.name)).toEqual(["ping"]);
	});

	it("writes a collection renamed in the workspace and keeps its folder", async () => {
		await sync();
		edit(".bruno/collections/app-a/opencollection.yml", "name: App A", "name: App Z");
		await sync();
		expect(json(COLLECTION).info.name).toBe("App Z");
		expect(existsSync(join(root, ".bruno/collections/app-a/opencollection.yml"))).toBe(true);
		everythingInSync((await sync()).files);
	});

	it("is a change to the workspace alone when only a setting the request file cannot hold changed", async () => {
		await sync();
		const before = read(COLLECTION);
		edit(PONG, "timeout: 0", "timeout: 30000");
		const result = await sync();
		expect(states(result.files)).toEqual({ [BASELINE]: "changed" });
		expect(result.issues).toEqual([]);
		expect(read(COLLECTION)).toBe(before);
		expect(read(PONG)).toContain("timeout: 30000");
		everythingInSync((await sync()).files);
	});

	it("reports a setting the request file cannot hold when the same edit also changes what it can", async () => {
		await sync();
		edit(PONG, "timeout: 0", "timeout: 30000");
		edit(PONG, "/ping", "/ping-two");
		const result = await sync();
		expect(result.issues).toEqual([
			{
				file: COLLECTION,
				message: `${PONG} holds settings the request file cannot carry; they stay in the workspace`,
			},
		]);
		expect(read(PONG)).toContain("timeout: 30000");
		everythingInSync((await sync()).files);
	});

	it("writes a changed environment variable back and never writes a secret's value", async () => {
		await sync();
		edit(ENV_FILE, "value: theholocron/sandbox", "value: theholocron/elsewhere");
		const result = await sync();
		expect(states(result.files)).toEqual({ [ENVIRONMENT]: "changed", [BASELINE]: "changed" });
		const env = json(ENVIRONMENT);
		expect(env.values.find((v: { key: string }) => v.key === "repo").value).toBe("theholocron/elsewhere");
		expect(env.values.find((v: { key: string }) => v.key === "secret")).toEqual({
			key: "secret",
			value: "",
			type: "secret",
			enabled: true,
		});
		everythingInSync((await sync()).files);
	});

	it("keeps the request file's other keys when it writes an environment back", async () => {
		put(ENVIRONMENT, { ...environment("A (local)"), _postman_variable_scope: "environment" });
		await sync();
		edit(ENV_FILE, "value: theholocron/sandbox", "value: theholocron/elsewhere");
		await sync();
		expect(json(ENVIRONMENT)._postman_variable_scope).toBe("environment");
	});

	it("reports a setting of an environment file the request file cannot hold", async () => {
		await sync();
		edit(ENV_FILE, "name: A (local)", "name: A (local)\ncolor: red");
		edit(ENV_FILE, "value: theholocron/sandbox", "value: theholocron/elsewhere");
		const result = await sync();
		expect(result.issues).toEqual([
			{
				file: ENVIRONMENT,
				message: `${ENV_FILE} holds settings the environment file cannot carry; they stay in the workspace`,
			},
		]);
	});

	it("leaves a workspace-only edit of an environment alone", async () => {
		await sync();
		const before = read(ENVIRONMENT);
		edit(ENV_FILE, "name: A (local)", "name: A (local)\ncolor: red");
		const result = await sync();
		expect(states(result.files)).toEqual({ [BASELINE]: "changed" });
		expect(read(ENVIRONMENT)).toBe(before);
	});

	it("says an environment file only the workspace has is not synced", async () => {
		await sync();
		write(".bruno/collections/app-a/environments/Only here.yml", read(ENV_FILE).replace("A (local)", "Only here"));
		const result = await sync();
		expect(result.issues).toEqual([
			{
				file: COLLECTION,
				message:
					".bruno/collections/app-a/environments/Only here.yml is only in the workspace: no environment file of the request files names it, so it is not synced",
			},
		]);
		expect(existsSync(join(root, ".bruno/collections/app-a/environments/Only here.yml"))).toBe(true);
	});

	it("names the file that cannot be read", async () => {
		await sync();
		write(PONG, "edited in Bruno\n");
		await expect(sync()).rejects.toThrow(/Group\/ping\.yml/);
	});

	it("needs the collection's own file", async () => {
		await sync();
		write(PONG, read(PONG));
		unlinkSync(join(root, ".bruno/collections/app-a/opencollection.yml"));
		edit(PONG, "/ping", "/other");
		await expect(sync()).rejects.toThrow(/opencollection\.yml: not found/);
	});

	it("takes a request in a folder with no folder file as a folder named for its directory", async () => {
		await sync();
		write(
			".bruno/collections/app-a/Loose/one.yml",
			read(PONG).replace("name: ping", "name: one").replace("seq: 1", "seq: 1")
		);
		await sync();
		const names = json(COLLECTION).item.map((i: { name: string }) => i.name);
		expect(names).toContain("Loose");
	});
});

describe("both sides changed", () => {
	const change = async () => {
		await sync();
		put(COLLECTION, collection("App A", "ping", "pong"));
		edit(PING, "/ping", "/ping-two");
	};

	it("is a conflict that writes nothing, naming the way out", async () => {
		await change();
		const before = { collection: read(COLLECTION), ping: read(PING), baseline: read(BASELINE) };
		const result = await sync();
		const conflict = result.files.find((f) => f.state === "conflict");
		expect(conflict?.path).toBe(COLLECTION);
		expect(conflict?.note).toMatch(/--prefer source.*--prefer workspace/);
		expect({ collection: read(COLLECTION), ping: read(PING), baseline: read(BASELINE) }).toEqual(before);
		expect(existsSync(join(root, ".bruno/collections/app-a/Group/pong.yml"))).toBe(false);
	});

	it("writes nothing for another pair either while one is in conflict", async () => {
		put("apps/b/requests/collection.json", collection("App B", "one"));
		await sync({ collectionFiles: [COLLECTION, "apps/b/requests/collection.json"], envFiles: [ENVIRONMENT] });
		put("apps/b/requests/collection.json", collection("App B", "one", "two"));
		put(COLLECTION, collection("App A", "ping", "pong"));
		edit(PING, "/ping", "/ping-two");
		const result = await sync({
			collectionFiles: [COLLECTION, "apps/b/requests/collection.json"],
			envFiles: [ENVIRONMENT],
		});
		expect(result.files.some((f) => f.state === "conflict")).toBe(true);
		expect(existsSync(join(root, ".bruno/collections/app-b/Group/two.yml"))).toBe(false);
	});

	it("is settled for the request file with --prefer source", async () => {
		await change();
		const result = await sync({ prefer: "source" });
		expect(result.files.some((f) => f.state === "conflict")).toBe(false);
		expect(read(PING)).toContain("/ping\n".trim());
		expect(read(PING)).not.toContain("ping-two");
		expect(existsSync(join(root, ".bruno/collections/app-a/Group/pong.yml"))).toBe(true);
		everythingInSync((await sync()).files);
	});

	it("is settled for the workspace with --prefer workspace", async () => {
		await change();
		const result = await sync({ prefer: "workspace" });
		expect(result.files.some((f) => f.state === "conflict")).toBe(false);
		const names = json(COLLECTION).item[0].item.map((i: { name: string }) => i.name);
		expect(names).toEqual(["ping"]);
		expect(json(COLLECTION).item[0].item[0].request.url.raw).toBe("{{baseUrl}}/ping-two");
		everythingInSync((await sync()).files);
	});

	it("is no conflict when both sides changed to the same thing", async () => {
		await sync();
		const earlier = read(BASELINE);
		put(COLLECTION, collection("App A", "ping", "pong"));
		await sync();
		// The baseline is the one from before either side changed, so both look changed, and they hold the same.
		write(BASELINE, earlier);
		const result = await sync();
		expect(states(result.files)).toEqual({ [BASELINE]: "changed" });
	});

	it("is a conflict for an environment", async () => {
		await sync();
		put(ENVIRONMENT, environment("A (local)", "theholocron/one"));
		edit(ENV_FILE, "value: theholocron/sandbox", "value: theholocron/two");
		const result = await sync();
		expect(result.files.find((f) => f.state === "conflict")).toMatchObject({ path: ENVIRONMENT });
		expect(json(ENVIRONMENT).values[1].value).toBe("theholocron/one");
		const preferred = await sync({ prefer: "workspace" });
		expect(preferred.files.some((f) => f.state === "conflict")).toBe(false);
		expect(json(ENVIRONMENT).values[1].value).toBe("theholocron/two");
	});

	it("is a conflict for an environment settled for the request file", async () => {
		await sync();
		put(ENVIRONMENT, environment("A (local)", "theholocron/one"));
		edit(ENV_FILE, "value: theholocron/sandbox", "value: theholocron/two");
		await sync({ prefer: "source" });
		expect(read(ENV_FILE)).toContain("theholocron/one");
	});

	it("with no baseline is a conflict when the two differ", async () => {
		await sync();
		unlinkSync(join(root, BASELINE));
		put(COLLECTION, collection("App A", "ping", "pong"));
		edit(PING, "/ping", "/ping-two");
		const result = await sync();
		expect(result.files.some((f) => f.state === "conflict")).toBe(true);
	});

	it("keeps the old baseline entry of a pair in conflict", async () => {
		await change();
		const before = json(BASELINE).pairs[0];
		await sync();
		expect(json(BASELINE).pairs[0]).toEqual(before);
	});

	it("makes two environment pairs that would write different content to one file a conflict of their own", async () => {
		put("apps/b/requests/collection.json", collection("App B", "one"));
		const both = { collectionFiles: [COLLECTION, "apps/b/requests/collection.json"], envFiles: [ENVIRONMENT] };
		await sync(both);
		edit(
			".bruno/collections/app-a/environments/A (local).yml",
			"value: theholocron/sandbox",
			"value: theholocron/a"
		);
		edit(
			".bruno/collections/app-b/environments/A (local).yml",
			"value: theholocron/sandbox",
			"value: theholocron/b"
		);
		const result = await sync(both);
		expect(result.files.find((f) => f.state === "conflict")?.note).toMatch(
			/two pairs would write different content/
		);
	});
});

describe("a side that is not there", () => {
	it("is made from the other when the workspace is missing", async () => {
		await sync();
		rmSync(join(root, ".bruno/collections"), { recursive: true });
		const result = await sync();
		expect(states(result.files)[PING]).toBe("new");
		everythingInSync((await sync()).files);
	});

	it("is made from the workspace when the request file is gone and the baseline has the pair", async () => {
		await sync();
		const before = json(COLLECTION);
		unlinkSync(join(root, COLLECTION));
		const result = await sync();
		expect(states(result.files)[COLLECTION]).toBe("new");
		expect(json(COLLECTION).item[0].item[0].name).toBe(before.item[0].item[0].name);
		everythingInSync((await sync()).files);
	});

	it("restores an environment file that is gone", async () => {
		await sync();
		unlinkSync(join(root, ENVIRONMENT));
		const result = await sync();
		expect(states(result.files)[ENVIRONMENT]).toBe("new");
		expect(json(ENVIRONMENT).name).toBe("A (local)");
	});

	it("is an error that names the file when the request file is gone and there is no baseline", async () => {
		await expect(sync({ collectionFiles: ["apps/none/collection.json"] })).rejects.toThrow(
			/apps\/none\/collection\.json: not found/
		);
	});

	it("is an error that names the file when an environment file is gone and there is no baseline", async () => {
		await expect(sync({ envFiles: ["apps/a/requests/gone.json"] })).rejects.toThrow(
			/apps\/a\/requests\/gone\.json: not found/
		);
	});

	it("makes the environments of a collection that is only in the workspace", async () => {
		await sync();
		unlinkSync(join(root, COLLECTION));
		unlinkSync(join(root, ENVIRONMENT));
		await sync();
		expect(existsSync(join(root, ENVIRONMENT))).toBe(true);
		expect(existsSync(join(root, COLLECTION))).toBe(true);
	});
});

describe("--dry-run and the states", () => {
	it("lists what a workspace edit would write to the request file and writes nothing", async () => {
		await sync();
		edit(PING, "/ping", "/ping-two");
		const before = read(COLLECTION);
		const result = await sync({ dryRun: true });
		expect(states(result.files)).toEqual({ [COLLECTION]: "changed", [BASELINE]: "changed" });
		expect(read(COLLECTION)).toBe(before);
		expect(json(BASELINE).pairs[0].workspaceHash).not.toBe("");
		const real = await sync();
		expect(states(real.files)).toEqual(states(result.files));
	});

	it("reports a conflict on a dry run too", async () => {
		await sync();
		put(COLLECTION, collection("App A", "ping", "pong"));
		edit(PING, "/ping", "/ping-two");
		const result = await sync({ dryRun: true });
		expect(result.files.some((f) => f.state === "conflict")).toBe(true);
	});
});
