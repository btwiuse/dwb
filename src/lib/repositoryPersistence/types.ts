import type {
	RepositorySlug,
	RepositoryStore,
	SessionUrl,
} from "@/lib/repository";

export type RepositoryStorePersistence = {
	load: () => RepositoryStore;
	save: (store: RepositoryStore) => void;
	deleteRepository: (
		store: RepositoryStore,
		slug: RepositorySlug,
	) => RepositoryStore;
	deleteSession: (
		store: RepositoryStore,
		slug: RepositorySlug,
		sessionUrl: SessionUrl,
	) => RepositoryStore;
};
