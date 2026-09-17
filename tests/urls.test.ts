import { afterEach, expect, it, vi } from "vitest";
import { appBaseUrl, safeReturnPath } from "@/lib/urls";
afterEach(() => vi.unstubAllEnvs());
it.each([
  "//evil.example",
  "/\\evil.example",
  "https://evil.example",
  "/admin/../../evil",
  "/adminx",
  "/admin\n/evil"
])("rejects unsafe admin destination %s", (path) =>
  expect(safeReturnPath(path, "/admin", "/admin")).toBe("/admin")
);
it("keeps valid in-area destinations", () =>
  expect(safeReturnPath("/admin/elections/123?saved=1", "/admin", "/admin")).toBe(
    "/admin/elections/123?saved=1"
  ));
it("requires an explicit HTTPS production origin", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_BASE_URL", "");
  expect(appBaseUrl).toThrow();
  vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
  expect(appBaseUrl).toThrow();
  vi.stubEnv("APP_BASE_URL", "https://neighborvote.online/");
  expect(appBaseUrl()).toBe("https://neighborvote.online");
});
