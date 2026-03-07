export const SIDE_PANEL_OPEN_WINDOWS_KEY = "dwb.sidePanelOpenWindows.v1";

function isValidWindowId(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function normalizeOpenSidePanelWindowIds(value: unknown): number[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return [...new Set(value.filter(isValidWindowId))].sort((a, b) => a - b);
}

export function addOpenSidePanelWindowId(
	value: unknown,
	windowId: number,
): number[] {
	const windowIds = normalizeOpenSidePanelWindowIds(value);
	return normalizeOpenSidePanelWindowIds([...windowIds, windowId]);
}

export function removeOpenSidePanelWindowId(
	value: unknown,
	windowId: number,
): number[] {
	return normalizeOpenSidePanelWindowIds(value).filter((id) => id !== windowId);
}
