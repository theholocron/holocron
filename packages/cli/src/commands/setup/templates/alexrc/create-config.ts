import alexrc from "./alexrc.json";

export function createConfig(): string {
	return JSON.stringify(alexrc, null, 2) + "\n";
}
