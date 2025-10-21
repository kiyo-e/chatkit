import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import App from './client/app'
import { renderer } from './renderer'

type AppEnv = { Bindings: CloudflareBindings; Variables: { userId: string } }

const app = new Hono<AppEnv>()
const SESSION_COOKIE = 'chatkit_session_id'

// Middleware & Routes
app.use('*', renderer)

app.use('/api/*', async (c, next) => {
  let userId = getCookie(c, SESSION_COOKIE)
  if (!userId) {
    userId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
    setCookie(c, SESSION_COOKIE, userId, {
      path: '/',
      maxAge: 2592000, // 30 days
      httpOnly: true,
      sameSite: 'Lax',
      secure: import.meta.env.PROD,
    })
  }
  c.set('userId', userId)
  await next()
})

app.onError((err, c) => {
  console.error(err)
  return c.req.path.startsWith('/api/')
    ? c.json({ error: 'Internal Server Error' }, 500)
    : c.text('Internal Server Error', 500)
})

app.get('/', (c) => c.render(<App />))

app.post('/api/chatkit/session', async (c) => {
  const { OPENAI_API_KEY, CHATKIT_WORKFLOW_ID, CHATKIT_API_BASE, OPENAI_ORGANIZATION, OPENAI_PROJECT } = c.env
  if (!OPENAI_API_KEY) return c.json({ error: 'Missing OPENAI_API_KEY' }, 500)

  const body = await c.req.json().catch(() => ({}))
  const workflowId = body?.workflow?.id ?? body?.workflowId ?? CHATKIT_WORKFLOW_ID
  if (!workflowId) return c.json({ error: 'Missing CHATKIT_WORKFLOW_ID' }, 400)

  const res = await fetch(`${CHATKIT_API_BASE ?? 'https://api.openai.com'}/v1/chatkit/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'chatkit_beta=v1',
      ...(OPENAI_ORGANIZATION && { 'OpenAI-Organization': OPENAI_ORGANIZATION }),
      ...(OPENAI_PROJECT && { 'OpenAI-Project': OPENAI_PROJECT }),
    },
    body: JSON.stringify({
      workflow: { id: workflowId },
      user: body?.user ?? c.get('userId'),
      chatkit_configuration: { file_upload: { enabled: body?.chatkit_configuration?.file_upload?.enabled ?? false } },
    }),
  })

  const data = (await res.json().catch(() => ({}))) as any
  if (!res.ok) {
    const status = (res.status >= 200 && res.status <= 599 && ![204, 205, 304].includes(res.status)) ? res.status as ContentfulStatusCode : 500
    return c.json({ error: data?.error?.message ?? data?.error ?? data?.message ?? 'Failed to create session', details: data }, status)
  }

  return c.json({ client_secret: data?.client_secret ?? null, expires_after: data?.expires_after ?? null })
})

export default app
