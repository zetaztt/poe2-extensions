# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 交流语言

除非用户明确要求使用其他语言，否则尽量使用中文回答、总结和说明代码变更。

## 项目概览

这是一个基于 WXT、Vue 3 和 TypeScript 的浏览器扩展项目。WXT 负责扩展构建流程、manifest 生成和 entrypoint 发现；Vue 支持通过 `wxt.config.ts` 中的 `@wxt-dev/module-vue` 启用。

当前代码基本保持 WXT + Vue starter 模板结构：

- `entrypoints/background.ts` 通过 `defineBackground` 定义扩展后台脚本。
- `entrypoints/content.ts` 通过 `defineContentScript` 定义内容脚本；当前匹配 `*://*.google.com/*`。
- `entrypoints/popup/` 包含 popup 页面。`index.html` 声明 `<meta name="manifest.type" content="browser_action" />`，加载 `main.ts`，并把 Vue 应用挂载到 `#app`。
- `entrypoints/popup/App.vue` 是 popup 根组件，并通过 `@/` alias 引入共享 Vue 组件。
- `components/` 和 `assets/` 存放共享 Vue 组件与打包资源。
- `public/` 存放会被复制到扩展输出目录的静态文件，包括图标和 `wxt.svg`。

## 常用命令

当前仓库没有 package manager lockfile。脚本定义在 `package.json` 中，可用贡献者选择的包管理器运行；以下命令以 npm 为例。

```bash
npm install
```

安装依赖。`postinstall` 会运行 `wxt prepare`，生成 TypeScript 所需的 WXT 类型和配置。

```bash
npm run dev
npm run dev:firefox
```

分别以 Chromium 或 Firefox 目标启动 WXT 开发模式。

```bash
npm run build
npm run build:firefox
```

分别为 Chromium 或 Firefox 构建扩展。

```bash
npm run zip
npm run zip:firefox
```

分别为 Chromium 或 Firefox 将扩展输出打包成 zip。

```bash
npm run compile
```

使用 `vue-tsc --noEmit` 运行 TypeScript/Vue 类型检查。

当前 `package.json` 没有 test 或 lint 脚本，因此仓库尚未定义运行测试、运行单个测试或 lint 的命令。

## TypeScript 与 WXT 注意事项

`tsconfig.json` 继承 `./.wxt/tsconfig.json`，所以在全新 checkout 后，先运行 `npm install` 或 `npm run postinstall`/`wxt prepare`，再依赖编辑器或 CLI 进行类型检查。

WXT 通过生成的类型提供 `defineBackground`、`defineContentScript`、`browser` 等全局能力。除非项目明确需要自定义 manifest wiring，否则优先遵循 `entrypoints/` 下的 WXT entrypoint 约定。

## Vue Popup 架构

Popup 是标准的 Vue 3 单页挂载流程：

1. `entrypoints/popup/index.html` 提供文档外壳和 manifest metadata。
2. `entrypoints/popup/main.ts` 引入 popup 全局 CSS，创建 Vue app，并挂载 `App.vue`。
3. `entrypoints/popup/App.vue` 组合 popup UI，并通过 `@/` 从 `components/` 引入可复用组件。

Popup 专用样式应尽量靠近 popup entrypoint；只有确实需要跨扩展界面共享时再抽到共享位置。

## 仓库文件中的 IDE 建议

`README.md` 和 `.vscode/extensions.json` 建议使用 VS Code + Volar，以获得更好的 Vue 开发体验。
