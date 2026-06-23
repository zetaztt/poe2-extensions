# AGENTS.md

## 项目概览

这是一个面向 Path of Exile 2 trade2 页面的浏览器扩展，用于在 `https://www.pathofexile.com/trade2` 上提供中文化和交易辅助工具。项目基于 Vite、vite-plugin-web-extension、Vue 3 和 TypeScript 构建，核心能力包括：

- 在 trade2 页面加载早期注入主世界脚本。
- 拦截物品、词缀、静态数据和筛选器相关数据。
- 使用本地、缓存或远端翻译字典将命中文本显示为中文。
- 在关键条目后保留英文原文，避免丢失原始语义。
- 将 trade2 本地缓存重定向到 `_zh` 后缀，避免污染官方英文缓存。
- 在侧边栏维护 trade2 搜索书签、搜索翻译词典和计算货币或商品差价。
- 将 trade2 搜索结果中的物品复制为 PoB 可识别文本。
- 保存、应用、重命名和删除 trade2 高级筛选 stat group 预设。

## 技术栈

- Vite：浏览器扩展工程构建、开发服务器和静态资源处理。
- vite-plugin-web-extension：根据 manifest 和额外入口构建 WebExtension。
- @vitejs/plugin-vue：Vue 单文件组件编译。
- Vue 3：侧边栏页面。
- TypeScript：扩展逻辑、注入脚本和翻译数据脚本。
- Browser Extension APIs：`browser.runtime`、`browser.storage.local`、`browser.storage.sync`、`browser.tabs`、`navigator.clipboard`、Chrome Side Panel API、content script 通信。
- Crawlee / Playwright：抓取或辅助生成翻译数据。
- `csv`：读写翻译源数据。

## 目录说明

- `vite.config.ts`：Vite 与 `vite-plugin-web-extension` 配置，合并 `package.json` 元信息和 `src/manifest.json`，并通过 `additionalInputs` 构建主世界注入脚本。
- `src/manifest.json`：扩展 manifest 源文件，声明 background、side panel、content script、权限和 web accessible resources。
- `src/background.ts`：background service worker 入口，负责侧边栏点击行为、翻译字典的本地 fallback、缓存、远端版本检查和消息响应。
- `src/sidepanel/`：扩展侧边栏的 Vue 页面和全局样式，包含书签、差价、词典和设置四个标签页。
- `src/settings/settings.ts`：全项目云同步用户设置入口，包含默认关闭的中文翻译、物品文本复制和筛选预设三个 trade 功能开关。
- `src/bookmarks/`：扩展自有的 trade2 书签树类型、`browser.storage.local` 存储校验和增删改查业务逻辑；不依赖浏览器书签 API，源码文件使用 `bookmarks-*` 前缀命名。
- `src/sidepanel/bookmarks/`：书签树、文件夹、条目、菜单、拖拽和当前 trade2 搜索保存交互。
- `src/sidepanel/dictionary/`：翻译字典中英文搜索和英文原文复制页面。
- `src/sidepanel/settings/`：三个 trade 功能开关及当前活动 trade2 标签页同步逻辑。
- `src/trade/`：trade 页面逻辑、功能状态消息、通用类型和工具。
    - `trade-content.ts`：manifest `content_scripts` 直接声明的 trade content script 编排入口，负责读取三个 trade 功能开关、安装模块 content bridge、注入 `src/trade/trade-inject.js` 并同步功能状态。
    - `trade-inject.ts`：通过 `vite.config.ts` 的 `additionalInputs` 构建的 trade 主世界脚本入口，负责监听功能状态消息并安装已启用功能。
    - `translate/`：中文化数据 hook、DOM 翻译、翻译消息、翻译字典 content bridge 和 `_zh` 本地缓存隔离。
    - `item-code/`：接管搜索结果复制按钮，并将 trade 物品数据格式化为 PoB 文本。
    - `stat-preset/`：在高级筛选界面安装预设 UI，并通过 content bridge 和本地存储消息处理完成预设存储操作。
- `src/translate-dictionary.ts`：主世界脚本侧加载翻译字典的入口，通过 `window.postMessage` 请求 content/background。
- `scripts/translate/`：翻译数据拉取、自动翻译和字典生成脚本。
- `data/`：翻译源 CSV 数据。
- `assets/`：Vite `publicDir`，包含扩展图标以及生成的 `translate.json` 和 `translate-meta.json`，构建时原样复制到扩展输出目录。
- `dist/`、`.chrome-profile/`、`node_modules/`、`storage/`：本地生成、开发浏览器配置或依赖目录，不应作为业务源码修改。

## 常用命令

- `npm run dev`：启动 Chromium 开发模式。
- `npm run build`：构建 Chromium 扩展。
- `npm run compile`：运行 `vue-tsc --noEmit` 做类型检查。
- `npm run format`：使用 Prettier 格式化纳管文件。
- `npm run format:check`：检查纳管文件是否符合 Prettier 格式。
- `npm run pull-translate`：从 POE2 官方英文/繁中 trade 数据接口拉取文本到 `data/trade-texts.csv`。
- `npm run auto-translate`：通过 poe2db 等来源辅助生成自动翻译数据。
- `npm run build-translate`：根据 `data/*.csv` 生成 `assets/translate.json` 和 `assets/translate-meta.json`。

