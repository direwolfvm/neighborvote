import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { CRON_JOB_PATH, isCronRequestAuthorized } from "@/lib/cron-auth";

const invoker =
  "neighborvote-scheduler@example-project.iam.gserviceaccount.com";
const env = {
  APP_BASE_URL: "https://neighborvote.test",
  CRON_INVOKER_EMAIL: invoker,
} as unknown as NodeJS.ProcessEnv;
const audience = `https://neighborvote.test${CRON_JOB_PATH}`;

let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "test",
    alg: "RS256",
  };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function idToken(
  { aud = audience, ...claims }: Record<string, unknown>,
  key = privateKey,
) {
  return new SignJWT({ email: invoker, email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://accounts.google.com")
    .setAudience(aud as string)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

function request(headers: Record<string, string>) {
  return new Request(audience, { method: "POST", headers });
}

describe("cron auth", () => {
  it("accepts a Scheduler ID token for the configured invoker", async () => {
    const token = await idToken({});
    expect(
      await isCronRequestAuthorized(
        request({ authorization: `Bearer ${token}` }),
        env,
        keys,
      ),
    ).toBe(true);
  });

  it("rejects another service account, wrong audience, unverified email, or foreign key", async () => {
    const cases = [
      await idToken({
        email: "someone-else@example-project.iam.gserviceaccount.com",
      }),
      await idToken({
        aud: "https://other.test/api/jobs/election-open-notifications",
      }),
      await idToken({ email_verified: false }),
      await idToken({}, otherKey),
    ];
    for (const token of cases)
      expect(
        await isCronRequestAuthorized(
          request({ authorization: `Bearer ${token}` }),
          env,
          keys,
        ),
      ).toBe(false);
  });

  it("rejects ID tokens when CRON_INVOKER_EMAIL is unset", async () => {
    const token = await idToken({});
    const noInvoker = {
      APP_BASE_URL: env.APP_BASE_URL,
    } as unknown as NodeJS.ProcessEnv;
    expect(
      await isCronRequestAuthorized(
        request({ authorization: `Bearer ${token}` }),
        noInvoker,
        keys,
      ),
    ).toBe(false);
  });

  it("still accepts the legacy x-cron-token while CRON_JOB_TOKEN is set", async () => {
    const withToken = {
      ...env,
      CRON_JOB_TOKEN: "t".repeat(40),
    } as NodeJS.ProcessEnv;
    expect(
      await isCronRequestAuthorized(
        request({ "x-cron-token": "t".repeat(40) }),
        withToken,
        keys,
      ),
    ).toBe(true);
    expect(
      await isCronRequestAuthorized(
        request({ "x-cron-token": "x".repeat(40) }),
        withToken,
        keys,
      ),
    ).toBe(false);
    expect(
      await isCronRequestAuthorized(
        request({ "x-cron-token": "t".repeat(40) }),
        env,
        keys,
      ),
    ).toBe(false);
  });

  it("rejects requests with no credentials", async () => {
    expect(await isCronRequestAuthorized(request({}), env, keys)).toBe(false);
  });
});
