# Legal site (Privacy + Terms)

Static pages served by nginx on Railway (project `pantry-party`, service
`legal`). The **source of truth is `docs/legal/PRIVACY.md` + `TERMS.md`** —
`site/` is generated from them (placeholders filled: app name, dates, contact
email) and committed so deploys are reproducible.

Deploy after regenerating:

```sh
railway up web/legal --path-as-root --service legal --detach
```

Apple App Store Connect wants the privacy-policy URL from this service
(`/privacy/`); the terms live at `/terms/`.
