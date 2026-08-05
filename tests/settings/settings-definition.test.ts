import assert from "node:assert/strict";
import { test } from "node:test";
import {
	defineSetting,
	defineSettings,
	settingsIpcProtocol,
	type GetSettingValuesParams,
} from "@poe2-extensions/core/settings";
import { tradeIpcProtocol, tradeSettings } from "@poe2-extensions/core/trade";

const settings = defineSettings({
	name: "test",
	first: defineSetting({ defaultValue: false }),
	second: defineSetting({ defaultValue: true }),
});

const mixedSettings = defineSettings({
	name: "mixed",
	enabled: defineSetting({ defaultValue: false }),
	label: defineSetting({ defaultValue: "default" }),
	level: defineSetting({ defaultValue: 1 }),
	position: defineSetting({
		defaultValue: { x: 0, y: 0 },
		equals: (left, right) => left.x === right.x && left.y === right.y,
	}),
});

test("defineSettings 通过 name 和成员名生成 key", () => {
	assert.equal(settings.name, "test");
	assert.equal(settings.first.name, "first");
	assert.equal(settings.second.name, "second");
	assert.equal(settings.first.key, "test/first");
	assert.equal(settings.second.key, "test/second");
	assert.equal(settings.resolve("test/first"), settings.first);
	assert.equal(settings.resolve("unknown"), undefined);
});

test("trade 设置公开带前缀的稳定 key", () => {
	const translateKey: "trade/translate" = tradeSettings.translate.key;
	const itemCopyKey: "trade/itemCopy" = tradeSettings.itemCopy.key;
	const statPresetKey: "trade/statPreset" = tradeSettings.statPreset.key;
	assert.deepEqual(
		[translateKey, itemCopyKey, statPresetKey],
		["trade/translate", "trade/itemCopy", "trade/statPreset"],
	);
});

test("settings 协议公开单项、批量读取和变化通知，trade 协议公开具名 setter", () => {
	const getParams: GetSettingValuesParams = {
		settings: [
			{
				key: tradeSettings.translate.key,
				defaultValue: tradeSettings.translate.defaultValue,
			},
		],
	};
	assert.deepEqual(getParams, { settings: [{ key: "trade/translate", defaultValue: false }] });
	assert.deepEqual(Object.keys(settingsIpcProtocol).sort(), [
		"get",
		"getValues",
		"name",
		"onChanged",
		"persistenceFailed",
	]);
	assert.equal(settingsIpcProtocol.get.method, "settings/get");
	assert.equal(settingsIpcProtocol.getValues.method, "settings/getValues");
	assert.equal(settingsIpcProtocol.onChanged.method, "settings/onChanged");
	assert.equal(settingsIpcProtocol.persistenceFailed.method, "settings/persistenceFailed");
	assert.equal("loadSettings" in tradeIpcProtocol, false);
	assert.equal(tradeIpcProtocol.setTranslateEnabled.method, "trade/setTranslateEnabled");
	assert.equal(tradeIpcProtocol.setItemCopyEnabled.method, "trade/setItemCopyEnabled");
	assert.equal(tradeIpcProtocol.setStatPresetEnabled.method, "trade/setStatPresetEnabled");
});

test("设置定义创建默认值", () => {
	const defaults = settings.createDefaults();
	assert.deepEqual(defaults, { first: false, second: true });
});

test("设置定义支持混合值类型和成员自定义相等比较", () => {
	const defaults = mixedSettings.createDefaults();
	assert.deepEqual(defaults, {
		enabled: false,
		label: "default",
		level: 1,
		position: { x: 0, y: 0 },
	});

	assert.equal(mixedSettings.position.equals(defaults.position, { x: 0, y: 0 }), true);
	assert.equal(mixedSettings.position.equals(defaults.position, { x: 1, y: 0 }), false);
});

test("不同设置前缀生成互不冲突的成员 key", () => {
	const first = defineSettings({ name: "first", enabled: defineSetting({ defaultValue: false }) });
	const second = defineSettings({ name: "second", enabled: defineSetting({ defaultValue: true }) });
	assert.equal(first.enabled.key, "first/enabled");
	assert.equal(second.enabled.key, "second/enabled");
});
