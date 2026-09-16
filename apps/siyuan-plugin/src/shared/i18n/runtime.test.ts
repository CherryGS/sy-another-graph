import { afterEach, describe, expect, it } from "vitest";
import { i18n, locale, normalizeLocale, setLocale, t, text } from "./runtime";

afterEach(() => setLocale("en"));

describe("bundled localization", () => {
  it.each(["zh_CN", "zh-CN", "zh_TW", "zh-Hant", "ZH"])(
    "uses Simplified Chinese for %s",
    (value) => {
      expect(normalizeLocale(value)).toBe("zh-CN");
    },
  );
  it.each(["en_US", "en-GB", "fr_FR", "", undefined, null, 42])(
    "falls back to English for %s",
    (value) => {
      expect(normalizeLocale(value)).toBe("en");
    },
  );
  it("formats retained messages in the current language without changing their data", () => {
    const failure = Object.freeze({
      code: "text.youCanSaveUpToValuePresets",
      params: Object.freeze({ p0: 1234 }),
    });
    setLocale("zh_CN");
    expect(text(failure)).toBe("最多保存 1,234 个预设。");
    setLocale("en_US");
    expect(text(failure)).toBe("You can save up to 1,234 presets.");
    expect(failure.params.p0).toBe(1234);
    expect(text({ code: "text.saveFailedValue", params: { p0: failure } })).toContain(
      "You can save",
    );
  });
  it("preserves raw upstream errors and user-authored titles literally", () => {
    const literal = '<img onerror="bad()"> 项目 $t(text.all) {{count}}';
    expect(text(literal)).toBe(literal);
    expect(t("preset.filterLabel", { name: literal })).toBe(`Filter: ${literal}`);
  });
  it("does not emit a language change for the same normalized host language", () => {
    let events = 0;
    const count = () => {
      events++;
    };
    i18n.on("languageChanged", count);
    setLocale("zh_CN");
    setLocale("zh-Hant");
    expect(locale()).toBe("zh-CN");
    expect(events).toBe(1);
    i18n.off("languageChanged", count);
  });
});
