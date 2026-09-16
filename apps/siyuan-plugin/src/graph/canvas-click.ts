import type { CanvasSelectEvent } from "./types";

export type CanvasClick =
  | { kind: "inspect"; id: string | null; event: CanvasSelectEvent }
  | { kind: "open"; id: string }
  | { kind: "none" };

/** Node circles and both label layers share one gesture meaning. */
export function canvasClick(id: string | null, event: CanvasSelectEvent): CanvasClick {
  if (event.detail === 2) {
    if (id && !event.shiftKey) return { kind: "open", id };
    return { kind: "none" };
  }
  return {
    kind: "inspect",
    id,
    event: { shiftKey: event.shiftKey, detail: event.detail },
  };
}
