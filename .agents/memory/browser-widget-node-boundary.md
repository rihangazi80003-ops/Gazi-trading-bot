---
name: Browser widget in Node package
description: How browser-facing chart code coexists with the Node bot build.
---

Browser-facing widget code can use DOM types by including the `DOM` library in
the package TypeScript configuration, but it must not assume `document` or
`HTMLElement` exists at runtime. Resolve the document through `globalThis` and
allow a missing container so importing or instantiating the widget in Node stays
safe.

**Why:** The bot package compiles both Telegram infrastructure and the optional
dashboard widget, while the bot process itself has no browser globals.

**How to apply:** Keep rendering isolated behind a container check, provide
an injectable document for browser/test use, and run a no-DOM smoke test after
changes to the widget.