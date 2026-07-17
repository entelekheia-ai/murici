/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

// i18nConfig.js sets prefixDefault:true — every locale, including the
// default, is always prefixed. Once a request already carries its locale
// prefix, next-i18n-router's middleware does a plain passthrough
// (NextResponse.next()), never a NextResponse.rewrite() — which matters
// here specifically: an earlier version of this app used prefixDefault:false
// and omitted the prefix for the default locale, relying on the middleware
// to internally rewrite bare paths. That rewrite target could get
// re-processed by the middleware a second time under real (concurrent)
// Electron browser traffic, redirecting back to bare and producing a
// self-redirect loop that curl could never reproduce (see issue #3). Always
// prefixing removes the rewrite from the picture entirely.
export function localeHref(locale: string, path: string): string {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`
  return `/${locale}${withLeadingSlash}`
}
