import alexrc from "./alexrc.json";
import alexignore from "./alexignore";

export function createRcConfig(): string {
	return JSON.stringify(alexrc, null, 2) + "\n";
}

export function createIgnoreConfig(): string {
	return alexignore;
}
