import { vi, describe, it, expect, beforeEach } from "vitest";

// Capture callbacks registered with vitest's lifecycle hooks so we can
// invoke them directly and verify the behavior of each registered function.
const hooks: {
	beforeAll: Array<() => Promise<void>>;
	afterEach: Array<() => void>;
	afterAll: Array<() => void>;
} = { beforeAll: [], afterEach: [], afterAll: [] };

vi.mock("vitest", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vitest")>();
	return {
		...actual,
		beforeAll: vi.fn((fn: () => Promise<void>) => {
			hooks.beforeAll.push(fn);
		}),
		afterEach: vi.fn((fn: () => void) => {
			hooks.afterEach.push(fn);
		}),
		afterAll: vi.fn((fn: () => void) => {
			hooks.afterAll.push(fn);
		}),
	};
});

import { setupMSWBrowser, setupMSWNode } from "./msw.js";

describe("setupMSWBrowser", () => {
	beforeEach(() => {
		hooks.beforeAll.length = 0;
		hooks.afterEach.length = 0;
		hooks.afterAll.length = 0;
	});

	it("calls annotations.beforeAll before worker.start", async () => {
		const order: string[] = [];
		const worker = {
			start: vi.fn(async () => {
				order.push("start");
			}),
			resetHandlers: vi.fn(),
			stop: vi.fn(),
		};
		const annotations = {
			beforeAll: vi.fn(async () => {
				order.push("annotations");
			}),
		};
		setupMSWBrowser(worker, annotations);
		await hooks.beforeAll[0]();
		expect(order).toEqual(["annotations", "start"]);
		expect(worker.start).toHaveBeenCalledWith({ onUnhandledRequest: "warn" });
	});

	it("starts worker without annotations", async () => {
		const worker = {
			start: vi.fn(async () => {}),
			resetHandlers: vi.fn(),
			stop: vi.fn(),
		};
		setupMSWBrowser(worker);
		await hooks.beforeAll[0]();
		expect(worker.start).toHaveBeenCalledWith({ onUnhandledRequest: "warn" });
	});

	it("calls worker.resetHandlers in afterEach", () => {
		const worker = {
			start: vi.fn(),
			resetHandlers: vi.fn(),
			stop: vi.fn(),
		};
		setupMSWBrowser(worker);
		hooks.afterEach[0]();
		expect(worker.resetHandlers).toHaveBeenCalledOnce();
	});

	it("calls worker.stop in afterAll", () => {
		const worker = {
			start: vi.fn(),
			resetHandlers: vi.fn(),
			stop: vi.fn(),
		};
		setupMSWBrowser(worker);
		hooks.afterAll[0]();
		expect(worker.stop).toHaveBeenCalledOnce();
	});
});

describe("setupMSWNode", () => {
	beforeEach(() => {
		hooks.beforeAll.length = 0;
		hooks.afterEach.length = 0;
		hooks.afterAll.length = 0;
	});

	it("calls annotations.beforeAll before server.listen", async () => {
		const order: string[] = [];
		const server = {
			listen: vi.fn(() => {
				order.push("listen");
			}),
			resetHandlers: vi.fn(),
			close: vi.fn(),
		};
		const annotations = {
			beforeAll: vi.fn(async () => {
				order.push("annotations");
			}),
		};
		setupMSWNode(server, annotations);
		await hooks.beforeAll[0]();
		expect(order).toEqual(["annotations", "listen"]);
		expect(server.listen).toHaveBeenCalledWith({ onUnhandledRequest: "warn" });
	});

	it("starts server without annotations", async () => {
		const server = {
			listen: vi.fn(),
			resetHandlers: vi.fn(),
			close: vi.fn(),
		};
		setupMSWNode(server);
		await hooks.beforeAll[0]();
		expect(server.listen).toHaveBeenCalledWith({ onUnhandledRequest: "warn" });
	});

	it("calls server.resetHandlers in afterEach", () => {
		const server = {
			listen: vi.fn(),
			resetHandlers: vi.fn(),
			close: vi.fn(),
		};
		setupMSWNode(server);
		hooks.afterEach[0]();
		expect(server.resetHandlers).toHaveBeenCalledOnce();
	});

	it("calls server.close in afterAll", () => {
		const server = {
			listen: vi.fn(),
			resetHandlers: vi.fn(),
			close: vi.fn(),
		};
		setupMSWNode(server);
		hooks.afterAll[0]();
		expect(server.close).toHaveBeenCalledOnce();
	});
});
