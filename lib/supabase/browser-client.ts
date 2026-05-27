// Stub: Supabase browser client removed in local fork.
// Kept as a shim so remaining UI components compile without modification.
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null })
  },
  from: (_table: string) => ({
    select: (_cols?: string) => ({
      eq: () => ({ single: async () => ({ data: null, error: null }) })
    }),
    upload: async () => ({ data: null, error: null })
  }),
  storage: {
    from: (_bucket: string) => ({
      upload: async () => ({ data: null, error: null }),
      remove: async () => ({ data: null, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null })
    })
  }
} as any
