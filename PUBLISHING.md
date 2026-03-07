# Chrome Web Store – Publishing Justifications

This document contains the answers required on the **Privacy practices** tab of
the Chrome Web Store Developer Dashboard before the extension can be published.

---

## Single Purpose Description

DeepWiki Bookmarker automatically tracks the DeepWiki pages a user visits,
organises those pages by repository, and lets the user revisit any saved session
from a convenient browser side panel.

---

## Permission Justifications

### Host permission – `https://deepwiki.com/*`

The extension's only purpose is to track browsing activity on
[deepwiki.com](https://deepwiki.com). The background service worker listens for
`chrome.tabs.onUpdated` events and inspects each new URL. The host permission
restricts that inspection to `deepwiki.com` exclusively; no other origin is ever
accessed or monitored.

### `tabs`

The `tabs` permission is required so the background service worker can read the
URLs of tabs that navigate to `deepwiki.com`. When a tab's URL changes,
`chrome.tabs.onUpdated` fires and the new URL is parsed to determine whether it
represents a repository page or a session page. Without this permission the
extension cannot detect navigation events and therefore cannot record any history.

### `storage`

Repository and session history is persisted locally with
`chrome.storage.local` so that data survives browser restarts and is
immediately available when the side panel opens. The stored data consists solely
of DeepWiki URLs and user-supplied session aliases. Nothing is transmitted off
the device.

### `sidePanel`

The extension's entire user interface is presented as a browser side panel. When
the user clicks the extension icon, `chrome.sidePanel.open()` is called to show
the panel. Without this permission the extension has no way to display the saved
repository and session list to the user.

### Remote code

The extension **does not use remote code**. All JavaScript is bundled at build
time and shipped inside the extension package. There are no calls to `eval()`,
no `new Function(…)`, and no scripts fetched from or injected from external
URLs at runtime.

---

## Data Usage

| Data collected | Purpose | Shared with third parties | Sold |
|---|---|---|---|
| DeepWiki URLs visited by the user | Display and organise session history in the side panel | No | No |
| Optional user-supplied session aliases | Let the user label sessions for easier identification | No | No |

All data is stored exclusively in `chrome.storage.local` on the user's own
device. The extension never transmits, uploads, or shares any data with external
servers or third parties. No personal information beyond the URLs the user
voluntarily browses on deepwiki.com is collected.

I certify that my data usage complies with the
[Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/).
