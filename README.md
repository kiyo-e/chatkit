# ChatKit + Hono Minimal Sample

Minimal Cloudflare Worker project that wires OpenAI's ChatKit with the Hono framework and a React client. Use it as a starting point for experimenting with ChatKit workflows or bootstrapping a production Worker.

## Overview

- Hono-based Worker entry point (`src/index.tsx`) issues authenticated ChatKit session tokens.
- React client (`src/client/app.tsx`) mounts the ChatKit React components and talks to the Worker API.
- Server-side JSX rendering is configured in `src/renderer.tsx` using `@hono/react-renderer`.

## Prerequisites

- Node.js 18 or newer (Cloudflare Workers compatibility date target).
- npm 9+ (or a compatible alternative such as Bun; this sample uses npm scripts).
- An OpenAI API key with access to ChatKit workflows.

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables in your Worker or `.dev.vars` file:

- `OPENAI_API_KEY` – Required. OpenAI API key used when creating ChatKit sessions.
- `CHATKIT_WORKFLOW_ID` – Required. ID of the ChatKit workflow to launch (see `wrangler.jsonc` for the default binding name).
- `CHATKIT_API_BASE` – Optional. Override the ChatKit API base URL.
- `OPENAI_ORGANIZATION` – Optional. Forward a specific OpenAI organization header.
- `OPENAI_PROJECT` – Optional. Forward a specific OpenAI project header.

## Running Locally

```bash
npm run dev
```

The command runs Vite in development mode. Configure your ChatKit variables in `.dev.vars` so the Worker can exchange session tokens during local testing.

## Deployment

```bash
npm run deploy
```

This builds the project and deploys it to Cloudflare using Wrangler.

## Type Generation

Regenerate Worker binding typings whenever you change `wrangler.jsonc`:

```bash
npm run cf-typegen
```

## Architecture Overview

1. The Worker (`src/index.tsx`) bootstraps a `Hono` app with middleware that creates a per-user cookie, exposes `/api/chatkit/session`, and renders the React app at `/`.
2. `renderer.tsx` registers the React renderer so Hono can serve SSR content and hydrate the client bundle produced by Vite.
3. The React entry point (`src/client/index.tsx`) hydrates the app, while `src/client/app.tsx` demonstrates how to mount ChatKit React components with the server-issued session secret.

## Project Structure

```
.
├── public/                # Static assets served by Vite
├── src/
│   ├── index.tsx          # Worker + API routes
│   ├── renderer.tsx       # Hono + React renderer wiring
│   └── client/            # React client and ChatKit integration
├── wrangler.jsonc         # Cloudflare deployment configuration
└── package.json           # Scripts and dependencies
```

## Next Steps

- Swap `CHATKIT_WORKFLOW_ID` for your custom workflow.
- Extend the Hono routes under `/api/*` to add business logic, storage, or file handling.
- Connect production secrets using `wrangler secret put` before deploying.
