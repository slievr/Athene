#!/usr/bin/env node
// Publishes workspace packages to npm using the npm CLI.
// Used in place of `changeset publish` so that npm (not pnpm) handles
// the actual publish request, enabling native OIDC trusted publishing.
//
// `pnpm pack` is used to generate the tarball because it rewrites
// `workspace:*` dependencies to their resolved semver versions. `npm pack`
// does not understand the workspace protocol and publishes the literal
// `workspace:*` string, which breaks `npm install -g @made-by-moonlight/athene`.
import { execSync } from 'child_process';
import { readFileSync, rmSync } from 'fs';

const root = process.cwd();

// Optional --tag <name> flag for publishing under a dist-tag (e.g. "nightly").
// Without it, npm defaults to "latest".
const tagIdx = process.argv.indexOf('--tag');
const distTag = tagIdx !== -1 ? process.argv[tagIdx + 1] : null;

const packages = JSON.parse(
  execSync('pnpm list --recursive --json --depth 0', { encoding: 'utf-8' })
);

let published = 0;

for (const { path: dir, private: isPrivate } of packages) {
  if (dir === root || isPrivate) continue;

  const { name, version } = JSON.parse(
    readFileSync(`${dir}/package.json`, 'utf-8')
  );

  try {
    execSync(`npm view ${name}@${version} version`, { stdio: 'pipe' });
    console.log(`  skip     ${name}@${version}`);
    continue;
  } catch {
    // not yet published
  }

  console.log(`  publish  ${name}@${version}`);
  // pnpm pack rewrites workspace:* → resolved version; npm pack does not.
  // pnpm pack output includes a "Tarball Contents" header — extract just the .tgz line.
  const packOutput = execSync('pnpm pack', { cwd: dir, encoding: 'utf-8' });
  const tarball = packOutput.split('\n').map(l => l.trim()).find(l => l.endsWith('.tgz'));
  if (!tarball) throw new Error(`pnpm pack produced no .tgz for ${name}:\n${packOutput}`);
  const tagFlag = distTag ? ` --tag ${distTag}` : '';
  try {
    execSync(`npm publish ${tarball}${tagFlag}`, { cwd: dir, stdio: 'inherit' });
  } finally {
    try { rmSync(`${dir}/${tarball}`); } catch { /* best-effort cleanup */ }
  }
  published++;
}

console.log(`\nPublished ${published} package(s).`);
