# AGENTS.md

## 项目概览

本仓库是面向 Path of Exile 2 `trade2` 页面的 Chromium Manifest V3 扩展。代码跨越 background service worker、side-panel 扩展页面、isolated world content script 和 MAIN world 注入环境；修改前必须确认代码所属环境及跨环境边界。

## 仓库结构

- `projects/apps/background/`：background service worker 工程，持有浏览器行为、跨页面权威状态、持久化和业务 handler；入口只负责环境注册与模块安装。
- `projects/apps/content/`：isolated world content 工程，负责编排 runtime/window IPC relay 和 MAIN world 脚本注入。
- `projects/apps/inject/`：MAIN world 工程，维护 trade2 DOM 功能及其独立入口；不具备 Extension API，不得引入侧边栏页面框架或 store。
- `projects/apps/side-panel/`：Vue 侧边栏工程。功能组件、store 和 service 统一归入 `src/modules/<feature>/`，根目录只保留组合入口，跨功能 UI 放入 `src/common/`；组件从模块 store 读取状态并调用 store action，只在组件内维护展示和临时交互状态。
- `projects/packages/core/`：所有运行工程共同依赖的环境无关核心工程；领域子路径导出共享数据契约和 IPC protocol，`ipc` 公开 channel、message、connection、envelope 和 connection hub，不创建运行环境 channel 单例。
- `public/`：`icon/` 和 `data/` 保持稳定的扩展路径；页面图片、字体及后续同类静态资源放入 `assets/`，侧边栏资源位于 `assets/side-panel/`。
- `data/trade-texts.po`：翻译人工维护源；`public/data/translate.json` 和 `public/data/translate-meta.json` 是生成产物及扩展内置 fallback。
- `scripts/translate/`：拉取 trade 数据和生成字典；`projects/packages/trade-translate-tools/` 是 npm workspace 中供脚本和发布分支复用的源码包。

## 开发流程

1. 修改前沿调用链确认运行环境、入口、IPC protocol、权威状态和持久化边界；不要依据旧文档猜测当前结构。
2. 修改已有功能时，以完成当前任务所需的最小改动为边界；除非任务明确要求或正确实现无法绕开，否则沿用现有架构、命名、IPC、状态管理和目录组织，不夹带无关重构。
3. 发现任务范围外的架构问题时，先完成并验证当前任务，再在交付说明中提出可独立评审的重构建议；若架构问题直接阻塞正确实现，才允许进行必要且影响范围最小的重构，并说明原因。
4. 将改动放在现有职责层：组件处理展示和临时交互，store action 调用 service 并更新自身状态，service 返回不含响应式状态的普通结果，background 模块处理跨页面协调和持久化，storage 模块负责序列化与校验。
5. 新增或调整跨环境能力时，同时检查注册该环境 IPC 实现的入口，以及 protocol、handler、调用方和清理逻辑。
6. 新增浏览器运行入口时同步检查 `vite.config.ts` 中的 manifest、`additionalInputs`、动态 content script 注册和 web accessible resources；仅更新实际需要的配置。
7. 翻译文本先修改 `data/trade-texts.po`，再运行 `npm run build-translate`；不要手工编辑字典内容或版本号。
8. 根据改动范围执行验证并检查最终 diff；生成命令产生的文件只有属于当前任务时才保留。

## 架构规则

