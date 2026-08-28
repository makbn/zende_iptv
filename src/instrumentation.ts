import type { Instrumentation } from "next";

/** Edge-safe entry — Node-only hooks live in instrumentation-node.ts */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNodeInstrumentation } = await import("./instrumentation-node");
  registerNodeInstrumentation();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  _request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("./instrumentation-node");
  reportRequestError(error, { ...context, method: _request.method });
};
