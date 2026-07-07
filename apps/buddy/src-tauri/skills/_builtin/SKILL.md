---
name: lexora-buddy-host
description: Use when the native Lexora Buddy desktop runtime needs host-owned desktop-pet actions without shell commands or IPC scripts.
---

# Lexora Buddy Host

This host-only skill is injected by the native Lexora Buddy desktop app. The Buddy host owns local desktop capabilities. Do not run commands, do not call Node scripts, and do not connect to sockets.

External clients use separate distributable skills. This built-in host skill must not include script, socket, launch, or installation instructions.

## Protocol

When the user asks for non-text Buddy desktop feedback, include exactly one hidden host action block in the assistant answer:

```txt
<lexora_buddy_host_action>{"version":1,"action":"animation","animation":"celebrate","durationMs":3000,"priority":"high","reason":"user_requested_pet_feedback"}</lexora_buddy_host_action>
```

Then answer the user naturally in text. The hidden block is consumed by Buddy and removed from the visible transcript.

## Actions

### Animation

```txt
<lexora_buddy_host_action>{"version":1,"action":"animation","animation":"celebrate","durationMs":3000,"priority":"high","reason":"done"}</lexora_buddy_host_action>
```

### Move

```txt
<lexora_buddy_host_action>{"version":1,"action":"move","target":{"kind":"center"},"after":"celebrate","reason":"move_to_center"}</lexora_buddy_host_action>
```

### Sequence

```txt
<lexora_buddy_host_action>{"version":1,"action":"sequence","steps":[{"type":"move","target":{"kind":"center"}},{"type":"animation","animation":"celebrate","durationMs":3000},{"type":"move","target":{"kind":"home"},"after":"sleep"}],"reason":"center_cast_return_sleep"}</lexora_buddy_host_action>
```

## Animations

Use one of these values:

- `celebrate`
- `curious`
- `explain`
- `idle`
- `reassure`
- `run_left`
- `run_right`
- `sleep`
- `stumble_recover_left`
- `stumble_recover_right`
- `thinking`
- `working`
- `trip_fall_left`
- `trip_fall_right`
- `wake`

## Targets

- `{"kind":"center"}`
- `{"kind":"home"}`
- `{"kind":"edge","edge":"left"}` with `left`, `right`, `top`, or `bottom`
- `{"kind":"position","x":960,"y":540}`
- `{"kind":"x","x":960}`

## Fields

- `version`: always `1`.
- `action`: required, one of `animation`, `move`, `sequence`.
- `animation`: required for animation actions and animation steps.
- `target`: required for move actions and move steps.
- `steps`: required for sequence actions, 1 to 8 steps.
- `after`: optional animation name for move actions.
- `durationMs`: optional for animation, 100 to 30000.
- `priority`: optional, one of `background`, `normal`, `high`, `urgent`.
- `reason`: optional short snake_case reason.

## Mapping

- dance, celebrate, success, complete: `celebrate`
- think, focus, work: `working`
- explain, teach, show: `explain`
- comfort, reassure: `reassure`
- inspect, wonder, ask: `curious`
- sleep, rest, quiet: `sleep`
- wake, start: `wake`
- move to screen center: move target `center`
- move back to the usual resting place: move target `home`

For multi-step pet movement, use `sequence`. Do not fall back to shell commands.
