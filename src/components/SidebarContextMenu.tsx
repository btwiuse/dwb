import { Box, Button, Portal } from "@mantine/core";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { FiEdit2, FiFolderMinus, FiTrash2 } from "react-icons/fi";
import styles from "@/components/SidebarContextMenu.module.css";

type ContextMenuPayload =
	| { type: "repository"; slug: string }
	| { type: "session"; slug: string; sessionUrl: string };

type ContextMenuState =
	| {
			type: "repository";
			slug: string;
			x: number;
			y: number;
	  }
	| {
			type: "session";
			slug: string;
			sessionUrl: string;
			x: number;
			y: number;
	  }
	| null;

type SidebarContextMenuProps = {
	children: (props: {
		openContextMenu: (
			event: ReactMouseEvent,
			payload: ContextMenuPayload,
		) => void;
		sidebarRef: RefObject<HTMLDivElement | null>;
	}) => ReactNode;
	onDeleteRepository: (slug: string) => void;
	onStartSessionAliasEdit: (slug: string, sessionUrl: string) => void;
	onDeleteSession: (slug: string, sessionUrl: string) => void;
};

export function SidebarContextMenu({
	children,
	onDeleteRepository,
	onStartSessionAliasEdit,
	onDeleteSession,
}: SidebarContextMenuProps) {
	const contextMenuItemClassNames = {
		root: styles.contextMenuItem,
		inner: styles.contextMenuItemInner,
		section: styles.contextMenuItemSection,
		label: styles.contextMenuItemLabel,
	};

	// Ref to the sidebar element for bounding the context menu within it
	const sidebarRef = useRef<HTMLDivElement | null>(null);
	// Ref to the context menu element itself
	const contextMenuRef = useRef<HTMLDivElement | null>(null);
	// State for the current context menu. `null` means no context menu is closed
	const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
	// State for the calculated position of the context menu
	const [contextMenuPosition, setContextMenuPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);

	const openContextMenu = useCallback(
		(event: ReactMouseEvent, payload: ContextMenuPayload) => {
			// Prevent the default context menu from appearing and stop propagation
			event.preventDefault();
			event.stopPropagation();
			setContextMenu({
				...payload,
				x: event.clientX,
				y: event.clientY,
			});
			setContextMenuPosition(null);
		},
		[],
	);

	// Function to close the context menu
	const closeContextMenu = useCallback(() => {
		setContextMenu(null);
		setContextMenuPosition(null);
	}, []);

	// Effect to handle closing the context menu on various events
	useEffect(() => {
		if (!contextMenu) {
			return;
		}

		const handleClick = () => closeContextMenu();
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closeContextMenu();
			}
		};

		window.addEventListener("click", handleClick);
		window.addEventListener("contextmenu", handleClick);
		window.addEventListener("keydown", handleKey);
		window.addEventListener("resize", handleClick);
		window.addEventListener("scroll", handleClick, true);

		return () => {
			window.removeEventListener("click", handleClick);
			window.removeEventListener("contextmenu", handleClick);
			window.removeEventListener("keydown", handleKey);
			window.removeEventListener("resize", handleClick);
			window.removeEventListener("scroll", handleClick, true);
		};
	}, [closeContextMenu, contextMenu]);

	// Effect to calculate and update the position of the context menu
	useLayoutEffect(() => {
		if (!contextMenu) {
			return;
		}

		let frame = 0;
		let observer: ResizeObserver | null = null;

		const updatePosition = () => {
			const menuEl = contextMenuRef.current;
			if (!menuEl) {
				frame = requestAnimationFrame(updatePosition);
				return;
			}

			// 1. Get actual size of the context menu
			const rect = menuEl.getBoundingClientRect();
			const padding = 8;
			// 2. Get bounding rect of the sidebar or fallback to window bounds
			const sidebarRect = sidebarRef.current?.getBoundingClientRect();
			const bounds = sidebarRect ?? {
				left: 0,
				top: 0,
				right: window.innerWidth,
				bottom: window.innerHeight,
			};
			let nextX = contextMenu.x;
			let nextY = contextMenu.y;

			// 3. Adjust position to keep within bounds
			if (nextX + rect.width + padding > bounds.right) {
				// If overflow right
				nextX = bounds.right - rect.width - padding;
			}
			if (nextY + rect.height + padding > bounds.bottom) {
				// If overflow bottom
				nextY = bounds.bottom - rect.height - padding;
			}

			nextX = Math.max(bounds.left + padding, nextX); // If overflow left
			nextY = Math.max(bounds.top + padding, nextY); // If overflow top

			// 4. Update state if position has changed
			setContextMenuPosition((prev) => {
				if (prev && prev.x === nextX && prev.y === nextY) {
					return prev;
				}
				return { x: nextX, y: nextY };
			});

			// Observe size changes to the context menu to re-calculate position
			if (!observer) {
				observer = new ResizeObserver(() => {
					cancelAnimationFrame(frame);
					frame = requestAnimationFrame(updatePosition);
				});
				observer.observe(menuEl);
			}
		};

		updatePosition();

		return () => {
			cancelAnimationFrame(frame);
			observer?.disconnect();
		};
	}, [contextMenu]);

	return (
		<>
			{children({ openContextMenu, sidebarRef })}
			{contextMenu ? (
				<Portal>
					<Box
						ref={contextMenuRef}
						className={styles.contextMenu}
						style={{
							top: contextMenuPosition?.y ?? contextMenu.y,
							left: contextMenuPosition?.x ?? contextMenu.x,
							visibility: contextMenuPosition ? "visible" : "hidden",
						}}
						onClick={(event) => event.stopPropagation()}
						onContextMenu={(event) => event.preventDefault()}
					>
						{contextMenu.type === "repository" ? (
							<Button
								classNames={contextMenuItemClassNames}
								leftSection={<FiFolderMinus size={14} />}
								onClick={() => {
									onDeleteRepository(contextMenu.slug);
									closeContextMenu();
								}}
								type="button"
							>
								Delete repository
							</Button>
						) : (
							<>
								<Button
									classNames={contextMenuItemClassNames}
									leftSection={<FiEdit2 size={14} />}
									onClick={() => {
										onStartSessionAliasEdit(
											contextMenu.slug,
											contextMenu.sessionUrl,
										);
										closeContextMenu();
									}}
									type="button"
								>
									Rename session
								</Button>
								<Button
									classNames={contextMenuItemClassNames}
									leftSection={<FiTrash2 size={14} />}
									onClick={() => {
										onDeleteSession(contextMenu.slug, contextMenu.sessionUrl);
										closeContextMenu();
									}}
									type="button"
								>
									Delete session
								</Button>
							</>
						)}
					</Box>
				</Portal>
			) : null}
		</>
	);
}
