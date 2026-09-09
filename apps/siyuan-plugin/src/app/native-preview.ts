let nextToken = 0;
const clickSuppression = new WeakMap<Window, number>();

/** Bind only actual hover; clicking and keyboard activation keep the button's
 * existing action. Active listeners are removed as soon as the pointer leaves. */
export function bindNativePreview(element: HTMLElement, id: string): () => void {
  const target = element.ownerDocument.defaultView!;
  if (target.parent === target || !/^\d{14}-[a-z0-9]{7}$/.test(id)) return () => {};
  let active = false;
  let token = 0;
  const post = (data: Record<string, unknown>) => target.parent.postMessage(
    { channel: "sy-another-graph", type: "native-preview", token, ...data },
    target.location.origin,
  );
  const removeActiveListeners = () => {
    target.removeEventListener("scroll", cancel, true);
    target.removeEventListener("resize", cancel);
    target.removeEventListener("blur", cancel);
  };
  const cancel = () => {
    if (!active) return;
    active = false;
    removeActiveListeners();
    post({ action: "cancel" });
  };
  const enter = (event: MouseEvent) => {
    if (event.buttons || active || Date.now() < (clickSuppression.get(target) ?? 0)) return;
    const { left, top, width, height } = element.getBoundingClientRect();
    if (!width || !height) return;
    active = true;
    token = ++nextToken;
    post({ action: "enter", id, rect: { left, top, width, height } });
    target.addEventListener("scroll", cancel, true);
    target.addEventListener("resize", cancel);
    target.addEventListener("blur", cancel);
  };
  const leave = (event: MouseEvent) => {
    if (!active) return;
    active = false;
    removeActiveListeners();
    post({ action: "leave", x: event.clientX, y: event.clientY });
  };
  const press = () => {
    // Inspection can replace the row with a source card under the stationary
    // pointer. That layout-generated entry must not immediately reopen a preview.
    clickSuppression.set(target, Date.now() + 300);
    cancel();
  };
  element.addEventListener("mouseenter", enter);
  element.addEventListener("mouseleave", leave);
  element.addEventListener("mousedown", press);
  return () => {
    cancel();
    element.removeEventListener("mouseenter", enter);
    element.removeEventListener("mouseleave", leave);
    element.removeEventListener("mousedown", press);
  };
}
