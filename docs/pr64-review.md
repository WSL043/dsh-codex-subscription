# PR #64 review

Reviewed head: `c44dc11baa917da725a167746489f413e1f07911`, contributor `teron131`.

## Accepted changes

- Transport failure marks a sketch failed only while drawing. Idle, stopped and finished states remain accurate. The contributor's regression test is retained.
- Quota resets start collapsed using native details/summary, with the available count visible. Existing acknowledgment, countdown and confirmation are unchanged; no reset was consumed.

These changes were extracted from source and rebuilt, with contribution credit retained in commit `431e584`.

## Responsive layout decision

Keep responsive settings reflow and visible composer quota controls. Do not adopt full-settings horizontal scrolling or automatic quota/sketch hiding. The proposed hiding depends on locating an undocumented wrapping-flex ancestor; this adds host-layout coupling for behavior we do not want. This is a product and maintenance decision, not a claim that all proposed code is defective.

Narrow reset-card inspection found that the general full-width actions rule squeezed expiry text into an unreadable column even though overflow checks passed. A local fix gives actions their natural width and lets reset-card contents wrap. Other settings keep their existing responsive layout.

## Acceptance

- Full suite: 518 passed, 3 opt-in real-PATH tests skipped, zero failures.
- Official DSH 0.1.7-rc.2 dependency behavior suite: 406 passed, zero failures.
- Actual DSH 0.1.7-rc.2: percentage, forecast and progress-bar quota modes checked; original progress-bar setting restored. Forecast without history correctly shows pending estimation.
- Exact stylesheet component fixtures: Chinese and English at 280, 340, 480 and 720 px inspected, with no horizontal overflow or metadata/action overlap. Visual inspection confirms readable expiry text after the local fix. These are component checks, not a claim of full-host narrow-viewport acceptance.
- No model request or quota reset was consumed.
- The contributor-reported subagent runtime test passes with current dependencies and is not treated as a reproduced PR defect.

Disposition: partially adopted for the next version; close without merging the complete PR. These local changes have not been released.
