import { describe, expect, it } from "vitest";
import {
	addOpenSidePanelWindowId,
	normalizeOpenSidePanelWindowIds,
	removeOpenSidePanelWindowId,
} from "./sidePanelState";

describe("normalizeOpenSidePanelWindowIds", () => {
	it("filters invalid values and deduplicates window ids", () => {
		expect(
			normalizeOpenSidePanelWindowIds([4, "4", 2, -1, 4, 1.5, null, 2]),
		).toEqual([2, 4]);
	});

	it("returns an empty list for invalid storage values", () => {
		expect(normalizeOpenSidePanelWindowIds({ windowIds: [1, 2] })).toEqual([]);
	});
});

describe("side panel window id updates", () => {
	it("adds a window id in stable sorted order", () => {
		expect(addOpenSidePanelWindowId([9, 2], 5)).toEqual([2, 5, 9]);
	});

	it("removes a window id without affecting others", () => {
		expect(removeOpenSidePanelWindowId([2, 5, 9], 5)).toEqual([2, 9]);
	});
});
