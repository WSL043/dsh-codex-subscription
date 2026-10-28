# DSH 0.2.2-alpha.2 compatibility

2026-10-28. Preview-host support is included in plugin 3.2.0. Existing rc support and the stable development cohort remain unchanged.

## Changes

- Declare the exact alpha.2 host and its Cordis/Schemastery prereleases. Keep the stable development cohort and the default optional Codex component version on rc.4.
- Resolve Ultra's native Session record writer from the host, following the real CLI entry path before trying profile-local dependencies. Equal-version SDK copies have separate private Session brands; using the profile writer on a host Session caused a real request-preparation failure. Missing features in an older host are not borrowed from a newer profile.
- Recognize the native `isSeeded` fork marker when authorizing inherited original images. An exact image reference must still occur before the native inherited-event boundary; ordinary sessions and later images remain excluded.
- Forward alpha.2's step-time search/fetch readiness through the selected source and model gate. Subscription checks only read credential presence; they do not refresh tokens or perform searches. Auto retains its existing fallback policy, and explicitly selected sources do not gain cross-provider execution fallbacks.
- Align native SDK test fixtures with the new fetch selector, effective-config face and browser asset loader. The official install gate explicitly approves the two SDK build scripts already approved for its runner when they are installed in the profile instead.

## Acceptance

Validation used an isolated Windows Web host, Node 24.22.1, the official alpha.2 package cohort and copied existing sign-in data. The user's running Portable, kernel, configuration and sessions were not updated.

- Native alpha SDK behavior: 1,130 passed, zero failed, one conditional skip. Existing rc SDK/full checks: 1,310 passed, zero failed, five conditional skips. Skips cover the existing real-user PATH cases, unavailable first-party image projection fixture and a readiness API absent from the older SDK; the latter runs on alpha.2.
- A second isolated host reused the existing rc.3 kernel with the unmodified packed candidate: plugin activation, existing sign-in, a real subscription reply and native UI exception checks passed. The actual Portable process was not restarted or modified.
- Real subscription: plain conversation, Low-to-High reasoning change, retained multi-turn context, Codex search sources, readable fetched page content, and an actual generated image returned as a durable reference.
- Real native compaction completed and was reported as a phone compaction item. After restarting the isolated host and running Ultra, the model still recalled the pre-compaction fact.
- Ultra actually delegated to a native child, collected its reply and wrote a policy record. Cancellation after policy preparation settled idle; the following ordinary request completed without an inherited Ultra policy.
- The production phone bridge read persisted alpha history, paginated without repeated turns, retained the generated image, placed the image reference in the final reply, exposed Ultra and resumed paginated history. A real native fork successfully read the exact inherited original image.
- Browser interaction checked real input predictions, Tab insertion without sending, undo/cache recovery, native quoted text, suppression while quoted text exists and recovery after clearing it. Native image-picker upload suppressed predictions; a real model correctly described the uploaded image and the accepted send cleared its draft. Narrow Web layout was checked visually.

The phone protocol checks used an observational reference to the live production bridge inside the isolated process and an authenticated local test route. No bridge implementation, model response, history source or image result was replaced. These checks are not physical iPhone or Linux audio-device acceptance. No new phone pairing was created.

## Boundaries

No drawing logic, custom webpage-body UI, Portable kernel, new experimental tool or default feature switch was added. Existing native layouts and alpha.2's own UI/performance improvements are reused. Physical Linux audio, native desktop packaging and optional Codex CLI component execution were not newly qualified by this Windows Web-host run.
