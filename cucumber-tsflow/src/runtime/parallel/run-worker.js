"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const value_checker_1 = require("@cucumber/cucumber/lib/value_checker");
const worker_1 = require("./worker");
require("polyfill-symbol-metadata");
function run() {
    const exit = (exitCode, error, message) => {
        if ((0, value_checker_1.doesHaveValue)(error)) {
            console.error(new Error(message, { cause: error }));
        }
        process.exit(exitCode);
    };
    const worker = new worker_1.ChildProcessWorker({
        cwd: process.cwd(),
        exit,
        id: process.env.CUCUMBER_WORKER_ID,
        sendMessage: (message) => process.send(message),
        experimentalDecorators: process.env.EXPERIMENTAL_DECORATORS === 'true'
    });
    process.on('message', (m) => {
        worker.receiveMessage(m).catch((error) => exit(1, error, 'Unexpected error on worker.receiveMessage'));
    });
}
run();
//# sourceMappingURL=run-worker.js.map