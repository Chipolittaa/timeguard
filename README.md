# TimeGuard

TimeGuard is a lightweight Chrome extension for setting daily time limits on distracting websites. It tracks active browser time, shows usage progress, and blocks access when a configured limit is reached.

Built for Manifest V3 with plain HTML, CSS, JavaScript, and native Chrome APIs. There are no runtime dependencies, analytics, accounts, or external backend.

## Features

- Daily limits for websites and their subdomains
- Active-tab tracking with automatic pause when the browser loses focus
- Immediate blocking when a limit is reached
- Popup with current usage and progress indicators
- Settings page for managing rules and statistics
- Daily reset with a countdown to midnight
- Local-only storage through `chrome.storage.local`

## Architecture

```text
manifest.json       Extension configuration and permissions
background.js       Tracking, persistence, and blocking logic
popup.html/js       Compact usage overview
settings.html/js    Rule management and daily statistics
blocked.html/js     Limit screen and reset countdown
icons/              Extension icons
```

The background service worker listens for tab activation, navigation, tab closing, and browser focus changes. It accumulates active time for the matching domain and periodically checks the configured limit.

Data is stored locally:

```text
rules                [{ domain, limitMinutes }]
spent_YYYY-MM-DD     { domain: seconds }
blockedInfo          { domain, limitMinutes }
```

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome or another Chromium-based browser.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the project directory.

## Usage

1. Open TimeGuard settings from the toolbar popup.
2. Enter a domain or full URL, such as `youtube.com`.
3. Set a daily limit in minutes.
4. Monitor progress in the popup. Each rule applies to the domain and all its subdomains.

## Privacy

Visited URLs are processed only inside the browser to match configured domains. Rules and usage statistics remain in `chrome.storage.local`.

## Permissions

- `storage` stores rules and daily counters
- `tabs` identifies the active tab and redirects it when required
- `webNavigation` supports navigation-aware tracking
- `alarms` wakes the Manifest V3 service worker
- `<all_urls>` allows user-defined rules to work on any website

## Tech stack

- Chrome Extensions Manifest V3
- JavaScript (ES2020+)
- HTML5 and CSS3
- Chrome Tabs, Storage, Alarms, and Runtime APIs

## Roadmap

- Weekly usage reports
- Temporary focus sessions
- Settings export and import
- Automated tests for domain matching and time accounting
- Additional interface languages

## License

Released under the [MIT License](LICENSE).
