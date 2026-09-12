import type { PresetStore } from "./model";

export const WORKBENCH_PRESET_CHANNEL = "sy-another-graph";

export type PresetRequest =
  | {
      channel: typeof WORKBENCH_PRESET_CHANNEL;
      type: "preset-load";
      request: string;
    }
  | {
      channel: typeof WORKBENCH_PRESET_CHANNEL;
      type: "preset-save";
      request: string;
      store: PresetStore;
    };

export type PresetResponse = {
  channel: typeof WORKBENCH_PRESET_CHANNEL;
  type: "preset-response";
  request: string;
} & (
  | { ok: true; store: PresetStore | null }
  | { ok: false; error: string }
);

export interface GraphTabStateMessage {
  channel: typeof WORKBENCH_PRESET_CHANNEL;
  type: "graph-tab-state";
  title: string;
  description: string;
}

export function isPresetRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
