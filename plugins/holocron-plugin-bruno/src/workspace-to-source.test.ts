import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { collectionFiles } from "./collection-files.js";
import { canonicalJson, environmentToSource, hashOf, keepOriginal, workspaceToSource } from "./workspace-to-source.js";

type Loose = ReturnType<typeof JSON.parse>;

/** This repository's root: the real request files are the fidelity fixture. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const readRepoJson = (path: string) => JSON.parse(readFileSync(`${REPO_ROOT}${path}`, "utf8")) as Loose;
const requestsOf = (files: Map<string, string>) =>
	new Map([...files].filter(([path]) => !path.startsWith("environments/")));

describe("canonicalJson and hashOf", () => {
	it("gives the same text whatever the key order, and a different one for a different value", () => {
		expect(canonicalJson({ b: [{ y: 1, x: 2 }], a: null })).toBe(canonicalJson({ a: null, b: [{ x: 2, y: 1 }] }));
		expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
		expect(hashOf("a")).toMatch(/^[0-9a-f]{64}$/);
		expect(hashOf("a")).not.toBe(hashOf("b"));
	});
});

describe("workspaceToSource: the committed Sentinel collection, written and read back", () => {
	const original = readRepoJson("apps/sentinel/requests/collection.json");
	const files = async (collection: unknown) => requestsOf((await collectionFiles(collection, [])).files);

	it("keeps the structure, the order, the requests, their bodies and their headers", async () => {
		const back = workspaceToSource(await files(original));
		const names = (items: Loose[]): unknown[] => items.map((i) => (i.item ? [i.name, names(i.item)] : i.name));
		expect(names(back.item as Loose[])).toEqual(names(original.item));
		const flat = (items: Loose[]): Loose[] => items.flatMap((i) => (i.item ? flat(i.item) : [i]));
		const before = flat(original.item);
		const after = flat(back.item as Loose[]);
		for (const [index, request] of before.entries()) {
			expect(after[index].request.method).toBe(request.request.method);
			expect(after[index].request.url.raw).toBe(request.request.url.raw);
			expect(after[index].request.body).toEqual(request.request.body);
			expect(after[index].request.description).toBe(request.request.description);
			expect(after[index].request.header.map((h: Loose) => [h.key, h.value])).toEqual(
				request.request.header.map((h: Loose) => [h.key, h.value])
			);
		}
	});

	it("keeps the collection's and the folders' descriptions and the collection variables", async () => {
		const back = workspaceToSource(await files(original));
		expect((back.info as Loose).name).toBe(original.info.name);
		expect((back.info as Loose).description).toBe(original.info.description);
		expect((back.item as Loose[]).map((f) => f.description)).toEqual(
			original.item.map((f: Loose) => f.description)
		);
		expect(back.variable).toEqual(original.variable);
	});

	it("keeps the signing script, in Postman's own calls, on the folders that hold it", async () => {
		const back = workspaceToSource(await files(original));
		const script = (folder: Loose) =>
			folder.event?.find((e: Loose) => e.listen === "prerequest")?.script.exec.join("\n");
		for (const [index, folder] of original.item.entries()) {
			const was = script(folder);
			if (was === undefined) continue;
			const now = script((back.item as Loose[])[index]) as string;
			expect(now).toContain('pm.variables.get("webhookSecret")');
			expect(now).toContain("CryptoJS.HmacSHA256(body, secret)");
			expect(now).toContain("X-Hub-Signature-256");
			expect(now).toContain("// Signs the body exactly as it is sent");
		}
	});

	it("keeps each request's test", async () => {
		const back = workspaceToSource(await files(original));
		const first = (back.item as Loose[])[0].item[0];
		expect(first.event[0].listen).toBe("test");
		expect(first.event[0].script.exec.join("\n")).toContain("405");
	});

	it("is the same once it has been written and read again", async () => {
		const once = workspaceToSource(await files(original));
		const twice = workspaceToSource(await files(once));
		expect(canonicalJson(twice)).toBe(canonicalJson(once));
	});

	it("is the same for the Comlink collection", async () => {
		const comlink = readRepoJson("apps/comlink/requests/collection.json");
		const once = workspaceToSource(await files(comlink));
		expect(canonicalJson(workspaceToSource(await files(once)))).toBe(canonicalJson(once));
		expect((once.item as Loose[]).length).toBe(comlink.item.length);
	});

	it("does not carry the variable Bruno makes up for a dynamic value", async () => {
		const back = workspaceToSource(await files(original));
		expect((back.variable as Loose[]).map((v) => v.key)).not.toContain("$guid");
	});
});

describe("workspaceToSource: what it needs", () => {
	it("needs the collection's own file", () => {
		expect(() => workspaceToSource(new Map())).toThrow(/opencollection\.yml: not found/);
	});

	it("names a request file that cannot be read", () => {
		const files = new Map([
			["opencollection.yml", "opencollection: 1.0.0\ninfo:\n  name: A\n"],
			["broken.yml", "not a request"],
		]);
		expect(() => workspaceToSource(files)).toThrow(/broken\.yml/);
	});

	it("names a collection file that cannot be read", () => {
		expect(() => workspaceToSource(new Map([["opencollection.yml", ": : :"]]))).toThrow(/opencollection\.yml/);
	});

	it("gives requests that carry no position one, in the order of their names", async () => {
		const made = await collectionFiles(
			{
				info: { name: "A", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
				item: [
					{ name: "one", request: { method: "GET", url: "http://x/1" } },
					{ name: "two", request: { method: "GET", url: "http://x/2" } },
				],
			},
			[]
		);
		const files = requestsOf(made.files);
		for (const [path, text] of files) files.set(path, text.replace(/\n {2}seq: \d+/, ""));
		const back = workspaceToSource(files);
		expect((back.item as Loose[]).map((i) => i.name)).toEqual(["one", "two"]);
	});
});

describe("environmentToSource", () => {
	it("reads a secret variable without a value and the rest as the request files write them", () => {
		const text = [
			"name: Local",
			"variables:",
			"  - name: baseUrl",
			"    value: http://x",
			"  - secret: true",
			"    name: token",
			"  - name: off",
			"    value: 1",
			"    disabled: true",
			"",
		].join("\n");
		const environment = environmentToSource(text, "env.yml");
		expect(environment.name).toBe("Local");
		expect(environment.values[0]).toEqual({ key: "baseUrl", value: "http://x", type: "default", enabled: true });
		expect(environment.values[1]).toEqual({ key: "token", value: "", type: "secret", enabled: true });
		expect(environment.values[2]).toMatchObject({ key: "off", enabled: false });
	});

	it("reads an environment with no variables as none", () => {
		expect(environmentToSource("name: Empty\n", "env.yml")).toEqual({ name: "Empty", values: [] });
	});

	it("names an environment file that cannot be read", () => {
		expect(() => environmentToSource(": : :", "bad/env.yml")).toThrow(/bad\/env\.yml/);
	});
});

describe("keepOriginal", () => {
	const item = (name: string, url: string, test = "t") => ({
		name,
		event: [{ listen: "test", script: { exec: [test] } }],
		request: { method: "GET", url: { raw: url } },
	});
	const original = {
		info: { name: "A", _postman_id: "keep-me" },
		item: [
			{
				name: "Group",
				description: "kept",
				item: [item("one", "http://x/1", "orig one"), item("two", "http://x/2", "orig two")],
			},
		],
		variable: [{ key: "a", value: "1" }],
	};
	const carried = {
		info: { name: "A" },
		item: [{ name: "Group", description: "kept", item: [item("one", "http://x/1"), item("two", "http://x/2")] }],
		variable: [{ key: "a", value: "1", type: "default" }],
	};

	it("keeps the original's text for everything the workspace carries the same as before", () => {
		const derived = structuredClone(carried);
		const merged = keepOriginal(derived, carried, original);
		expect(merged).toEqual(original);
	});

	it("rewrites only the request that changed, and only the part of it that changed", () => {
		const derived = structuredClone(carried);
		derived.item[0].item[0] = item("one", "http://x/changed");
		const merged = keepOriginal(derived, carried, original) as Loose;
		expect(merged.item[0].item[0].request.url.raw).toBe("http://x/changed");
		expect(merged.item[0].item[0].event[0].script.exec).toEqual(["orig one"]);
		expect(merged.item[0].item[1]).toEqual(original.item[0].item[1]);
		expect(merged.info).toEqual(original.info);
	});

	it("takes a folder's own change and keeps what is below it", () => {
		const derived = structuredClone(carried);
		derived.item[0].description = "changed";
		const merged = keepOriginal(derived, carried, original) as Loose;
		expect(merged.item[0].description).toBe("changed");
		expect(merged.item[0].item).toEqual(original.item[0].item);
	});

	it("keeps an original key the derived collection changed the value of, but with the original's other keys", () => {
		const derived = structuredClone(carried);
		derived.info.name = "B";
		const merged = keepOriginal(derived, carried, original) as Loose;
		expect(merged.info).toEqual({ name: "B", _postman_id: "keep-me" });
	});

	it("takes an item the original does not have as it is, and drops one the workspace removed", () => {
		const derived = structuredClone(carried);
		derived.item[0].item = [derived.item[0].item[1]!, item("three", "http://x/3")];
		const merged = keepOriginal(derived, carried, original) as Loose;
		expect(merged.item[0].item.map((i: Loose) => i.name)).toEqual(["two", "three"]);
		expect(merged.item[0].item[0]).toEqual(original.item[0].item[1]);
	});

	it("takes a collection key the original does not have", () => {
		const derived = { ...structuredClone(carried), auth: { type: "noauth" } };
		expect((keepOriginal(derived, carried, original) as Loose).auth).toEqual({ type: "noauth" });
	});
});
