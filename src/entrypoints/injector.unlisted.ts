import { injectTrade } from "@/trade/inject";

export default defineUnlistedScript(function () {
	if (window.location.hostname === "www.pathofexile.com" && window.location.pathname.startsWith("/trade2")) {
		injectTrade();
	}
});
