# AGENTS.md

Plume is a Linux-only Tauri 2 desktop app: React 18 + TypeScript/Vite frontend, Rust backend.
UI copy, Rust error messages, and comments are French; keep new user-facing strings French.

## Commands

- Install: `npm install`
- Full app dev: `npm run tauri dev` — Tauri starts Vite itself via `beforeDevCommand`; do not start Vite separately. Vite is pinned to port 1420 with `strictPort`, so a busy port fails instead of picking another.
- Frontend-only dev: `npm run dev` — useful for UI work, but IPC/`invoke` calls fail outside the Tauri webview.
- Frontend lint: `npm run lint` (ESLint, config in `eslint.config.js`); `npm run lint:fix` autofixes.
- Frontend check/build: `npm run build` = `tsc --noEmit && vite build`. `strict` and `noUnusedLocals` are enabled, so unused imports/variables fail the build.
- Rust check: `cargo check --manifest-path src-tauri/Cargo.toml` (or `cd src-tauri && cargo check`).
- Rust format/clippy: `cd src-tauri && cargo fmt -- --check` and `cargo clippy -- -D warnings`.
- Bundle: `npm run tauri build`; outputs under `src-tauri/target/release/bundle/`.
- No test suite is configured. Quick local verification: `npm run lint`, `npm run build`, `cargo check`; CI also runs the checks below.

## CI and release

- `.github/workflows/ci.yml` runs on push and pull requests to `dev`: ESLint (`npm run lint`), `tsc --noEmit`, `npm run tauri build`, `cargo check`, `cargo fmt -- --check`, and `cargo clippy -- -D warnings`.
- `.github/workflows/release.yml` runs on every push to `main` and via `workflow_dispatch`. It builds Ubuntu 22.04 (`.deb`/`.rpm`/`.AppImage`), Windows (`.msi`/`.exe`), and macOS Apple Silicon + Intel (`.dmg`), then publishes a GitHub release with `tauri-apps/tauri-action`.
- The release tag/name use `__VERSION__`, replaced with the version in `src-tauri/tauri.conf.json`; bump that version to create a new release tag. The workflow needs `contents: write` and uses `GITHUB_TOKEN`; Tauri update-signing secrets are optional and currently commented out.

## Architecture and page wiring

- `src/core/` = shared IPC, formatting, layout, settings, and UI atoms.
- `src/pages/` = one folder per feature page. `src/pages/registry.ts` array order is the sidebar order.
- `src-tauri/src/shared/` = filesystem/scanner helpers; `src-tauri/src/modules/` = one Rust module per page's IPC commands.

Adding or changing a page requires all of these:

1. `src/pages/<page>/index.ts` exporting `page` (`id`, `label`, `icon`, `component`), then import it in `src/pages/registry.ts`.
2. `src-tauri/src/modules/<page>/mod.rs` with `#[tauri::command]` functions returning `Result<T, String>`.
3. Add `pub mod <page>;` in `src-tauri/src/modules/mod.rs`.
4. Register every command in `tauri::generate_handler![...]` in `src-tauri/src/main.rs`.

Frontend commands go through `call<T>()` from `@/core/ipc`, not `invoke` directly. `@/` is the alias for `src/` (configured in both `vite.config.ts` and `tsconfig.json`).

## IPC and data conventions

- Serde controls JSON field names. Most multi-word structs add `#[serde(rename_all = "camelCase")]` (home, scanner); `modules/applications` does not, so its TypeScript types intentionally use `snake_case`. Match the Rust output exactly instead of assuming camelCase.
- For blocking filesystem scans or package commands in async commands, wrap the work in `crate::shared::blocking(...)` (`tauri::async_runtime::spawn_blocking`) rather than doing it inline.

## Safety rules

- Never permanently delete user files; use `trash::delete`/`delete_all`. Only `~/.cache/*` and the trash itself may be emptied directly (see `modules/clean`).
- Validate paths under the user's home with `fsutil::is_inside(&fsutil::home(), path)`; reject anything outside.
- Privileged package operations should go through `pkexec` (see `modules/updates::run_root`). The applications module currently shells out to `sudo` via `sh -c`; align it with `pkexec` when touching it.
- `scanner::scan` skips hidden directories and its `SKIP` list (`node_modules`, `target`, `dist`, `vendor`, etc.); reuse it instead of reimplementing home walking.

## Scope gotchas

- `updates` supports apt, pacman, and dnf. `applications` is Debian-oriented and only lists/uninstalls apt, snap, and flatpak.
- Runtime depends on Linux tools: `pkexec`/polkit, `xdg-open`, `/sys/class/hwmon`, and optional `nvidia-smi`. Build prerequisites for Tauri are in `README.md`.
- Settings persist in `localStorage` under `plume.settings.v1`; themes are driven by CSS variables in `src/styles/global.css`.
- `GEMINI.md` contains older project notes. Where it conflicts with this file or the code, trust the code.
