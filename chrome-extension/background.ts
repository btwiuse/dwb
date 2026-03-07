import sharedConstants from "@/shared/constants.json";

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
const TAB_CONTEXT_STORAGE_KEY = "dwb.tabRepositoryContext.v1";
const SIDE_PANEL_WINDOWS_STORAGE_KEY = "dwb.sidePanel.windows.v1";

// Track which repository the user was last viewing per tab
const tabRepositoryContext = new Map<number, string>();
const tabRepositoryContextReady = hydrateTabRepositoryContext();

function parseTabRepositoryContext(value: unknown): Map<number, string> {
	const context = new Map<number, string>();
	if (!isRecord(value)) {
		return context;
	}
	for (const [tabIdRaw, slug] of Object.entries(value)) {
		const tabId = Number.parseInt(tabIdRaw, 10);
		if (Number.isInteger(tabId) && typeof slug === "string") {
			context.set(tabId, slug);
		}
	}
	return context;
}

async function hydrateTabRepositoryContext(): Promise<void> {
	try {
		const result = await chrome.storage.session.get(TAB_CONTEXT_STORAGE_KEY);
		const parsed = parseTabRepositoryContext(result[TAB_CONTEXT_STORAGE_KEY]);
		for (const [tabId, slug] of parsed.entries()) {
			tabRepositoryContext.set(tabId, slug);
		}

		let activeTabIds: Set<number> | null = null;
		try {
			const tabs = await chrome.tabs.query({});
			activeTabIds = new Set(
				tabs
					.map((tab) => tab.id)
					.filter((id): id is number => typeof id === "number"),
			);
		} catch {
			activeTabIds = null;
		}

		if (activeTabIds) {
			let removed = false;
			for (const tabId of tabRepositoryContext.keys()) {
				if (!activeTabIds.has(tabId)) {
					tabRepositoryContext.delete(tabId);
					removed = true;
				}
			}
			if (removed) {
				await persistTabRepositoryContext();
			}
		}
	} catch {
		// Ignore hydration failures and start with an empty context.
	}
}

async function persistTabRepositoryContext(): Promise<void> {
	const serialized: Record<string, string> = {};
	for (const [tabId, slug] of tabRepositoryContext.entries()) {
		serialized[String(tabId)] = slug;
	}
	try {
		await chrome.storage.session.set({
			[TAB_CONTEXT_STORAGE_KEY]: serialized,
		});
	} catch {
		// Ignore storage failures and keep in-memory state.
	}
}

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
	await tabRepositoryContextReady;
	const normalized = normalizeUrl(rawUrl);
	const kind = parseDeepWikiUrl(normalized);

	if (kind.type === "home") {
		if (tabRepositoryContext.delete(tabId)) {
			await persistTabRepositoryContext();
		}
		return;
	}

	if (kind.type === "other") {
		return;
	}

	const data = await loadData();
	let repos = data.repositories;

	if (kind.type === "repository") {
		const existingContext = tabRepositoryContext.get(tabId);
		if (existingContext !== kind.slug) {
			tabRepositoryContext.set(tabId, kind.slug);
			await persistTabRepositoryContext();
		}
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
		const existingContext = tabRepositoryContext.get(tabId);
		if (existingContext !== targetRepository) {
			tabRepositoryContext.set(tabId, targetRepository);
			await persistTabRepositoryContext();
		}
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
	void (async () => {
		await tabRepositoryContextReady;
		if (tabRepositoryContext.delete(tabId)) {
			await persistTabRepositoryContext();
		}
	})();
});

// Track which windows currently have the side panel open.
const openSidePanelWindows = new Set<number>();
const openSidePanelWindowsReady = hydrateOpenSidePanelWindows();

function parseWindowIdList(value: unknown): number[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(
		(item): item is number => typeof item === "number" && Number.isInteger(item),
	);
}

async function hydrateOpenSidePanelWindows(): Promise<void> {
	try {
		const result = await chrome.storage.session.get(
			SIDE_PANEL_WINDOWS_STORAGE_KEY,
		);
		const storedIds = parseWindowIdList(result[SIDE_PANEL_WINDOWS_STORAGE_KEY]);

		let activeWindowIds: Set<number> | null = null;
		try {
			const windows = await chrome.windows.getAll();
			activeWindowIds = new Set(
				windows
					.map((window) => window.id)
					.filter((id): id is number => typeof id === "number"),
			);
		} catch {
			activeWindowIds = null;
		}

		let didChange = false;
		for (const windowId of storedIds) {
			if (activeWindowIds && !activeWindowIds.has(windowId)) {
				didChange = true;
				continue;
			}
			openSidePanelWindows.add(windowId);
		}
		if (didChange) {
			await persistOpenSidePanelWindows();
		}
	} catch {
		// Ignore hydration failures and start with an empty set.
	}
}

async function persistOpenSidePanelWindows(): Promise<void> {
	try {
		await chrome.storage.session.set({
			[SIDE_PANEL_WINDOWS_STORAGE_KEY]: Array.from(openSidePanelWindows),
		});
	} catch {
		// Ignore storage failures and keep in-memory state.
	}
}

async function markSidePanelOpened(windowId: number): Promise<void> {
	await openSidePanelWindowsReady;
	if (!openSidePanelWindows.has(windowId)) {
		openSidePanelWindows.add(windowId);
		await persistOpenSidePanelWindows();
	}
}

async function markSidePanelClosed(windowId: number): Promise<void> {
	await openSidePanelWindowsReady;
	if (openSidePanelWindows.delete(windowId)) {
		await persistOpenSidePanelWindows();
	}
}

chrome.sidePanel.onOpened.addListener((info) => {
	void markSidePanelOpened(info.windowId);
});

chrome.sidePanel.onClosed.addListener((info) => {
	void markSidePanelClosed(info.windowId);
});

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
	if (tab.windowId === undefined) return;
	void (async () => {
		await openSidePanelWindowsReady;
		if (openSidePanelWindows.has(tab.windowId)) {
			await chrome.sidePanel.close({ windowId: tab.windowId });
		} else {
			await chrome.sidePanel.open({ windowId: tab.windowId });
		}
	})();
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
