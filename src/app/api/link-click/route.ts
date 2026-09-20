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
const MAX_PATH_LENGTH = 200;

let projectsById: Map<string, ReturnType<typeof getProjects>[number]> | null = null;
function findProject(id: string) {
  projectsById ??= new Map(getProjects().map((project) => [project.id, project]));
  return projectsById.get(id) ?? null;
}

/** The page the click happened on: the path of the Referer, and only if it is one of our own pages. */
function pathOf(request: NextRequest): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.host !== request.nextUrl.host) return null;
    return url.pathname.length <= MAX_PATH_LENGTH ? url.pathname : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // A click can only come from a page of ours. Browsers say so; a script can pretend, so this trims noise, not abuse.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse(null, { status: 403 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let parsed;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    parsed = bodySchema.safeParse(JSON.parse(text));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const { kind, project: projectId } = parsed.data;
  const project = projectId === undefined ? null : findProject(projectId);
  if (takesProject(kind) ? !project : projectId !== undefined) return new NextResponse(null, { status: 400 });

  // Answered the same way as a recorded click, so nothing tells a client which clicks count.
  if (process.env.VERCEL_ENV === "preview") return new NextResponse(null, { status: 204 });
  if (isAutomatedClient(request.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  if (request.cookies.has(SESSION_COOKIE)) return new NextResponse(null, { status: 204 });

  const ip = clientIp(request);
  if (!checkRateLimit(ip)) return new NextResponse(null, { status: 429 });

  try {
    await recordLinkClick({
      kind,
      projectId: project?.id ?? null,
      host: clickHost(kind, project),
      path: pathOf(request),
      visitorHash: hashVisitor(ip),
    });
  } catch (error) {
    console.error("Failed to record link click:", error);
    return new NextResponse(null, { status: 502 });
  }
  return new NextResponse(null, { status: 204 });
}
