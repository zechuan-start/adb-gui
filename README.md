# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## GitHub Packaging

- Manual package: run the `Package` workflow from GitHub Actions to build macOS, Windows, and Linux installers as workflow artifacts.
- Release package: push a `v*` tag, for example `v0.1.0`, to create a draft GitHub Release with installer assets and `latest.json`.
- Updater signing: set `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, then configure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub repository secrets before publishing signed updater artifacts.
