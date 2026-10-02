---
"murici": patch
---

Fix macOS code signing in CI: update electron-builder to 26.16.1, which unlocks the temporary signing keychain with its own password instead of the certificate's import password.