## 扩展运行链路

1. `vite.config.ts` 使用 `webExtension()` 合并 `package.json` 元信息和 `src/manifest.json`，生成扩展 manifest。
2. `src/manifest.json` 声明 `src/background.ts` 为 service worker，并设置点击扩展图标打开侧边栏。
3. `src/sidepanel/index.html` 加载侧边栏 Vue 应用；侧边栏包含书签、差价、词典和设置四个标签页；书签初始化成功时默认进入书签页，否则停留在设置页。
4. 设置页通过 `src/settings/settings.ts` 读写 `browser.storage.sync` 中三个默认关闭的功能开关。
5. manifest 的 `content_scripts` 匹配 `https://www.pathofexile.com/trade2*`，在 `document_start` 运行 `src/trade/trade-content.ts` 完成 trade content 安装。
6. content script 始终通过 `browser.runtime.getURL("src/trade/trade-inject.js")` 注入主世界入口，随后使用 trade 功能消息下发当前开关状态。
7. `src/trade/trade-inject.ts` 构建出的主世界脚本验证域名、路径和站点标识后监听功能状态，只安装已启用功能对应的 hook 或 UI。
8. 中文翻译启用时，主世界脚本注入官方繁中脚本、安装 trade 数据和 DOM 翻译逻辑，并将指定 localStorage key 重定向到 `_zh` 后缀。
9. 主世界脚本通过 `src/translate-dictionary.ts` 发出翻译字典请求，content script 仅在翻译开启时将请求转发给 background。
10. background 在扩展内置字典、`browser.storage.local` 缓存和远端 `https://zetaztt.github.io/poe2/` 字典之间选择可用的最新版本，并在返回前校验结构。
11. 物品复制启用时，主世界脚本监听搜索结果 DOM，将原复制按钮绑定为 PoB 文本复制；关闭时移除绑定并恢复按钮原状态。
12. 筛选预设启用时，主世界脚本在高级筛选界面安装保存和选择 UI，通过 `window.postMessage` 向 content script 请求本地预设的读取、保存、重命名和删除。
13. 翻译开关切换后刷新当前活动 trade2 标签页，以便完整安装或停止不可卸载的翻译 hook；物品复制和筛选预设通过运行时消息即时更新。
14. 三个功能全部关闭时，入口脚本和桥接仍存在，但不会安装翻译 hook、物品复制绑定或页面 UI。

## 侧边栏与存储

- `browser.storage.sync` 只存放三个体积较小、需要云同步的功能开关。
- `browser.storage.local` 存放扩展自有书签树、差价工具状态、筛选预设和远端翻译字典缓存。
- 书签功能只接受 `https://www.pathofexile.com/trade2` 下的 URL；打开书签时优先复用当前活动的 trade2 标签页。
- 差价工具由用户维护货币、商品和报价，支持货币双向循环及商品跨货币买卖计算；跨货币商品机会只使用直接兑换报价。
- 词典页直接通过 `browser.runtime.sendMessage` 向 background 请求与页面翻译相同的最新可用字典，不经过 trade2 页面桥接。
- 筛选预设保存在 `tradeStatPresets` 本地存储项中，content script 必须对消息和存储结构进行校验。

## 翻译数据流程

- 优先维护 `data/*.csv` 中的源数据和翻译数据。
- `data/trade-texts.csv` 是从官方 trade 数据接口整理出的文本清单。
- `data/trade-texts-atuo-translate.csv` 是自动翻译结果文件；文件名保持现状，不要在普通改动中重命名。
- `data/trade-texts-manual-translate.csv` 是人工补充翻译结果。
- 生成最终字典时运行 `npm run build-translate`。
- `assets/translate.json` 和 `assets/translate-meta.json` 是生成产物，同时也是扩展的本地 fallback 资源；可以随翻译数据一起提交，但不要手动随意修改版本号。
- `translate-meta.json` 的 `version` 在字典内容变化时由脚本使用 `Date.now()` 更新。

## 开发注意事项

