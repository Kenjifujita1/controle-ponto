/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Personalização da marca (white-label)
  readonly VITE_APP_NAME?: string
  readonly VITE_APP_HANDLE?: string
  readonly VITE_APP_BADGE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
