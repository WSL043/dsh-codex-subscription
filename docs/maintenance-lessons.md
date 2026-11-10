# Maintenance and verification practices

See the [documentation policy](documentation-policy.md), [architecture](ARCHITECTURE.md) and [DSH extension contracts](dsh-plugin-contracts.md).

## Before changing code

- Identify the user outcome, affected operations, existing behavior to preserve and completion criteria.
- Keep bug fixes reviewable. Handle unrelated redesigns and refactoring separately.
- Check the host's extension points for conversations, queues, jobs, approvals, attachments, settings, retries and plugin management.
- Record existing local changes and preserve other working copies and shared dependencies.

## Verification scope

| Check | Additional evidence needed |
| --- | --- |
| Unit, fixture or fault-injection tests | Rendered UI or live service behavior |
| Official host loads the plugin and registers a tool | Successful task execution and usable output |
| HTTP success or parameter acceptance | Completed response, actual model, metering and quality |
| Settings write acknowledgment | Persistence and UI state after restart |
| Web or a single OS | Desktop, Portable or other platforms |
| Digital audio or protocol tests | Physical devices, audio quality and acoustic echo |
| Manual dry run or a run with no updates | Scheduled execution, an eligible update and publication |

Record the commit, actual backend, host version, OS, distribution, account and device conditions. Include failures, skips and unreproduced conditions.

## Code and data invariants

- Base fixtures on real host events and external contracts. Preserve async iteration, prepared calls, cancellation, offloading and rehydration.
- Read credentials and account identity from the same snapshot. Invalidate late responses during account switches and refresh. Keep secrets in credential storage.
- Prevent asynchronous saves, restores and image preparation from overwriting newer edits or another conversation. Track the lifetimes of session references and file-operation locks.
- Preserve settings the user changed after a temporary override. Record successful operations and cleanup failures independently.
- Determine whether the provider accepted an interrupted request before retrying. Respect the selected model, route, billing and permissions.
- Check subtask permissions and the actual tool list. Verify what the `never` approval mode permits. Keep approval and permission changes under user control.
- Record requested and returned model and dimensions, payload size and billed tokens, and observations and forecasts distinctly. Preserve unknowns.
- Measure the affected behavior. Pixel error, overflow, cache hit rate and line count are supporting measurements.

## Releases and operations

1. Identify the source commit, release tag, npm package, candidate and installed build. Use published versions in installation examples.
2. Start compatibility patches from the immutable tag matching the published package.
3. Review all open issues and pull requests before publishing. Record the disposition and remaining work for each relevant item.
4. Define the hypothesis and stopping condition. Investigate setup failures before attributing them to product compatibility.
5. Use a test profile for settings writes and fault injection. If testing in the daily profile, record any temporary settings and verify restoration.
6. Verify backend restart, window recovery and package installation as applicable. Report side effects, cleanup and gaps.
7. Move superseded procedures out of current guides. Preserve unique decisions and failures in the appropriate public or private records.

## Verification record

- Problem and completion criteria
- Commit, package, DSH version, OS and distribution
- Hypothesis, reproduction and fix
- Automated tests and fault injection
- Host, account, rendered UI and physical device checks
- Failures, skips, unverified conditions and unreproduced reports
- Temporary changes and cleanup
- Issue and PR disposition
- Merge, release and installation status

Publish the reproducible evidence required for the audience. Keep private paths, conversations, credentials and raw account responses local.
