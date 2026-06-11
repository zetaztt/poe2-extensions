# AGENTS.md

## 项目概览

这是一个面向 Path of Exile 2 trade2 页面的浏览器扩展，用于在 `https://www.pathofexile.com/trade2` 上启用中文化体验。项目基于 WXT、Vue 3 和 TypeScript 构建，核心能力包括：

- 在 trade2 页面加载早期注入主世界脚本。
- 拦截物品、词缀、静态数据和筛选器相关数据。
- 使用本地、缓存或远端翻译字典将命中文本显示为中文。
- 在关键条目后保留英文原文，避免丢失原始语义。
- 将 trade2 本地缓存重定向到 `_zh` 后缀，避免污染官方英文缓存。

## 技术栈

- WXT：浏览器扩展工程、entrypoint 管理和构建。
- Vue 3：侧边栏页面。
- TypeScript：扩展逻辑、注入脚本和翻译数据脚本。
- Browser Extension APIs：`browser.runtime`、`browser.storage.local`、`browser.tabs`、Chrome Side Panel API、content script 通信。
- Crawlee / Playwright：抓取或辅助生成翻译数据。
- `csv`：读写翻译源数据。

## 目录说明

- `entrypoints/`：WXT entrypoints。
  - `background.ts`：background 逻辑，负责侧边栏点击行为、翻译字典的本地 fallback、缓存、远端版本检查和消息响应。
  - `content.ts`：content script，运行在 trade2 页面，负责读取中文翻译开关、注入 `/injector.js` 并桥接页面消息与 background。
  - `injector.unlisted.ts`：生成主世界注入脚本，实际调用 `src/trade-translate/inject.ts`。
  - `sidepanel/`：扩展侧边栏的 Vue 页面和样式，提供中文翻译开关。
- `src/settings.ts`：全项目共享设置入口，目前包含默认关闭的 `tradeTranslateEnabled`。
- `src/trade-translate/`：trade 中文化核心逻辑，包括消息类型、数据处理、DOM 处理、存储和共享常量。
- `src/translate-dictionary.ts`：主世界脚本侧加载翻译字典的入口，通过 `window.postMessage` 请求 content/background。
- `scripts/translate/`：翻译数据拉取、自动翻译和字典生成脚本。
- `data/`：翻译源 CSV 数据。
- `assets/`：扩展内置资源，包括生成的 `translate.json` 和 `translate-meta.json`。
- `public/`：扩展图标等静态资源。
- `.wxt/`、`.output/`、`node_modules/`、`storage/`：本地生成或依赖目录，不应作为业务源码修改。

## 常用命令

- `npm run dev`：启动 Chromium 开发模式。
- `npm run dev:firefox`：启动 Firefox 开发模式。
- `npm run build`：构建 Chromium 扩展。
- `npm run build:firefox`：构建 Firefox 扩展。
- `npm run zip`：打包 Chromium 扩展。
- `npm run zip:firefox`：打包 Firefox 扩展。
- `npm run compile`：运行 `vue-tsc --noEmit` 做类型检查。
- `npm run pull-translate`：从 POE2 官方英文/繁中 trade 数据接口拉取文本到 `data/trade-texts.csv`。
- `npm run auto-translate`：通过 poe2db 等来源辅助生成自动翻译数据。
- `npm run build-translate`：根据 `data/*.csv` 生成 `assets/translate.json` 和 `assets/translate-meta.json`。

## 扩展运行链路

1. `entrypoints/background.ts` 设置点击扩展图标打开侧边栏。
2. `entrypoints/sidepanel/` 读取并写入 `src/settings.ts` 中的 `tradeTranslateEnabled`，该开关默认关闭；切换后会刷新当前活动的 trade2 标签页。
3. `entrypoints/content.ts` 匹配 `https://www.pathofexile.com/trade2*`，在 `document_start` 运行，并先读取 `tradeTranslateEnabled`。
4. 如果中文翻译关闭，content script 不安装消息桥接，也不注入主世界脚本。
5. 如果中文翻译开启，content script 安装 `window.postMessage` 桥接逻辑，并通过 WXT 的 `injectScript('/injector.js')` 注入主世界脚本。
6. `entrypoints/injector.unlisted.ts` 调用 `injextTrade()`，在页面主世界安装 trade 数据 hook、DOM 观察和官方繁中脚本注入。
7. 主世界脚本通过 `src/translate-dictionary.ts` 发出翻译字典请求。
8. content script 将请求转发给 background。
9. `entrypoints/background.ts` 在本地内置字典、`browser.storage.local` 缓存和远端 `https://zetaztt.github.io/poe2/` 字典之间选择可用的最新版本。
10. 字典返回主世界脚本后，trade 数据和页面文本按命中字典进行中文化处理。

## 翻译数据流程

- 优先维护 `data/*.csv` 中的源数据和翻译数据。
- `data/trade-texts.csv` 是从官方 trade 数据接口整理出的文本清单。
- `data/trade-texts-atuo-translate.csv` 是自动翻译结果文件；文件名保持现状，不要在普通改动中重命名。
- `data/trade-texts-manual-translate.csv` 是人工补充翻译结果。
- 生成最终字典时运行 `npm run build-translate`。
- `assets/translate.json` 和 `assets/translate-meta.json` 是生成产物，同时也是扩展的本地 fallback 资源；可以随翻译数据一起提交，但不要手动随意修改版本号。
- `translate-meta.json` 的 `version` 在字典内容变化时由脚本使用 `Date.now()` 更新。

## 开发注意事项

- 保持 WXT entrypoint 约定，不要绕过 `entrypoints/` 直接引入浏览器运行入口。
- 新增功能设置应优先集中在 `src/settings.ts`，保持默认值、storage key 和读写函数可复用。
- content script 与主世界脚本之间只能通过受控消息桥接；新增消息时同步更新类型守卫和消息类型定义。
- background 返回的翻译字典必须经过结构校验，避免把无效远端或缓存数据传入页面。
- 主世界 hook 会影响 trade2 页面运行时行为，修改 `src/trade-translate/` 时要尽量收窄影响范围。
- 中文翻译开关默认关闭；修改注入链路时确认关闭状态不会注入官方繁中脚本、数据 hook 或 DOM 翻译逻辑。
- 避免污染官方 trade2 本地缓存；涉及缓存 key 或 storage 改动时确认 `_zh` 隔离策略仍然有效。
- 修改翻译数据时，优先改 CSV，再运行生成脚本更新 `assets/translate.json` 和 `assets/translate-meta.json`。
- 项目当前没有专门测试框架；较大逻辑变更至少运行类型检查和构建。
- 代码风格以现有文件为准：TypeScript 模块化、小范围类型守卫、中文日志和用户可见说明可以保留中文。
- Git 提交日志使用中文，保持简短并说明核心变更。

## 验证建议

- 文档或注释变更通常不需要运行测试。
- TypeScript 或 Vue 逻辑变更后运行 `npm run compile`。
- entrypoint、manifest、侧边栏、注入链路或构建相关改动后运行 `npm run build`，确认 manifest 包含 `side_panel`、`sidePanel` 权限和 `action`，且没有 `action.default_popup`。
- 翻译数据变更后运行 `npm run build-translate`，确认 `assets/translate.json` 与 `assets/translate-meta.json` 更新符合预期。
- 涉及页面注入、hook、storage、侧边栏或消息桥接的改动，建议在开发模式下手动打开 `https://www.pathofexile.com/trade2`，确认默认关闭、侧边栏开关、自动刷新、翻译效果、缓存隔离和控制台日志。
