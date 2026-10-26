import { parentPort, workerData } from 'node:worker_threads';
import { simulate } from './simulation-engine.js';
parentPort.postMessage(simulate(workerData.config, workerData.seed));