- 运行工程之间不得互相依赖；内部 Workspace 依赖只指向 core，不共享运行环境 adapter。少量 `window.postMessage` 和 WebExtension runtime/tabs 适配代码由使用它的 app 本地持有；内部依赖必须同时声明于工程的 `package.json` dependencies 和 `tsconfig.json` references。
- Workspace 通过各自的 package exports 和 npm Workspace 链接解析，不配置 TypeScript `paths`，不跨 Workspace 相对导入内部源码。依赖边界以 `eslint.config.ts` 为权威，调整边界时同步更新该配置。
- 跨 background、side-panel、content 和 MAIN world 的业务通信必须使用 `@poe2-extensions/core/ipc`、各 app 的环境 adapter 与具名领域 protocol；不要另建裸 `browser.runtime` 消息或 `window.postMessage` 协议。新增协议成员时同步 core 契约、handler 和调用方。
- `ipcMain` 单例由 background、inject 和 side-panel 各自创建，core 不得创建或导出运行环境单例。只有 background 的 `ipcMain` 使用 `IpcHandlerChannel`；其他环境只使用 `IpcChannel`，不得绕过能力边界注册 handler。
- 共享 envelope version 属于跨构建兼容约定。只有不兼容 wire format 变更才升级 envelope version，并同步 Window 与 WebExtension adapter。
- 需要跨页面共享可变状态的业务模块由 background 模块持有权威状态。跨页面状态同步必须区分 background service worker 生命周期，并拒绝重复、过期或乱序状态；不得退化为组件本地副本或 mutation 返回值驱动的长期状态。
- 模块 store 使用 Pinia Setup Store；action 负责 loading、错误、快照排序、乐观更新和失败恢复，并在 service 返回普通结果后修改自身状态。页面 service 不得导入 Pinia 或 store，也不得保存与 store 重复的可观察状态。
- Store 只公开页面消费的响应式状态和业务 action；机械 mutation、订阅安装、快照处理及其他流程辅助函数保留在 Setup Store 闭包内。需要页面 store 的 Vue 运行环境在 composition root 创建并安装 Pinia，组件解构状态使用 `storeToRefs`。
- MAIN world 不得直接或间接引入页面框架或模块 store；不消费响应式状态的加载、缓存和请求去重使用该入口目录内的普通运行时对象，避免把页面框架打入注入脚本。
- 页面 service 和 background 模块各自只导出一个具名的单例对象，并将该对象声明为文件最后一个顶层成员；业务方法作为对象成员公开，共享 enum 和数据契约放入对应 core 领域子路径，不要为同一能力同时保留独立函数导出。
- `browser.storage.sync` 只用于体积小且需要跨设备同步的用户设置；业务数据、大体积数据和缓存使用 `browser.storage.local`。更改既有 storage key、数据版本或 IPC method 属于兼容性变更，必须同时提供迁移或明确的兼容策略。
- 设置定义放在对应的 core 领域子路径；通用 core settings 与 background settings 不得依赖具体领域。`SettingMember.key` 同时作为 IPC 和 `storage.sync` 的稳定标识，由定义名称和成员名生成；重命名任一部分必须按 storage key 兼容性变更处理。
- 通用 settings IPC 只提供读取、变化和持久化失败通知，不提供任意 key/value 写入。设置写入由领域 background 通过具名领域 RPC 接收，在调用通用 settings 状态模块后执行页面或浏览器副作用；页面不得绕过领域 background 直接写设置。
- settings background 的内存缓存是当前 service worker 生命周期内的权威状态；写入先更新缓存、递增 revision 并广播，再按 key 串行异步写入 `storage.sync`。持久化失败只发送失败通知而不回滚当前值，调用方不得把设置 RPC 返回视为持久化已经完成。
- 翻译通过 background 动态注册 `world: "MAIN"` 的 content script，仅在开启时加载。切换翻译设置只同步动态注册状态，不自动刷新已打开的 trade2 标签页；页面提示用户手动刷新后生效。当前 hook 不支持卸载，不得实现无刷新即时切换，除非同时提供完整回滚。
- 物品复制和筛选预设脚本会预先注入，但必须按设置即时启停。关闭时恢复官方按钮行为，移除或停用扩展事件、观察器、样式、弹窗和插入 DOM；保留的惰性观察器不得继续产生功能副作用或重复绑定。
- MAIN world hook 的影响范围必须限定在 `https://www.pathofexile.com/trade2`。翻译缓存必须与官方缓存隔离，避免中文数据污染英文缓存；现有 `_zh` namespace 属于持久化兼容约定，变更时必须提供迁移策略。
- 翻译字典继续按“内置 fallback → 有效本地缓存 → 更高版本远端字典”选择，并在使用或缓存前校验 meta、缓存和字典结构；远端失败不能破坏可用 fallback。
- 物品和 stat 词条翻译必须保留可见的英文原文，避免中文映射不完整或歧义时丢失原始语义。
- 书签只接受同源 `https://www.pathofexile.com/trade2` URL，目录模型保持顶层一级结构。打开书签时优先复用当前活动 trade2 标签页；导入、存储读取和 background 写入都必须保留结构与 URL 校验。
- 筛选预设 RPC 只在功能开启时可用；读取无效持久化数据时回退安全默认值，写入前继续校验名称和预设数组结构。
- 模块入口只负责编排、生命周期、环境注册和公开 API。DOM 安装、格式化、存储、校验和弹窗等实现放入同功能目录的职责文件。
- 在同一运行环境且依赖方向自然时直接调用目标模块；不要为形式解耦增加透传回调或中转层。跨运行环境、反向依赖或需要隔离副作用时才使用 protocol、接口或注入点。

