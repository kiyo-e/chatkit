export {}

declare global {
  interface CloudflareBindings {
    OPENAI_API_KEY: string
    CHATKIT_WORKFLOW_ID: string
    CHATKIT_API_BASE?: string
    OPENAI_ORGANIZATION?: string
    OPENAI_PROJECT?: string
  }
}
