import { describe, expect, it } from "vitest";

import type { TemplateInputs } from "../template-inputs.js";
import { render as renderAuth } from "./auth.js";
import { render as renderAuthTest } from "./auth-test.js";
import { render as renderCapability } from "./capability.js";
import { render as renderCapabilityTest } from "./capability-test.js";
import { render as renderEslintConfig } from "./eslint-config.js";
import { render as renderHelpers } from "./helpers.js";
import { render as renderIndexTest } from "./index-test.js";
import { render as renderPackageJson } from "./package-json.js";
import { render as renderPluginIndex } from "./plugin-index.js";
import { render as renderReadme } from "./readme.js";
import { render as renderRest } from "./rest.js";
import { render as renderRestTest } from "./rest-test.js";
import { render as renderTsconfigJson } from "./tsconfig-json.js";
import { render as renderTsdownConfig } from "./tsdown-config.js";
import { render as renderValidateScript } from "./validate-script.js";
import { render as renderVerifyToken } from "./verify-token.js";
import { render as renderVerifyTokenTest } from "./verify-token-test.js";
import { render as renderVitestConfig } from "./vitest-config.js";

const inputs: TemplateInputs = {
	slug: "clerk",
	vendorName: "Clerk",
	vendorUpper: "CLERK",
	capability: "auth",
	capabilityClass: "ClerkAuth",
	tokenEnv: "HOLOCRON_CLERK_TOKEN",
	vendorEnv: "CLERK_SECRET_KEY",
	baseUrl: "https://api.clerk.com/v1",
	transport: "rest",
};

describe("auth", () => {
	it("references the token env var and keyring account", () => {
		const out = renderAuth(inputs);
		expect(out).toContain("HOLOCRON_CLERK_TOKEN");
		expect(out).toContain("clerk");
	});
});

describe("auth-test", () => {
	it("imports from auth.js", () => {
		expect(renderAuthTest(inputs)).toContain(`from "../auth.js"`);
	});
});

describe("capability", () => {
	it("embeds the capability key and vendor name", () => {
		const out = renderCapability(inputs);
		expect(out).toContain("auth");
		expect(out).toContain("Clerk");
		expect(out).toContain("ClerkAuth");
	});
});

describe("capability-test", () => {
	it("imports the capability class", () => {
		expect(renderCapabilityTest(inputs)).toContain("ClerkAuth");
	});
});

describe("eslint-config", () => {
	it("extends the root config", () => {
		expect(renderEslintConfig(inputs)).toContain("eslint.config.js");
	});
});

describe("helpers", () => {
	it("exports stubFetch", () => {
		expect(renderHelpers(inputs)).toContain("stubFetch");
	});
});

describe("index-test", () => {
	it("imports from index.js", () => {
		expect(renderIndexTest(inputs)).toContain(`from "../index.js"`);
	});
});

describe("package-json", () => {
	it("uses the slug for the package name and directory", () => {
		const out = renderPackageJson(inputs);
		const parsed = JSON.parse(out) as Record<string, unknown>;
		expect(parsed["name"]).toBe("@theholocron/holocron-plugin-clerk");
		expect((parsed["repository"] as Record<string, string>)["directory"]).toContain("clerk");
	});

	it("includes the capability in the description", () => {
		expect(renderPackageJson(inputs)).toContain("auth");
	});
});

describe("plugin-index", () => {
	it("exports the capability class and createPlugin", () => {
		const out = renderPluginIndex(inputs);
		expect(out).toContain("ClerkAuth");
		expect(out).toContain("createPlugin");
	});
});

describe("readme", () => {
	it("includes the slug, vendor name, token env, and base URL", () => {
		const out = renderReadme(inputs);
		expect(out).toContain("clerk");
		expect(out).toContain("Clerk");
		expect(out).toContain("HOLOCRON_CLERK_TOKEN");
		expect(out).toContain("https://api.clerk.com/v1");
	});
});

describe("rest", () => {
	it("creates a vendor-named REST client factory", () => {
		const out = renderRest(inputs);
		expect(out).toContain("createClerkRestClient");
		expect(out).toContain("https://api.clerk.com/v1");
	});
});

describe("rest-test", () => {
	it("imports the vendor REST client factory", () => {
		expect(renderRestTest(inputs)).toContain("createClerkRestClient");
	});
});

describe("tsconfig-json", () => {
	it("sets the display name to the vendor", () => {
		const out = renderTsconfigJson(inputs);
		const parsed = JSON.parse(out) as Record<string, unknown>;
		expect(parsed["display"]).toContain("Clerk");
	});
});

describe("tsdown-config", () => {
	it("produces a valid tsdown config string", () => {
		expect(renderTsdownConfig(inputs)).toContain("defineConfig");
		expect(renderTsdownConfig(inputs)).toContain("src/index.ts");
	});
});

describe("validate-script", () => {
	it("references the token env var and base URL", () => {
		const out = renderValidateScript(inputs);
		expect(out).toContain("HOLOCRON_CLERK_TOKEN");
		expect(out).toContain("https://api.clerk.com/v1");
	});
});

describe("verify-token", () => {
	it("references the vendor REST client", () => {
		expect(renderVerifyToken(inputs)).toContain("ClerkRestClient");
	});
});

describe("verify-token-test", () => {
	it("imports from verify-token.js", () => {
		expect(renderVerifyTokenTest(inputs)).toContain(`from "../verify-token.js"`);
	});
});

describe("vitest-config", () => {
	it("produces a vitest config string", () => {
		expect(renderVitestConfig(inputs)).toContain("defineConfig");
		expect(renderVitestConfig(inputs)).toContain("environment");
	});
});
