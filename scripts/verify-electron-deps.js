/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// electron-builder.yml packs the asar from a hand-maintained `files:`
// allowlist (node_modules is excluded by default, then re-included package
// by package). That list has already silently dropped a whole runtime
// dependency once (winston + its 20-package transitive tree), because
// nothing checks it against what electron-dist/*.js actually requires.
// This script closes that gap: it inspects the real compiled output, walks
// the real node_modules dependency graph, and fails the build if the
// allowlist doesn't cover it — instead of a user's packaged app crashing.
const fs = require("fs")
const path = require("path")
const yaml = require("js-yaml")
const Module = require("module")

const rootDir = path.join(__dirname, "..")
const electronDistDir = path.join(rootDir, "electron-dist")
const builderConfigPath = path.join(rootDir, "electron-builder.yml")
const nodeModulesDir = path.join(rootDir, "node_modules")

const builtinModules = new Set(Module.builtinModules)
// "electron" is resolved by the Electron runtime itself, not from
// node_modules — require("electron") inside the packaged app never touches
// node_modules/electron (that's a devDependency, only used to run/download
// the Electron binary during development and build).
const runtimeProvidedModules = new Set(["electron"])

// Matches require("x") / require('x') and static import ... from "x",
// import("x"). Does not catch dynamically-constructed specifiers (e.g. the
// `new Function("s","return import(s)")("@dot-agent/sdk")` trick in
// main.ts, used deliberately to force a real ESM import() at runtime past
// TypeScript's compile-to-require) — that's fine here since @dot-agent/**
// is already wholesale-allowlisted below, but keep this in mind if a new
// dynamically-built specifier is introduced elsewhere.
const specifierRegex = /(?:require\(|import\s+(?:[\w*${},\s]+\s+from\s+)?|import\()\s*["']([^"']+)["']/g

function isBareSpecifier(specifier) {
  return !specifier.startsWith(".") && !specifier.startsWith("/")
}

function packageNameFromSpecifier(specifier) {
  const parts = specifier.split("/")
  if (specifier.startsWith("@")) return parts.slice(0, 2).join("/")
  return parts[0]
}

function extractBareImports(jsSource) {
  const found = new Set()
  let match
  while ((match = specifierRegex.exec(jsSource)) !== null) {
    const specifier = match[1]
    if (!isBareSpecifier(specifier)) continue
    const bareName = specifier.startsWith("node:") ? specifier.slice(5) : specifier
    if (builtinModules.has(bareName)) continue
    const pkgName = packageNameFromSpecifier(specifier)
    if (runtimeProvidedModules.has(pkgName)) continue
    if (pkgName.startsWith("@types/")) continue // ambient typings, never require()'d
    found.add(pkgName)
  }
  return found
}

function readPackageJson(pkgName) {
  const pkgJsonPath = path.join(nodeModulesDir, pkgName, "package.json")
  if (!fs.existsSync(pkgJsonPath)) return null
  return JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"))
}

function resolveTransitiveClosure(entryPackages) {
  const closure = new Set()
  const queue = [...entryPackages]

  while (queue.length > 0) {
    const pkgName = queue.pop()
    if (closure.has(pkgName)) continue
    closure.add(pkgName)

    const pkgJson = readPackageJson(pkgName)
    if (!pkgJson) continue // not on disk (e.g. optional/platform dep) — nothing to allowlist

    for (const dep of Object.keys(pkgJson.dependencies || {})) {
      if (dep.startsWith("@types/")) continue // ambient typings, never require()'d
      if (!closure.has(dep)) queue.push(dep)
    }
  }

  return closure
}

function scopeRootOf(pkgName) {
  return pkgName.startsWith("@") ? pkgName.split("/")[0] : null
}

function loadAllowlistedPackages() {
  const config = yaml.load(fs.readFileSync(builderConfigPath, "utf8"))
  const allowlisted = new Set()

  for (const entry of config.files || []) {
    if (typeof entry !== "string" || entry.startsWith("!")) continue
    const match = entry.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\/\*\*$/)
    if (match) allowlisted.add(match[1])
  }

  return allowlisted
}

function main() {
  if (!fs.existsSync(electronDistDir)) {
    console.error(`[verify-electron-deps] ${electronDistDir} not found — run electron:compile first`)
    process.exit(1)
  }

  const compiledFiles = fs.readdirSync(electronDistDir).filter(f => f.endsWith(".js"))
  const entryPackages = new Set()
  for (const file of compiledFiles) {
    const source = fs.readFileSync(path.join(electronDistDir, file), "utf8")
    for (const pkg of extractBareImports(source)) entryPackages.add(pkg)
  }

  const requiredClosure = resolveTransitiveClosure(entryPackages)
  const allowlisted = loadAllowlistedPackages()

  const missing = [...requiredClosure]
    .filter(pkg => !allowlisted.has(pkg) && !allowlisted.has(scopeRootOf(pkg)))
    .sort()

  if (missing.length > 0) {
    console.error("[verify-electron-deps] The packaged app would be missing these runtime dependencies:")
    console.error("[verify-electron-deps] Add the following lines to electron-builder.yml's files: array:\n")
    for (const pkg of missing) console.error(`  - node_modules/${pkg}/**`)
    console.error(`\n[verify-electron-deps] ${missing.length} package(s) required by electron-dist/*.js are not in the electron-builder.yml allowlist.`)
    process.exit(1)
  }

  console.log(`[verify-electron-deps] OK — all ${requiredClosure.size} runtime dependencies of electron-dist/*.js are allowlisted.`)
}

main()
