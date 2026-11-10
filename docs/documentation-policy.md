# Documentation policy

Write public development and maintenance documentation in English. The user guides and README translations serve their respective audiences.

| Material | Location | Contents |
| --- | --- | --- |
| Current user guides | Public repository | Setup, supported features, compatibility and security. Describe availability by release. |
| Current developer guides | Public repository | Architecture, extension contracts and reproducible validation procedures. |
| Historical technical records | `docs/archive/` | Previously public records and sanitized findings with the original version, conditions and limitations. |
| Private maintenance records | Ignored `.local/` directory or private storage outside the repository | Conversation-derived history, detailed audits and handoffs, local paths and work in progress. |
| Temporary validation files | Ignored `.artifacts/` directory or equivalent local storage | Logs, traces, packages and screenshots. Retain necessary evidence and remove reproducible temporary files after validation. |
| Credentials | DSH credential storage | OAuth tokens, authorization codes, cookies and pairing credentials. Keep them out of documentation, conversations and diagnostic logs. |

Public procedures should work without access to private material. Before publishing:

1. Check the intended audience and whether the material belongs in the repository or the npm package.
2. Review the staged diff for private paths, credentials, account values, raw responses, conversation excerpts and links to local-only records.
3. Record the tested version, procedure, result and limits of each check. Keep past and current procedures identifiable.
4. Run `node --test tests/documentation.test.mjs` and review the resulting links. Use [package.json](../package.json) and the packed artifact to verify what npm includes.
