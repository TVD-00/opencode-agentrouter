# opencode-agentrouter

OpenCode plugin for using [AgentRouter](https://agentrouter.org) models inside [OpenCode](https://opencode.ai).

## How it works

The plugin patches `globalThis.fetch` at module load time. For any request to `agentrouter.org` it:

1. **Injects identity headers** — AgentRouter only allows requests from whitelisted coding-agent clients. The plugin adds the required headers so OpenCode is accepted.
2. **Sanitizes Claude request bodies** — Strips `reasoning_effort`, `reasoning`, and `cache_control` fields that AgentRouter rejects.
3. **Injects adaptive thinking** — Automatically sets `thinking: { type: "adaptive" }` for Claude models. Opus 4.7 requires adaptive thinking; older Claude models are upgraded from `type: "enabled"` (deprecated) to `type: "adaptive"`.
4. **Auto-retries on sensitive content errors** — When AgentRouter returns `sensitive_words_detected`, the plugin retries with exponential backoff (up to 30 attempts).
5. **Serializes Claude requests** — Queues Claude model calls with cooldown to avoid rate limiting.

Requests to all other domains pass through untouched.

## Install

### Option A: npm plugin (recommended)

```json
{
  "plugin": ["opencode-agentrouter"]
}
```

Add to your OpenCode config (`~/.config/opencode/opencode.json`). OpenCode installs npm plugins automatically.

### Option B: local plugin

Copy `dist/index.js` to:

```
~/.config/opencode/plugins/agentrouter-auth.js
```

Files in the plugins directory are auto-loaded.

## Configure provider

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-agentrouter"],
  "provider": {
    "agentrouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "AgentRouter",
      "options": {
        "baseURL": "https://agentrouter.org/v1",
        "apiKey": "sk-YOUR-KEY-HERE"
      },
      "models": {
        "claude-opus-4-6": {
          "name": "Claude Opus 4.6",
          "limit": { "context": 1000000, "output": 128000 },
          "reasoning": true
        },
        "claude-opus-4-7": {
          "name": "Claude Opus 4.7",
          "limit": { "context": 1000000, "output": 128000 },
          "reasoning": true
        },
        "deepseek-r1-0528": {
          "name": "DeepSeek R1 0528",
          "limit": { "context": 163840, "output": 16384 },
          "reasoning": true
        },
        "glm-5.1": {
          "name": "GLM 5.1",
          "limit": { "context": 202752, "output": 65535 },
          "reasoning": true
        }
      }
    }
  }
}
```

Get your API key at https://agentrouter.org/console/token

## Available models

| Model | Context | Output | Reasoning |
|---|---|---|---|
| `claude-opus-4-6` | 1,000,000 | 128,000 | yes |
| `claude-opus-4-7` | 1,000,000 | 128,000 | yes |
| `deepseek-r1-0528` | 163,840 | 16,384 | yes |
| `deepseek-v3.1` | 163,840 | 32,768 | no |
| `deepseek-v3.2` | 131,072 | 32,768 | no |
| `glm-4.5` | 131,072 | 98,304 | yes |
| `glm-4.6` | 204,800 | 204,800 | yes |
| `glm-5.1` | 202,752 | 65,535 | yes |

Check https://agentrouter.org/pricing for the latest list.

## Usage

1. Install the plugin (Option A or B above)
2. Add the provider config with your API key
3. Restart OpenCode
4. Run `/models` and select an AgentRouter model

## Development

```bash
git clone https://github.com/TVD-00/opencode-agentrouter.git
cd opencode-agentrouter
npm install
npm run build
```

## License

[MIT](LICENSE)
