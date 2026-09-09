import { isNativeBlockId } from "./scope-menu";

export interface PreviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isRect(value: unknown): value is PreviewRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as PreviewRect;
  return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height > 0;
}

/** SiYuan's document-level block-ref handler owns the delay and the BlockPanel.
 * The invisible host anchor only bridges the iframe's geometry and mouse events.
 * No editor, native setting, or native panel lifecycle is reimplemented here. */
export class NativeBlockPreview {
  private anchor: HTMLSpanElement | null = null;
  private token: number | null = null;
  private readonly frame: HTMLIFrameElement;

  constructor(frame: HTMLIFrameElement) {
    this.frame = frame;
  }

  handle(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const data = message as Record<string, unknown>;
    if (data.channel !== "sy-another-graph" || data.type !== "native-preview"
      || !Number.isSafeInteger(data.token)) return;
    if (data.action === "leave" || data.action === "cancel") {
      if (data.token !== this.token) return;
      this.dismiss(data.action === "leave" ? data : undefined);
      return;
    }
    if (data.action !== "enter" || !isNativeBlockId(data.id) || !isRect(data.rect)) return;
    const bounds = this.frame.getBoundingClientRect();
    const rect = data.rect;
    const width = this.frame.clientWidth;
    const height = this.frame.clientHeight;
    if (width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0
      || rect.left < 0 || rect.top < 0 || rect.left >= width || rect.top >= height
      || rect.left + rect.width > width + 1 || rect.top + rect.height > height + 1) return;
    this.clear();
    const anchor = this.frame.ownerDocument.createElement("span");
    const scaleX = bounds.width / width;
    const scaleY = bounds.height / height;
    anchor.dataset.type = "block-ref";
    anchor.dataset.id = data.id;
    anchor.dataset.atlasPreview = "true";
    anchor.setAttribute("aria-hidden", "true");
    anchor.style.cssText = "position:fixed;display:block;opacity:0;pointer-events:none;";
    anchor.style.left = `${bounds.left + rect.left * scaleX}px`;
    anchor.style.top = `${bounds.top + rect.top * scaleY}px`;
    anchor.style.width = `${rect.width * scaleX}px`;
    anchor.style.height = `${rect.height * scaleY}px`;
    this.frame.ownerDocument.body.appendChild(anchor);
    this.anchor = anchor;
    this.token = data.token as number;
    this.mouseover(anchor);
  }

  clear(): void {
    if (!this.anchor) return;
    this.dismiss();
    this.anchor.remove();
    this.anchor = null;
    this.token = null;
  }

  private dismiss(pointer?: Record<string, unknown>): void {
    if (!this.anchor) return;
    // A pending native timer must not rediscover a reference after cancellation.
    // Keep its geometry until the next hover so an already loading panel can place
    // itself normally while SiYuan processes its own delayed dismissal.
    delete this.anchor.dataset.type;
    delete this.anchor.dataset.id;
    if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
      const bounds = this.frame.getBoundingClientRect();
      const target = this.frame.ownerDocument.elementFromPoint(
        bounds.left + (pointer.x as number) * bounds.width / this.frame.clientWidth,
        bounds.top + (pointer.y as number) * bounds.height / this.frame.clientHeight,
      );
      // Moving into a native overlay already delivers a real host mouseover. A
      // late iframe leave must not overwrite that event with a dismissal.
      if (target && target !== this.frame) return;
    }
    this.mouseover(this.frame);
  }

  private mouseover(target: HTMLElement): void {
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  }
}
