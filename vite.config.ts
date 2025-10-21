import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  plugins: [
    cloudflare(),
    ssrPlugin({
      hotReload: {
        ignore: ['./src/client/**/*.tsx']
      }
    }),
    react()
  ],
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: 'src/index.tsx'
        }
      }
    }
  },
  ssr: {
    external: ['react', 'react-dom']
  }
})
