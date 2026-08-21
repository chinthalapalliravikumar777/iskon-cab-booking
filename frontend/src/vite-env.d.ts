/// <reference types="vite/client" />

// Declare all environment variables used in this project
// Vite exposes them via import.meta.env
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_COGNITO_USER_POOL_ID: string
  readonly VITE_COGNITO_CLIENT_ID: string
  readonly VITE_COGNITO_REGION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
