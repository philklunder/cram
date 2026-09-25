import { describe, expect, it } from "vitest";

import { DEFAULT_DENSITY, DENSITY_OPTIONS, densityLabel, parseDensity } from "./generationDensity";

describe("generation density", () => {
  it("offers the three levels the backend accepts, lightest first", () => {
    expect(DENSITY_OPTIONS.map((o) => o.value)).toEqual(["essentials", "balanced", "comprehensive"]);
    expect(DENSITY_OPTIONS.map((o) => o.level)).toEqual([1, 2, 3]);
  });

  it("defaults to balanced, matching the server default", () => {
    expect(DEFAULT_DENSITY).toBe("balanced");
  });

  it("keeps a known stored value", () => {
    expect(parseDensity("essentials")).toBe("essentials");
    expect(parseDensity("comprehensive")).toBe("comprehensive");
  });

  it("falls back to the default for anything unknown", () => {
    for (const raw of [null, undefined, "", "everything", "Balanced", "constructor"]) {
      expect(parseDensity(raw)).toBe(DEFAULT_DENSITY);
    }
  });

  it("labels each level for display", () => {
    expect(densityLabel("essentials")).toBe("Key concepts");
    expect(densityLabel("comprehensive")).toBe("Everything");
  });
});
