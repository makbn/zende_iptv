import { NextResponse } from "next/server";

import { gateApiRequest } from "@/lib/auth/gate-api";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/http/public-error";
import {
  getProxy,
  updateProxy,
} from "@/lib/proxies/proxy-store";
import {
  getGluetunContainerStatus,
  isDockerAvailable,
  startGluetunContainer,
  stopGluetunContainer,
} from "@/lib/proxies/gluetun-manager";

export const runtime = "nodejs";

/** GET — return current Gluetun container status */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { id } = await context.params;
  const row = await getProxy(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (row.vpnType !== "gluetun") {
    return NextResponse.json({ error: "Proxy is not a Gluetun container." }, { status: 400 });
  }

  const dockerOk = await isDockerAvailable();
  if (!dockerOk) {
    return NextResponse.json({ status: "error", error: "Docker is not available on this server." });
  }

  const status = await getGluetunContainerStatus(row.gluetunContainerId);

  // Sync persisted status if it changed
  if (status !== row.gluetunStatus) {
    await updateProxy(id, { gluetunStatus: status });
  }

  return NextResponse.json({
    status,
    containerId: row.gluetunContainerId,
    hostPort: row.gluetunHostPort,
  });
}

/** POST — start (or restart) the Gluetun container */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { id } = await context.params;
  const row = await getProxy(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (row.vpnType !== "gluetun") {
    return NextResponse.json({ error: "Proxy is not a Gluetun container." }, { status: 400 });
  }
  if (!row.vpnConfigJson) {
    return NextResponse.json({ error: "No VPN config saved for this proxy." }, { status: 400 });
  }

  const dockerOk = await isDockerAvailable();
  if (!dockerOk) {
    return NextResponse.json(
      { error: "Docker is not available on this server. Install Docker and ensure it is running." },
      { status: 503 },
    );
  }

  try {
    await updateProxy(id, { gluetunStatus: "starting" });
    const { containerId, hostPort } = await startGluetunContainer(id, row.vpnConfigJson);
    await updateProxy(id, {
      gluetunContainerId: containerId,
      gluetunHostPort: hostPort,
      gluetunStatus: "starting",
    });
    return NextResponse.json({ status: "starting", containerId, hostPort });
  } catch (err) {
    await updateProxy(id, { gluetunStatus: "error" });
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE — stop and remove the Gluetun container */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateApiRequest(request);
  if ("response" in gate) return gate.response;

  const { id } = await context.params;
  const row = await getProxy(id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (row.vpnType !== "gluetun") {
    return NextResponse.json({ error: "Proxy is not a Gluetun container." }, { status: 400 });
  }

  try {
    if (row.gluetunContainerId) {
      await stopGluetunContainer(row.gluetunContainerId);
    }
    await updateProxy(id, {
      gluetunContainerId: null,
      gluetunHostPort: null,
      gluetunStatus: "stopped",
    });
    return new Response(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg ?? PUBLIC_INTERNAL_ERROR }, { status: 500 });
  }
}
