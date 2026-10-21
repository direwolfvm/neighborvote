import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const CRON_JOB_PATH = "/api/jobs/election-open-notifications";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
let googleKeys: JWTVerifyGetKey | undefined;

function defaultKeys(): JWTVerifyGetKey {
  googleKeys ??= createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs"),
  );
  return googleKeys;
}

function staticTokenMatches(
  request: Request,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  const supplied = request.headers.get("x-cron-token");
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

// Cloud Scheduler sends a Google-signed ID token when the job uses --oidc-service-account-email.
// The audience is pinned to the job URL on APP_BASE_URL and the caller to CRON_INVOKER_EMAIL.
async function schedulerTokenMatches(
  request: Request,
  env: NodeJS.ProcessEnv,
  keys: JWTVerifyGetKey,
): Promise<boolean> {
  const invoker = env.CRON_INVOKER_EMAIL?.trim().toLowerCase();
  const baseUrl = env.APP_BASE_URL?.trim();
  if (!invoker || !baseUrl) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  if (!match) return false;
  try {
    const { payload } = await jwtVerify(match[1], keys, {
      issuer: GOOGLE_ISSUERS,
      audience: new URL(CRON_JOB_PATH, baseUrl).toString(),
      algorithms: ["RS256"],
    });
    return (
      typeof payload.email === "string" &&
      payload.email.toLowerCase() === invoker &&
      payload.email_verified === true
    );
  } catch {
    return false;
  }
}

export async function isCronRequestAuthorized(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  keys: JWTVerifyGetKey = defaultKeys(),
): Promise<boolean> {
  if (staticTokenMatches(request, env.CRON_JOB_TOKEN)) return true;
  return schedulerTokenMatches(request, env, keys);
}
