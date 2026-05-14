# MCP Blog Server

基于 Model Context Protocol (MCP) 的博客发布工具，支持将 Markdown 文章发布到 CSDN、掘金、博客园等多个平台。自动上传本地图片并替换为远程 URL。

## 功能特性

- **多平台支持**：CSDN、掘金、博客园
- **图片自动上传**：发布/更新时自动识别 Markdown 中的本地图片路径，上传到对应平台并替换为远程 URL
- **Markdown 文件支持**：直接读取本地 `.md` 文件发布，自动提取标题和摘要
- **批量发布**：一键将文章发布到多个已配置平台
- **动态配置**：运行时动态设置平台 Cookie，无需重启

## MCP 工具列表

### 平台配置

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `set_platform_config` | 设置平台 Cookie/Token | `platform`, `config.cookie`, `config.token`(博客园) |
| `list_configured_platforms` | 查看已配置的平台 | 无 |

### 文章发布

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `publish_article` | 发布文章（自动上传本地图片） | `platform`, `title`, `content`, `status` |
| `read_markdown_and_publish` | 读取本地 Markdown 文件并发布（自动上传图片） | `filePath`, `platform`(可选，不传则发布到所有已配置平台) |
| `batch_publish` | 批量发布到多个平台 | `platforms[]`, `title`, `content` |

### 文章管理

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `get_articles` | 获取文章列表 | `platform`, `page`, `pageSize` |
| `get_article_detail` | 获取文章详情 | `platform`, `articleId` |
| `update_article` | 更新文章（自动上传本地图片） | `platform`, `articleId`, `content` |
| `edit_blog` | 读取本地 Markdown 文件更新已有文章（自动上传图片） | `platform`, `articleId`, `filePath` |
| `delete_article` | 删除文章 | `platform`, `articleId` |

### 图片与文件

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| `upload_image` | 上传图片到平台 | `platform`, `filePath` 或 `imageUrl` |
| `download_image` | 下载网络图片到本地 | `url`, `savePath` |
| `read_markdown` | 读取本地 Markdown 文件 | `filePath` |

### 通用参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `platform` | enum | `csdn` / `juejin` / `cnblog` |
| `title` | string | 文章标题 |
| `content` | string | Markdown 内容 |
| `filePath` | string | 本地文件路径（支持相对/绝对路径） |
| `status` | enum | `draft`(草稿) / `publish`(发布) |
| `tags` | string[] | 标签列表 |
| `coverImage` | string | 封面图片 URL |

### 各平台专属参数

发布/更新工具中通过 `csdnParams`、`juejinParams`、`cnblogParams` 传入各平台特有参数。

#### CSDN (`csdnParams`)

| 参数 | 类型 | 说明 |
|------|------|------|
| `readType` | enum | `public`=公开, `private`=私有, `read_need_pay`=付费, `read_need_vip`=VIP可见（默认 public） |
| `type` | enum | `original`=原创, `reproduced`=转载, `translated`=翻译（默认 original） |
| `original_link` | string | 转载原文链接（type 为 reproduced 时填写） |

#### 掘金 (`juejinParams`)

| 参数 | 类型 | 说明 |
|------|------|------|
| `tag_ids` | string[] | 标签 ID 数组（发布时必填） |
| `category_id` | string | 分类 ID（默认后端） |
| `column_ids` | string[] | 专栏 ID 数组 |
| `theme_ids` | string[] | 主题 ID 数组 |

常用标签 ID：

| 标签 | ID |
|------|-----|
| 前端 | `6809640408797167623` |
| 后端 | `6809637769959178254` |
| Android | `6809635626879549448` |
| iOS | `6809635626879563271` |
| 人工智能 | `6809637771511044104` |
| 开发工具 | `6809635627016548359` |
| 代码人生 | `6809637773939011591` |
| 阅读 | `6809635626879571975` |

#### 博客园 (`cnblogParams`)

| 参数 | 类型 | 说明 |
|------|------|------|
| `accessPermission` | number | `0`=公开, `1`=登录可见, `2`=仅自己可见（默认 0） |
| `inSiteCandidate` | boolean | 入选首页候选（默认 false） |
| `inSiteHome` | boolean | 发布到首页（默认 false） |
| `isAllowComments` | boolean | 允许评论（默认 true） |
| `displayOnHomePage` | boolean | 显示在个人首页（默认 true） |

## 快速添加 MCP 配置

### Claude Desktop

