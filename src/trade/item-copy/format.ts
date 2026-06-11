import type { TradeSearchItem } from '../types';

type MergedRuneMod = 'unmerged' | number | {
	min: number;
	max: number;
};

export function formatTradeItemText(item: TradeSearchItem): string {
	const lines = [
		...getBasicInfo(item),
		...getProperties(item),
		...getEnchantMods(item),
		...getSockets(item),
		...getNotableLines(item),
	];

	const runeLines = getRuneMods(item);
	const implicitLines = getImplicits(item);
	if (implicitLines.length > 0) {
		lines.push(`Implicits: ${implicitLines.length}`);
	}

	lines.push(
		...runeLines,
		...implicitLines,
		...getFracturedMods(item),
		...getExplicits(item),
		...getDesecratedMods(item),
		...getMutatedMods(item),
		...getCorruptionLine(item),
		...getUnmetInfo(item),
		...getAugmentedInfo(item),
	);

	return lines.filter((line) => line.trim() !== '').join('\n');
}

function getBasicInfo(item: TradeSearchItem): string[] {
	const lines: string[] = [];

	if (item.rarity) lines.push(`Rarity: ${item.rarity}`);

	if (item.name || item.typeLine) {
		lines.push(`${item.name || ''}${item.name && item.typeLine ? '\n' : ''}${item.typeLine || ''}`.trim());
	}

	if (item.ilvl !== undefined) lines.push(`Item Level: ${item.ilvl}`);

	return lines;
}

function getProperties(item: TradeSearchItem): string[] {
	return (item.properties || [])
		.map((property) => (
			property.name && property.values?.length
				? `${property.name}: ${property.values.map((value) => value[0]).join(', ')}`
				: ''
		))
		.filter(Boolean);
}

function getSockets(item: TradeSearchItem): string[] {
	const lines: string[] = [];
	const sockets = item.sockets || [];
	const socketCount = sockets.length;

	if (socketCount) {
		lines.push(`Sockets: ${sockets.map(() => 'S').join(' ')}`);
	}

	const runes = (item.socketedItems || []).filter((socketedItem) => socketedItem.frameType === 5);

	for (let i = 0; i < socketCount; i += 1) {
		lines.push(i < runes.length ? `Rune: ${runes[i].baseType ?? ''}` : 'Rune: None');
	}

	return lines;
}

function getNotableLines(item: TradeSearchItem): string[] {
	return (item.notableProperties || []).map((notable) => `Allocates ${notable.name}`);
}

function getImplicits(item: TradeSearchItem): string[] {
	return item.implicitMods || [];
}

function getRuneMods(item: TradeSearchItem): string[] {
	return item.sockets?.length && item.runeMods?.length ? getRuneEffects(item) : [];
}

function getExplicits(item: TradeSearchItem): string[] {
	return item.explicitMods?.length ? [...item.explicitMods] : [];
}

function getFracturedMods(item: TradeSearchItem): string[] {
	return item.fracturedMods?.length ? item.fracturedMods.map((mod) => `{fractured}${mod}`) : [];
}

function getDesecratedMods(item: TradeSearchItem): string[] {
	return item.desecratedMods?.length ? item.desecratedMods.map((mod) => `{desecrated}${mod}`) : [];
}

function getMutatedMods(item: TradeSearchItem): string[] {
	return item.mutatedMods?.length ? item.mutatedMods.map((mod) => `{mutated}${mod}`) : [];
}

function getCorruptionLine(item: TradeSearchItem): string[] {
	return item.corrupted ? ['Corrupted'] : [];
}

function getUnmetInfo(item: TradeSearchItem): string[] {
	return item.unmetRequirements?.length ? [`Unmet: ${item.unmetRequirements.join(', ')}`] : [];
}

function getAugmentedInfo(item: TradeSearchItem): string[] {
	return item.augmentedInfo ? [`Augmented: ${item.augmentedInfo}`] : [];
}

function getEnchantMods(item: TradeSearchItem): string[] {
	return (item.enchantMods || []).map((mod) => `${mod} (enchant)`);
}

function getRuneEffects(item: TradeSearchItem): string[] {
	const merged: Record<string, MergedRuneMod> = {};

	for (const mod of item.runeMods || []) {
		processRuneEffect(mod, merged);
	}

	return formatMergedRuneMods(merged);
}

function processRuneEffect(mod: string, merged: Record<string, MergedRuneMod>): void {
	const contextMatch = mod.match(/^([\w\s/]+?):\s(.+)$/);
	const content = contextMatch ? contextMatch[2] : mod;

	const rangeMatch = content.match(/^Adds (\d+) to (\d+) (.+)$/i);
	if (rangeMatch) {
		const [, min, max, text] = rangeMatch;
		const key = `Adds X to Y ${text}`;
		const current = merged[key];
		if (!isRangeRuneMod(current)) {
			merged[key] = { min: 0, max: 0 };
		}

		const next = merged[key];
		if (isRangeRuneMod(next)) {
			next.min += Number.parseInt(min, 10);
			next.max += Number.parseInt(max, 10);
		}
		return;
	}

	const plusToMatch = content.match(/^\+(\d+)\s+to\s+(.+)$/i);
	if (plusToMatch) {
		const [, value, stat] = plusToMatch;
		addNumberRuneMod(merged, `+to ${stat}`, Number.parseInt(value, 10));
		return;
	}

	const plusMatch = content.match(/^\+(\d+)(\s.+)?$/);
	if (plusMatch) {
		const [, value, text = ''] = plusMatch;
		addNumberRuneMod(merged, `+${text.trim()}`, Number.parseInt(value, 10));
		return;
	}

	const percentMatch = content.match(/^([0-9.]+)%\s(.+)$/);
	if (percentMatch) {
		const [, value, text] = percentMatch;
		addNumberRuneMod(merged, text, Number.parseFloat(value));
		return;
	}

	merged[content] = 'unmerged';
}

function addNumberRuneMod(merged: Record<string, MergedRuneMod>, key: string, value: number): void {
	const current = merged[key];
	merged[key] = typeof current === 'number' ? current + value : value;
}

function formatMergedRuneMods(merged: Record<string, MergedRuneMod>): string[] {
	return Object.entries(merged).map(([key, value]) => {
		if (value === 'unmerged') {
			return `{enchant}{rune}${key}`;
		}

		if (isRangeRuneMod(value)) {
			return `{enchant}{rune}Adds ${value.min} to ${value.max} ${key.replace(/^Adds X to Y /, '')}`;
		}

		const isInt = Number.isInteger(value);
		const needsPercent = !/^to\s/i.test(key) && !/^\+/.test(key);
		return `{enchant}{rune}${isInt ? value : value.toFixed(2)}${needsPercent ? '%' : ''} ${key}`;
	});
}

function isRangeRuneMod(value: MergedRuneMod | undefined): value is { min: number; max: number } {
	return typeof value === 'object' && value !== null && 'min' in value && 'max' in value;
}
