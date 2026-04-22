/**
 * opencode-agentrouter
 *
 * OpenCode plugin that enables AgentRouter (agentrouter.org) models
 * by injecting the required client identity headers into every request.
 *
 * AgentRouter's OneAPI gateway validates incoming requests against a
 * whitelist of known coding-agent clients. Requests that lack the
 * expected headers are rejected with "unauthorized client detected".
 *
 * This plugin patches `globalThis.fetch` at module-load time so that
 * any request targeting agentrouter.org automatically carries the
 * same headers that RooCode sends via the `openai` npm package.
 *
 * Additionally, for Claude models proxied through AgentRouter, the
 * plugin strips the `reasoning_effort` field from request bodies.
 * AgentRouter rejects this field with:
 *   "***.***.enabled" is not supported for this model.
 *    Use "***.***.adaptive" and "output_config.effort"
 *
 * Headers were captured from a verified, working RooCode session:
 *   - RooCode identity: HTTP-Referer, X-Title, User-Agent
 *   - OpenAI SDK fingerprint: x-stainless-* family
 *
 * @see https://github.com/RooCodeInc/Roo-Code/blob/main/src/api/providers/constants.ts
 * @see https://docs.agentrouter.org
 */

import type { Plugin } from "@opencode-ai/plugin"

/** Only intercept requests to this host. */
const AGENTROUTER_HOST = "agentrouter.org"

/**
 * Headers that AgentRouter expects on every API call.
 * Captured from a successful RooCode + openai@6.34.0 session.
 */
const REQUIRED_HEADERS: Record<string, string> = {
  // RooCode client identity
  "http-referer": "https://github.com/RooVetGit/Roo-Cline",
  "x-title": "Roo Code",
  "user-agent": "RooCode/3.52.1",

  // OpenAI SDK stainless telemetry (required by AgentRouter gateway)
  "x-stainless-arch": "x64",
  "x-stainless-lang": "js",
  "x-stainless-os": "Windows",
  "x-stainless-package-version": "6.34.0",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v22.12.0",
}

/**
 * Models that need `reasoning_effort` stripped from request body.
 * AgentRouter rejects this field for Claude models with HTTP 400.
 */
const STRIP_REASONING_MODELS = ["claude-opus", "claude-sonnet", "claude-haiku"]

/**
 * Safely extract a URL from any fetch input.
 */
function getURL(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === "string") return new URL(input)
    if (input instanceof Request) return new URL(input.url)
    if (input instanceof URL) return input
    return new URL(String(input))
  } catch {
    return null
  }
}

/**
 * Check if request body contains a Claude model and strip
 * incompatible fields (reasoning_effort) if so.
 * Returns the original or modified body.
 */
function sanitizeBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (!body || typeof body !== "string") return body

  try {
    const json = JSON.parse(body)
    const model: string = json.model || ""
    const needsStrip = STRIP_REASONING_MODELS.some((prefix) => model.includes(prefix))

    if (needsStrip) {
      delete json.reasoning_effort
      return JSON.stringify(json)
    }

    return body
  } catch {
    return body
  }
}

// --- Patch globalThis.fetch at module load time ---

const originalFetch = globalThis.fetch

globalThis.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = getURL(input)

  // Pass through anything that is not targeting AgentRouter
  if (!url || !url.hostname.endsWith(AGENTROUTER_HOST)) {
    return originalFetch(input, init)
  }

  // Build headers from the original request, then overwrite with required set
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  )

  for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
    headers.set(key, value)
  }

  if (!headers.has("x-stainless-retry-count")) {
    headers.set("x-stainless-retry-count", "0")
  }

  // Sanitize body: strip incompatible fields for Claude models
  const originalBody = init?.body ?? (input instanceof Request ? input.body : undefined)
  const sanitizedBody = sanitizeBody(originalBody as BodyInit | null | undefined)

  const patchedInit: RequestInit = { ...init, headers, body: sanitizedBody }

  // Rebuild Request object when the input is a Request instance
  if (input instanceof Request) {
    const rebuilt = new Request(input.url, {
      method: input.method,
      redirect: input.redirect,
      signal: init?.signal ?? input.signal,
      ...patchedInit,
    })
    return originalFetch(rebuilt)
  }

  return originalFetch(input, patchedInit)
}

// --- Plugin export ---

export const AgentRouterAuth: Plugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: "opencode-agentrouter",
      level: "info",
      message: "AgentRouter plugin loaded — client identity headers active, Claude body sanitizer active",
    },
  })

  return {}
}
