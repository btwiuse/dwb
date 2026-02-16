import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { RepositoryStore } from "@/lib/repository";
import {
	localStorageRepositoryPersistence,
	type RepositoryStorePersistence,
} from "@/lib/repositoryPersistence";

// Custom hook to manage repositories with persistent storage
export function useRepositories(
	persistence: RepositoryStorePersistence = localStorageRepositoryPersistence,
): [RepositoryStore, Dispatch<SetStateAction<RepositoryStore>>] {
	const [repositoryStore, setRepositoryStore] = useState<RepositoryStore>(() =>
		persistence.load(),
	);

	useEffect(() => {
		persistence.save(repositoryStore);
	}, [persistence, repositoryStore]);

	return [repositoryStore, setRepositoryStore];
}
