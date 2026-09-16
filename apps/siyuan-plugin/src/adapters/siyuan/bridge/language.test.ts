import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeWorkbenchLanguage, subscribeHostLanguage } from "./language";
import { locale, setLocale } from "../../../shared/i18n/runtime";

afterEach(() => setLocale("en"));

function host() {
  let receive: ((event: MessageEvent) => void) | undefined;
  const parent = { postMessage: vi.fn() };
  const target = {
    parent,
    document: { documentElement: { lang: "" } },
    location: {
      origin: "http://localhost:6806",
      href: "http://localhost:6806/plugins/graph/ui/?lang=zh-CN",
    },
    addEventListener: vi.fn((_type: string, callback: typeof receive) => {
      receive = callback;
    }),
    removeEventListener: vi.fn(() => {
      receive = undefined;
    }),
  };
  return {
    target: target as unknown as Window,
    parent,
    send(data: unknown, source: unknown = parent, origin = target.location.origin) {
      receive?.({ data, source, origin } as MessageEvent);
    },
  };
}

describe("trusted host language", () => {
  it("initializes the iframe language before rendering and requests the latest host language", () => {
    const h = host();
    initializeWorkbenchLanguage(h.target);
    expect(locale()).toBe("zh-CN");
    expect(h.target.document.documentElement.lang).toBe("zh-CN");
    const dispose = subscribeHostLanguage(h.target);
    expect(h.parent.postMessage).toHaveBeenCalledExactlyOnceWith(
      { channel: "sy-another-graph", type: "language-ready" },
      h.target.location.origin,
    );
    dispose();
    expect(h.target.removeEventListener).toHaveBeenCalledOnce();
  });
  it("ignores foreign, malformed and unsupported messages and updates only the owned iframe", () => {
    const h = host();
    initializeWorkbenchLanguage(h.target);
    const dispose = subscribeHostLanguage(h.target);
    const update = { channel: "sy-another-graph", type: "host-language", language: "en" };
    h.send(update, {});
    h.send(update, h.parent, "https://example.com");
    for (const value of [
      null,
      42,
      { ...update, channel: "other" },
      { ...update, type: "other" },
      { ...update, language: "fr" },
    ])
      h.send(value);
    expect(locale()).toBe("zh-CN");
    h.send(update);
    expect(locale()).toBe("en");
    expect(h.target.document.documentElement.lang).toBe("en");
    dispose();
    h.send({ ...update, language: "zh-CN" });
    expect(locale()).toBe("en");
  });
});
