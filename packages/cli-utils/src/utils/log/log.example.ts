import { log } from "@/utils";

const FN = "func";
const options = { debug: true };

console.log(log.style.bold("this message is bold"));

log.data(FN, "key", { test: "value" }, options);
log.error(FN, "This is an error message", options);
log.info(FN, "This is an info message", options);
log.process(FN, "this is a processing message", options);
log.success(FN, "This is a success message", options);
log.warning(FN, "This is a warning message", options);
