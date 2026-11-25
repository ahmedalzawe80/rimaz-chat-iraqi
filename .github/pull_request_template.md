## Summary

<!-- What changed and why? -->

## Scope and risk

- [ ] Repository organization/documentation only
- [ ] Application behavior or API change
- [ ] Persistence, uploads, sessions, or permissions change
- [ ] Build, CI, Docker, or deployment workflow change

## Validation

- [ ] `node --check server.js`
- [ ] `node --check verify.js`
- [ ] `npm test`
- [ ] Docker production build (when build/runtime files change)
- [ ] Documentation links and repository paths checked (when docs/layout change)
- [ ] Root and `public/` browser assets checked for required synchronization

## Data and release safety

- [ ] No production database, uploads, private media, or hosting volume was modified
- [ ] No secrets, credentials, local environment files, or backups were added
- [ ] Staging and backup/restore requirements are documented if this change affects runtime data
- [ ] `CHANGELOG.md` and relevant documentation were updated

## Remaining checks or known limitations

<!-- List anything not tested. Never describe CI as proof of live production health. -->
