import statPresetStyle from "./style.css?raw";

const styleId = "poe2-extensions-stat-preset-style";

export function installStatPresetStyle(): void {
	if (document.getElementById(styleId)) return;

	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = statPresetStyle;

	document.documentElement.appendChild(style);
}

export function removeStatPresetStyle(): void {
	document.getElementById(styleId)?.remove();
}
