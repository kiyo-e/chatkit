import { reactRenderer } from '@hono/react-renderer'
import { Link, ReactRefresh, Script, ViteClient } from 'vite-ssr-components/react'

export const renderer = reactRenderer(({ children }) => {
  const Refresh = import.meta.env.DEV ? ReactRefresh : () => null
  return (
    <html>
      <head>
        <title>ChatKit Demo on Hono</title>
        <Refresh />
        <ViteClient />
        <script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js" defer />
        <Script src="/src/client/index.tsx" />
        <Link href="/src/style.css" rel="stylesheet" />
      </head>
      <body>
        <div className="page-layout">
          <div id="root">{children}</div>
        </div>
      </body>
    </html>
  )
})
