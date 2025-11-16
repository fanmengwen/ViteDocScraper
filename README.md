# Vite 文档爬虫

一个简单的 Node.js 脚本，用来把 Vite 中文官网的文档爬下来，转成本地 Markdown 文件。

## 功能

- 支持爬取多个文档分类（指南、配置等）
- 自动提取侧边栏链接
- 转换 HTML 为 Markdown
- 按 URL 路径组织文件结构

## 配置

修改 `index.js` 里的 `ENTRY_PAGES` 数组来添加要爬取的页面：

```javascript
const ENTRY_PAGES = [
  "/guide/", // 指南
  "/config/", // 配置
  // 添加更多...
];
```

## 使用

安装依赖：

```bash
npm install
```

运行爬虫：

```bash
npm run scrape
```

生成的 Markdown 文件会保存在 `docs/` 目录下。

## 输出示例

```
docs/
  ├── guide/
  │   ├── index.md
  │   ├── why.md
  │   └── ...
  └── config/
      ├── index.md
      ├── shared-options.md
      └── ...
```
