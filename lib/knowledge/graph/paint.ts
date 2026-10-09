// SPDX-License-Identifier: Apache-2.0

import type { Paint } from "@entelekheia-ai/cerrado/spec"

/**
 * The watercolour of the canopy, by page theme. The lenses carry only `drop_scale` in their `paint:`
 * block, because it sets each node's canopy radius at scene-build time and differs per lens; the rest
 * is here, so a light and a dark page each get the tuning that reads on it.
 */

/**
 * What gives the wash its form, from the technique study the watercolour comes from (its five signatures:
 * darkened edge, irregular contour, glazing in two or three coats, granulation, subtractive mixing):
 * a pigment rim, a world-space wobble of the contour, two glazes, sub-coats that disagree at the edge so it
 * crumbles into the paper, and a grain that is faint and broad. The grain is the one that reads as a
 * speckled texture when it is strong, so it stays low (cerrado's papel recipe uses 0.16 at 0.3).
 */
const FORM: Paint = {
  softness: 0,
  wash_depth: 0.45,
  edge_strength: 0.9,
  rim_width: 0.2,
  rim_glaze: 1.4,
  wobble: { amp: 0.06, freq: 0.02 },
  bands: 2,
  band_softness: 0.3,
  drop_size: 70,
  drop_jitter: 0.7,
  ink_curve: 1.5,
  brush: { amp: 0.15, freq: 2, layers: 4 },
  mask: { amp: 0.5, freq: 0.1 },
  grain: { amp: 0.06, freq: 0.15 }
}

/**
 * Light page: the ink is translucent, so the paper shows through, over a wet first coat (`underwash`).
 * `subtractive` mixing is left off: it deepens every overlap into a dark ring on this page.
 */
const LIGHT: Paint = {
  ...FORM,
  alpha: 0.85,
  rim_glaze: 1.7,
  underwash: 0.5,
  subtractive: false
}

/**
 * Dark page: on a black ground transparency only delivers black, so the ink is laid thicker than on
 * paper, alpha-blended, and with no underwash or subtractive mixing, both of which are for a light paper.
 */
const DARK: Paint = {
  ...FORM,
  alpha: 0.85,
  softness: 0.12,
  mask: { amp: 0.2, freq: 0.1 }
}

/** The paint for a page of this lightness; a lens's own keys (its `drop_scale`) win over these. */
export function paintFor(lightPage: boolean): Paint {
  return lightPage ? LIGHT : DARK
}
