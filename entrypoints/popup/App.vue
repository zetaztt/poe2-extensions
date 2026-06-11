<script lang="ts" setup>
const features = [
	'在 POE2 trade 页面拦截物品、词缀、静态数据和筛选器接口',
	'将命中字典的文本显示为中文，并在关键条目后保留英文原文',
	'把 trade2 本地缓存重定向到 _zh 后缀，避免污染原始英文缓存',
	'兼容加载官方繁中页面文案脚本',
];
</script>

<template>
	<main class="app">
		<section class="card">
			<p class="eyebrow">POE2 Extensions</p>
			<h1>Trade 中文化</h1>
			<p class="description">
				打开 <strong>pathofexile.com/trade2</strong> 后刷新页面，扩展会在页面加载早期启用数据翻译。
			</p>
		</section>

		<section class="card">
			<h2>当前功能</h2>
			<ul>
				<li v-for="feature in features" :key="feature">{{ feature }}</li>
			</ul>
		</section>

		<section class="card muted">
			<h2>字典来源</h2>
			<a href="https://zetaztt.github.io/poe2/translate.json" target="_blank">
				translate.json
			</a>
			<p>如果页面已在扩展安装前打开，请刷新 trade 页面以重新注入脚本。</p>
		</section>
	</main>
</template>

<style scoped>
.app {
	width: 320px;
	padding: 16px;
	color: #f4efe4;
	background: #15110c;
}

.card {
	padding: 14px;
	border: 1px solid #3b3024;
	border-radius: 12px;
	background: #211a13;
}

.card+.card {
	margin-top: 12px;
}

.eyebrow {
	margin: 0 0 6px;
	color: #d7a85f;
	font-size: 12px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

h1,
h2 {
	margin: 0;
}

h1 {
	font-size: 22px;
}

h2 {
	font-size: 16px;
}

.description,
.muted p {
	margin: 10px 0 0;
	color: #c9bba7;
	line-height: 1.6;
}

ul {
	margin: 10px 0 0;
	padding-left: 18px;
	color: #c9bba7;
	line-height: 1.6;
}

a {
	display: inline-block;
	margin-top: 10px;
	color: #d7a85f;
}
</style>