编辑配置文件：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "blog": {
      "command": "npx",
      "args": ["-y", "mcp-blog-server"],
      "env": {
        "CSDN_COOKIE": "",
        "JUEJIN_COOKIE": "",
        "CNBLOG_COOKIE": "",
        "CNBLOG_TOKEN": ""
      }
    }
  }
}
```

### Codex CLI

编辑 `~/.codex/config.json`，或使用命令：

```bash
codex --mcp-config '{
  "mcpServers": {
    "blog": {
      "command": "npx",
      "args": ["-y", "mcp-blog-server"],
      "env": {
        "CSDN_COOKIE": "",
        "JUEJIN_COOKIE": "",
        "CNBLOG_COOKIE": "",
        "CNBLOG_TOKEN": ""
      }
    }
  }
}'
```

### OpenCode

编辑项目目录下的 `.opencode.json` 或全局 `~/.opencode/config.json`：

```json
{
  "mcpServers": {
    "blog": {
      "command": "npx",
      "args": ["-y", "mcp-blog-server"],
      "env": {
        "CSDN_COOKIE": "",
        "JUEJIN_COOKIE": "",
        "CNBLOG_COOKIE": "",
        "CNBLOG_TOKEN": ""
      }
    }
  }
}
```

> **提示**：如果本项目已发布到 npm，将 `npx` + `args` 替换为 `node /path/to/mcp-blog-server/dist/index.js` 即可使用本地版本。

## 使用示例

### 1. 动态配置平台 Cookie

```
请帮我配置 CSDN 平台，cookie 是 xxxxxxxx
```

### 2. 发布 Markdown 文件到 CSDN

```
把 ./my-article.md 发布到 CSDN，标签为 Vue、TypeScript，设为原创文章
```

### 3. 批量发布到所有平台

```
把 ./article.md 发布到 CSDN、掘金和博客园，状态为草稿
```

### 4. 更新已有文章

```
用 ./updated-article.md 的内容更新 CSDN 上文章 ID 为 12345 的文章
```

### 5. 获取文章列表

```
查看 CSDN 上的文章列表，第 1 页
```

## 获取 Cookie 方法

### 方式一：AI + Playwright 自动获取（推荐）

配合 Playwright MCP Server，可以让 AI 自动打开浏览器登录并提取 Cookie。在 MCP 配置中同时添加 Playwright 和 Blog Server：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-playwright"]
    },
    "blog": {
      "command": "npx",
      "args": ["-y", "mcp-blog-server"]
    }
  }
}
```

配置好后，直接对 AI 说：

#### 自动获取 CSDN Cookie

```
帮我打开 CSDN 登录页面，我登录后你提取 Cookie 然后配置到 blog 服务器
```

AI 会执行以下流程：
1. 用 Playwright 打开 `https://www.csdn.net/` 登录页
2. 等待你扫码或输入账号密码完成登录
3. 登录成功后自动从浏览器提取 `document.cookie`
4. 调用 `set_platform_config` 将 Cookie 写入 blog 服务器

#### 自动获取掘金 Cookie

```
打开掘金网站，我登录后帮我提取 Cookie 并配置到 blog 平台
```

#### 自动获取博客园 Cookie + Token

```
打开博客园登录页，我登录完成后帮我提取 Cookie 和 X-XSRF-TOKEN，然后配置到 blog 服务器。
X-XSRF-TOKEN 可以从 cookie 中名为 "XSRF-TOKEN" 的字段提取
```

#### 一键配置所有平台

```
依次帮我打开 CSDN、掘金、博客园的登录页面，每个平台我登录后你提取 Cookie 并自动配置到 blog 服务器。
博客园还需要从 Cookie 中提取 XSRF-TOKEN 字段作为 token 参数
```

> **原理**：AI 通过 Playwright 的 `browser_evaluate` 工具执行 `document.cookie` 获取当前页面的 Cookie，然后调用 `set_platform_config` 完成配置，全程无需手动复制粘贴。

### 方式二：手动获取

#### CSDN
1. 登录 [CSDN](https://www.csdn.net/)
2. F12 打开开发者工具 → Network 标签
3. 刷新页面，复制任意请求头中的 `Cookie` 值

#### 掘金
1. 登录 [掘金](https://juejin.cn/)
2. F12 → Network → 刷新页面
3. 复制请求头中的 `Cookie` 值

#### 博客园
1. 登录 [博客园](https://www.cnblogs.com/)
2. F12 → Network → 刷新页面
3. 复制 `Cookie` 值
4. 同时复制 `X-XSRF-TOKEN` 值（对应 `CNBLOG_TOKEN`）

## 注意事项

1. **Cookie 有效期**：Cookie 会过期，可再次让 AI 通过 Playwright 自动刷新
2. **图片上传**：发布/更新时自动处理本地图片（`![](./image.png)`），远程 URL 保持不变
3. **发布状态**：`draft` 为草稿，`publish` 为立即发布
4. **批量发布**：某个平台失败不会影响其他平台
5. **掘金标签**：掘金发布时 `tag_ids` 为必填参数

## 开发

```bash
npm install
npx tsup --dts false   # 快速构建（跳过 DTS）
npm run build           # 完整构建
npm run dev             # 监听模式
node dist/index.js      # 运行
```

## 许可证

MIT License
