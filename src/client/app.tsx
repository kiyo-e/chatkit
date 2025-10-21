import { ChatKit, useChatKit } from '@openai/chatkit-react'
import { useCallback, useMemo, useState } from 'react'

const SESSION_ENDPOINT = '/api/chatkit/session'

function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const getClientSecret = useCallback(
    async (existing?: string | null) => {
      if (!existing) {
        setStatus('loading')
        setError(null)
      }

      const response = await fetch(SESSION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...(existing ? { client_secret: existing } : null)
        })
      })

      const payload = (await response.json().catch(() => ({}))) as {
        client_secret?: string | null
        error?: string
      }

      if (!response.ok) {
        const message =
          typeof payload?.error === 'string'
            ? payload.error
            : `Unable to fetch ChatKit session (${response.status})`
        setStatus('error')
        setError(message)
        throw new Error(message)
      }

      const clientSecret = payload?.client_secret
      if (!clientSecret) {
        const message = 'Missing client secret in ChatKit session response'
        setStatus('error')
        setError(message)
        throw new Error(message)
      }

      setStatus('ready')
      setError(null)
      return clientSecret
    },
    [sessionKey]
  )

  const { control } = useChatKit({
    api: {
      getClientSecret
    }
  })

  const handleRetry = useCallback(() => {
    setSessionKey((value) => value + 1)
    setStatus('loading')
    setError(null)
  }, [])

  const showLoader = useMemo(() => status === 'loading' && !error, [status, error])

  return (
    <div className="chatkit-shell">
      <header className="chatkit-shell__header">
        <h1>ChatKit on Hono</h1>
        <p>Start a conversation powered by the configured ChatKit workflow.</p>
      </header>
      <main className="chatkit-shell__main">
        {error && status === 'error' ? (
          <div className="chatkit-shell__error">
            <p>{error}</p>
            <button type="button" onClick={handleRetry}>
              Try again
            </button>
          </div>
        ) : (
          <ChatKit
            key={sessionKey}
            control={control}
            className={`chatkit-shell__widget${showLoader ? ' chatkit-shell__widget--loading' : ''}`}
          />
        )}
      </main>
    </div>
  )
}

export default App
