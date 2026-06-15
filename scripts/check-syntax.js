#!/usr/bin/env node
// Pre-deploy syntax gate — runs before every wrangler deploy
// Extracts every <script> block from index.html and validates JS syntax.
// Exit 1 if any block fails — wrangler deploy never runs.

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os   = require('os');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'index.html'), 'utf8'
);

const blocks = [];
const re = /<script(?:[^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) {
  const src = m[1].trim();
  if (src && !src.startsWith('{')) blocks.push(src); // skip JSON-LD
}

let errors = 0;
blocks.forEach((src, i) => {
  const tmp = path.join(os.tmpdir(), `me-check-${i}.js`);
  fs.writeFileSync(tmp, src);
  try {
    execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`\n✗ SYNTAX ERROR in script block ${i + 1}:`);
    console.error(e.stderr.toString().replace(tmp, `<script #${i + 1}>`));
    errors++;
  } finally {
    fs.unlinkSync(tmp);
  }
});

if (errors) {
  console.error(`\n🚫 DEPLOY BLOCKED — ${errors} script block(s) have syntax errors.\n`);
  process.exit(1);
} else {
  console.log(`✓ All ${blocks.length} script blocks passed syntax check.`);
}
