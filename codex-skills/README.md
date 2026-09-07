# Codex session command skills

This bundle contains six reusable Codex skills:

- `/tldr` — exactly three bullets, each under 10 words.
- `/huh` — one-line plain-English restatement.
- `/done` — implementation, testing, deployment, and outstanding-work check.
- `/remind` — session purpose, progress, decisions, blockers, and next step.
- `/close` — closeout audit and authorized cleanup/archive preparation.
- `/todo` — complete checked/unchecked session checklist.

## Install on another device

Copy the six skill folders into the Codex skills directory:

`%CODEX_HOME%\skills` (or `%USERPROFILE%\.codex\skills` when `CODEX_HOME` is unset)

The resulting layout should be:

```text
skills/
  tldr/SKILL.md
  huh/SKILL.md
  done/SKILL.md
  remind/SKILL.md
  close/SKILL.md
  todo/SKILL.md
```

Restart or refresh Codex, then invoke them as `/tldr`, `/huh`, `/done`, `/remind`, `/close`, or `/todo`.
