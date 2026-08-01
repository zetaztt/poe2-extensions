export interface SettingOptions<TValue> {
	defaultValue: TValue;
	equals?(left: TValue, right: TValue): boolean;
}

export interface SettingMember<TValue, TKey extends string> {
	readonly key: TKey;
	readonly defaultValue: TValue;
	// 仅用于从成员类型提取 TValue，不会写入运行时成员对象。
	readonly _value?: TValue;
	equals(left: TValue, right: TValue): boolean;
}

type AnySettingOptions = SettingOptions<unknown>;
export type AnySettingMember = SettingMember<unknown, string>;

type BindSettingMember<TName extends string, TMemberName extends string, TOptions> =
	TOptions extends SettingOptions<infer TValue> ? SettingMember<TValue, `${TName}/${TMemberName}`> : never;

type BindSettingMembers<TName extends string, TDefinition> = {
	[K in keyof Omit<TDefinition, "name">]: BindSettingMember<TName, Extract<K, string>, Omit<TDefinition, "name">[K]>;
};

type ValidateSettingsDefinition<TDefinition> = {
	[K in keyof TDefinition]: K extends "name" ? string : AnySettingOptions;
};

export type SettingMemberValue<TMember> = TMember extends SettingMember<infer TValue, string> ? TValue : never;

export type SettingsDefinitionMember<TDefinition extends { readonly members: readonly AnySettingMember[] }> =
	TDefinition["members"][number];

type SettingValues<TMembers extends Record<string, AnySettingMember>> = {
	[K in keyof TMembers]: SettingMemberValue<TMembers[K]>;
};

export type SettingsValues<TDefinition extends { createDefaults(): object }> = ReturnType<
	TDefinition["createDefaults"]
>;

export interface SettingsDefinition<
	TName extends string = string,
	TMembers extends Record<string, AnySettingMember> = Record<string, AnySettingMember>,
	TValues extends object = SettingValues<TMembers>,
> {
	readonly name: TName;
	readonly members: readonly TMembers[keyof TMembers][];
	resolve(key: unknown): TMembers[keyof TMembers] | undefined;
	createDefaults(): TValues;
	areEqual(left: TValues, right: TValues): boolean;
}

type DefinedSettings<TName extends string, TMembers extends Record<string, AnySettingMember>> = SettingsDefinition<
	TName,
	TMembers,
	SettingValues<TMembers>
>
	& TMembers;

export function defineSetting<TValue>(options: SettingOptions<TValue>): SettingOptions<TValue> {
	return options;
}

export function defineSettings<const TDefinition extends { name: string }>(
	definition: TDefinition & ValidateSettingsDefinition<TDefinition>,
): DefinedSettings<TDefinition["name"], BindSettingMembers<TDefinition["name"], TDefinition>> {
	const { name, ...memberOptions } = definition as { name: string } & Record<string, AnySettingOptions>;
	const members: AnySettingMember[] = [];
	const memberByKey = new Map<string, AnySettingMember>();
	const memberNameByMember = new Map<AnySettingMember, string>();
	const settingsDefinition: Record<string, unknown> = { name };

	for (const [memberName, options] of Object.entries(memberOptions)) {
		// 生成值同时用于 IPC 和 storage；修改 definition name 或成员名时必须提供持久化迁移。
		const member: AnySettingMember = {
			key: `${name}/${memberName}`,
			defaultValue: options.defaultValue,
			equals: options.equals ?? Object.is,
		};
		memberByKey.set(member.key, member);
		memberNameByMember.set(member, memberName);
		members.push(member);
		settingsDefinition[memberName] = member;
	}

	settingsDefinition.members = members;
	settingsDefinition.resolve = (key: unknown) => (typeof key === "string" ? memberByKey.get(key) : undefined);
	settingsDefinition.createDefaults = () => createDefaults(members, memberNameByMember);
	settingsDefinition.areEqual = (left: Record<string, unknown>, right: Record<string, unknown>) =>
		members.every((member) => {
			const memberName = getMemberName(member, memberNameByMember);
			return member.equals(left[memberName], right[memberName]);
		});

	return settingsDefinition as DefinedSettings<
		TDefinition["name"],
		BindSettingMembers<TDefinition["name"], TDefinition>
	>;
}

function createDefaults(
	members: readonly AnySettingMember[],
	memberNameByMember: ReadonlyMap<AnySettingMember, string>,
): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const member of members) values[getMemberName(member, memberNameByMember)] = member.defaultValue;
	return values;
}

function getMemberName(member: AnySettingMember, memberNameByMember: ReadonlyMap<AnySettingMember, string>): string {
	const memberName = memberNameByMember.get(member);
	if (!memberName) throw new Error(`设置成员不属于当前定义: ${member.key}`);
	return memberName;
}
