import * as fs from "node:fs";
import * as path from "node:path";
import winston from "winston";
import { config } from "@/utils";

const LOGS = config.get("preferences.logs");

if (!fs.existsSync(LOGS)) {
	fs.mkdirSync(LOGS, { recursive: true });
}

export type LogLevel = "error" | "warn" | "info" | "verbose" | "debug" | "all";

export const logger = winston.createLogger({
	level: "info" as LogLevel,
	format: winston.format.combine(
		winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
		winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
	),
	transports: [
		new winston.transports.File({ filename: path.join(LOGS, "error.log"), level: "error" as LogLevel }),
		new winston.transports.File({ filename: path.join(LOGS, "warn.log"), level: "warn" as LogLevel }),
		new winston.transports.File({ filename: path.join(LOGS, "info.log"), level: "info" as LogLevel }),
		new winston.transports.File({ filename: path.join(LOGS, "verbose.log"), level: "verbose" as LogLevel }),
		new winston.transports.File({ filename: path.join(LOGS, "debug.log"), level: "debug" as LogLevel }),
		new winston.transports.File({ filename: path.join(LOGS, "log") }), // General log file
	],
});
