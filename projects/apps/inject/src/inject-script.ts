import "./inject-ipc-channels";

export type InjectScriptMain = () => void | Promise<void>;

/**
 * 在 MAIN world IPC channel 注册完成后执行注入入口，并统一消费同步异常和异步 rejection。
 */
export function bootstrapInjectScript(main: InjectScriptMain): void {
	try {
		const result = main();
		if (result) {
			void result.catch((error) => {
				console.error("[poe2-extensions] inject script 初始化失败", error);
			});
		}
	} catch (error) {
		console.error("[poe2-extensions] inject script 初始化失败", error);
	}
}
