/**
 * Bundles the WebView editor into a single .ts file that exports the HTML string.
 * Runs after `vite build` (see the "build" script in package.json).
 *
 * Output: ../src/webview/generated/editorHtml.ts — the committed build artifact
 * the React Native layer imports as the tentap `customSource`.
 */
const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, 'dist');
const jsPath = path.join(DIST, 'bundle.js');
if (!fs.existsSync(jsPath)) {
  console.error('bundle.js not found! Run the Vite build first.');
  process.exit(1);
}

const js = fs.readFileSync(jsPath, 'utf8');

// Vite emits CSS as a separate file (from `import './editor.css'` in main.tsx).
const css = fs
  .readdirSync(DIST)
  .filter(f => f.endsWith('.css'))
  .map(f => fs.readFileSync(path.join(DIST, f), 'utf8'))
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${js.replace(/<\/script>/g, '<\\/script>')}</script>
  </body>
</html>`;

// The explicit `: string` is required, not redundant: without it tsc infers the
// literal type and inlines the whole ~800 kB HTML into every emitted .d.ts.
const fileContent = `// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
// To regenerate, run \`npm run build:webview\` from the package root
// (or \`npm run build\` inside webview/).
export const customEditorHtml: string = ${JSON.stringify(html)};\n`;

const outPath = path.resolve(__dirname, '../src/webview/generated/editorHtml.ts');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, fileContent);

console.log('Successfully bundled to ' + outPath);