- 保持 `src/manifest.json`、`vite.config.ts` 和实际入口文件一致；新增浏览器运行入口时同步更新 manifest、`additionalInputs` 或 HTML 引用。
- 新增功能设置应优先集中在 `src/settings/settings.ts`，保持默认值、storage key 和读写函数可复用。
- sidepanel 的 Vue、DOM、拖拽、菜单和提示状态保留在对应页面目录；存储、校验、计算和可复用业务操作放在 `src/bookmarks/`、`src/settings/` 等功能模块。
- 用户开关设置使用 `browser.storage.sync` 云同步；书签、差价状态、筛选预设、翻译字典缓存等业务或大体积数据继续使用 `browser.storage.local`。
- content script 与主世界脚本之间只能通过受控消息桥接；新增消息时同步更新类型守卫和消息类型定义。
- background 返回的翻译字典必须经过结构校验，避免把无效远端或缓存数据传入页面。
- 主世界 hook 会影响 trade2 页面运行时行为，修改 `src/trade/` 时要尽量收窄影响范围。
- 各模块入口文件优先只负责生命周期、状态切换、功能编排和对外 API；DOM/UI 安装、样式注入、消息请求、存储访问、弹窗、下拉、按钮、格式化、校验、计算等独立逻辑应拆到对应职责脚本。
- 拆分模块时保持已有对外导入路径、storage key、消息协议和功能开关 API 稳定，除非任务明确要求改动。
- 优先表达真实依赖；无论是否跨模块，只要调用目的明确、流程稳定、依赖方向自然，就可以直接调用目标函数，避免为了形式上的解耦透传回调、创建中转层或引入 options。
- 只有存在复用、可替换行为、反向依赖风险、跨运行环境边界、测试替身需求或副作用隔离需求时，再使用回调、接口、options 或消息协议。
- 只被单个脚本使用的 DOM id、class、selector、timeout、storage key、局部文案等定义放在对应脚本内；两个以上脚本复用的通用函数或定义放到同目录 `utils.ts` 或已有业务工具模块。
- 只有存在明确跨模块共享需求时才新建 `constants.ts`、`types.ts` 等共享文件，避免为了少量单用常量创建中转文件。
- 三个 trade 功能开关默认关闭；修改注入链路时确认关闭状态不会安装对应 hook、按钮绑定或页面 UI。
- 翻译 hook 当前只安装一次且不支持运行时卸载，因此翻译设置继续通过刷新 trade2 页面生效；不要直接改成即时切换，除非同时实现完整卸载。
- 物品复制和筛选预设支持即时启停；关闭时必须清理事件、观察器、样式和扩展插入的 DOM，并保留官方页面原行为。
- 筛选预设消息只能在功能开启时处理，写入前继续校验名称和预设数组结构。
- 书签和差价数据读取时应继续校验持久化结构，无效数据使用安全默认值或重建默认树。
- 避免污染官方 trade2 本地缓存；涉及缓存 key 或 storage 改动时确认 `_zh` 隔离策略仍然有效。
- 修改翻译数据时，优先改 CSV，再运行生成脚本更新 `assets/translate.json` 和 `assets/translate-meta.json`。
- 项目当前没有专门测试框架；较大逻辑变更至少运行类型检查和构建。
- 代码格式由 Prettier 统一，配置见 `.prettierrc.json`：Tab 缩进宽度 4、双引号、分号、`bracketSameLine: true`。
- 遍历数组、NodeList、Map、Set 等集合时优先使用 `for...of`，避免使用 `.forEach(...)`，需要索引时使用 `entries()`。
- TypeScript 保持模块化、小范围类型守卫，中文日志和用户可见说明可以保留中文。
- 功能模块源码文件默认使用“模块路径 + 职责名”的 `kebab-case` 命名，并保留目录结构；例如 `src/trade/stat-preset/trade-stat-preset-modal.ts`。当前已迁移 `src/trade`、`src/bookmarks`，后续新增功能模块按同样规则命名。
- Vue 单文件组件使用 `kebab-case.vue`；保留 manifest 或 Vite 直接引用的入口文件名如 `src/background.ts`、`src/trade/trade-content.ts`、`src/trade/trade-inject.ts`。
- Git 提交日志使用中文，保持简短并说明核心变更。

## 验证建议

- 文档或注释变更通常不需要运行测试。
- 修改纳管文件后运行 `npm run format`，或至少运行 `npm run format:check` 确认格式。
- TypeScript 或 Vue 逻辑变更后运行 `npm run compile`。
- 入口、manifest、侧边栏、注入链路或构建相关改动后运行 `npm run build`，确认 manifest 包含 `side_panel`、`sidePanel` 权限和 `action`，且没有 `action.default_popup`。
- 翻译数据变更后运行 `npm run build-translate`，确认 `assets/translate.json` 与 `assets/translate-meta.json` 更新符合预期。
- 书签改动应手动验证目录增删改、跨目录拖拽、保存当前搜索、替换搜索、复用当前 trade2 标签页和本地持久化。
- 差价工具改动应验证状态恢复、货币循环、商品同币种与跨币种计算、缺失直接兑换提示、利润门槛和排序。
- 词典页改动应验证中英文搜索、结果上限、失败重试和英文复制。
- 涉及页面注入、hook、storage 或消息桥接的改动，建议在开发模式下手动打开 `https://www.pathofexile.com/trade2`，确认三个功能默认关闭且互不影响。
- 分别验证翻译开启后的页面刷新、字典加载、繁中脚本、数据与 DOM 中文化和 `_zh` 缓存隔离。
- 分别验证物品复制与筛选预设的即时启停、页面动态内容、PoB 文本复制、预设增删改用，以及关闭后的 UI 和事件清理。
