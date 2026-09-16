import { normalizeLocale, setLocale } from "../../../shared/i18n/runtime";

export function hostLanguage(target: Window = window) {
  const host = target as unknown as {
    siyuan?: { config?: { lang?: string; appearance?: { lang?: string } } };
  };
  return normalizeLocale(host.siyuan?.config?.lang ?? host.siyuan?.config?.appearance?.lang);
}

/** SiYuan normally reloads after changing language. Also handle retained host surfaces. */
export function watchHostLanguage(publish: () => void): () => void {
  let previous = hostLanguage();
  setLocale(previous);
  const check = () => {
    const next = hostLanguage();
    if (next === previous) return;
    previous = next;
    setLocale(next);
    publish();
  };
  const timer = window.setInterval(check, 1000);
  window.addEventListener("focus", check);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", check);
  };
}
