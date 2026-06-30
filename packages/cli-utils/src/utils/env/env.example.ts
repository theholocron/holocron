import { env } from "@/utils";

const [err, data] = env.read();

if (err) {
	console.error(err);
	process.exit(1);
}

console.log("Complete env");
console.log(data);

const [singleErr, singleData] = env.read("VERBOSE");

if (singleErr) {
	console.error(singleErr);
	process.exit(1);
}

console.log("Single key env");
console.log(singleData);
