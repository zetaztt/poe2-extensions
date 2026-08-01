import "./inject-ipc-channels";

export type InjectScriptMain = () => void | Promise<void>;

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
