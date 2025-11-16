## ViteDocScraper (Vite 中文文档爬虫)

轻量级 Node.js 脚本，用于自动爬取 Vite 中文文档网站（`https://cn.vite.dev/guide/`）的“指南”等文档，将页面内容转换为本地 Markdown 文件，并按分组结构进行归档。

### 功能概述

- **导航链接发现（FR1）**

  - 从入口页面 `https://cn.vite.dev/guide/` 开始抓取。
  - 使用 `cheerio` 解析页面中的侧边栏导航（使用 `nav#VPSidebarNav` 结构）。
  - 精确定位 VitePress 侧边栏结构：`section.VPSidebarItem.level-0` 中的所有 `a.VPLink` 链接。
  - 提取所有指向文档页面的链接及其标题，并识别所属分组（从 `h2.text` 中提取）。

- **内容页面抓取（FR2）**

  - 遍历在侧边栏中发现的所有文档链接。
  - 使用 `axios` 逐一请求页面，获取完整 HTML 内容。

- **核心内容提取（FR3）**

  - 使用 `cheerio` 定位主内容区域（优先选择 `main.VPDoc`，否则退化为第一个 `main`）。
  - 从文档区域中：
    - 提取第一个 `<h1>` 作为页面标题。
    - 删除 `<h1>`，保留其后的所有正文内容（包含子标题、段落、代码块、列表等）。
    - 尝试移除导航、页脚等非正文结构（如 `nav`, `.VPDocFooter`, `.VPDocAside`）。

- **HTML 转 Markdown（FR4）**

  - 使用 `turndown` + `turndown-plugin-gfm` 将正文 HTML 转换为 Markdown。
  - 配置为：
    - `<h1>`/`<h2>` 等 -> `#`/`##` 形式的 ATX 标题。
    - `<pre>`/`<code>` -> Fenced code block（```）。
    - `<a>` -> `[text](link)`。
    - `<ul>`/`<li>` -> `-` 列表。

- **文件存储（FR5）**
  - 根据文档 URL 计算输出路径，默认输出根目录为 `docs/`。
  - 目录结构：
    - **直接使用 URL 路径**，避免重复（例如 `/guide/why-vite.html` -> `docs/guide/why-vite.md`）。
    - `/config/shared-options.html` -> `docs/config/shared-options.md`。
  - 自动创建所需目录，并将 Markdown 写入对应 `.md` 文件中。

### 技术栈

- **运行环境**：Node.js ≥ 18
- **HTTP 请求**：`axios`
- **HTML 解析**：`cheerio`
- **HTML -> Markdown 转换**：`turndown` + `turndown-plugin-gfm`
- **文件系统**：Node.js 内置模块 `fs/promises` + `path`

### 项目结构

```text
vite-scraper/
  ├─ index.js        # 主爬虫脚本
  ├─ package.json    # 依赖与脚本定义
  ├─ README.md       # 项目说明
  └─ docs/           # 运行后生成的 Markdown 文档（按分组与路径分目录）
```

### 安装与运行

1. **安装依赖**

   在项目根目录下执行：

   ```bash
   cd /Users/fanmw/Desktop/study/vite-scraper
   npm install
   ```

   > 说明：`package.json` 中已经声明了所需依赖：`axios`、`cheerio`、`turndown`、`turndown-plugin-gfm`。

2. **运行爬虫**

   ```bash
   npm run scrape
   ```

   - 脚本会：
     - 访问 `https://cn.vite.dev/guide/`。
     - 分析侧边栏并发现所有文档链接。
     - 逐个抓取页面、提取主内容、转换为 Markdown。
     - 在项目根目录下生成 `docs/` 文件夹及子目录结构。

### 实现细节说明

- **入口与侧边栏解析**

  - 常量 `ENTRY_URL` 设为 `https://cn.vite.dev/guide/`。
  - 使用 `extractSidebarLinks(html)`：
    - 首先在 `aside.VPDocAside a[href]` 中寻找链接。
    - 对每个链接：
      - 忽略锚点（如 `#xxx`）和外部链接。
      - 将相对路径（如 `/guide/why-vite.html`）转换为绝对 URL。
      - 使用最近的“分组容器”（如带 `group` 的类或 `.VPSidebarGroup`）的标题作为分组名。
    - 如果上述结构完全匹配不到，则退化为在任意包含 `sidebar` 的节点内寻找 `<a>` 链接，以提高对 VitePress 升级的兼容性。

- **内容提取**

  - `extractContent(html)` 负责：

    - 优先选择 `main.VPDoc` 作为主内容节点；如果不存在则选择第一个 `main`。
    - 在该节点内：
      - 寻找第一个 `<h1>` 作为标题，并从 DOM 中移除，避免重复出现在正文 Markdown 中。
      - 尝试移除典型非内容区域（导航、页脚等）。
    - 将剩余 HTML 片段传给 `turndown` 进行 Markdown 转换。
    - 最终返回形如：

      ```markdown
      # 页面标题

      （正文 Markdown 内容）
      ```

- **路径与文件命名**

  - `normalizePathFromUrl(url)` 根据 URL 生成相对路径：
    - 将以 `/` 结尾的路径视为目录，并补全为 `index.html`。
    - 去掉开头的 `/`，按 `/` 拆分为路径片段。
    - 最后一个片段作为文件名（`.html` / `.htm` -> `.md`）。
  - `saveMarkdown(doc, markdown)`：
    - 取“分组标题”做一级目录名（经 `slugify` 处理）。
    - 再追加 URL 拆分出的路径片段，最终形成完整目录。
    - 使用 `fs.mkdir(..., { recursive: true })` 自动创建目录。
    - 将 Markdown 写入最终文件。

- **礼貌抓取（防止请求过快）**

  - 在处理每个文档页面后调用 `sleep(500)`，在两次请求之间加入约 500ms 延时。
  - 有利于减小对官方服务器的瞬时压力。

- **错误处理与可维护性**
  - 抓取入口页失败或主内容区域选择器失效时，会抛出错误并在控制台输出。
  - 对每个文档页面的抓取均包裹在 `try/catch` 中，即使部分页面失败，也不会中断整个抓取流程。
  - 若 VitePress 将来调整类名（如 `VPDocAside` 被替换），只需更新：
    - 侧边栏选择器（`extractSidebarLinks`）。
    - 主内容选择器（`extractContent` 中的 `main.VPDoc` 等）。

### 后续改进方向（可选）

- 增加命令行参数：
  - 自定义入口 URL。
  - 自定义输出目录。
  - 限制抓取范围（仅 `guide`、仅 `config` 等）。
- 增加简单重试机制：
  - 针对临时网络错误自动重新请求 1~2 次。
- 增加日志文件：
  - 将抓取成功/失败列表输出到日志文件，方便后续检查。
