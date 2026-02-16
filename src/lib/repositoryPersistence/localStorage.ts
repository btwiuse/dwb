import type {
	RepositorySlug,
	RepositoryStore,
	Session,
	SessionUrl,
} from "@/lib/repository";
import type { RepositoryStorePersistence } from "@/lib/repositoryPersistence/types";
import {
	compareRepositorySlug,
	compareSessionCreatedAt,
} from "@/lib/repositorySort";

const REPOSITORIES_STORAGE_KEY = "dwb.repositories.v1";
const REPOSITORIES_STORAGE_VERSION = 1 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function repositoriesToStore(
	repositories: Array<{ slug: RepositorySlug; sessions: Session[] }>,
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

function storeToRepositories(
	store: RepositoryStore,
): Array<{ slug: RepositorySlug; sessions: Session[] }> {
	return Array.from(store.entries())
		.map(([slug, sessionsByUrl]) => ({
			slug,
			sessions: Array.from(sessionsByUrl.values()).sort(
				compareSessionCreatedAt,
			),
		}))
		.sort((a, b) => compareRepositorySlug(a.slug, b.slug));
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

function parseRepository(
	value: unknown,
): { slug: RepositorySlug; sessions: Session[] } | null {
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

function parseRepositoriesArray(value: unknown): RepositoryStore {
	if (!Array.isArray(value)) {
		return new Map();
	}

	const repositories = value
		.map((repository) => parseRepository(repository))
		.filter(
			(
				repository,
			): repository is { slug: RepositorySlug; sessions: Session[] } =>
				repository !== null,
		);

	return repositoriesToStore(repositories);
}

function parsePersistedRepositories(value: unknown): RepositoryStore {
	if (Array.isArray(value)) {
		return parseRepositoriesArray(value);
	}

	if (!isRecord(value)) {
		return new Map();
	}

	if (value.version !== REPOSITORIES_STORAGE_VERSION) {
		return new Map();
	}

	return parseRepositoriesArray(value.repositories);
}

function loadRepositoryStore(): RepositoryStore {
	if (typeof window === "undefined") {
		return new Map();
	}

	try {
		const raw = window.localStorage.getItem(REPOSITORIES_STORAGE_KEY);
		if (!raw) {
			return new Map();
		}

		const parsed = JSON.parse(raw);
		return parsePersistedRepositories(parsed);
	} catch {
		return new Map();
	}
}

function saveRepositoryStore(repositoryStore: RepositoryStore): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		const payload: {
			version: typeof REPOSITORIES_STORAGE_VERSION;
			repositories: Array<{ slug: RepositorySlug; sessions: Session[] }>;
		} = {
			version: REPOSITORIES_STORAGE_VERSION,
			repositories: storeToRepositories(repositoryStore),
		};
		window.localStorage.setItem(
			REPOSITORIES_STORAGE_KEY,
			JSON.stringify(payload),
		);
	} catch {
		// Ignore storage errors and keep in-memory state.
	}
}

function deleteRepositoryFromStore(
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

function deleteSessionFromStore(
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

function deleteRepository(
	repositoryStore: RepositoryStore,
	slug: RepositorySlug,
): RepositoryStore {
	const nextStore = deleteRepositoryFromStore(repositoryStore, slug);
	if (nextStore === repositoryStore) {
		return repositoryStore;
	}
	saveRepositoryStore(nextStore);
	return nextStore;
}

function deleteSession(
	repositoryStore: RepositoryStore,
	slug: RepositorySlug,
	sessionUrl: SessionUrl,
): RepositoryStore {
	const nextStore = deleteSessionFromStore(repositoryStore, slug, sessionUrl);
	if (nextStore === repositoryStore) {
		return repositoryStore;
	}
	saveRepositoryStore(nextStore);
	return nextStore;
}

export const localStorageRepositoryPersistence: RepositoryStorePersistence = {
	load: loadRepositoryStore,
	save: saveRepositoryStore,
	deleteRepository,
	deleteSession,
};
