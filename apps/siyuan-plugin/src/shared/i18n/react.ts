import { useTranslation } from "react-i18next";
import { i18n, normalizeLocale } from "./runtime";

/** Only presentation subscribes. Graph identities and caches do not include locale. */
export function useLocale() {
  const { i18n: current } = useTranslation("translation", { i18n, useSuspense: false });
  return normalizeLocale(current.language);
}
