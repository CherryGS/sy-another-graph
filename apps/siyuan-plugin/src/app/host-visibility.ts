import { useEffect, useState } from "react";

/** Visibility is a host lifecycle signal, never a request to reload the graph. */
export function subscribeHostVisibility(
  target: Window,
  publish: (active: boolean) => void,
) {
  let hostActive = true;
  const update = () =>
    publish(hostActive && target.document.visibilityState !== "hidden");
  const onMessage = (event: MessageEvent) => {
    if (
      event.source !== target.parent ||
      event.origin !== target.location.origin
    )
      return;
    const message = event.data;
    if (
      message?.channel !== "sy-another-graph" ||
      message.type !== "host-visibility" ||
      typeof message.active !== "boolean"
    )
      return;
    hostActive = message.active;
    update();
  };
  target.addEventListener("message", onMessage);
  target.document.addEventListener("visibilitychange", update);
  if (target.parent !== target)
    target.parent.postMessage(
      { channel: "sy-another-graph", type: "workbench-ready" },
      target.location.origin,
    );
  update();
  return () => {
    target.removeEventListener("message", onMessage);
    target.document.removeEventListener("visibilitychange", update);
  };
}

export function useHostVisibility() {
  const [active, setActive] = useState(true);
  useEffect(() => subscribeHostVisibility(window, setActive), []);
  return active;
}