## 编码规范

- 新功能源码使用“模块路径 + 职责”的 `kebab-case` 文件名；Vue 单文件组件使用 `kebab-case.vue`。保留 manifest、Vite 或 HTML 直接引用的现有入口文件名。
- 单文件专用的 selector、DOM id、timeout、storage key 和文案留在该文件；至少两个职责文件共享时再移入同目录工具或现有业务模块，不为少量常量新建中转文件。
- 集合遍历优先使用 `for...of`，需要索引时使用 `entries()`；模块级和局部 `const` 使用 camelCase，外部协议名称保持原始大小写。
- 注释面向代码的使用者和审核者说明意图，不要复述类、变量、方法、属性或参数的名称。新增或实质修改的定义只要无法由名称和类型一目了然地判断职责，就必须添加说明，无论是否导出或是否为 private；导出定义优先使用 JSDoc，私有定义和局部实现按场景使用行注释。
- JSDoc 必须使用 `/**`、内容行和 `*/` 分行的块格式，不使用单行 `/** ... */`；包含多个独立语义时，每个语义使用单独的 `*` 内容行，不用分号连接。
- 涉及运行环境限制、跨环境边界、兼容协议、非显而易见副作用、状态归属、异步持久化、并发或乱序、生命周期、缓存与权威状态同步、失败重试或回滚时，必须在关键定义或实现处说明不变量、设计原因和维护风险。
- TypeScript 或 Vue 改动在验证前必须审查本次新增和实质修改定义的注释完整性，不为任务无关旧代码批量补注释。交付说明必须报告审查结果；没有新增注释时，需确认本次仅包含能由代码直接表达的机械修改。
- 页面可见错误和日志可以使用中文；新增状态码或错误类型时沿用所在模块现有 enum 与映射方式，不在协议值中混入 UI 文案。

## 测试与验证

验证按改动范围和风险由窄到宽逐级执行：

1. 优先运行能够覆盖本次改动的最小、最快验证。
2. 只有较窄验证无法覆盖构建、入口或跨运行环境集成风险时，才升级到完整 build。
3. 不为追求形式上的完整验证，重复运行与改动无关的昂贵流程。

按以下规则选择验证：

- 仅文档或注释：对改动文件运行 Prettier check；不需要构建。
- TypeScript 或 Vue：`npm run compile`。
- manifest、入口、IPC adapter/relay、envelope、side-panel 或 trade 注入链路：`npm run compile` 和 `npm run build`。
- `projects/packages/trade-translate-tools/`：除根类型检查外运行 `npx tsc --noEmit -p projects/packages/trade-translate-tools/tsconfig.json`。
- 翻译源：运行 `npm run build-translate`，确认两个字典产物同时更新，且内容未变化时 meta version 不应变化。
- 所有纳管文件的格式检查使用 `npm run format:check`；只检查单个文档可使用 `npx prettier --check <file>`。

