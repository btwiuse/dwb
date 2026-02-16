import { Flex, Text } from "@mantine/core";
import type { CSSProperties } from "react";
import styles from "@/components/TitleBar.module.css";

type TitleBarProps = {
	title: string;
	height: number;
};

export function TitleBar({ title, height }: TitleBarProps) {
	const titleBarStyle = {
		"--title-bar-height": `${height}px`,
	} as CSSProperties;

	return (
		<Flex
			className={styles.titleBar}
			data-tauri-drag-region
			style={titleBarStyle}
		>
			<Text className={styles.title} data-tauri-drag-region>
				{title}
			</Text>
		</Flex>
	);
}
