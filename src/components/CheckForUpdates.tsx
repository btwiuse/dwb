import {
	Badge,
	Box,
	Button,
	Center,
	Group,
	Loader,
	Progress,
	Stack,
	Text,
} from "@mantine/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";
import styles from "@/components/CheckForUpdates.module.css";
import { CHECK_FOR_UPDATES_EVENT } from "@/lib/constants";

type UpdateCheckOutcome =
	| { status: "update_available"; update: Update }
	| { status: "up_to_date"; currentVersion?: string }
	| { status: "error"; message: string };

// A shared promise to maintain the state of the ongoing update check
// across multiple openings and closings of the update dialog.
let sharedCheckPromise: Promise<UpdateCheckOutcome> | null = null;

async function runUpdateCheck(): Promise<UpdateCheckOutcome> {
	try {
		const update = await check();

		if (!update) {
			return { status: "up_to_date", currentVersion: await getVersion() };
		}

		return { status: "update_available", update };
	} catch (error) {
		return {
			status: "error",
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

function startOrJoinCheck() {
	if (sharedCheckPromise) return sharedCheckPromise;

	const task = runUpdateCheck()
		.then((result) => result)
		.finally(() => {
			sharedCheckPromise = null;
		});

	sharedCheckPromise = task;
	return task;
}

export function CheckForUpdates() {
	const [result, setResult] = useState<UpdateCheckOutcome | null>(null);
	const [isChecking, setIsChecking] = useState<boolean>(!!sharedCheckPromise);
	const [isUpdating, setIsUpdating] = useState(false);
	const [downloadedBytes, setDownloadedBytes] = useState(0);
	const [totalBytes, setTotalBytes] = useState(0);
	const [updateError, setUpdateError] = useState<string | null>(null);
	const [didInstall, setDidInstall] = useState(false);

	useEffect(() => {
		if (!sharedCheckPromise) return;

		sharedCheckPromise.then((res) => {
			setResult(res);
			setIsChecking(false);
		});
	}, []);

	useEffect(() => {
		let unlisten: (() => void) | undefined;

		const setupListener = async () => {
			unlisten = await listen(CHECK_FOR_UPDATES_EVENT, async () => {
				const window = getCurrentWindow();
				await window.show();
				await window.setFocus();

				const promise = startOrJoinCheck();
				setResult(null);
				setIsChecking(true);
				setDidInstall(false);
				setUpdateError(null);
				promise.then((res) => {
					setResult(res);
					setIsChecking(false);
				});
			});
		};

		setupListener().catch((error: unknown) => {
			setResult({
				status: "error",
				message: `Failed to subscribe to update events: ${String(error)}`,
			});
			setIsChecking(false);
		});

		return () => {
			unlisten?.();
		};
	}, []);

	const updateResult =
		result && result.status === "update_available" ? result : null;
	const upToDateResult =
		result && result.status === "up_to_date" ? result : null;
	const errorResult = result && result.status === "error" ? result : null;
	const progress =
		totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0;

	const handleUpdate = async () => {
		if (!updateResult) return;

		setIsUpdating(true);
		setUpdateError(null);
		setDownloadedBytes(0);
		setTotalBytes(0);

		try {
			const update = updateResult.update;

			await update.downloadAndInstall((event) => {
				switch (event.event) {
					case "Started":
						setTotalBytes(event.data.contentLength ?? 0);
						break;
					case "Progress":
						setDownloadedBytes((prev) => prev + event.data.chunkLength);
						break;
					default:
						break;
				}
			});

			setDidInstall(true);
		} catch (error) {
			setUpdateError(error instanceof Error ? error.message : String(error));
		} finally {
			setIsUpdating(false);
		}
	};

	const handleClose = async () => {
		const window = getCurrentWindow();
		await window.hide();
	};

	return (
		<Center className={styles.root}>
			<Box className={styles.panel}>
				{isChecking && (
					<Group className={styles.checkingRow}>
						<Loader size="sm" />
						<Text className={styles.dimmedText}>Checking for updates...</Text>
					</Group>
				)}

				{updateResult && (
					<Stack className={styles.updateStack}>
						<Group className={styles.updateHeader}>
							<Group className={styles.updateHeaderLeft}>
								<Badge color="orange" variant="filled" radius="xl">
									Update available
								</Badge>
								<Text className={styles.versionText}>
									v{updateResult.update.version}
								</Text>
							</Group>
							{updateResult.update.currentVersion ? (
								<Text className={styles.currentVersionText}>
									Current version: v{updateResult.update.currentVersion}
								</Text>
							) : null}
						</Group>

						<Text className={styles.sectionTitle}>New version found</Text>
						{updateResult.update.date ? (
							<Text className={styles.releaseDateText}>
								Released on: {String(updateResult.update.date)}
							</Text>
						) : null}

						<Group className={styles.actions}>
							<Button
								color="indigo"
								onClick={handleUpdate}
								loading={isUpdating}
								disabled={didInstall}
							>
								{didInstall ? "Installed" : "Update"}
							</Button>
							<Button
								variant="default"
								onClick={handleClose}
								disabled={isUpdating}
							>
								Remind me later
							</Button>
						</Group>

						{isUpdating && (
							<Stack className={styles.progressSection}>
								<Text className={styles.progressText}>
									{totalBytes > 0
										? `Downloading ${progress.toFixed(1)}%...`
										: "Preparing update..."}
								</Text>
								{totalBytes > 0 ? (
									<Progress value={progress} />
								) : (
									<Loader size="xs" />
								)}
							</Stack>
						)}

						{didInstall && (
							<Text className={styles.installSuccessText}>
								Update installed. Restart the app to finish.
							</Text>
						)}

						{updateError && (
							<Text className={styles.errorText}>{updateError}</Text>
						)}
					</Stack>
				)}

				{upToDateResult && (
					<Stack className={styles.upToDateStack}>
						<Badge color="green" variant="filled" radius="xl">
							Up to date
						</Badge>
						<Text className={styles.sectionTitle}>
							You are using the latest version
						</Text>
						<Text className={styles.dimmedText}>
							{upToDateResult?.currentVersion
								? `Current version: v${upToDateResult.currentVersion}`
								: "No newer updates are available right now."}
						</Text>
						<Button onClick={handleClose} variant="default">
							Close
						</Button>
					</Stack>
				)}

				{errorResult && (
					<Stack className={styles.errorStack}>
						<Text className={styles.centerText}>
							An error occurred while checking for updates
						</Text>
						<Text className={styles.centerDimmedText}>
							{errorResult.message}
						</Text>
					</Stack>
				)}
			</Box>
		</Center>
	);
}
