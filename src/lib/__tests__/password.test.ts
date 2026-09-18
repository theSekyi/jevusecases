import { describe, expect, test } from "vitest";
import { generateTemporaryPassword, hashPassword, verifyAgainstDummy, verifyPassword } from "../password";

describe("hashPassword / verifyPassword", () => {
  test("a password verifies against its own hash, and a different one doesn't", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  test("never stores the password, and salts every hash differently", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first).not.toContain("same password");
    expect(first).not.toBe(second);
    expect(await verifyPassword("same password", second)).toBe(true);
  });

  test("records its own parameters in the stored string", async () => {
    const hash = await hashPassword("x");
    expect(hash.startsWith("scrypt$32768$8$3$")).toBe(true);
  });

  test("treats visually identical unicode forms as the same password", async () => {
    const hash = await hashPassword("café-password");
    expect(await verifyPassword("café-password", hash)).toBe(true);
  });

  test("a malformed or foreign stored hash never matches", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "plaintext")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$10$abc$def$ghi$jkl")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$not$numbers$here$abc$def")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$32768$8$3$$")).toBe(false);
  });

  test("a stored hash that decodes to nothing never matches, whatever the password", async () => {
    expect(await verifyPassword("anything", "scrypt$32768$8$3$AAAA$A")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$32768$8$3$AAAA$!!!!")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$32768$8$3$!!!!$AAAA")).toBe(false);
  });

  test("refuses parameters that would demand unbounded work, without attempting them", async () => {
    const salt = Buffer.from("saltsaltsaltsalt").toString("base64");
    const hash = Buffer.from("h".repeat(64)).toString("base64");

    expect(await verifyPassword("x", `scrypt$${2 ** 30}$8$3$${salt}$${hash}`)).toBe(false);
    expect(await verifyPassword("x", `scrypt$32768$9999$3$${salt}$${hash}`)).toBe(false);
    expect(await verifyPassword("x", `scrypt$32768$8$9999$${salt}$${hash}`)).toBe(false);
  });

  test("parameters scrypt itself rejects (like a non-power-of-two cost) mean no match, not an error", async () => {
    const salt = Buffer.from("saltsaltsaltsalt").toString("base64");
    const hash = Buffer.from("h".repeat(64)).toString("base64");

    await expect(verifyPassword("x", `scrypt$1000$8$3$${salt}$${hash}`)).resolves.toBe(false);
  });
});

describe("verifyAgainstDummy", () => {
  test("completes without throwing, for any input", async () => {
    await expect(verifyAgainstDummy("whatever")).resolves.toBeUndefined();
    await expect(verifyAgainstDummy("")).resolves.toBeUndefined();
  });

  test("costs about the same as a real check, every time, including the first", async () => {
    const hash = await hashPassword("some password");

    const timeOf = async (work: () => Promise<unknown>) => {
      const start = performance.now();
      await work();
      return performance.now() - start;
    };
    // Busy machines only ever make a run slower, so the fastest of a few runs is the honest cost.
    const fastestOf = async (work: () => Promise<unknown>) =>
      Math.min(await timeOf(work), await timeOf(work), await timeOf(work));

    const dummyFirst = await timeOf(() => verifyAgainstDummy("guess"));
    const dummy = await fastestOf(() => verifyAgainstDummy("guess"));
    const real = await fastestOf(() => verifyPassword("guess", hash));

    expect(dummyFirst).toBeGreaterThan(real * 0.4);
    expect(dummy).toBeGreaterThan(real * 0.4);
    expect(dummy).toBeLessThan(real * 1.8);
  });
});

describe("generateTemporaryPassword", () => {
  test("is 20 url-safe characters and different every time", () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));

    expect(passwords.size).toBe(50);
    for (const password of passwords) {
      expect(password).toMatch(/^[A-Za-z0-9_-]{20}$/);
    }
  });
});
