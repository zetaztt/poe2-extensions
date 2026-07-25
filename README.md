# POE2 Extensions

## 开发环境

安装依赖后，在 VS Code 中运行 `TypeScript: Select TypeScript Version` 并选择 `Use Workspace Version`。仓库内 TypeScript、Volar 和 `npm run compile` 会读取相同的 Project References 工程图。

`npm run compile` 将声明和增量缓存统一生成到 `dist/types`。`npm run build` 将可加载的 Chromium 扩展生成到 `dist/poe2-extensions`，浏览器加载未打包扩展时应选择该目录。
