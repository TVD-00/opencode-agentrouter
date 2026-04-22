# opencode-agentrouter

OpenCode plugin that lets you use [AgentRouter](https://agentrouter.org) models inside [OpenCode](https://opencode.ai).

AgentRouter provides access to Claude Opus, DeepSeek, GLM and other models through a unified API. This plugin handles the authentication handshake so OpenCode can connect without being blocked.

## How it works

AgentRouter validates incoming requests against a whitelist of known coding-agent clients. Raw API calls are rejected with `"unauthorized client detected"`. This plugin patches `globalThis.fetch` to inject the required client identity headers into every request targeting `agentrouter.org` — making OpenCode appear as an authorized client.

## Install

### Option A: npm plugin (recommended)

Add to your OpenCode config (`~/.config/opencode/opencode.json` or `opencode.json`):

```json
{
  "plugin": ["opencode-agentrouter"]
}
```

OpenCode installs npm plugins automatically at startup.

### Option B: local plugin

Copy `dist/index.js` into your plugins directory:

```
~/.config/opencode/plugins/agentrouter-auth.js
```

Files in the plugins directory are auto-loaded — no config needed.

## Configure provider

Add the AgentRouter provider to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "agentrouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "AgentRouter",
      "options": {
        "baseURL": "https://agentrouter.org/v1",
        "apiKey": "sk-YOUR-KEY-HERE"
      },
      "models": {
        "claude-opus-4-7": {
          "name": "Claude Opus 4.7",
          "limit": { "context": 1000000, "output": 128000 },
          "reasoning": true
        },
        "glm-5.1": {
          "name": "GLM 5.1",
          "limit": { "context": 202752, "output": 65535 },
          "reasoning": true
        },
        "deepseek-r1-0528": {
          "name": "DeepSeek R1 0528",
          "limit": { "context": 163840, "output": 16384 },
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

## How the plugin works

The plugin runs at module load time and patches `globalThis.fetch`. For any request to `agentrouter.org`, it injects headers that identify the caller as an authorized coding-agent client. Requests to all other domains pass through untouched.

No API keys are stored or transmitted by the plugin itself — it only adds identity headers. Your API key is managed by OpenCode's provider config as usual.

## Development

```bash
git clone https://github.com/github-47303/opencode-agentrouter.git
cd opencode-agentrouter
npm install
npm run build
```

## License

[MIT](LICENSE)
