import { relayImageFromEncodedPath } from "@/lib/media/image-relay";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ encoded: string }> },
): Promise<Response> {
  const { encoded } = await params;
  return relayImageFromEncodedPath(encoded);
}

