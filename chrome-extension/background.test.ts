import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ClickListener = (tab: chrome.tabs.Tab) => void;

function createChromeMock() {
	let onClickedListener: ClickListener | undefined;

	return {
		chromeMock: {
			action: {
				onClicked: {
					addListener: vi.fn((listener: ClickListener) => {
						onClickedListener = listener;
					}),
				},
			},
			runtime: {
				onInstalled: {
					addListener: vi.fn(),
				},
			},
			sidePanel: {
				close: vi.fn().mockResolvedValue(undefined),
				open: vi.fn().mockResolvedValue(undefined),
			},
			storage: {
				local: {
					get: vi.fn().mockResolvedValue({}),
					set: vi.fn().mockResolvedValue(undefined),
				},
			},
			tabs: {
				onRemoved: {
					addListener: vi.fn(),
				},
				onUpdated: {
					addListener: vi.fn(),
				},
				query: vi.fn().mockResolvedValue([]),
			},
		},
		getOnClickedListener: () => onClickedListener,
	};
}

describe("chrome extension background action click", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("toggles the side panel for the clicked window", async () => {
		const { chromeMock, getOnClickedListener } = createChromeMock();
		vi.stubGlobal("chrome", chromeMock);

		await import("./background");
		const onClickedListener = getOnClickedListener();

		expect(onClickedListener).toBeTypeOf("function");

		onClickedListener?.({ windowId: 7 } as chrome.tabs.Tab);
		await Promise.resolve();

		expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
		expect(chromeMock.sidePanel.close).not.toHaveBeenCalled();

		onClickedListener?.({ windowId: 7 } as chrome.tabs.Tab);
		await Promise.resolve();

		expect(chromeMock.sidePanel.close).toHaveBeenCalledWith({ windowId: 7 });
	});

	it("ignores clicks without a window id", async () => {
		const { chromeMock, getOnClickedListener } = createChromeMock();
		vi.stubGlobal("chrome", chromeMock);

		await import("./background");
		const onClickedListener = getOnClickedListener();

		onClickedListener?.({} as chrome.tabs.Tab);
		await Promise.resolve();

		expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
		expect(chromeMock.sidePanel.close).not.toHaveBeenCalled();
	});
});
