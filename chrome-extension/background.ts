import { HOME_ORIGIN } from "@/lib/constants";
import { normalizeUrl, parseDeepWikiUrl } from "@/lib/deepWikiUrl";

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

// Track which windows currently have the side panel open.
const openSidePanelWindows = new Set<number>();

chrome.sidePanel.onOpened.addListener((info) => {
	openSidePanelWindows.add(info.windowId);
});

chrome.sidePanel.onClosed.addListener((info) => {
	openSidePanelWindows.delete(info.windowId);
});

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
	if (tab.windowId === undefined) return;
	if (openSidePanelWindows.has(tab.windowId)) {
		chrome.sidePanel.close({ windowId: tab.windowId });
	} else {
		chrome.sidePanel.open({ windowId: tab.windowId });
	}
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
