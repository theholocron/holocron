import { describe, expect, it, vi } from "vitest";

import type { EnsureRelaySourceResult } from "../../plugin/index.js";
import { ensureRelaySource } from "./ensure-relay-source.js";
import type { RelaySourceProvider } from "./relay-sources.type.js";

const source = { id: "doppler", spec: { capability: "vault" as const, events: ["config.secrets.update"] } };
const input = { host: "comlink.example.dev", newSecret: () => "FRESH" };
const setup = (result: EnsureRelaySourceResult | undefined, dryRun = false) => {
	const ensure = vi.fn(async () => result!);
	const provider: RelaySourceProvider = {
		key: "vault",
		providerName: "doppler",
		...(result ? { ensureRelaySource: ensure } : {}),
	};
	const lines: string[] = [];
	const made: boolean[] = [];
	return {
		ensure,
		provider,
		lines,
		made,
		run: { print: (l: string) => lines.push(l), made: (c: boolean) => made.push(c), dryRun },
	};
};

describe("ensureRelaySource", () => {
	it("asks the provider for the relay URL with a fresh secret and returns the secret it gives back, printing neither", async () => {
		const s = setup({ created: true, updated: [], secret: "FRESH" });
		const out = await ensureRelaySource(source, s.provider, input, s.run);
		expect(s.ensure).toHaveBeenCalledWith({
			source: "doppler",
			url: "https://comlink.example.dev/doppler",
			name: "Doppler",
			events: ["config.secrets.update"],
			secret: "FRESH",
		});
		expect(out).toEqual({ secret: "FRESH", todo: [] });
		expect(s.lines.join("\n")).toContain("created doppler webhook Doppler");
		expect(s.lines.join("\n")).not.toContain("FRESH");
		expect(s.made).toEqual([true]);
	});

	it("uses the layout's name, and passes scope and options through", async () => {
		const s = setup({ created: false, updated: ["events"] });
		await ensureRelaySource(
			{ id: "cloudflare", spec: { capability: "workers", name: "Alerts", scope: ["a"], options: { x: 1 } } },
			s.provider,
			input,
			s.run
		);
		expect(s.ensure).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Alerts", scope: ["a"], options: { x: 1 } })
		);
		expect(s.lines.join("\n")).toContain("updated doppler webhook Alerts: events");
	});

	it("says an adopted webhook keeps the Worker's secret, and warns when a new one gave none", async () => {
		const adopted = setup({ created: false, updated: [] });
		const out = await ensureRelaySource(source, adopted.provider, input, adopted.run);
		expect(out.secret).toBeUndefined();
		expect(adopted.lines.join("\n")).toContain("exists  doppler webhook Doppler");
		expect(adopted.lines.join("\n")).toContain("the Worker keeps the one it has");
		expect(adopted.made).toEqual([false]);
		const fresh = setup({ created: true, updated: [] });
		await ensureRelaySource(source, fresh.provider, input, fresh.run);
		expect(fresh.lines.join("\n")).toContain("set COMLINK_DOPPLER_SECRET on the Worker yourself");
	});

	it("hands back what the vendor's API cannot do", async () => {
		const s = setup({ created: true, updated: [], todo: ["add it in the dashboard"] });
		expect((await ensureRelaySource(source, s.provider, input, s.run)).todo).toEqual(["add it in the dashboard"]);
	});

	it("previews without asking the provider", async () => {
		const s = setup({ created: true, updated: [] }, true);
		expect(await ensureRelaySource(source, s.provider, input, s.run)).toEqual({ todo: [] });
		expect(s.ensure).not.toHaveBeenCalled();
		expect(s.lines.join("\n")).toContain(
			"would ensure the doppler webhook Doppler for https://comlink.example.dev/doppler"
		);
	});

	it("throws for a provider that cannot make a webhook", async () => {
		const s = setup(undefined);
		await expect(ensureRelaySource(source, s.provider, input, s.run)).rejects.toThrow(
			/cannot make a webhook for relay source doppler/
		);
	});
});
