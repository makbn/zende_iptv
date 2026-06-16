/** Edge-safe entry — Node-only hooks live in instrumentation-node.ts */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNodeInstrumentation } = await import("./instrumentation-node");
  registerNodeInstrumentation();
}
