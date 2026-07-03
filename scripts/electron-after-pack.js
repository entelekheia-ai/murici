/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// electron-builder's `extraResources` glob matcher was silently dropping
// .next/standalone/node_modules (and the nested .next runtime dir) when
// copying into Resources/server, so the packaged app shipped a server.js
// with no "next" module to require and startNextServer() rejected with
// nothing ever surfacing it (main.ts had no .catch() either — fixed
// separately). A plain recursive fs copy has no glob filtering to get
// wrong, so bypass extraResources entirely for this step.
const fs = require("fs")
const path = require("path")

module.exports = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context

  const resourcesDir =
    electronPlatformName === "darwin"
      ? path.join(
          appOutDir,
          `${packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources"
        )
      : path.join(appOutDir, "resources")

  const src = path.join(__dirname, "..", ".next", "standalone")
  const dest = path.join(resourcesDir, "server")

  if (!fs.existsSync(src)) {
    throw new Error(`[afterPack] .next/standalone not found at ${src} — run the Next.js build before packaging`)
  }

  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true, dereference: true })

  const nextModulePath = path.join(dest, "node_modules", "next")
  if (!fs.existsSync(nextModulePath)) {
    throw new Error(`[afterPack] copy completed but node_modules/next is still missing at ${nextModulePath}`)
  }

  console.log(`[afterPack] copied Next.js standalone server: ${src} -> ${dest}`)
}
