# MonkeyGraph Agent SDK 示例

本目录提供多种语言的 Agent SDK 示例代码，方便开发者快速集成 MonkeyGraph API。

## 目录结构

```
sdk/
├── javascript/     # JavaScript/TypeScript SDK
├── python/        # Python SDK
├── go/           # Go SDK
└── curl/         # cURL 命令示例
```

## 快速开始

### 1. 注册 Agent

```javascript
// JavaScript
const response = await fetch('http://localhost:13001/api/agent/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'my-agent' })
});
const { agent } = await response.json();
const apiKey = agent.api_key;
```

### 2. 使用 API Key 认证

所有后续请求需要在 Header 中添加认证信息：

```javascript
const response = await fetch('http://localhost:13001/api/agent/graphs', {
  headers: { 'Authorization': `Agent ${apiKey}` }
});
```

详细示例请参阅各语言目录下的 README.md。