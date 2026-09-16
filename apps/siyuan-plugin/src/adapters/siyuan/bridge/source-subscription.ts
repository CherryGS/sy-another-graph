interface SourceUpdateTarget {
  sourceChanged(version: number): void;
  setActive(active: boolean): void;
}

export function subscribeSourceRefresh(target: Window, refresh: SourceUpdateTarget) {
  let hostActive = true;
  const visibility = () =>
    refresh.setActive(hostActive && target.document.visibilityState !== "hidden");
  const message = (event: MessageEvent) => {
    if (
      target.parent === target ||
      event.source !== target.parent ||
      event.origin !== target.location.origin
    )
      return;
    const data = event.data;
    if (data?.channel !== "sy-another-graph") return;
    if (data.type === "source-changed" && typeof data.version === "number")
      refresh.sourceChanged(data.version);
    if (data.type === "host-visibility" && typeof data.active === "boolean") {
      hostActive = data.active;
      visibility();
    }
  };
  target.addEventListener("message", message);
  target.document.addEventListener("visibilitychange", visibility);
  visibility();
  return () => {
    target.removeEventListener("message", message);
    target.document.removeEventListener("visibilitychange", visibility);
  };
}
