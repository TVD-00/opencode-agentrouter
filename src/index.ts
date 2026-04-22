import type { Plugin } from "@opencode-ai/plugin"
import { join } from "node:path"

const AGENTROUTER_HOST = "agentrouter.org"

const REQUIRED_HEADERS: Record<string, string> = {
  "http-referer": "https://github.com/RooVetGit/Roo-Cline",
  "x-title": "Roo Code",
  "user-agent": "RooCode/3.52.1",
  "x-stainless-arch": "x64",
  "x-stainless-lang": "js",
  "x-stainless-os": "Windows",
  "x-stainless-package-version": "6.34.0",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v22.12.0",
}

const CLAUDE_PREFIX = "claude"
const FIELDS_TO_STRIP = ["reasoning_effort", "reasoning"]
const MAX_ATTEMPTS = 30
const RETRY_DELAYS_MS = [1000, 1000, 2000, 2000, 3000, 3000, 5000]

let claudeCooldownUntil = 0
let claudeQueue: Promise<void> = Promise.resolve()

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

async function readBodySafe(
  body: unknown,
): Promise<{ text: string; fallback: BodyInit | null }> {
  if (!body) return { text: "", fallback: null }
  if (typeof body === "string") return { text: body, fallback: null }
  if (body instanceof ArrayBuffer)
    return { text: new TextDecoder().decode(body), fallback: null }
  if (body instanceof Uint8Array)
    return { text: new TextDecoder().decode(body), fallback: null }
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    const [forRead, forFallback] = (body as ReadableStream<Uint8Array>).tee()
    const reader = forRead.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    return { text: new TextDecoder().decode(merged), fallback: forFallback }
  }
  return { text: String(body), fallback: null }
}

function isClaudeModel(model: unknown): model is string {
  return typeof model === "string" && model.startsWith(CLAUDE_PREFIX)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nextDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]
}

async function readErrorPayload(
  resp: Response,
): Promise<{ code?: string; message?: string }> {
  try {
    const text = await resp.clone().text()
    const json = JSON.parse(text)
    return { code: json?.error?.code, message: json?.error?.message }
  } catch {
    return {}
  }
}

async function withClaudeQueue<T>(run: () => Promise<T>): Promise<T> {
  const previous = claudeQueue
  let release!: () => void
  claudeQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  try {
    const now = Date.now()
    if (claudeCooldownUntil > now) {
      await sleep(claudeCooldownUntil - now)
    }
    return await run()
  } finally {
    release()
  }
}

function sanitizeBody(bodyStr: string): {
  finalBody: string
  modelName: string
} {
  let modelName = ""
  try {
    const json = JSON.parse(bodyStr)
    modelName = typeof json.model === "string" ? json.model : ""

    if (isClaudeModel(json.model)) {
      for (const field of FIELDS_TO_STRIP) {
        delete json[field]
      }
      if (Array.isArray(json.messages)) {
        for (const msg of json.messages) {
          if (msg && typeof msg === "object") {
            delete (msg as Record<string, unknown>).cache_control
            const content = (msg as Record<string, unknown>)?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block && typeof block === "object") {
                  delete (block as Record<string, unknown>).cache_control
                }
              }
            }
          }
        }
      }
    }

    return { finalBody: JSON.stringify(json), modelName }
  } catch {
    return { finalBody: bodyStr, modelName }
  }
}

const originalFetch = globalThis.fetch

globalThis.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = getURL(input)

  if (!url || !url.hostname.endsWith(AGENTROUTER_HOST)) {
    return originalFetch(input, init)
  }

  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  )
  for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
    headers.set(key, value)
  }

  const rawBody =
    init?.body ?? (input instanceof Request ? input.body : undefined)
  const { text: bodyStr, fallback } = await readBodySafe(rawBody)
  const { finalBody, modelName } = sanitizeBody(bodyStr)

  const bodyToSend = finalBody !== bodyStr ? finalBody : (fallback ?? bodyStr)

  const sendRequest = () =>
    originalFetch(url.href, {
      method:
        init?.method ?? (input instanceof Request ? input.method : "POST"),
      headers,
      body: bodyToSend,
      signal:
        init?.signal ?? (input instanceof Request ? input.signal : undefined),
    })

  const runWithRetry = async (): Promise<Response> => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const resp = await sendRequest()

      if (resp.ok) {
        if (isClaudeModel(modelName)) claudeCooldownUntil = 0
        return resp
      }

      const errorPayload = await readErrorPayload(resp)
      const shouldRetry =
        errorPayload.code === "sensitive_words_detected" ||
        errorPayload.message?.includes("sensitive words detected")

      if (!shouldRetry || attempt === MAX_ATTEMPTS) {
        return resp
      }

      const delayMs = nextDelayMs(attempt)
      if (isClaudeModel(modelName)) claudeCooldownUntil = Date.now() + delayMs
      await sleep(delayMs)
    }

    return sendRequest()
  }

  if (isClaudeModel(modelName)) {
    return withClaudeQueue(runWithRetry)
  }
  return runWithRetry()
}

export const AgentRouterAuth: Plugin = async () => {
  return {}
}
