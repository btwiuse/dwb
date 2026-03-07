import {
	Box,
	Collapse,
	Divider,
	Flex,
	Loader,
	NavLink,
	ScrollArea,
	Stack,
	Text,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiHome } from "react-icons/fi";
import { SidebarContextMenu } from "@/components/SidebarContextMenu";
import { HOME_URL } from "@/lib/constants";
import {
	formatSessionLabel,
	normalizeUrl,
	parseDeepWikiUrl,
} from "@/lib/deepWikiUrl";
import {
	findSessionOwner,
	setSessionAlias,
	upsertRepository,
} from "@/lib/repository";
import {
	compareRepositorySlug,
	compareSessionCreatedAt,
} from "@/lib/repositorySort";
import {
	deleteRepositoryFromStore,
	deleteSessionFromStore,
	useChromeRepositories,
} from "./hooks/useChromeRepositories";
import styles from "./PopupApp.module.css";

export function PopupApp() {
	const [repositoryStore, setRepositoryStore, isLoaded] =
		useChromeRepositories();

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

	// Currently selected URL (tracks the active deepwiki tab)
	const [selectedUrl, setSelectedUrl] = useState(HOME_URL);
	// Open state of repository groups
	const [openedRepositories, setOpenedRepositories] = useState<Set<string>>(
		() => new Set(),
	);
	// Repository context ref
	const repositoryContextRef = useRef<string | null>(null);
	// Inline alias editing
	const [editingSessionUrl, setEditingSessionUrl] = useState<string | null>(
		null,
	);
	const [sessionAliasDraft, setSessionAliasDraft] = useState("");
	const sessionAliasInputRef = useRef<HTMLInputElement | null>(null);

	const selectedKind = useMemo(
		() => parseDeepWikiUrl(selectedUrl),
		[selectedUrl],
	);
	const selectedSessionOwner = useMemo(() => {
		if (selectedKind.type !== "session") {
			return null;
		}
		return findSessionOwner(repositoryStore, selectedUrl);
	}, [repositoryStore, selectedKind, selectedUrl]);

	// On popup open, check the active tab URL
	useEffect(() => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const tab = tabs[0];
			if (tab?.url) {
				const normalized = normalizeUrl(tab.url);
				const kind = parseDeepWikiUrl(normalized);
				setSelectedUrl(normalized);
				if (kind.type === "repository") {
					repositoryContextRef.current = kind.slug;
					setRepositoryStore((prev) => upsertRepository(prev, kind.slug));
				} else if (kind.type === "session") {
					const owner = findSessionOwner(repositoryStore, normalized);
					if (owner) {
						repositoryContextRef.current = owner;
					}
				}
			}
		});
	}, [isLoaded, repositoryStore, setRepositoryStore]);

	// Keep selected repository expanded
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

	// Navigate: open URL in the active deepwiki tab or create one
	// If Command (metaKey) or Ctrl (ctrlKey) is held, always open in new tab
	const navigate = useCallback(
		async (
			url: string,
			repositoryContext: string | null,
			event?: React.MouseEvent,
		) => {
			repositoryContextRef.current = repositoryContext;
			setSelectedUrl(normalizeUrl(url));
			try {
				// Check if Command (Mac) or Ctrl (Windows/Linux) key is pressed
				const forceNewTab = event?.metaKey || event?.ctrlKey;

				if (forceNewTab) {
					// Always create a new tab when modifier key is pressed
					await chrome.tabs.create({ url });
				} else {
					// Original behavior: reuse existing deepwiki tab or create new one
					const tabs = await chrome.tabs.query({
						url: "https://deepwiki.com/*",
						currentWindow: true,
					});
					if (tabs.length > 0 && tabs[0].id !== undefined) {
						await chrome.tabs.update(tabs[0].id, { url, active: true });
					} else {
						await chrome.tabs.create({ url });
					}
				}
			} catch (error: unknown) {
				console.error("[dwb] Navigation error:", error);
			}
		},
		[],
	);

	// Session alias editing handlers
	const startSessionAliasEdit = useCallback(
		(sessionUrl: string, currentAlias?: string) => {
			setEditingSessionUrl(sessionUrl);
			setSessionAliasDraft(currentAlias ?? "");
		},
		[],
	);

	const cancelSessionAliasEdit = useCallback(() => {
		setEditingSessionUrl(null);
		setSessionAliasDraft("");
	}, []);

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

	const handleStartSessionAliasEdit = useCallback(
		(slug: string, sessionUrl: string) => {
			const currentAlias = repositoryStore.get(slug)?.get(sessionUrl)?.alias;
			startSessionAliasEdit(sessionUrl, currentAlias);
		},
		[repositoryStore, startSessionAliasEdit],
	);

	useEffect(() => {
		if (!editingSessionUrl) {
			return;
		}
		sessionAliasInputRef.current?.focus();
		sessionAliasInputRef.current?.select();
	}, [editingSessionUrl]);

	// Delete handlers
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
			setRepositoryStore((prev) => deleteRepositoryFromStore(prev, slug));

			const shouldLeaveCurrent =
				(selectedKind.type === "repository" && selectedKind.slug === slug) ||
				(selectedKind.type === "session" && selectedSessionOwner === slug);
			if (shouldLeaveCurrent) {
				void navigate(HOME_URL, null);
			}
		},
		[navigate, selectedKind, selectedSessionOwner, setRepositoryStore],
	);

	const handleDeleteSession = useCallback(
		(slug: string, sessionUrl: string) => {
			setRepositoryStore((prev) =>
				deleteSessionFromStore(prev, slug, sessionUrl),
			);
			if (selectedUrl === sessionUrl) {
				void navigate(`https://deepwiki.com/${slug}`, slug);
			}
		},
		[navigate, selectedUrl, setRepositoryStore],
	);

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

	if (!isLoaded) {
		return (
			<Flex className={styles.loadingRoot}>
				<Loader size="sm" />
			</Flex>
		);
	}

	return (
		<Flex className={styles.popupRoot}>
			<SidebarContextMenu
				onDeleteRepository={handleDeleteRepository}
				onStartSessionAliasEdit={handleStartSessionAliasEdit}
				onDeleteSession={handleDeleteSession}
			>
				{({ openContextMenu, sidebarRef }) => (
					<Box ref={sidebarRef} className={styles.sidebar}>
						<Stack className={styles.sidebarStack}>
							<NavLink
								active={selectedKind.type === "home"}
								className={styles.navLinkRoot}
								label="Home"
								leftSection={<FiHome size={16} />}
								onClick={(event) => void navigate(HOME_URL, null, event)}
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
									{repositories.length === 0 ? (
										<Text className={styles.emptyText}>
											Browse deepwiki.com to start tracking repositories
										</Text>
									) : null}
									{repositories.map((repo) => {
										const isRepoSelected =
											selectedKind.type === "repository" &&
											selectedKind.slug === repo.slug;
										const isRepoOpened = openedRepositories.has(repo.slug);
										const hasSessions = repo.sessions.length > 0;
										return (
											<Stack key={repo.slug} className={styles.repositoryGroup}>
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
													onClick={(event) =>
														void navigate(
															`https://deepwiki.com/${repo.slug}`,
															repo.slug,
															event,
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
																						className={styles.sessionAliasInput}
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
																					<Text className={styles.sessionLabel}>
																						{displayLabel}
																					</Text>
																				)
																			}
																			onClick={(event) => {
																				if (isSessionEditing) {
																					return;
																				}
																				void navigate(session.url, repo.slug, event);
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
	);
}
