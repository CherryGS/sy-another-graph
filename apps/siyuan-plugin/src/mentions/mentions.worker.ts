import { MentionWorkerRuntime } from "./worker-runtime";
import type { MentionRequest, MentionResponse } from "./protocol";

const scope = globalThis as unknown as {
  postMessage(message: MentionResponse): void;
  onmessage: ((event: MessageEvent<MentionRequest>) => void) | null;
};
const runtime = new MentionWorkerRuntime(message => scope.postMessage(message));
scope.onmessage = event => runtime.receive(event.data);
