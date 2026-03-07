import { describe, expect, it } from "vitest";
import { HOME_URL } from "@/lib/constants";
import { normalizeUrl, parseDeepWikiUrl } from "@/lib/deepWikiUrl";

describe("normalizeUrl", () => {
	it("normalizes DeepWiki root URL to HOME_URL", () => {
		expect(normalizeUrl("https://deepwiki.com/")).toBe(HOME_URL);
	});

	it("normalizes DeepWiki URL by removing hash", () => {
		expect(normalizeUrl("https://deepwiki.com/owner/repo?x=1#section")).toBe(
			"https://deepwiki.com/owner/repo?x=1",
		);
	});

	it("returns non-DeepWiki URLs unchanged", () => {
		const raw = "https://example.com/path?a=1#b";
		expect(normalizeUrl(raw)).toBe(raw);
	});

	it("returns invalid URL strings unchanged", () => {
		const raw = "not a url";
		expect(normalizeUrl(raw)).toBe(raw);
	});
});

describe("parseDeepWikiUrl", () => {
	it("parses home url", () => {
		expect(parseDeepWikiUrl(HOME_URL)).toEqual({ type: "home" });
	});

	it("parses repository url", () => {
		expect(parseDeepWikiUrl("https://deepwiki.com/owner/repo")).toEqual({
			type: "repository",
			slug: "owner/repo",
		});
	});

	it("parses search session url", () => {
		expect(parseDeepWikiUrl("https://deepwiki.com/search/abc123")).toEqual({
			type: "session",
		});
	});

	it("classifies non-deepwiki url as other", () => {
		expect(parseDeepWikiUrl("https://example.com/owner/repo")).toEqual({
			type: "other",
		});
	});
});
