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

fs.writeFileSync(output, css.trim() + "\n");
console.log(`Wrote ${output} (${css.length} bytes)`);
