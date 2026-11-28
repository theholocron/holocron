import { spawnSync } from "node:child_process";

import type { RunPublishInput } from "./run-publish/index.js";

export const defaultExec: NonNullable<RunPublishInput["exec"]> = async (cmd, args, opts) => {
	// HOLOCRON_OTP (when set) is this process's own secret-delivery channel
	// from the interactive menu (holocron#1052) -- already consumed via
	// resolveOtp() and passed to this exact pnpm/npm call as an explicit
	// --otp arg when needed. It must never also be inherited into that
	// subprocess's own env: npm/pnpm never reads an OTP from there, but a
	// compromised package's lifecycle script (prepublishOnly, etc.) could.
	const { HOLOCRON_OTP: _omittedOtp, ...env } = process.env;
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd,
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
		env,
	});
	return {
		exitCode: result.status ?? -1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
};
