// SPDX-License-Identifier: Apache-2.0

/** A cerrado map document, imported as its own text (see `next.config.js`). */
declare module "*.cmap" {
  const source: string
  export default source
}

/** The icon font file, imported as its URL (see `next.config.js`). */
declare module "lucide-static/font/lucide.woff2" {
  const url: string
  export default url
}

/** A cerrado view (lens) document, imported as its own text. */
declare module "*.cview" {
  const source: string
  export default source
}
