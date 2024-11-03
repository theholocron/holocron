type NamespacedStorageData = {
	[key: string]: unknown;
};

type AppStorageData = {
	[namespace: string]: {
		[appName: string]: NamespacedStorageData;
	};
};

export type TSessionStorage = {
	registerApp: (appName: string) => void;
	sendTo: (key: string, value: unknown) => void;
	getAll: () => object;
	getFrom: (key?: string | null) => string;
	removeFrom: (key: string) => void;
	clear: () => void;
};

const ERROR_MSG = "Nothing is currently registered!";

export const isSessionStorageAvailable: boolean = () =>
	typeof window !== "undefined" && window.sessionStorage;

function createStorage(namespace = "theholocron"): TSessionStorage {
	const prefixedNamespace = `@${namespace}`;
	let lastRegisteredApp: string | undefined;
	const storage: AppStorageData = {};

	function getAppStorage(appName: string): NamespacedStorageData {
		if (!storage[prefixedNamespace]) {
			storage[prefixedNamespace] = {};
		}
		if (!storage[prefixedNamespace][appName]) {
			storage[prefixedNamespace][appName] = {};
		}
		lastRegisteredApp = appName;

		return storage[prefixedNamespace][appName];
	}

	return {
		registerApp(appName: string) {
			getAppStorage(appName);
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		sendTo(key: string, value: any) {
			if (!lastRegisteredApp) {
				throw new Error(ERROR_MSG);
			}
			const appStorage = getAppStorage(lastRegisteredApp);
			const keys = key.split("."); // Split the key by '.'
			let currentLevel = appStorage;

			// Traverse through the keys except the last one
			for (let i = 0; i < keys.length - 1; i++) {
				const subKey = keys[i];

				// If the key doesn't exist, create an empty object
				if (!(subKey in currentLevel)) {
					currentLevel[subKey] = {};
				}

				currentLevel = currentLevel[subKey]; // Move deeper into the object
			}

			// Assign the value to the last key in the chain
			currentLevel[keys[keys.length - 1]] = value;

			try {
				sessionStorage.setItem(
					prefixedNamespace,
					JSON.stringify(storage)
				);
			} catch (error) {
				console.error("Failed to store data in sessionStorage", error);
			}
		},
		getAll() {
			if (!lastRegisteredApp) {
				throw new Error(ERROR_MSG);
			}
			return storage;
		},
		getFrom(key: string | null = null) {
			if (!lastRegisteredApp) {
				throw new Error(ERROR_MSG);
			}
			const appStorage = getAppStorage(lastRegisteredApp);

			try {
				const storedData = sessionStorage.getItem(prefixedNamespace);
				if (storedData) {
					const parsedData = JSON.parse(storedData);
					Object.assign(storage, parsedData); // Merge stored data into current storage
				}
			} catch (error) {
				console.error("Failed to read data in sessionStorage", error);
			}

			if (key !== null) {
				// Split key by dot notation for nested access
				const keys = key.split(".");
				let currentLevel = appStorage;

				for (let i = 0; i < keys.length; i++) {
					const subKey = keys[i];

					if (subKey in currentLevel) {
						currentLevel = currentLevel[subKey]; // Go deeper into the nested object
					} else {
						return null; // Return null if any part of the key is missing
					}
				}

				return currentLevel; // Return the nested value if found
			}

			return appStorage; // Return full storage if no key is provided
		},
		removeFrom(key: string) {
			if (!lastRegisteredApp) {
				throw new Error(ERROR_MSG);
			}
			const appStorage = getAppStorage(lastRegisteredApp);

			// Split key by dot notation for nested access
			const keys = key.split(".");
			let currentLevel = appStorage;

			// Traverse to the second-to-last key
			for (let i = 0; i < keys.length - 1; i++) {
				const subKey = keys[i];
				if (subKey in currentLevel) {
					currentLevel = currentLevel[subKey]; // Go deeper into the nested object
				} else {
					return; // Key doesn't exist, so nothing to remove
				}
			}

			const lastKey = keys[keys.length - 1];
			if (lastKey in currentLevel) {
				delete currentLevel[lastKey]; // Delete the final key in the path

				try {
					sessionStorage.setItem(
						prefixedNamespace,
						JSON.stringify(storage)
					);
				} catch (error) {
					console.error(
						"Failed to remove data from sessionStorage",
						error
					);
				}
			}
		},
		clear() {
			delete storage[prefixedNamespace];

			try {
				sessionStorage.removeItem(prefixedNamespace);
			} catch (error) {
				console.error("Failed to clear sessionStorage", error);
			}
		},
	};
}

export const session = {
	create: createStorage,
	isAvailable: isSessionStorageAvailable,
};
