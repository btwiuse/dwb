import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type {
	RepositorySlug,
	RepositoryStore,
	Session,
	SessionUrl,
} from "@/lib/repository";
import {
	compareRepositorySlug,
	compareSessionCreatedAt,
} from "@/lib/repositorySort";

const STORAGE_KEY = "dwb.repositories.v1";
const STORAGE_VERSION = 1 as const;

type PersistedRepository = {
	slug: RepositorySlug;
	sessions: Session[];
};

type PersistedData = {
	version: typeof STORAGE_VERSION;
	repositories: PersistedRepository[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseSession(
	value: unknown,
	fallbackCreatedAt: number,
): Session | null {
	if (typeof value === "string") {
		return { url: value, createdAt: fallbackCreatedAt };
	}
	if (!isRecord(value)) {
		return null;
	}
	if (typeof value.url !== "string") {
		return null;
	}
	if (
		typeof value.createdAt !== "number" ||
		!Number.isFinite(value.createdAt)
	) {
		return null;
	}
	const normalizedAlias =
		typeof value.alias === "string" ? value.alias.trim() : undefined;
	return {
		url: value.url,
		createdAt: value.createdAt,
		...(normalizedAlias ? { alias: normalizedAlias } : {}),
	};
}

function parseRepository(value: unknown): PersistedRepository | null {
	if (!isRecord(value)) {
		return null;
	}
	if (typeof value.slug !== "string" || !Array.isArray(value.sessions)) {
		return null;
	}
	const sessions = value.sessions
		.map((session, index) => parseSession(session, index))
		.filter((session): session is Session => session !== null);
	return { slug: value.slug, sessions };
}

function parseRepositoriesArray(value: unknown): PersistedRepository[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((repository) => parseRepository(repository))
		.filter(
			(repository): repository is PersistedRepository => repository !== null,
		);
}

function repositoriesToStore(
	repositories: PersistedRepository[],
): RepositoryStore {
	const store: RepositoryStore = new Map();
	for (const repository of repositories) {
		const sessionsByUrl =
			store.get(repository.slug) ?? new Map<SessionUrl, Session>();
		for (const session of repository.sessions) {
			const existing = sessionsByUrl.get(session.url);
			if (!existing || session.createdAt > existing.createdAt) {
				sessionsByUrl.set(session.url, session);
			}
		}
		store.set(repository.slug, sessionsByUrl);
	}
	return store;
}

function storeToRepositories(store: RepositoryStore): PersistedRepository[] {
	return Array.from(store.entries())
		.map(([slug, sessionsByUrl]) => ({
			slug,
			sessions: Array.from(sessionsByUrl.values()).sort(
				compareSessionCreatedAt,
			),
		}))
		.sort((a, b) => compareRepositorySlug(a.slug, b.slug));
}

function parsePersistedData(value: unknown): RepositoryStore {
	if (Array.isArray(value)) {
		return repositoriesToStore(parseRepositoriesArray(value));
	}
	if (!isRecord(value)) {
		return new Map();
	}
	if (value.version !== STORAGE_VERSION) {
		return new Map();
	}
	return repositoriesToStore(parseRepositoriesArray(value.repositories));
}

async function loadFromChromeStorage(): Promise<RepositoryStore> {
	try {
		const result = await chrome.storage.local.get(STORAGE_KEY);
		const data = result[STORAGE_KEY];
		if (!data) {
			return new Map();
		}
		return parsePersistedData(data);
	} catch {
		return new Map();
	}
}

async function saveToChromeStorage(store: RepositoryStore): Promise<void> {
	try {
		const payload: PersistedData = {
			version: STORAGE_VERSION,
			repositories: storeToRepositories(store),
		};
		await chrome.storage.local.set({ [STORAGE_KEY]: payload });
	} catch {
		// Ignore storage errors and keep in-memory state.
	}
}

export function deleteRepositoryFromStore(
	repositoryStore: RepositoryStore,
	slug: RepositorySlug,
): RepositoryStore {
	if (!repositoryStore.has(slug)) {
		return repositoryStore;
	}
	const nextStore = new Map(repositoryStore);
	nextStore.delete(slug);
	return nextStore;
}

export function deleteSessionFromStore(
	repositoryStore: RepositoryStore,
	slug: RepositorySlug,
	sessionUrl: SessionUrl,
): RepositoryStore {
	const sessions = repositoryStore.get(slug);
	if (!sessions || !sessions.has(sessionUrl)) {
		return repositoryStore;
	}
	const nextSessions = new Map(sessions);
	nextSessions.delete(sessionUrl);
	const nextStore = new Map(repositoryStore);
	nextStore.set(slug, nextSessions);
	return nextStore;
}

export function useChromeRepositories(): [
	RepositoryStore,
	Dispatch<SetStateAction<RepositoryStore>>,
	boolean,
] {
	const [repositoryStore, setRepositoryStore] = useState<RepositoryStore>(
		() => new Map(),
	);
	const [isLoaded, setIsLoaded] = useState(false);

	// Load data from chrome.storage.local on mount
	useEffect(() => {
		loadFromChromeStorage().then((store) => {
			setRepositoryStore(store);
			setIsLoaded(true);
		});
	}, []);

	// Save to chrome.storage.local whenever store changes (after initial load)
	useEffect(() => {
		if (!isLoaded) {
			return;
		}
		saveToChromeStorage(repositoryStore);
	}, [isLoaded, repositoryStore]);

	// Listen for chrome.storage changes (e.g., from background script)
	useEffect(() => {
		const handleStorageChange = (
			changes: Record<string, chrome.storage.StorageChange>,
			areaName: string,
		) => {
			if (areaName !== "local" || !changes[STORAGE_KEY]) {
				return;
			}
			const newValue = changes[STORAGE_KEY].newValue;
			if (newValue) {
				setRepositoryStore(parsePersistedData(newValue));
			}
		};
		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	return [repositoryStore, setRepositoryStore, isLoaded];
}
