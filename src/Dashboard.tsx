import {
	Box,
	Collapse,
	Divider,
	Flex,
	NavLink,
	ScrollArea,
	Stack,
	Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiHome } from "react-icons/fi";
import { SidebarContextMenu } from "@/components/SidebarContextMenu";
import { TitleBar } from "@/components/TitleBar";
import styles from "@/Dashboard.module.css";
import { useRepositories } from "@/hooks/useRepositories";
import {
	HOME_URL,
	SIDEBAR_WIDTH,
	TITLE_BAR_HEIGHT,
	URL_CHANGED_EVENT,
} from "@/lib/constants";
import {
	formatSessionLabel,
	normalizeUrl,
	parseDeepWikiUrl,
} from "@/lib/deepWikiUrl";
import {
	appendSession,
	findSessionOwner,
	setSessionAlias,
	upsertRepository,
} from "@/lib/repository";
import { localStorageRepositoryPersistence } from "@/lib/repositoryPersistence";
import {
	compareRepositorySlug,
	compareSessionCreatedAt,
} from "@/lib/repositorySort";

type UrlChangedPayload = {
	url: string;
};

export function Dashboard() {
	// Repository store (Map-based for faster in-memory operations)
	const [repositoryStore, setRepositoryStore] = useRepositories();
	const repositories = useMemo(
		() =>
			Array.from(repositoryStore.entries())
				.sort(([left], [right]) => compareRepositorySlug(left, right))
				.map(([slug, sessionsByUrl]) => ({
					slug,
					sessions: Array.from(sessionsByUrl.values()).sort(
						compareSessionCreatedAt,
					),
				})),
		[repositoryStore],
	);
	// Currently selected URL
	const [selectedUrl, setSelectedUrl] = useState(HOME_URL);
	// Open state of repository groups in sidebar
	const [openedRepositories, setOpenedRepositories] = useState<Set<string>>(
		() => new Set(),
	);
	// Viewport width for responsive design
	const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
	// Reference to keep track of the current repository context
	const repositoryContextRef = useRef<string | null>(null);
	// Inline alias editing state for the selected session
	const [editingSessionUrl, setEditingSessionUrl] = useState<string | null>(
		null,
	);
	const [sessionAliasDraft, setSessionAliasDraft] = useState("");
	const sessionAliasInputRef = useRef<HTMLInputElement | null>(null);

	// Function to show error notifications
	const notifyError = useCallback((message: string) => {
		notifications.show({
			title: "Error",
			message,
			color: "red",
			withBorder: true,
		});
	}, []);

	// Parse the selected URL to determine its kind
	const selectedKind = useMemo(
		() => parseDeepWikiUrl(selectedUrl),
		[selectedUrl],
	);
	// Determine the owner repository of the selected session, if applicable
	const selectedSessionOwner = useMemo(() => {
		if (selectedKind.type !== "session") {
			return null;
		}

		return findSessionOwner(repositoryStore, selectedUrl);
	}, [repositoryStore, selectedKind, selectedUrl]);

	// Update viewport width on resize
	useEffect(() => {
		const handleResize = () => setViewportWidth(window.innerWidth);
		window.addEventListener("resize", handleResize);
		return () => {
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	// Keep selected repository/session owner expanded in sidebar
	useEffect(() => {
		if (selectedKind.type === "repository") {
			setOpenedRepositories((prev) => {
				if (prev.has(selectedKind.slug)) {
					return prev;
				}
				const next = new Set(prev);
				next.add(selectedKind.slug);
				return next;
			});
			return;
		}

		if (selectedKind.type === "session" && selectedSessionOwner) {
			setOpenedRepositories((prev) => {
				if (prev.has(selectedSessionOwner)) {
					return prev;
				}
				const next = new Set(prev);
				next.add(selectedSessionOwner);
				return next;
			});
		}
	}, [selectedKind, selectedSessionOwner]);

	// Listen for URL change events from the backend
	useEffect(() => {
		let unlisten: (() => void) | undefined;

		const updateByDetectedUrl = (rawUrl: string) => {
			const normalized = normalizeUrl(rawUrl);
			const kind = parseDeepWikiUrl(normalized);
			setSelectedUrl(normalized);

			if (kind.type === "home") {
				repositoryContextRef.current = null;
				return;
			}

			if (kind.type === "repository") {
				repositoryContextRef.current = kind.slug;
				setRepositoryStore((prev) => upsertRepository(prev, kind.slug));
				return;
			}

			if (kind.type === "session") {
				setRepositoryStore((prev) => {
					const targetRepository =
						findSessionOwner(prev, normalized) ?? repositoryContextRef.current;
					if (!targetRepository) {
						return prev;
					}
					repositoryContextRef.current = targetRepository;
					return appendSession(prev, targetRepository, normalized);
				});
			}
		};

		const setupListener = async () => {
			unlisten = await listen<UrlChangedPayload>(URL_CHANGED_EVENT, (event) => {
				updateByDetectedUrl(event.payload.url);
			});
		};

		setupListener().catch((error: unknown) => {
			notifyError(`Failed to initialize event listener: ${String(error)}`);
		});

		return () => {
			unlisten?.();
		};
	}, [notifyError, setRepositoryStore]);

	// Function to navigate to a given URL with optional repository context
	const navigate = useCallback(
		async (url: string, repositoryContext: string | null) => {
			repositoryContextRef.current = repositoryContext;
			setSelectedUrl(normalizeUrl(url));
			try {
				await invoke("navigate_deepwiki", { url });
			} catch (error: unknown) {
				notifyError(String(error));
			}
		},
		[notifyError],
	);

	// Handlers for starting, canceling, and committing session alias edits
	const startSessionAliasEdit = useCallback(
		(sessionUrl: string, currentAlias?: string) => {
			setEditingSessionUrl(sessionUrl);
			setSessionAliasDraft(currentAlias ?? "");
		},
		[],
	);

	// Reset session alias editing state
	const cancelSessionAliasEdit = useCallback(() => {
		setEditingSessionUrl(null);
		setSessionAliasDraft("");
	}, []);

	// Commit the edited alias to the repository store
	const commitSessionAliasEdit = useCallback(
		(sessionUrl: string, aliasDraft: string) => {
			setRepositoryStore((prev) =>
				setSessionAlias(prev, sessionUrl, aliasDraft),
			);
			setEditingSessionUrl(null);
			setSessionAliasDraft("");
		},
		[setRepositoryStore],
	);

	// Handler to initiate alias editing from the context menu
	const handleStartSessionAliasEdit = useCallback(
		(slug: string, sessionUrl: string) => {
			const currentAlias = repositoryStore.get(slug)?.get(sessionUrl)?.alias;
			startSessionAliasEdit(sessionUrl, currentAlias);
		},
		[repositoryStore, startSessionAliasEdit],
	);

	// Effect to focus and select the input when starting to edit a session alias
	useEffect(() => {
		if (!editingSessionUrl) {
			return;
		}

		sessionAliasInputRef.current?.focus();
		sessionAliasInputRef.current?.select();
	}, [editingSessionUrl]);

	// Handlers for deleting repositories and sessions
	const handleDeleteRepository = useCallback(
		(slug: string) => {
			if (repositoryContextRef.current === slug) {
				repositoryContextRef.current = null;
			}
			setOpenedRepositories((prev) => {
				if (!prev.has(slug)) {
					return prev;
				}
				const next = new Set(prev);
				next.delete(slug);
				return next;
			});
			setRepositoryStore((prev) =>
				localStorageRepositoryPersistence.deleteRepository(prev, slug),
			);

			const shouldLeaveCurrent =
				(selectedKind.type === "repository" && selectedKind.slug === slug) ||
				(selectedKind.type === "session" && selectedSessionOwner === slug);
			if (shouldLeaveCurrent) {
				void navigate(HOME_URL, null);
			}
		},
		[navigate, selectedKind, selectedSessionOwner, setRepositoryStore],
	);

	// Handler for deleting a session
	const handleDeleteSession = useCallback(
		(slug: string, sessionUrl: string) => {
			setRepositoryStore((prev) =>
				localStorageRepositoryPersistence.deleteSession(prev, slug, sessionUrl),
			);
			if (selectedUrl === sessionUrl) {
				void navigate(`https://deepwiki.com/${slug}`, slug);
			}
		},
		[navigate, selectedUrl, setRepositoryStore],
	);

	// Toggle the fold state of a repository group in the sidebar
	const toggleRepositoryFold = useCallback((slug: string) => {
		setOpenedRepositories((prev) => {
			const next = new Set(prev);
			if (next.has(slug)) {
				next.delete(slug);
			} else {
				next.add(slug);
			}
			return next;
		});
	}, []);

	const navbarWidth = Math.min(SIDEBAR_WIDTH, viewportWidth);

	return (
		<Flex className={styles.dashboardRoot}>
			<TitleBar height={TITLE_BAR_HEIGHT} title="d('w')b" />

			<Flex className={styles.dashboardBody}>
				<SidebarContextMenu
					onDeleteRepository={handleDeleteRepository}
					onStartSessionAliasEdit={handleStartSessionAliasEdit}
					onDeleteSession={handleDeleteSession}
				>
					{({ openContextMenu, sidebarRef }) => (
						<Box
							ref={sidebarRef}
							className={styles.sidebar}
							style={{ width: `${navbarWidth}px` }}
						>
							<Stack className={styles.sidebarStack}>
								<NavLink
									active={selectedKind.type === "home"}
									className={styles.navLinkRoot}
									label="Home"
									leftSection={<FiHome size={16} />}
									onClick={() => void navigate(HOME_URL, null)}
									variant={selectedKind.type === "home" ? "filled" : "subtle"}
								/>

								<Divider
									color="#2c2c2c"
									label={
										<Text className={styles.repositoriesHeading}>
											Repositories
										</Text>
									}
									labelPosition="center"
								/>

								<ScrollArea
									className={styles.repositoriesScroll}
									offsetScrollbars
								>
									<Stack className={styles.repositoryList}>
										{repositories.map((repo) => {
											const isRepoSelected =
												selectedKind.type === "repository" &&
												selectedKind.slug === repo.slug;
											const isRepoOpened = openedRepositories.has(repo.slug);
											const hasSessions = repo.sessions.length > 0;
											return (
												<Stack
													key={repo.slug}
													className={styles.repositoryGroup}
												>
													<NavLink
														active={isRepoSelected}
														className={
															hasSessions
																? `${styles.navLinkRoot} ${styles.navLinkRootWithFold}`
																: styles.navLinkRoot
														}
														label={
															<Text className={styles.repositoryLabel}>
																{repo.slug}
															</Text>
														}
														onClick={() =>
															void navigate(
																`https://deepwiki.com/${repo.slug}`,
																repo.slug,
															)
														}
														onContextMenu={(event) =>
															openContextMenu(event, {
																type: "repository",
																slug: repo.slug,
															})
														}
														rightSection={
															hasSessions ? (
																<Box
																	aria-label={
																		isRepoOpened
																			? "Collapse repository sessions"
																			: "Expand repository sessions"
																	}
																	className={styles.repoFoldToggle}
																	component="span"
																	data-opened={isRepoOpened || undefined}
																	onClick={(event) => {
																		event.preventDefault();
																		event.stopPropagation();
																		toggleRepositoryFold(repo.slug);
																	}}
																	onKeyDown={(event) => {
																		if (event.key === " ") {
																			event.preventDefault();
																			event.stopPropagation();
																			toggleRepositoryFold(repo.slug);
																		}
																	}}
																	role="button"
																	tabIndex={0}
																>
																	<FiChevronRight size={14} />
																</Box>
															) : null
														}
														variant={isRepoSelected ? "filled" : "subtle"}
													/>
													{hasSessions ? (
														<Collapse in={isRepoOpened}>
															<Box className={styles.sessionListContainer}>
																<Stack className={styles.sessionList}>
																	{repo.sessions.map((session) => {
																		const isSessionSelected =
																			selectedUrl === session.url;
																		const isSessionEditing =
																			editingSessionUrl === session.url;
																		const displayLabel =
																			session.alias?.trim() ||
																			formatSessionLabel(session.url);
																		return (
																			<NavLink
																				key={session.url}
																				active={isSessionSelected}
																				className={styles.navLinkRoot}
																				label={
																					isSessionEditing ? (
																						<input
																							ref={sessionAliasInputRef}
																							aria-label="Session alias"
																							className={
																								styles.sessionAliasInput
																							}
																							onBlur={() =>
																								commitSessionAliasEdit(
																									session.url,
																									sessionAliasDraft,
																								)
																							}
																							onChange={(event) =>
																								setSessionAliasDraft(
																									event.currentTarget.value,
																								)
																							}
																							onClick={(event) =>
																								event.stopPropagation()
																							}
																							onKeyDown={(event) => {
																								if (event.key === "Escape") {
																									event.preventDefault();
																									event.stopPropagation();
																									cancelSessionAliasEdit();
																								} else if (
																									event.key === "Enter"
																								) {
																									event.preventDefault();
																									event.stopPropagation();
																									commitSessionAliasEdit(
																										session.url,
																										sessionAliasDraft,
																									);
																								}
																							}}
																							onMouseDown={(event) =>
																								event.stopPropagation()
																							}
																							placeholder={formatSessionLabel(
																								session.url,
																							)}
																							type="text"
																							value={sessionAliasDraft}
																						/>
																					) : (
																						<Text
																							className={styles.sessionLabel}
																						>
																							{displayLabel}
																						</Text>
																					)
																				}
																				onClick={() => {
																					if (isSessionEditing) {
																						return;
																					}
																					void navigate(session.url, repo.slug);
																				}}
																				onContextMenu={(event) =>
																					openContextMenu(event, {
																						type: "session",
																						slug: repo.slug,
																						sessionUrl: session.url,
																					})
																				}
																				variant={
																					isSessionSelected ? "light" : "subtle"
																				}
																			/>
																		);
																	})}
																</Stack>
															</Box>
														</Collapse>
													) : null}
												</Stack>
											);
										})}
									</Stack>
								</ScrollArea>
							</Stack>
						</Box>
					)}
				</SidebarContextMenu>
			</Flex>
		</Flex>
	);
}
