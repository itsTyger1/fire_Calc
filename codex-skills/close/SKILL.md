---
name: close
description: Prepare the current Codex session for archiving by auditing decisions, processes, worktrees, browsers, memory notes, and wiki documentation.
---

When the user invokes `/close`, perform a closeout audit for the current session.

First inspect and report:

- Outstanding decisions or required user input.
- Running development servers and related processes.
- Stale worktrees, branches, or temporary artifacts.
- Open browser sessions or tabs created for this task.
- Stale session notes or memory that should be retained.
- Relevant wiki or Markdown documentation that is missing or outdated.

Then, only when the user’s request clearly authorizes it and the target is unambiguous:

- Stop task-owned servers and processes.
- Remove task-owned temporary artifacts or stale worktrees using recoverable, scoped actions.
- Update relevant wiki/Markdown documentation with the session outcome.

Never delete broad directories, unrelated worktrees, user data, or shared resources. Do not silently discard uncommitted work. If cleanup requires a meaningful choice, report it as outstanding instead. End with a concise archive-readiness status and remaining actions.
