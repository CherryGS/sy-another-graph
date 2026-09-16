import { createInstance } from "i18next";
import zhCN from "./zh-CN.json";
import en from "./en.json";

export type Locale = "zh-CN" | "en";
export type TranslationKey = keyof typeof en;

export function normalizeLocale(value: unknown): Locale {
  return typeof value === "string" && /^zh(?:[-_]|$)/i.test(value) ? "zh-CN" : "en";
}

export const i18n = createInstance();
void i18n.init({
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["zh-CN", "en"],
  resources: { "zh-CN": { translation: zhCN }, en: { translation: en } },
  initAsync: false,
  keySeparator: false,
  interpolation: { escapeValue: false },
});

i18n.services.formatter?.add("value", (value: unknown, language?: string) =>
  typeof value === "number" ? value.toLocaleString(normalizeLocale(language)) : String(value ?? ""),
);

export const locale = (): Locale => normalizeLocale(i18n.language);
export function setLocale(value: unknown): void {
  const next = normalizeLocale(value);
  if (next !== locale()) void i18n.changeLanguage(next);
}

export const t = (key: TranslationKey, params?: Record<string, unknown>): string =>
  i18n.t(key, params);

export const number = (value: number): string => value.toLocaleString(locale());
export const dateTime = (value: string | number | Date): string =>
  new Date(value).toLocaleString(locale());

/** Structural formatting boundary; shared infrastructure does not import core. */
export function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || !("code" in value)) return String(value ?? "");
  if (typeof value.code !== "string") return String(value);
  const raw = "params" in value ? value.params : undefined;
  const params =
    raw && typeof raw === "object"
      ? Object.fromEntries(
          Object.entries(raw).map(([key, item]) => [
            key,
            typeof item === "number" ? number(item) : typeof item === "object" ? text(item) : item,
          ]),
        )
      : undefined;
  return i18n.t(value.code, params);
}
