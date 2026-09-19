import { discover } from "./algorithm";
import { failureOf } from "../../core/diagnostics/message";
import type { DiscoveryRequest } from "./types";

self.onmessage = (event: MessageEvent<DiscoveryRequest>) => {
  try {
    self.postMessage({ result: discover(event.data) });
  } catch (error) {
    self.postMessage({ error: failureOf(error) });
  }
};
