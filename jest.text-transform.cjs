// SPDX-License-Identifier: Apache-2.0

// Jest side of the `asset/source` webpack rule: a .cmap/.cview module is its own text.
module.exports = {
  process(sourceText) {
    return { code: `module.exports = { __esModule: true, default: ${JSON.stringify(sourceText)} }` }
  }
}
