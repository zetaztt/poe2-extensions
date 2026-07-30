import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "eslint/config";
import type { ESLintRules } from "eslint/rules";
import importX from "eslint-plugin-import-x";
import type { Options as NoExtraneousDependenciesOptions } from "eslint-plugin-import-x/rules/no-extraneous-dependencies";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";
import { Linter } from "eslint";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

const defaultRestrictedPackages = ["@poe2-extensions/apps-*"];

const projectsRestrictedPackages: Record<string, string[]> = {
	"projects/apps/inject": ["pinia", "vue", "webextension-polyfill"],
};

function createProjectDependencyBoundaryConfigs() {
	return Object.entries(projectsRestrictedPackages).map(([directory, restrictedPackages]) => ({
		files: [`${directory}/src/**/*.{ts,vue}`],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [...defaultRestrictedPackages, ...restrictedPackages].map((packageName) => ({
						group: [packageName, `${packageName}/**`],
						message: `${directory} 不允许依赖 ${packageName}。`,
					})),
				},
			] satisfies ESLintRules["no-restricted-imports"],
		},
	}));
}

export default defineConfig([
	{
		ignores: [".chrome-profile/**", "dist/**", "node_modules/**"],
	},
	{
		files: ["projects/**/*.{ts,vue}", "scripts/**/*.ts", "tests/**/*.ts", "vite.config.ts"],
		plugins: {
			"unused-imports": unusedImports,
		},
		rules: {
			"unused-imports/no-unused-imports": "error",
		},
	},
	{
		files: ["projects/**/*.{ts,vue}", "scripts/**/*.ts", "vite.config.ts"],
		plugins: {
			"import-x": importX,
		},
		settings: {
			"import-x/resolver": {
				typescript: {
					alwaysTryTypes: true,
					project: path.join(repositoryRoot, "tsconfig.json"),
				},
			},
		},
		rules: {
			"import-x/no-relative-packages": "error",
		},
	},
	{
		files: ["projects/**/*.{ts,vue}"],
		rules: {
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					bundledDependencies: false,
					devDependencies: false,
					includeTypes: true,
					optionalDependencies: false,
					peerDependencies: false,
				},
			] satisfies Linter.RuleEntry<[NoExtraneousDependenciesOptions]>,
			"no-restricted-imports": [
				"error",
				{
					patterns: defaultRestrictedPackages.map((packageName) => ({
						group: [packageName, `${packageName}/**`],
						message: `Workspace 工程不允许依赖 ${packageName}。`,
					})),
				},
			] satisfies ESLintRules["no-restricted-imports"],
		},
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
	},
	{
		files: ["**/*.vue"],
		languageOptions: {
			parser: vueParser,
			parserOptions: {
				ecmaVersion: "latest",
				parser: tseslint.parser,
				sourceType: "module",
			},
		},
	},
	{
		files: ["scripts/**/*.ts", "vite.config.ts"],
		rules: {
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					bundledDependencies: false,
					devDependencies: true,
					includeTypes: true,
					optionalDependencies: false,
					packageDir: repositoryRoot,
					peerDependencies: false,
				},
			] satisfies Linter.RuleEntry<[NoExtraneousDependenciesOptions]>,
		},
	},
	...createProjectDependencyBoundaryConfigs(),
]);
