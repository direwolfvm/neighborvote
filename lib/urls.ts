export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL;
  if (!configured && process.env.NODE_ENV === "production")
    throw new Error("APP_BASE_URL is required");
  const url = new URL(configured || "http://localhost:3000");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("APP_BASE_URL must be a trusted HTTPS origin in production");
  }
  return url.origin;
}

/** Accept only local destinations in the intended area, including after URL normalization. */
export function safeReturnPath(value: unknown, fallback: string, prefix: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u0020]/.test(value))
    return fallback;
  try {
    const url = new URL(value, "https://neighborvote.invalid");
    if (
      url.origin !== "https://neighborvote.invalid" ||
      !(url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
    )
      return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
