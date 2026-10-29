import { afterEach, beforeEach, vi } from "vitest";

import { storage } from "./index.ts";

describe("Session Storage", () => {
	beforeEach(() => sessionStorage.clear());
	afterEach(() => vi.restoreAllMocks());

	describe("storage.session.create", () => {
		test("default namespace", () => {
			const vault = storage.session.create();

			vault.registerApp("myApp");
			const data = vault.getAll();

			expect(Object.keys(data)[0]).toBe("@theholocron");
		});

		test("custom namespace", () => {
			const vault = storage.session.create("mockNamespace");

			vault.registerApp("myApp");
			const data = vault.getAll();

			expect(Object.keys(data)[0]).toBe("@mockNamespace");
		});
	});

	describe("sendTo", () => {
		test("throws an error if nothing is registered when sending data", () => {
			const vault = storage.session.create("mockapp");

			expect(() => {
				vault.sendTo("name", "myApp");
			}).toThrow("Nothing is currently registered!");
		});

		test("send data to the vault", () => {
			const vault = storage.session.create("mockapp");

			const appName = "myApp";
			vault.registerApp(appName);

			const name = "appName";
			const amount = 1000;

			vault.sendTo(name, appName);
			vault.sendTo("amount", amount);
			vault.sendTo("foo.bar", "baz");

			const retrievedName = vault.getFrom(name);
			const retrievedAmount = vault.getFrom("amount");
			const retrievedNested = vault.getFrom("foo.bar");

			expect(retrievedName).toBe(appName);
			expect(retrievedAmount).toBe(amount);
			expect(retrievedNested).toBe("baz");
		});
	});

	describe("getAll", () => {
		test("throws an error if nothing is registered when getting all data", () => {
			const vault = storage.session.create("mockapp");

			expect(() => {
				vault.getAll();
			}).toThrow("Nothing is currently registered!");
		});

		test("get all data", () => {
			const vault = storage.session.create("mockapp");

			const appName = "myApp";
			vault.registerApp(appName);

			const name = "appName";
			const amount = 1000;

			vault.sendTo(name, appName);
			vault.sendTo("amount", amount);

			const retrievedAllStorage = vault.getAll();
			expect(retrievedAllStorage).toEqual({
				"@mockapp": {
					myApp: {
						appName,
						amount,
					},
				},
			});
		});
	});

	describe("getFrom", () => {
		const vault = storage.session.create("mockapp");

		test("throw an error if nothing is registered when getting data", () => {
			const vault = storage.session.create("mockapp");

			expect(() => {
				vault.getFrom("name");
			}).toThrow("Nothing is currently registered!");
		});

		const appName = "myApp";
		vault.registerApp(appName);

		const name = "appName";
		const amount = 1000;

		vault.sendTo(name, appName);
		vault.sendTo("amount", amount);
		vault.sendTo("foo.bar", "baz");

		test("get data by key", () => {
			const retrievedName = vault.getFrom(name);
			const retrievedAmount = vault.getFrom("amount");
			const retrievedNested = vault.getFrom("foo.bar");

			expect(retrievedName).toBe(appName);
			expect(retrievedAmount).toBe(amount);
			expect(retrievedNested).toBe("baz");
		});
	});

	describe("removeFrom", () => {
		test("throws an error if is nothing registered when removing data", () => {
			const vault = storage.session.create("mockapp");

			expect(() => {
				vault.removeFrom("name");
			}).toThrow("Nothing is currently registered!");
		});

		test("removes data from app storage", () => {
			const vault = storage.session.create("mockapp");
			const appName = "myApp";
			vault.registerApp(appName);

			vault.sendTo("name", "myApp");
			vault.sendTo("amount", 1000);

			vault.removeFrom("name");
			const retrievedName = vault.getFrom("name");
			const retrievedAmount = vault.getFrom("amount");

			expect(retrievedName).toBeNull();
			expect(retrievedAmount).toBe(1000);
		});

		test("removes nested data from app storage", () => {
			const vault = storage.session.create("mockapp");
			vault.registerApp("myApp");

			vault.sendTo("foo.bar", "baz");
			vault.removeFrom("foo.bar");

			expect(vault.getFrom("foo.bar")).toBeNull();
		});
	});

	describe("clear", () => {
		test("clears the storage", () => {
			const vault = storage.session.create("mockapp");
			const appName = "myApp";
			vault.registerApp(appName);

			vault.sendTo("name", "myApp");
			vault.sendTo("amount", 1000);

			vault.clear();

			const retrievedName = vault.getFrom("name");
			const retrievedAmount = vault.getFrom("amount");

			expect(retrievedName).toBeNull();
			expect(retrievedAmount).toBeNull();
		});
	});

	describe("sessionStorage persistence", () => {
		test("sendTo persists data to sessionStorage", () => {
			const vault = storage.session.create("persist");
			vault.registerApp("app");
			vault.sendTo("key", "value");

			const raw = sessionStorage.getItem("@persist");
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw!);
			expect(parsed["@persist"]["app"]["key"]).toBe("value");
		});

		test("getFrom reads data written to sessionStorage by another instance", () => {
			const writer = storage.session.create("shared");
			writer.registerApp("app");
			writer.sendTo("token", "abc123");

			const reader = storage.session.create("shared");
			reader.registerApp("app");
			const value = reader.getFrom("token");

			expect(value).toBe("abc123");
		});

		test("removeFrom updates sessionStorage", () => {
			const vault = storage.session.create("rem");
			vault.registerApp("app");
			vault.sendTo("a", 1);
			vault.sendTo("b", 2);
			vault.removeFrom("a");

			const raw = sessionStorage.getItem("@rem");
			const parsed = JSON.parse(raw!);
			expect(parsed["@rem"]["app"]["a"]).toBeUndefined();
			expect(parsed["@rem"]["app"]["b"]).toBe(2);
		});

		test("clear removes the namespace key from sessionStorage", () => {
			const vault = storage.session.create("clr");
			vault.registerApp("app");
			vault.sendTo("x", 42);
			vault.clear();

			expect(sessionStorage.getItem("@clr")).toBeNull();
		});

		test("sendTo logs error when sessionStorage.setItem throws", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
				throw new DOMException("QuotaExceededError");
			});

			const vault = storage.session.create("err");
			vault.registerApp("app");
			vault.sendTo("k", "v");

			expect(errorSpy).toHaveBeenCalledWith("Failed to store data in sessionStorage", expect.any(DOMException));
		});

		test("getFrom logs error when sessionStorage.getItem throws", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			vi.spyOn(sessionStorage, "getItem").mockImplementation(() => {
				throw new DOMException("SecurityError");
			});

			const vault = storage.session.create("err2");
			vault.registerApp("app");
			vault.sendTo("k", "v");
			errorSpy.mockClear();

			vault.getFrom("k");
			expect(errorSpy).toHaveBeenCalledWith("Failed to read data in sessionStorage", expect.any(DOMException));
		});

		test("removeFrom logs error when sessionStorage.setItem throws", () => {
			const vault = storage.session.create("err3");
			vault.registerApp("app");
			vault.sendTo("k", "v");

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
				throw new DOMException("QuotaExceededError");
			});

			vault.removeFrom("k");
			expect(errorSpy).toHaveBeenCalledWith(
				"Failed to remove data from sessionStorage",
				expect.any(DOMException)
			);
		});

		test("clear logs error when sessionStorage.removeItem throws", () => {
			const vault = storage.session.create("err4");
			vault.registerApp("app");
			vault.sendTo("k", "v");

			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			vi.spyOn(sessionStorage, "removeItem").mockImplementation(() => {
				throw new DOMException("SecurityError");
			});

			vault.clear();
			expect(errorSpy).toHaveBeenCalledWith("Failed to clear sessionStorage", expect.any(DOMException));
		});

		test("removeFrom does nothing when nested key path does not exist", () => {
			const vault = storage.session.create("nokey");
			vault.registerApp("app");
			vault.sendTo("a", 1);

			expect(() => vault.removeFrom("missing.nested")).not.toThrow();
			expect(vault.getFrom("a")).toBe(1);
		});
	});

	describe("nested keys and missing paths", () => {
		test("sendTo reuses an intermediate object that already exists", () => {
			const vault = storage.session.create("nested");
			vault.registerApp("app");

			vault.sendTo("a.b", 1);
			vault.sendTo("a.c", 2);

			expect(vault.getFrom("a")).toEqual({ b: 1, c: 2 });
		});

		test("removeFrom leaves everything alone when the last key does not exist", () => {
			const setItem = vi.spyOn(Storage.prototype, "setItem");
			const vault = storage.session.create("rm-missing");
			vault.registerApp("app");
			vault.sendTo("a.b", 1);
			setItem.mockClear();

			vault.removeFrom("a.nope");

			expect(vault.getFrom("a")).toEqual({ b: 1 });
			expect(setItem).not.toHaveBeenCalled();
		});

		test("removeFrom ignores a path whose middle does not exist", () => {
			const vault = storage.session.create("rm-middle");
			vault.registerApp("app");
			vault.sendTo("a", 1);

			expect(() => vault.removeFrom("x.y.z")).not.toThrow();
			expect(vault.getFrom("a")).toBe(1);
		});

		test("the default logger prints just the message when the thrown value is undefined", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
				throw undefined;
			});

			const vault = storage.session.create("undef");
			vault.registerApp("app");
			vault.sendTo("k", "v");

			expect(errorSpy).toHaveBeenCalledWith("Failed to store data in sessionStorage");
		});
	});

	describe("without sessionStorage", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
			vi.resetModules();
		});

		test("keeps everything in memory and never touches the browser", async () => {
			const setItem = vi.spyOn(Storage.prototype, "setItem");
			const removeItem = vi.spyOn(Storage.prototype, "removeItem");
			vi.stubGlobal("window", undefined);
			vi.resetModules();
			const { storage: bare } = await import("./index.ts");

			const vault = bare.session.create("memory");
			vault.registerApp("app");
			vault.sendTo("a.b", 1);
			vault.sendTo("a.c", 2);
			vault.removeFrom("a.b");
			vault.removeFrom("a.nope");
			const read = vault.getFrom("a");
			vault.clear();

			expect(read).toEqual({ c: 2 });
			expect(vault.getAll()).toEqual({});
			expect(setItem).not.toHaveBeenCalled();
			expect(removeItem).not.toHaveBeenCalled();
		});
	});
});
