import { describe, expect, it } from "vitest";
import { guideContent } from "./guideContent";

describe("understanding guide content", () => {
  it("keeps the Chinese and English guide structures aligned", () => {
    const zh = guideContent["zh-CN"];
    const en = guideContent["en-US"];
    expect(zh.flowSteps).toHaveLength(5);
    expect(en.flowSteps).toHaveLength(5);
    expect(zh.terms).toHaveLength(8);
    expect(en.terms).toHaveLength(8);
    expect(zh.chapters).toHaveLength(8);
    expect(en.chapters).toHaveLength(8);
    expect(zh.sources.map((source) => source.href)).toEqual(en.sources.map((source) => source.href));
  });

  it("links only to official OpenAI developer documentation", () => {
    guideContent["zh-CN"].sources.forEach((source) => {
      expect(new URL(source.href).hostname).toBe("developers.openai.com");
    });
  });
});
