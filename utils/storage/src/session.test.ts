import { createStorage } from "./create-storage";

describe("Storage", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	describe("createStorage", () => {
		test("default namespace", () => {
			const vault = createStorage();

			vault.registerApp("myApp");
			const storage = vault.getAll();

			expect(Object.keys(storage)[0]).toBe("@theholocron");
		});

		test("custom namespace", () => {
			const vault = createStorage("mockNamespace");

			vault.registerApp("myApp");
			const storage = vault.getAll();

			expect(Object.keys(storage)[0]).toBe("@mockNamespace");
		});
	});

	describe("sendTo", () => {
		test("throws an error if no app is registered when sending data", () => {
			const vault = createStorage("mockapp");

			expect(() => {
				vault.sendTo("name", "myApp");
			}).toThrow("No app is currently registered!");
		});

		test("send data to the vault", () => {
			const vault = createStorage("mockapp");

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
		test("throws an error if no app is registered when getting all data", () => {
			const vault = createStorage("mockapp");

			expect(() => {
				vault.getAll();
			}).toThrow("No app is currently registered!");
		});

		test("get all data", () => {
			const vault = createStorage("mockapp");

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
		const vault = createStorage("mockapp");

		test("throw an error if no app is registered when getting data", () => {
			const vault = createStorage("mockapp");

			expect(() => {
				vault.getFrom("name");
			}).toThrow("No app is currently registered!");
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

		test("get all data when no key is passed", () => {
			const retrievedStorage = vault.getFrom();
			expect(retrievedStorage).toEqual({
				appName,
				amount,
			});
		});
	});

	describe("removeFrom", () => {
		test("throws an error if no app is registered when removing data", () => {
			const vault = createStorage("mockapp");

			expect(() => {
				vault.removeFrom("name");
			}).toThrow("No app is currently registered!");
		});

		test("removes data from app storage", () => {
			const vault = createStorage("mockapp");
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
			const vault = createStorage("mockapp");
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
