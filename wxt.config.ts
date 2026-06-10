import { defineConfig } from 'wxt';
import * as path from "path";

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ['@wxt-dev/module-vue'],
	manifest: {
		host_permissions: [
			'https://www.pathofexile.com/*',
			'https://zetaztt.github.io/*',
			'https://web.poecdn.com/*',
		],
		"permissions": [
			"scripting"
		],
		web_accessible_resources: [
			{
				resources: ['injector.js'],
				matches: ['https://www.pathofexile.com/*'],
			},
		],
	},

	webExt: {
		chromiumArgs: [
			'--disable-blink-features=AutomationControlled', // 禁用 Blink 引擎的自动化控制特征
			// `--user-data-dir=${path.resolve("./.wxt/chrome-data")}`
		],
		chromiumProfile: path.resolve('.wxt/chrome-data'),
		// 设置为你想要存储配置文件的绝对路径
		// chromiumProfile: path.resolve('.wxt/chrome-data'),
		// 保留配置文件的修改（如登录状态、历史记录等）
		keepProfileChanges: true,
	}
});
