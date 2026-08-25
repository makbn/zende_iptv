import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const generated = path.join(root, "src/styles/utilities.generated.css");
const output = path.join(root, "src/styles/utilities.css");

let css = fs.readFileSync(generated, "utf8");

css = css.replace(/^\/\*![\s\S]*?\*\/\s*/u, "");
css = css.replace(/@layer properties;?\s*/g, "");
css = css.replace(/@property [^{]+\{[^}]+\}\s*/g, "");

// Drop Tailwind's oklch theme — we ship hex tokens in palette.css + tokens.css.
css = css.replace(/@layer theme\s*\{[\s\S]*?\n\}\s*/m, "");
css = css.replace(/@layer theme, base, components, utilities;\s*/g, "@layer base, components, utilities;\n");

// Animation utilities reference theme variables. Preserve the small non-color subset
// after removing Tailwind's oklch theme, otherwise animate-spin/pulse/ping are inert.
css = css.replace(
  "@layer base, components, utilities;\n",
  `@layer base, components, utilities;
:root {
  --animate-spin: spin 1s linear infinite;
  --animate-ping: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  --animate-pulse: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
`,
);

fs.writeFileSync(output, css.trim() + "\n");
console.log(`Wrote ${output} (${css.length} bytes)`);
