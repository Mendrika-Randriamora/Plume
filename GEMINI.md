# GEMINI.md - Plume Project Context & Guidelines

## Project Overview

**Plume** is a lightweight Linux desktop application built with **Tauri 2 (Rust + React 18 / TypeScript)** designed to help users keep their system clean and performant. It manages system memory, disk space, temporary files, package updates, obsolete packages, and uninstallation of applications.

- **Frontend:** React 18, TypeScript, Vite, Lucide React icons, pure CSS (`global.css`) with dynamic custom property themes.
- **Backend:** Tauri v2 (Rust), `sysinfo`, `walkdir`, `dirs`, `trash`, `serde`.
- **Target OS:** Linux (Debian/Ubuntu, Fedora, Arch Linux).

---

## Key Commands

### Development
```bash
npm install            # Install Node.js dependencies
npm run tauri dev      # Run full application in development mode (Rust + React)
npm run dev            # Start Vite dev server alone (frontend only on port 1420)
```

### Build & Check
```bash
npm run build          # Run TypeScript check (tsc --noEmit) and Vite build
npm run tauri build    # Compile release build & bundle packages (.deb, .rpm, .AppImage) in src-tauri/target/release/bundle/
```

### Rust Cargo Commands (from `src-tauri/` directory)
```bash
cd src-tauri && cargo check    # Type-check Rust codebase
cd src-tauri && cargo build    # Build Rust backend
```

---

## Code Base Structure & Architecture

```
plume/
├── src/                        # Frontend React + TypeScript codebase
│   ├── App.tsx                 # Main application shell & navigation
│   ├── main.tsx                # Entry point & theme initializer
│   ├── core/                   # Core shared UI & utilities
│   │   ├── ipc.ts              # Tauri invoke wrapper call<T>()
│   │   ├── format.ts           # Formatting helpers (bytes, time, dates)
│   │   ├── layout/             # Sidebar, navigation context
│   │   ├── settings/           # Settings state store, themes, permissions
│   │   └── ui/                 # Reusable atomic UI components
│   ├── pages/                  # Page modules (one directory per feature)
│   │   ├── registry.ts         # Central page registry (menu order)
│   │   ├── home/               # Dashboard / system stats page
│   │   ├── updates/            # System updates & orphan package cleaner
│   │   ├── clean/              # Large files & temp files cleaner
│   │   ├── applications/       # Installed app manager & uninstaller
│   │   └── settings/           # Preferences & permission toggles
│   └── styles/
│       └── global.css          # Central stylesheet (CSS variables, responsive design)
└── src-tauri/                  # Backend Rust codebase
    ├── Cargo.toml              # Rust crate dependencies & release profiles
    ├── tauri.conf.json         # Tauri configuration
    └── src/
        ├── main.rs             # Tauri application entry point & registered command handlers
        ├── shared/             # Shared Rust utilities
        │   ├── fsutil.rs       # File system helpers (is_inside, dir_size, home)
        │   └── scanner.rs      # /home file tree scanner with ignore rules
        └── modules/            # Backend IPC command implementations
            ├── home/           # Stats reading, hardware sensors, file manager opening
            ├── updates/        # Package manager detection, update checks, package removal
            ├── clean/          # Scanning trash, temp files, trash deletion
            └── applications/   # Desktop file parsing, application uninstallation
```

---

## Architectural & Development Conventions

### 1. Adding a New Page / Feature
To add a new feature page, follow this modular pattern:
1. **Frontend Page Directory (`src/pages/<feature-name>/`):**
   - `index.ts`: Export a `page` object (`PageDef`: `id`, `label`, `icon`, `component`).
   - `<Feature>Page.tsx`: Main page component.
   - `api.ts`: API wrapper functions using `call<T>('command_name', { args })`.
   - `types.ts`: TypeScript interfaces matching Rust structs (camelCase).
   - `components/`: Feature-specific subcomponents.
2. **Register Page:** Import and add `page` to `pages` array in `src/pages/registry.ts`.
3. **Backend Rust Module (`src-tauri/src/modules/<feature-name>/mod.rs`):**
   - Implement `#[tauri::command]` functions returning `Result<T, String>`.
   - Expose module in `src-tauri/src/modules/mod.rs`.
   - Register commands in `tauri::generate_handler![...]` inside `src-tauri/src/main.rs`.

### 2. Frontend Conventions
- **Path Alias:** Use `@/` to import from `src/` (e.g., `import { call } from "@/core/ipc"`).
- **IPC Handling:** Always use `call<T>(cmd, args)` from `@/core/ipc` instead of directly calling `invoke`. It standardizes error formatting.
- **Styling:** Vanilla CSS using CSS variables defined in `global.css`. Theme colors are derived dynamically from `--base` and `--ink`. Avoid inline styles where utility/component CSS classes exist.
- **Settings Persistence:** Stored in `localStorage` (`plume.settings.v1`) and applied dynamically to document root attributes (`data-theme`, CSS variables).

### 3. Rust Backend Conventions & Safety Standards
- **File Deletion Rules:** Never use permanent deletion (`std::fs::remove_file` / `remove_dir_all`) for user files. Use the `trash` crate (`trash::delete`) to move files to system trash. The only exceptions are clearing `~/.cache/*` contents and emptying the trash.
- **Path Verification:** Always restrict home-related file operations to the user's home directory (`/home/...`) by validating paths with `fsutil::is_inside(&fsutil::home(), &path)`.
- **System Commands & Elevation:** Package manager actions (apt, pacman, dnf) requiring root privileges must be run via `pkexec`.
- **Serde Field Naming:** Rust structs exposed via IPC should use `#[serde(rename_all = "camelCase")]` to follow JavaScript naming conventions.

---

## Hardware & System Support Notes
- **Temperatures:** Hardware sensor data is read via Linux `/sys/class/hwmon`. Fallback to `nvidia-smi` for NVIDIA GPUs. If a sensor is unavailable, handle missing values gracefully without failing.
- **Package Managers:** Automatically detects installed system package managers (`apt`, `pacman`, `dnf`) to handle package lists, updates, and removals across different Linux distributions.
