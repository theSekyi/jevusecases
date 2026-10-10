import { hashPassword, verifyAgainstDummy, verifyPassword } from "../src/lib/password.ts";

// Temporary HTTP probe. No database, real credentials, or account access.
const compatibilityWorker = {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/password") {
      return new Response("Not found", { status: 404 });
    }
    const started = performance.now();
    const hash = await hashPassword("compatibility-probe-fixture");
    const acceptsCorrect = await verifyPassword("compatibility-probe-fixture", hash);
    const rejectsWrong = !(await verifyPassword("wrong-fixture", hash));
    await verifyAgainstDummy("wrong-fixture");
    return Response.json({
      acceptsCorrect,
      rejectsWrong,
      unknownUserCheckCompleted: true,
      wallTimeMs: Math.round(performance.now() - started),
      measurement: "elapsed wall time; use Workers logs for production CPU",
    });
  },
};

export default compatibilityWorker;
