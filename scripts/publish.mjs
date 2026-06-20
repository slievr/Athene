#!/usr/bin/env node
// Publishes workspace packages to npm using the npm CLI.
// Used in place of `changeset publish` so that npm (not pnpm) handles
// the actual publish request, enabling native OIDC trusted publishing.
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const root = process.cwd();

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
  execSync('npm publish', { cwd: dir, stdio: 'inherit' });
  published++;
}

console.log(`\nPublished ${published} package(s).`);
