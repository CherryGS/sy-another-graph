import { parentPort, workerData } from "node:worker_threads";

// Exercise the actual browser-built worker in a DOM-free runtime.
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
parentPort.on("message", (message) => globalThis.onmessage?.({ data: message }));
await import(workerData);
parentPort.postMessage({ kind: "boot" });
