import {describe, it, expect, vi, beforeEach} from "vitest";
import {withReloadOnce} from "@/utils/lazyWithReload.js";

describe("withReloadOnce", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "location", {
      value: {...window.location, reload: vi.fn()},
      writable: true
    });
  });

  it("resolves with the module on success", async () => {
    const importer = vi.fn().mockResolvedValue({default: "component"});
    const result = await withReloadOnce(importer, "streams")();

    expect(result).toEqual({default: "component"});
  });

  it("clears the flag for that key on success", async () => {
    sessionStorage.setItem("elv-chunk-reload-attempted:streams", "1");
    const importer = vi.fn().mockResolvedValue({default: "component"});
    await withReloadOnce(importer, "streams")();

    expect(sessionStorage.getItem("elv-chunk-reload-attempted:streams")).toBeNull();
  });

  it("reloads once and never resolves on first failure", async () => {
    const importer = vi.fn().mockRejectedValue(new Error("Failed to fetch dynamically imported module"));

    const pending = withReloadOnce(importer, "streams")();
    const race = await Promise.race([pending, Promise.resolve("still-pending")]);

    expect(race).toBe("still-pending");
    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("elv-chunk-reload-attempted:streams")).toBe("1");
  });

  it("throws instead of reloading again once the flag is already set", async () => {
    sessionStorage.setItem("elv-chunk-reload-attempted:streams", "1");
    const importer = vi.fn().mockRejectedValue(new Error("still broken"));

    await expect(withReloadOnce(importer, "streams")()).rejects.toThrow("still broken");
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("scopes the reload flag by key so unrelated chunks don't interfere", async () => {
    sessionStorage.setItem("elv-chunk-reload-attempted:settings", "1");

    const importer = vi.fn().mockRejectedValue(new Error("Failed to fetch dynamically imported module"));
    withReloadOnce(importer, "streams")();
    await Promise.resolve();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("elv-chunk-reload-attempted:streams")).toBe("1");
  });
});
