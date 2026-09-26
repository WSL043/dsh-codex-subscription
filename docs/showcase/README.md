# Product visuals

The gallery arranges **actual screenshots from DSH**, without reconstructing its
controls or changing their values. The headline and surrounding layout are separate
presentation elements. The icon is shown independently in the README.

Captured in DSH 0.1.7-alpha.2 with plugin 2.2.2 on 2026-09-27. Source crops in
`docs/assets/real-*.png` retain native masked account labels and exclude conversations and unrelated UI.
The quota is a capture-time reading, not a promise of quota available to a new user.
The main product image uses one continuous account-and-quota settings window,
including native navigation, account management, quota, Credits and alert controls.
No account or quota cards are detached, no values are replaced, and no controls are redrawn.
Both language variants show the same capture-time quota and Credits state.

| Crop | Source area at a 1200 × 1000 viewport |
| --- | --- |
| Full account settings window (Chinese and English) | x=199, y=99, 802 × 802 |
| Account | x=412, y=158, 559 × 248 |
| Models & runtime | x=412, y=158, 559 × 329 |
| Quota window | x=426, y=488, 529 × 76 |
| Images & sketch (Chinese) | x=412, y=158, 564 × 697 |
| Images & sketch (English) | x=412, y=158, 564 × 714 |

Capture coordinates are evidence for this host version, not a stable automation API.
Refresh these assets from the installed host when its UI changes. Never use an AI
redraw as an actual screenshot. Keep source screenshots with private data out of Git.

From the repository root:

```sh
node docs/showcase/build.mjs
node docs/showcase/serve.mjs
```

Open `http://127.0.0.1:65319/`. Use `?lang=en` for English. Capture at
**1600 × 1050**, encode as PNG, and check both languages visually. Some browser
capture tools emit JPEG bytes regardless of the destination extension.

The gallery builds only into ignored `.artifacts/showcase` and is not included in
the plugin runtime or npm package. Update the README pair and `screenshots.json`
together when changing the published presentation.

The README displays Images & sketch crops directly. The plugin-list captures are
1200 × 780 native screenshots with the sidebar collapsed; they show the actual icon
in the Plugins homepage, not its details screen. No UI content was generated.

Composer screenshots were refreshed in the same host on 2026-09-27. Both use
GPT-6-Luna Default and native percentage quota display, cropped at x=245, y=343,
840 × 137 from a 1280 × 720 screenshot. Language, sidebar, and quota-display
preferences were restored after capture; no model request was sent.
