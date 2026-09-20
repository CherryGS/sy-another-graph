import { locale, setLocale, t } from "../../../shared/i18n/runtime";

export function initializeWorkbenchLanguage(target: Window): void {
  setLocale(new URL(target.location.href).searchParams.get("lang"));
  target.document.documentElement.lang = locale();
  target.document.title = t("app.name");
}

export function subscribeHostLanguage(target: Window): () => void {
  const receive = (event: MessageEvent) => {
    if (
      target.parent === target ||
      event.source !== target.parent ||
      event.origin !== target.location.origin
    )
      return;
    const data: unknown = event.data;
    if (
      !data ||
      typeof data !== "object" ||
      !("channel" in data) ||
      data.channel !== "sy-another-graph"
    )
      return;
    if (!("type" in data) || data.type !== "host-language" || !("language" in data)) return;
    if (data.language !== "zh-CN" && data.language !== "en") return;
    setLocale(data.language);
    target.document.documentElement.lang = locale();
    target.document.title = t("app.name");
  };
  target.addEventListener("message", receive);
  if (target.parent !== target)
    target.parent.postMessage(
      { channel: "sy-another-graph", type: "language-ready" },
      target.location.origin,
    );
  return () => target.removeEventListener("message", receive);
}
