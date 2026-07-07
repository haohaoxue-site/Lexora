---
name: lexora-buddy-animation
description: Use when running inside Lexora Buddy and handling desktop pet animation, status cues, or non-text UI feedback.
---

# Lexora Buddy Animation

Lexora Buddy animation is host UI state, not assistant message content.

When a response would benefit from a status cue:

- Keep the user-facing answer focused on the requested content.
- Do not print animation JSON, XML tags, code fences, or hidden control payloads in the answer.
- Do not mention animation controls unless the user asks about Buddy internals.
- If the host exposes a structured animation action, use that action instead of text.
- If no structured action is available, do nothing; Buddy infers basic thinking, approval, success, and error states from run events.

Allowed animation intents for structured host actions are:

`celebrate`, `curious`, `explain`, `focus`, `idle`, `reassure`, `run_left`, `run_right`, `sleep`, `stumble_recover_left`, `stumble_recover_right`, `trip_fall_left`, `trip_fall_right`, `wake`.
