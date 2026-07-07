---
name: lexora-buddy-animation
description: Use when an external runtime needs to control an installed Lexora Buddy desktop pet through the packaged IPC script.
---

# Lexora Buddy Animation

This skill controls an installed Lexora Buddy desktop pet from outside the native Buddy chat window.

If the conversation is already inside the native Lexora Buddy desktop chat, do not use this external skill contract. Buddy injects its own host-only skill that emits hidden host actions and does not run shell commands.

## Requirements

- Lexora Buddy must be installed through the platform package, such as `lexora-buddy-bin` on pacman/AUR or `lexora-buddy` on deb/apt.
- The desktop Buddy runtime must be running, or the `lexora-buddy` binary must be launchable from `PATH`.
- The skill does not depend on the Lexora source repository.

## Reference Routing

- Runtime socket, package names, launch and diagnostics: read `references/runtime-installation.md`.
- Screen edges, workarea and visibility rules: read `references/screen-and-visibility.md`.
- `center`, `home`, `original`, `edge` and explicit coordinate target semantics: read `references/position-targets.md`.
- Animation names and mappings: read `references/animations.md`.
- Multi-step action sequences and wait behavior: read `references/action-sequences.md`.

## Commands

Use `<skill_dir>` for the directory containing this `SKILL.md`.

```bash
node <skill_dir>/scripts/lexora-buddy-pet.mjs diagnose
node <skill_dir>/scripts/lexora-buddy-pet.mjs state
node <skill_dir>/scripts/lexora-buddy-pet.mjs capabilities

node <skill_dir>/scripts/lexora-buddy-pet.mjs animation celebrate
node <skill_dir>/scripts/lexora-buddy-pet.mjs move edge left --after celebrate
node <skill_dir>/scripts/lexora-buddy-pet.mjs move center
node <skill_dir>/scripts/lexora-buddy-pet.mjs move home --after sleep

node <skill_dir>/scripts/lexora-buddy-pet.mjs perform center-cast-return-sleep --animation celebrate --duration-ms 2000
```

For custom multi-step movement, use `sequence --json` or `sequence --file`; do not hand-write socket payloads.

## Response Rule

Run the control command first, then give the user a short natural-language confirmation. Show script output only when the user asks for diagnostics or when the control command fails.
