# Perplexity OpenCode Proxy

将 Perplexity 桌面应用转换为 OpenAI 兼容 API 的代理服务器。通过提取 Perplexity 桌面应用的 session cookie，代理请求到 Perplexity 内部 API。

## 特性

- 从 Perplexity 桌面应用提取认证信息
- 支持 OpenAI 兼容的 `/v1/chat/completions` 端点
- 支持 SSE 流式输出
- 自动转换请求/响应格式

## 安装

```bash
npm install
npm run build
```

## 配置

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件配置你的环境。

## 使用

### 启动代理服务器

```bash
npm start
```

服务器将在 `http://localhost:8080` 运行。

### 配置 OpenCode

在 `opencode.json` 中添加：

```json
{
  "provider": {
    "perplexity": {
      "name": "Perplexity",
      "baseUrl": "http://localhost:8080/v1",
      "apiKey": "perplexity-session-token"
    }
  }
}
```

## 工作原理

1. 从 Perplexity 桌面应用的 Electron Cookie 存储中读取 session token
2. 将 OpenAI 格式的请求转换为 Perplexity 内部 API 格式
3. 使用 session cookie 认证发送请求到 Perplexity 服务器
4. 将 Perplexity 的 SSE 响应转换回 OpenAI 格式

## 免责声明

本项目仅用于教育和研究目的。使用本项目可能违反 Perplexity 的服务条款。

## 许可证

MIT
