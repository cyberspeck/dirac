#!/usr/bin/env node
// Writes the current commit and date into README.md's BUILD-STAMP block, so the extension's
// Overview tab says which build is installed. The Extensions tab only ever shows package.json's
// version, which stays 0.5.13 across every rebuild of this fork and therefore identifies nothing.
// Run before `vsce package`; commit the stamped README with the build.
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const readme = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "README.md")
const git = (args) => execSync(`git ${args}`, { encoding: "utf8" }).trim()

const commit = git("rev-parse --short HEAD")
const branch = git("rev-parse --abbrev-ref HEAD")
const date = git("log -1 --format=%cs")
const dirty = git("status --porcelain") !== ""

const stamp =
	`**Build:** \`${commit}\` on \`${branch}\`, ${date}` +
	(dirty ? " — **built from a dirty working tree**, so the commit does not describe it exactly." : ".")

const source = readFileSync(readme, "utf8")
const block = /(<!-- BUILD-STAMP:START -->\n)[\s\S]*?(\n<!-- BUILD-STAMP:END -->)/
if (!block.test(source)) {
	console.error("stamp-build: BUILD-STAMP markers not found in README.md")
	process.exit(1)
}
writeFileSync(readme, source.replace(block, `$1${stamp}$2`))
console.log(`stamp-build: ${stamp}`)
