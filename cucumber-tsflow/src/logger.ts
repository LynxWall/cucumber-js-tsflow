import * as log4js from "log4js";
const logger = log4js.getLogger("cucumber-js.tsflow");

logger.level = "debug"; // default level is OFF - which means no logs at all.

export default logger;
