import { storage } from "./index.ts";

describe("Session Storage", () => {
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

			const retrievedName = vault.getFrom(name);
			const retrievedAmount = vault.getFrom("amount");

			expect(retrievedName).toBe(appName);
			expect(retrievedAmount).toBe(amount);
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

		test("get data by key", () => {
			const retrievedName = vault.getFrom(name);
			const retrievedAmount = vault.getFrom("amount");

			expect(retrievedName).toBe(appName);
			expect(retrievedAmount).toBe(amount);
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
});
