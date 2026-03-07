import sharedConstants from "@/shared/constants.json";
import {
	SIDE_PANEL_OPEN_WINDOWS_KEY,
	addOpenSidePanelWindowId,
	normalizeOpenSidePanelWindowIds,
	removeOpenSidePanelWindowId,
} from "./sidePanelState";

const HOME_URL = sharedConstants.HOME_URL;
const HOME_ORIGIN = new URL(HOME_URL).origin;

type UrlKind =
	| { type: "home" }
	| { type: "repository"; slug: string }
	| { type: "session" }
	| { type: "other" };

type Session = {
	url: string;
	createdAt: number;
	alias?: string;
};

type PersistedRepository = {
	slug: string;
	sessions: Session[];
};

type PersistedData = {
	version: 1;
	repositories: PersistedRepository[];
};

const STORAGE_KEY = "dwb.repositories.v1";

// Track which repository the user was last viewing per tab
const tabRepositoryContext = new Map<number, string>();

function parseDeepWikiUrl(raw: string): UrlKind {
	try {
		const url = new URL(raw);
		if (url.origin !== HOME_ORIGIN) {
			return { type: "other" };
		}

		const segments = url.pathname.split("/").filter(Boolean);
		if (segments.length === 0) {
			return { type: "home" };
		}

		if (segments[0] === "search" && segments.length >= 2) {
			return { type: "session" };
		}

		if (segments.length >= 2) {
			return { type: "repository", slug: `${segments[0]}/${segments[1]}` };
		}

		return { type: "other" };
	} catch {
		return { type: "other" };
	}
}

function normalizeUrl(raw: string): string {
	try {
		const url = new URL(raw);
		if (url.origin !== HOME_ORIGIN) {
			return raw;
		}
		if (url.pathname === "/") {
			return HOME_URL;
		}
		return `${url.origin}${url.pathname}${url.search}`;
	} catch {
		return raw;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function loadData(): Promise<PersistedData> {
	const result = await chrome.storage.local.get(STORAGE_KEY);
	const data = result[STORAGE_KEY];

	if (
		isRecord(data) &&
		data.version === 1 &&
		Array.isArray(data.repositories)
	) {
		return data as PersistedData;
	}

	return { version: 1, repositories: [] };
}

async function saveData(data: PersistedData): Promise<void> {
	await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function findSessionOwner(
	repositories: PersistedRepository[],
	sessionUrl: string,
): string | null {
	for (const repo of repositories) {
		if (repo.sessions.some((s) => s.url === sessionUrl)) {
			return repo.slug;
		}
	}
	return null;
}

function upsertRepository(
	repositories: PersistedRepository[],
	slug: string,
): PersistedRepository[] {
	if (repositories.some((r) => r.slug === slug)) {
		return repositories;
	}
	return [...repositories, { slug, sessions: [] }];
}

function appendSession(
	repositories: PersistedRepository[],
	slug: string,
	sessionUrl: string,
): PersistedRepository[] {
	const currentOwner = findSessionOwner(repositories, sessionUrl);
	if (currentOwner === slug) {
		return repositories;
	}

	// Find existing session data if it was in another repo
	let existingSession: Session | undefined;
	if (currentOwner) {
		const ownerRepo = repositories.find((r) => r.slug === currentOwner);
		existingSession = ownerRepo?.sessions.find((s) => s.url === sessionUrl);
	}

	const session: Session = {
		url: sessionUrl,
		createdAt: existingSession?.createdAt ?? Date.now(),
		...(existingSession?.alias ? { alias: existingSession.alias } : {}),
	};

	return repositories.map((repo) => {
		if (repo.slug === currentOwner) {
			return {
				...repo,
				sessions: repo.sessions.filter((s) => s.url !== sessionUrl),
			};
		}
		if (repo.slug === slug) {
			return {
				...repo,
				sessions: [...repo.sessions, session],
			};
		}
		return repo;
	});
}

async function handleUrlChange(tabId: number, rawUrl: string): Promise<void> {
	const normalized = normalizeUrl(rawUrl);
	const kind = parseDeepWikiUrl(normalized);

	if (kind.type === "home") {
		tabRepositoryContext.delete(tabId);
		return;
	}

	if (kind.type === "other") {
		return;
	}

	const data = await loadData();
	let repos = data.repositories;

	if (kind.type === "repository") {
		tabRepositoryContext.set(tabId, kind.slug);
		repos = upsertRepository(repos, kind.slug);
		await saveData({ version: 1, repositories: repos });
		return;
	}

	if (kind.type === "session") {
		const targetRepository =
			findSessionOwner(repos, normalized) ??
			tabRepositoryContext.get(tabId) ??
			null;
		if (!targetRepository) {
			return;
		}
		tabRepositoryContext.set(tabId, targetRepository);
		repos = upsertRepository(repos, targetRepository);
		repos = appendSession(repos, targetRepository, normalized);
		await saveData({ version: 1, repositories: repos });
	}
}

// Listen for tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
	if (changeInfo.url) {
		handleUrlChange(tabId, changeInfo.url).catch((error) => {
			console.error("[dwb] Error handling URL change:", error);
		});
	}
});

// Clean up context when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
	tabRepositoryContext.delete(tabId);
});

