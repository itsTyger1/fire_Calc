---
name: done
description: Check whether the requested fix or feature is already implemented, tested, deployed, or still outstanding.
---

When the user invokes `/done`, assess the current request using available repository state, tests, deployment state, and conversation context.

Report clearly:

- Implemented: yes/no/partial, with evidence.
- Tested: what passed, failed, or was not run.
- Deployed or released: yes/no/unknown, with evidence.
- Outstanding work or user decision, if any.

Do not claim deployment from a local build alone. Use concise evidence and say when external state cannot be verified.
