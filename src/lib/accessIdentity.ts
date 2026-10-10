import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AccessConfiguration { issuer: string; audience: string }

export function accessConfiguration(source: { ACCESS_ISSUER?: string; ACCESS_AUD?: string } = { ACCESS_ISSUER: process.env.ACCESS_ISSUER, ACCESS_AUD: process.env.ACCESS_AUD }): AccessConfiguration {
  const issuer = source.ACCESS_ISSUER;
  const audience = source.ACCESS_AUD;
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience) {
    throw new Error("Cloudflare Access issuer and application audience are required");
  }
  return { issuer, audience };
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verify the signature, application audience, issuer, expiry and email before trusting any identity. */
export async function verifyAccessIdentity(token: string, config = accessConfiguration(), resolver?: Parameters<typeof jwtVerify>[1]): Promise<string | null> {
  if (!token || token.length > 16_384) return null;
  let keys = keySets.get(config.issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${config.issuer}/cdn-cgi/access/certs`));
    keySets.set(config.issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, resolver ?? keys, {
      issuer: config.issuer, audience: config.audience, algorithms: ["RS256"], maxTokenAge: "1h", requiredClaims: ["exp", "iat", "sub", "email"],
    });
    if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;
    return payload.email.trim().toLowerCase();
  } catch {
    // Invalid or unavailable authentication fails closed; never log the bearer token.
    return null;
  }
}
