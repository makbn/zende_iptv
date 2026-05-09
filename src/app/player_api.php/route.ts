import { verifyIptvPortalLogin } from "@/lib/iptv/iptv-credential-auth";
import { handleXtreamAction } from "@/lib/iptv/xtream-actions";

export const runtime = "nodejs";

async function exec(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim() ?? "";
  const password = url.searchParams.get("password")?.trim() ?? "";

  const cred = await verifyIptvPortalLogin(username, password);
  if (!cred) {
    return Response.json({
      user_info: { auth: 0 },
    });
  }

  return handleXtreamAction(request, cred, password);
}

/** Xtream-compatible JSON API (`player_api.php?username=&password=` + optional `action=`). */
export function GET(request: Request) {
  return exec(request);
}

export function POST(request: Request) {
  return exec(request);
}
