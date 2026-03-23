# Project Brief: Inbound Email Processing via Cloudflare → Vercel

## Goal

Set up a system where an email sent to an address on my domain is automatically received, parsed, and forwarded as structured data (JSON webhook) to an API route in my Vercel-deployed Next.js app, so the app can act on it.

## Architecture

```
Incoming email → Cloudflare Email Routing → Cloudflare Email Worker → HTTP POST → Vercel API route → App logic
```

## What needs to be built

1. **Cloudflare Email Worker** — A small Cloudflare Worker that listens for inbound emails via Cloudflare Email Routing. It should parse the email (sender, recipient, subject, text body, HTML body, headers) and POST the parsed data as JSON to my Vercel app's webhook endpoint. Include a shared secret in the request for authentication.

2. **Vercel API route** — A Next.js App Router API route (e.g. `/api/inbound-email`) that receives the POST from the Worker, verifies the shared secret, and processes the email data. For now, just log the payload — I'll add real business logic later.

## Setup steps to walk me through

1. Install and authenticate the Wrangler CLI (`npm install -g wrangler`)
2. Scaffold the Cloudflare Email Worker project
3. Write the Worker code to parse inbound email and POST to my Vercel endpoint
4. Configure `wrangler.toml` with the `email` event trigger
5. Deploy the Worker to Cloudflare
6. Enable Email Routing on my domain in the Cloudflare dashboard and route the target address to the Worker
7. Create the Next.js API route on the Vercel side
8. Set up the shared secret as environment variables in both Cloudflare (Worker secret) and Vercel
9. Test end-to-end by sending an email to the routed address

## Constraints

- My domain's DNS is already on Cloudflare
- Free tier only — no paid Cloudflare plans
- The Vercel app uses Next.js with the App Router
- Keep the Worker minimal — parsing and forwarding only, no heavy logic
