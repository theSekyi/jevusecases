import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/authConstants";
import { clickHost, recordLinkClick } from "@/lib/linkClicks";
import { LINK_KINDS, takesProject } from "@/lib/linkKinds";
import { getProjects } from "@/lib/projects";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";
import { isAutomatedClient } from "@/lib/visitorEvents";
import { hashVisitor } from "@/lib/visitorHash";

// A person clicks a handful of links a minute at most; this only has to blunt a scripted flood.
const checkRateLimit = createRateLimiter(60, 60 * 1000);

// Exactly a kind, and a project id where the kind belongs to one. Nothing else is read from the request.
const bodySchema = z.strictObject({
  kind: z.enum(LINK_KINDS),
  project: z.string().max(200).optional(),
});

const MAX_BODY_BYTES = 512;
/** The site's own pages a click can be on, besides a project's page. A path outside these is stored as nothing. */
const KNOWN_PATHS = new Set(["/", "/submit", "/privacy"]);

let projectsById: Map<string, ReturnType<typeof getProjects>[number]> | null = null;
function findProject(id: string) {
  projectsById ??= new Map(getProjects().map((project) => [project.id, project]));
  return projectsById.get(id) ?? null;
}

/**
 * The page the click happened on: the path of the Referer, kept only if it is one of our own pages. Anything
 * else would let a client choose what gets stored.
 */
function pathOf(request: NextRequest): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.host !== request.nextUrl.host) return null;
    const projectPage = url.pathname.match(/^\/p\/([^/]+)$/);
    if (projectPage) {
      const id = decodeURIComponent(projectPage[1]);
      return findProject(id) ? `/p/${id}` : null;
    }
    return KNOWN_PATHS.has(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}

/** Reads at most MAX_BODY_BYTES of the body, stopping as soon as it is over, so a body with no declared length can't be buffered whole. */
async function readSmallBody(request: NextRequest): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

export async function POST(request: NextRequest) {
  // A click can only come from a page of ours. Browsers say so; a script can pretend, so this trims noise, not abuse.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse(null, { status: 403 });

  const text = await readSmallBody(request);
  if (text === null) return new NextResponse(null, { status: 413 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(text));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const { kind, project: projectId } = parsed.data;
  const project = projectId === undefined ? null : findProject(projectId);
  if (takesProject(kind) ? !project : projectId !== undefined) return new NextResponse(null, { status: 400 });

  // Answered the same way as a recorded click, so nothing tells a client which clicks count.
  if (process.env.WRITE_MODE === "maintenance") return new NextResponse(null, { status: 503 });
  if (process.env.APP_ENV === "preview" || (process.env.DATABASE_PROVIDER !== "d1" && process.env.VERCEL_ENV === "preview")) return new NextResponse(null, { status: 204 });
  if (isAutomatedClient(request.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  if (request.cookies.has(SESSION_COOKIE) || request.cookies.has("CF_Authorization")) return new NextResponse(null, { status: 204 });

  const ip = clientIp(request);
  if (!checkRateLimit(ip)) return new NextResponse(null, { status: 429 });

  // Without a visitor hash there is no telling people apart, so the click is not kept.
  const visitorHash = hashVisitor(ip);
  if (!visitorHash) return new NextResponse(null, { status: 204 });

  try {
    await recordLinkClick({
      kind,
      projectId: project?.id ?? null,
      host: clickHost(kind, project),
      path: pathOf(request),
      visitorHash,
    });
  } catch (error) {
    console.error("Failed to record link click:", error);
    return new NextResponse(null, { status: 502 });
  }
  return new NextResponse(null, { status: 204 });
}
