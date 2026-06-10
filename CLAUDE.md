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

## 命名规范

新增代码必须遵守以下规则；旧代码在修改时顺手修正同一作用域内明显不一致的命名，不做大面积无业务价值的重命名。

### 文件与目录

- 目录名统一小写；多词目录使用 `kebab-case`（如 `trade-translate`、`shared-utils`）
- Vue 单文件组件使用 `PascalCase`（如 `TradeTranslatePanel.vue`、`BaseButton.vue`）
- 普通 TypeScript 模块文件使用 `kebab-case`（如 `storage-bridge.ts`、`date-format.ts`）
- Vue composables 使用 `useXxx.ts`（如 `useStorage.ts`）
- WXT / 框架约定入口文件保留约定式命名（如 `background.ts`、`content.ts`、`main.ts`）
- 配置文件遵循生态默认命名（如 `wxt.config.ts`、`tsconfig.json`）

### Vue 组件与模板

- 组件文件名与导入名使用 `PascalCase`
- Vue 模板中组件标签使用 `kebab-case`（如 `<trade-translate-panel />`）
- 自定义事件名使用 `kebab-case`（如 `item-click`、`update:model-value`）
- 通用基础组件如有需要，使用 `Base` 前缀（如 `BaseButton.vue`）

### TypeScript 标识符

- 变量、函数、参数统一使用 `camelCase`（如 `redirectLocalStorageKey`、`getTradeDataKind`）
- 布尔值优先使用可读前缀：`is` / `has` / `can` / `should`（如 `isEnabled`、`hasPermission`）
- 事件处理函数使用 `handleXxx`（如 `handleClick`）
- 工厂/转换函数使用动词前缀：`create` / `build` / `get` / `parse` / `to`（如 `createMessage`、`parseResponse`）
- 类型别名、接口、类、枚举统一使用 `PascalCase`，不使用 `I` 前缀（如 `TradeDataKind`、`UserSettings`）
- 缩写保持可读性：`userId`、`apiClient`、`baseUrl`；避免无语义缩写如 `cfg`、`tmpData2`

### 常量

- 模块级常量统一使用 `camelCase`（如 `logPrefix`、`translateDictionaryUrl`、`tradeDataPaths`）
- 对象与数组常量保留 `camelCase + as const` 模式（如 `tradeDataPaths = { ... } as const`）

## 仓库文件中的 IDE 建议

`README.md` 和 `.vscode/extensions.json` 建议使用 VS Code + Volar，以获得更好的 Vue 开发体验。
