# On It: Agent Instructions

Read **WORK-SPLIT.md** before any task. It decides who builds what.

- Freebuff (and any other non-Claude-Code agent): build everything the user does not
  see. Do not touch UI. When a visible part has no design, stop and write a Handoff Note.
- Claude Code: build only what the user sees, only from the Claude Design HTML in `design/`.

Project rules for everyone are in **CLAUDE.md** (audit first, one commit per item, tests,
preview-only testing, migration safety). Read it too.
