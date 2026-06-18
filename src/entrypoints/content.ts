import { installTradeContent } from "@/trade/content";

export default defineContentScript({
	matches: ["https://www.pathofexile.com/trade2*"],
	runAt: "document_start",
	main() {
		void installTradeContent();
	},
});
