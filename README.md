# DeepWiki Browser

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="DeepWiki Browser Logo" width="20%" />
</p>

DeepWiki Browser (a.k.a. `dwb`) is a desktop application that automatically tracks
DeepWiki browsing sessions and organizes them by repository for easy navigation.

> [!NOTE]
> This application is an **unofficial** app for Devin and is not endorsed, provided, or supported by the developers of Devin.

<p align="center">
  <img src="assets/dwb.png" alt="DeepWiki Browser Demo" width="100%" />
</p>

## Installation

[![Latest Release](https://img.shields.io/badge/Release-latest-2ea44f?style=for-the-badge&logo=github)](https://github.com/ynqa/dwb/releases/latest)

### macOS

[![macOS DMG](https://img.shields.io/badge/macOS-DMG-111111?style=for-the-badge&logo=apple)](https://github.com/ynqa/dwb/releases/latest/download/DeepWiki.Bookmarker_universal.dmg)
[![macOS App Bundle](https://img.shields.io/badge/macOS-app.tar.gz-111111?style=for-the-badge&logo=apple)](https://github.com/ynqa/dwb/releases/latest/download/DeepWiki.Bookmarker_universal.app.tar.gz)

### Windows

[![Windows MSI](https://img.shields.io/badge/Windows-MSI-0078D4?style=for-the-badge&logo=windows)](https://github.com/ynqa/dwb/releases/latest/download/DeepWiki.Bookmarker_x64.msi)
[![Windows EXE](https://img.shields.io/badge/Windows-EXE-0078D4?style=for-the-badge&logo=windows)](https://github.com/ynqa/dwb/releases/latest/download/DeepWiki.Bookmarker_x64.exe)

### Linux

[![Linux AppImage](https://img.shields.io/badge/Linux-AppImage-f39c12?style=for-the-badge&logo=linux)](https://github.com/ynqa/dwb/releases/latest/download/DeepWiki.Bookmarker_amd64.AppImage)
[![Linux DEB](https://img.shields.io/badge/Linux-DEB-f39c12?style=for-the-badge&logo=debian)](https://github.com/ynqa/dwb/releases/latest/download/DeepWiki.Bookmarker_amd64.deb)
[![Linux RPM](https://img.shields.io/badge/Linux-RPM-f39c12?style=for-the-badge&logo=redhat)](https://github.com/ynqa/dwb/releases/latest/download/DeepWiki.Bookmarker_x86_64.rpm)

## Overview

`dwb` automatically tracks URL changes in the embedded DeepWiki WebView and manages the following data:

- Repositories
- Sessions (e.g. `search/xxx`) associated with each repository

## Features

- Display of repositories and their sessions
  - By automatic tracking of DeepWiki URL changes
- Right-click context menu for easy deletion of repositories and sessions from UI
  - Also renames the sessions for clarity
- Check for updates to notify users when a new version is available
