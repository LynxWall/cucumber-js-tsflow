// Stands in for an ESM loader hooks thread: enables timing through `initialize()`, records a phase and a file,
// then tells the test it is ready to answer snapshot requests. Node keeps a real hooks thread alive itself;
// this one needs a timer for that, since `initialize()` unrefs the port. The test terminates the worker.
import { parentPort, workerData } from 'node:worker_threads';
import { initialize, recordFile, recordPhase, startTimer } from '../../lib/utils/tsflow-timing.mjs';

setInterval(() => {}, 60_000);
initialize(workerData);
const start = startTimer();
recordPhase('esm:load', start);
recordFile('load', 'file:///hooks/a.ts', start);
parentPort.postMessage('ready');
