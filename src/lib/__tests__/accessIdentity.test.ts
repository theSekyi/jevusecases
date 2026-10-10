// @vitest-environment node
import { beforeAll, expect, test } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyAccessIdentity } from "../accessIdentity";

const config = { issuer: "https://fixture.cloudflareaccess.com", audience: "fixture-app" };
const keys = await generateKeyPair("RS256", { extractable: true });
let resolver: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  // A working identity-provider key set substitutes external JWKS retrieval; token verification uses real cryptography.
  resolver = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: "fixture", alg: "RS256" }] });
});
const token = (issuer = config.issuer, audience = config.audience, expiry = "1h") =>
  new SignJWT({ email: "Fixture@Example.com" }).setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .setIssuer(issuer).setAudience(audience).setSubject("fixture-admin").setIssuedAt().setExpirationTime(expiry).sign(keys.privateKey);

test("a valid Access identity returns its normalized email", async () => {
  expect(await verifyAccessIdentity(await token(), config, resolver)).toBe("fixture@example.com");
});
test("an expired Access identity is rejected", async () => {
  expect(await verifyAccessIdentity(await token(config.issuer, config.audience, "-1s"), config, resolver)).toBeNull();
});
test("a token issued for another application is rejected", async () => {
  expect(await verifyAccessIdentity(await token(config.issuer, "other-app"), config, resolver)).toBeNull();
});
test("a token from another issuer is rejected", async () => {
  expect(await verifyAccessIdentity(await token("https://other.cloudflareaccess.com"), config, resolver)).toBeNull();
});
test("an unsigned or malformed identity is rejected", async () => {
  expect(await verifyAccessIdentity("eyJhbGciOiJub25lIn0.eyJlbWFpbCI6ImZpeHR1cmVAZXhhbXBsZS5jb20ifQ.", config, resolver)).toBeNull();
});
test("a signature from an untrusted key is rejected", async () => {
  const otherKeys = await generateKeyPair("RS256");
  const forged = await new SignJWT({ email: "fixture@example.com" }).setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .setIssuer(config.issuer).setAudience(config.audience).setSubject("fixture-admin").setIssuedAt().setExpirationTime("1h").sign(otherKeys.privateKey);
  expect(await verifyAccessIdentity(forged, config, resolver)).toBeNull();
});
