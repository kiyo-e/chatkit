/**
 * Design doc: see README.md ("Architecture Overview") for the service flow and deployment notes.
 * Related modules: ./client/app.tsx renders the client UI, ./renderer.tsx configures the server-side JSX renderer.
 */
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import App from './client/app'
import { renderer } from './renderer'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: { userId: string } }>()

app.use('*', renderer)
app.use('/api/*', async (c, next) => {
  let id = getCookie(c, 'cksid')
  if (!id) setCookie(c, 'cksid', id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2), { path: '/', maxAge: 2592000, httpOnly: true, sameSite: 'Lax', secure: import.meta.env?.PROD })
  c.set('userId', id)
  await next()
})

app.onError((e, c) => {
  console.error(e)
  return c.req.path.startsWith('/api/') ? c.json({ error: 'Internal Server Error' }, 500) : c.text('Internal Server Error', 500)
})

app.get('/', (c) => c.render(<App />))

app.post('/api/chatkit/session', async (c) => {
  const { OPENAI_API_KEY: key, CHATKIT_WORKFLOW_ID: wfId, CHATKIT_API_BASE: base, OPENAI_ORGANIZATION: org, OPENAI_PROJECT: proj } = c.env
  if (!key) return c.json({ error: 'Missing OPENAI_API_KEY' }, 500)

  const body = await c.req.json().catch(() => ({})) as any
  const wId = body.workflow?.id ?? body.workflowId ?? wfId
  if (!wId) return c.json({ error: 'Missing CHATKIT_WORKFLOW_ID' }, 400)

  const res = await fetch(`${base || 'https://api.openai.com'}/v1/chatkit/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'OpenAI-Beta': 'chatkit_beta=v1', ...(org && { 'OpenAI-Organization': org }), ...(proj && { 'OpenAI-Project': proj }) },
    body: JSON.stringify({ workflow: { id: wId }, user: body.user ?? c.get('userId'), chatkit_configuration: { file_upload: { enabled: body.chatkit_configuration?.file_upload?.enabled } } }),
  })

  const data = await res.json().catch(() => ({})) as any
  if (!res.ok) return c.json({ error: data.error?.message || data.error || data.message || 'Failed', details: data }, res.status as any)
  return c.json({ client_secret: data.client_secret, expires_after: data.expires_after })
})

export default app