async function loadOpenSidePanelWindowIds(): Promise<number[]> {
	const result = await chrome.storage.session.get(SIDE_PANEL_OPEN_WINDOWS_KEY);
	return normalizeOpenSidePanelWindowIds(result[SIDE_PANEL_OPEN_WINDOWS_KEY]);
}

let openSidePanelWindowIdsUpdate: Promise<void> = Promise.resolve();

function logSidePanelStateUpdateError(context: string, error: unknown): void {
	console.error(`[dwb] ${context}:`, error);
}

async function updateOpenSidePanelWindowIds(
	update: (windowIds: number[]) => number[],
): Promise<void> {
	const nextUpdate = openSidePanelWindowIdsUpdate
		.catch((error) => {
			logSidePanelStateUpdateError(
				"Error waiting for prior side panel state update",
				error,
			);
		})
		.then(async () => {
			const windowIds = await loadOpenSidePanelWindowIds();
			await chrome.storage.session.set({
				[SIDE_PANEL_OPEN_WINDOWS_KEY]: update(windowIds),
			});
		});

	openSidePanelWindowIdsUpdate = nextUpdate;
	return nextUpdate;
}

async function loadTrackedOpenSidePanelWindowIds(): Promise<number[]> {
	await openSidePanelWindowIdsUpdate.catch((error) => {
		logSidePanelStateUpdateError(
			"Error waiting for queued side panel state update",
			error,
		);
	});
	return loadOpenSidePanelWindowIds();
}

let sidePanelToggleUpdate: Promise<void> = Promise.resolve();

async function toggleSidePanel(windowId: number): Promise<void> {
	const nextToggle = sidePanelToggleUpdate
		.catch((error) => {
			logSidePanelStateUpdateError(
				"Error waiting for prior side panel toggle",
				error,
			);
		})
		.then(async () => {
			const openSidePanelWindows = await loadTrackedOpenSidePanelWindowIds();

			if (openSidePanelWindows.includes(windowId)) {
				await chrome.sidePanel.close({ windowId });
				await updateOpenSidePanelWindowIds((windowIds) =>
					removeOpenSidePanelWindowId(windowIds, windowId),
				);
				return;
			}

			await chrome.sidePanel.open({ windowId });
			await updateOpenSidePanelWindowIds((windowIds) =>
				addOpenSidePanelWindowId(windowIds, windowId),
			);
		});

	sidePanelToggleUpdate = nextToggle;
	return nextToggle;
}

chrome.sidePanel.onOpened.addListener((info) => {
	updateOpenSidePanelWindowIds((windowIds) =>
		addOpenSidePanelWindowId(windowIds, info.windowId),
	).catch((error) => {
		logSidePanelStateUpdateError("Error tracking opened side panel", error);
	});
});

chrome.sidePanel.onClosed.addListener((info) => {
	updateOpenSidePanelWindowIds((windowIds) =>
		removeOpenSidePanelWindowId(windowIds, info.windowId),
	).catch((error) => {
		logSidePanelStateUpdateError("Error tracking closed side panel", error);
	});
});

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
	if (tab.windowId === undefined) return;
	toggleSidePanel(tab.windowId).catch((error) => {
		logSidePanelStateUpdateError("Error toggling side panel", error);
	});
});

// Also check the active tab on extension install/startup
chrome.runtime.onInstalled.addListener(async () => {
	const tabs = await chrome.tabs.query({ url: `${HOME_ORIGIN}/*` });
	for (const tab of tabs) {
		if (tab.id !== undefined && tab.url) {
			await handleUrlChange(tab.id, tab.url);
		}
	}
});
