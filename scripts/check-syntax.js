#!/usr/bin/env node
// Pre-deploy syntax gate — runs before every wrangler deploy
// Extracts every <script> block from index.html and validates JS syntax.
// Exit 1 if any block fails — wrangler deploy never runs.

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    console.error(`\n✗ SYNTAX ERROR in script block ${i + 1}:`);
    console.error(e.stderr.toString().replace(tmp, `<script #${i + 1}>`));
    errors++;
  } finally {
    fs.unlinkSync(tmp);
  }
});

const workerPath = path.join(__dirname, '..', 'src', 'worker.js');
const statusPath = path.join(__dirname, '..', 'foundation-status.html');
const wranglerPath = path.join(__dirname, '..', 'wrangler.jsonc');
const assetsIgnorePath = path.join(__dirname, '..', '.assetsignore');

try {
  execFileSync(process.execPath, ['--check', workerPath], { stdio: 'pipe' });
} catch (e) {
  console.error('\n✗ SYNTAX ERROR in src/worker.js:');
  console.error(e.stderr.toString());
  errors++;
}

const worker = fs.readFileSync(workerPath, 'utf8');
const requiredFoundationControls = [
  'const FOUNDATION_MODE = true;',
  'const EXTERNAL_PUBLISH_ENABLED = false;',
  "url.pathname.startsWith('/api/')",
  "const FOUNDATION_STATUS_ASSET = '/foundation-status.html';",
  'isInternalAssetPath(url.pathname)',
  "'/social/posts.json',",
  "headers.set('X-MEKE-Public-Mode', 'foundation');",
];

for (const control of requiredFoundationControls) {
  if (!worker.includes(control)) {
    console.error(`\n✗ FOUNDATION CONTROL MISSING: ${control}`);
    errors++;
  }
}

if (!fs.existsSync(statusPath)) {
  console.error('\n✗ foundation-status.html is missing');
  errors++;
} else {
  const status = fs.readFileSync(statusPath, 'utf8');
  const requiredStatements = [
    'Public autonomous services are paused',
    'not 33 autonomous public agents',
    'They are not active until',
  ];

  for (const statement of requiredStatements) {
    if (!status.includes(statement)) {
      console.error(`\n✗ FOUNDATION STATUS STATEMENT MISSING: ${statement}`);
      errors++;
    }
  }
}

const wrangler = fs.readFileSync(wranglerPath, 'utf8');
if (!wrangler.includes('"run_worker_first": true')) {
  console.error('\n✗ DEPLOYMENT CONTROL MISSING: assets.run_worker_first must be true');
  errors++;
}

if (!fs.existsSync(assetsIgnorePath)) {
  console.error('\n✗ .assetsignore is missing');
  errors++;
} else {
  const ignoredAssets = new Set(
    fs.readFileSync(assetsIgnorePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
  );
  const requiredIgnoredAssets = [
    '.git',
    '.git/**',
    '.github/',
    '.claude/',
    '.assetsignore',
    'node_modules/',
    'src/',
    'scripts/',
    'config/',
    'package.json',
    'package-lock.json',
    'wrangler.jsonc',
    '.env*',
    '.dev.vars*',
    'social/posts.json',
  ];

  for (const pattern of requiredIgnoredAssets) {
    if (!ignoredAssets.has(pattern)) {
      console.error(`\n✗ ASSET EXCLUSION MISSING: ${pattern}`);
      errors++;
    }
  }
}

if (errors) {
  console.error(`\n🚫 DEPLOY BLOCKED — ${errors} validation failure(s).\n`);
  process.exit(1);
} else {
  console.log(`✓ ${blocks.length} index scripts, worker syntax, and foundation-mode controls passed.`);
}
