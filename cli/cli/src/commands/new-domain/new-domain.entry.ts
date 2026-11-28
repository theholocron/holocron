import { type MenuEntry } from "@theholocron/kyber/menu";

export const newDomainEntry: MenuEntry = {
	name: "new domain",
	description: "Make a DNS record through the `dns` provider and keep it in .holocron/dns-records.json",
	positionals: [],
	options: [
		{ key: "type", flag: "--type", type: "input", message: "Type (CNAME, TXT, A or AAAA):", required: true },
		{ key: "name", flag: "--name", type: "input", message: "Hostname (e.g. status.example.dev):", required: true },
		{ key: "value", flag: "--value", type: "input", message: "Value, as the vendor shows it:", required: true },
		{ key: "note", flag: "--note", type: "input", message: "Note (which vendor serves it):" },
	],
	skipOptions: ["proxied", "yes"],
	supportsDryRun: true,
};