涉及浏览器行为时还需做针对性手工验证：

- 各 trade 页面功能应能分别启停且互不影响；翻译开启或关闭后刷新生效，字典失败时 fallback 可用，官方缓存仍隔离到 `_zh`。
- 物品复制和筛选预设可即时启停，动态结果可用，关闭后官方行为和页面 DOM 恢复。
- 书签覆盖目录增删改、同目录和跨目录拖拽、导入导出、保存或替换当前搜索、活动 trade2 标签页复用，以及重开侧边栏后的持久化。
- 字典页覆盖中英文搜索、加载失败重试和英文复制；设置页覆盖 background 重启及多个侧边栏同步。

## 工具与依赖

- 使用根 `package-lock.json` 管理 npm workspace 依赖。依赖变更必须同步 lockfile，不要引入第二套包管理器或独立子包 lockfile。
- `projects/packages/core` 是单一环境无关 workspace package，通过领域和 `ipc` 子路径公开 API，不提供聚合根入口；DOM 和 Extension adapter 留在对应运行工程，不得移入 core。
- 根 `dist/` 完全属于生成产物：Project References 的声明和增量缓存统一输出到 `dist/types/`，Vite 扩展输出到 `dist/poe2-extensions/`；浏览器加载未打包扩展时使用后者。Vite 以 `public/` 为 `publicDir`，源码入口由 manifest、HTML 或 `additionalInputs` 管理，不能仅创建文件而不接入构建。
- `projects/packages/trade-translate-tools` 的源码位于 main 分支；`trade-translate-tools-package` 分支由 GitHub Actions 生成，不作为手工维护源。
- `npm run pull-translate` 会访问外部 trade API 并重写翻译源及变更日志，只在任务明确需要同步上游数据时运行。

## Git 与变更管理

- 提交保持单一目的；翻译源变更应与对应的 `public/data/translate.json`、`public/data/translate-meta.json` 生成结果一起审查。
- Git 提交说明使用简短中文并描述核心变更。
- 不把工作流生成的 package 分支内容回写为 main 分支源码，也不手工发布该分支或字典 Pages；发布由现有 GitHub Actions 路径触发。

## AGENTS.md 维护规则

- AGENTS.md 用于记录 Coding Agent 无法可靠推断的项目规则。
- 不记录通用编程知识、Git 基础知识或工具默认行为。
- 不复制 README、API 文档或外部技术文档内容。
- 不维护可通过目录扫描得到的当前模块、文件或功能清单；仓库结构只描述分类规则、职责边界和架构不变量。
- 优先记录约束、决策和流程，而不是背景说明。
- 优先记录必须长期成立的行为和边界不变量，而不是当前实现机制；只有实现细节本身构成兼容协议、运行环境约束或明确架构决策时，才保留具体名称。
- 新增规则前，确认该规则是否：
    1. Agent 容易误判；
    2. 违反后会产生较大影响；
    3. 不能通过代码或配置自动约束。
- 删除已经由工具自动保证的规则，例如已有 lint、formatter、gitignore 明确约束的内容。
- 保持 AGENTS.md 简洁，避免成为项目文档替代品。
- 修改 AGENTS.md 时，只保留对未来 Coding Agent 有实际帮助的信息。
- 定期检查规则是否仍然有效，删除过时约束。
- 维护前必须核对当前目录、入口、配置和实现；代码与本文件冲突时先确认真实意图，不延续已不存在模块的说明。
- 每条新增规则应能指出适用范围、违反风险或必要流程；临时约束需注明删除条件。
- 保持本文件不超过 300 行；能由链接到仓库内权威文件替代的长篇说明不在此展开。
