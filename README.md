```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## ChatKit configuration

- `OPENAI_API_KEY` must be present in your Worker environment.
- Set `CHATKIT_WORKFLOW_ID` to the workflow you would like ChatKit to run (see `wrangler.jsonc`).
- Optionally configure `CHATKIT_API_BASE`, `OPENAI_ORGANIZATION`, or `OPENAI_PROJECT` if you need to target a non-default OpenAI endpoint.
