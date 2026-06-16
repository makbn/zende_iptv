import "server-only";

import {
  getHdhrDeviceId,
  getHdhrFriendlyName,
  getHdhrMaxChannels,
  getHdhrTunerCount,
  isHdhrEnabled,
} from "@/lib/hdhr/config";
import { getAggregatedXtreamCatalog } from "@/lib/iptv/aggregated-channels";
import { getRequestOrigin } from "@/lib/http/request-origin";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const origin = getRequestOrigin(request);
  const enabled = isHdhrEnabled();

  let channelCount = 0;
  if (enabled) {
    const { streams } = await getAggregatedXtreamCatalog();
    const max = getHdhrMaxChannels();
    channelCount = max != null ? Math.min(streams.length, max) : streams.length;
  }

  return Response.json({
    enabled,
    deviceAddress: enabled ? origin : null,
    friendlyName: getHdhrFriendlyName(),
    deviceId: getHdhrDeviceId(),
    tunerCount: getHdhrTunerCount(),
    channelCount,
    maxChannels: getHdhrMaxChannels(),
    endpoints: enabled
      ? {
          discover: `${origin}/discover.json`,
          lineup: `${origin}/lineup.json`,
          epg: `${origin}/hdhr/epg.xml`,
        }
      : null,
  });
}
