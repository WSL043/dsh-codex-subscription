# Development documentation

Use this index to find the current guides, compatibility information and maintenance checklist. See the [documentation policy](documentation-policy.md) for what belongs in the public repository.

## Current documentation

| Topic | Where to look |
| --- | --- |
| Installation and features | [README](../README.en.md), [user guide](GUIDE.en.md) and [Chinese user guide](GUIDE.zh-CN.md) |
| Contributions and testing | [Contributing](../CONTRIBUTING.md), [maintenance practices](maintenance-lessons.md) and [test guide](../tests/README.md) |
| Implementation | [Architecture](ARCHITECTURE.md) and [DSH extension contracts](dsh-plugin-contracts.md) |
| Desktop checks | [UI smoke tests](ui-smoke.md) |
| Sketch canvas | [Development and testing](sketch-maintenance.md) and [agent protocol](sketch-agent.md) |
| Context and quota | [Context budget](context-budget.md) and [quota forecast validation](quota-forecast-validation.md) |
| Diagnostics | [Diagnostics design](diagnostics-design.md) |
| Linux voice | [Native helper requirements](../native/README.md) |
| Past validation and design work | [Archive index](archive/README.md) |

<a id="compatibility"></a>

## Compatibility and distribution

- Use [compatibility.json](../compatibility.json) and the peer dependency range in [package.json](../package.json) for host compatibility.
- The [archive](archive/README.md) records the host versions and conditions used for past tests.
- Identify the exact commit, release tag, npm package or installed build under review. These can contain different code even when the version number matches.

<a id="documentation-checklist"></a>

## Documentation and usability checklist

Work through P1 first. Add the related issue and implementation links to the relevant row as findings are confirmed.

| ID | Priority | Area | Verified or changed | Remaining work |
| --- | --- | --- | --- | --- |
| D01 | P1 | Sign-in and quota | Official Desktop 0.2.2-rc.1 showed the signed-out state. Simulated responses covered expired sign-in, failed refresh, stale quota and recovery. Updated the refresh timing and stale quota label. | The [guide](GUIDE.en.md#sign-in-and-quota-status) describes each state. When an actual account expires or loses connectivity, verify that signing in again or retrying restores the reading. |
| D02 | P1 | Search and webpage reading | The [guide](GUIDE.en.md#web-search) explains the two settings and what to check when page reading fails. Official Desktop confirmed they can be changed independently. | Test Auto, DSH and Codex with real accounts. Check search results and page content independently. |
| D03 | P1 | UI, screenshots and language | Updated the model menu, prediction and image viewer documentation. Checked the structure and links of the eight localized READMEs. | Follow the [Desktop checks](ui-smoke.md) for the standard and subscription menus, Claude Style, image navigation and pins, and predictions during IME input. Refresh affected screenshots and check them for private information. |
| D04 | P1 | Compatibility and validation | Linked the compatibility metadata and historical test records. | Record the exact build, host, feature and test conditions before publishing. Identify the surfaces and account types actually exercised. |
| D05 | P2 | Duplication, translation and agent references | Moved detailed reasoning-cache documentation into the English and Chinese guides. | Compare the feature list, guide and [setting defaults](../src/preference-fields.js). Check UI labels, default values, both Chinese README copies and the language of linked guides. |
| D06 | P2 | Archive and moved links | Indexed past work and checked local Markdown links. | Review old links from issues and external documents. Keep each record's original environment and validation limits visible. |

## Updating documentation

- Update the current guide that owns the information. Link to it from other documents.
- Preserve unique findings, failures and open questions when moving historical records. Keep private reports and conversation-derived history in the ignored local maintenance area.
- Update references when moving files and run `node --test tests/documentation.test.mjs` to check paths and links.
