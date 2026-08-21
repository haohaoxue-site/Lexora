---
name: lexora-buddy-animation
description: Use when the user asks Lexora Buddy to move, emote, celebrate, rest, or perform a visible desktop-pet action.
---

# Lexora Buddy Animation

Use the `lexora_buddy_pet` tool for visible desktop-pet actions. Choose exactly one of these semantic macros:

- `thinking`: show focused reasoning.
- `working`: show active work.
- `awaitApproval`: wait attentively for the user.
- `celebrate`: react to a successful outcome.
- `sad`: react softly to a failure or blocker.
- `curious`: react to ambiguity or exploration.
- `explain`: accompany a concise explanation.
- `returnHome`: return to the normal resting position.

Do not execute shell commands for pet actions. Do not invent macros, parameters, sequences, durations, positions, or coordinates. If the tool reports that the pet is unavailable, continue helping with the user's main task without attempting an alternate control path.
