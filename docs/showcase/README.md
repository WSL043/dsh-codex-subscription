# Product visuals

The gallery composes the real account, usage, quota preference, and image/sketch
settings components from `src/`. It supplies fixed, clearly labeled demo data.
There are no credentials, backend connections, or real conversation data.

The editorial canvas, window frame, and host primitive styling are presentation
elements. This is a documentation composition, not a screenshot of the complete
DSH host or a substitute for installed-product acceptance. Menu anchors are
rendered for presentation; changing settings or signing in is not supported here.

From the repository root, using the existing development dependencies:

```sh
node docs/showcase/build.mjs
node docs/showcase/serve.mjs
```

Open `http://127.0.0.1:65318/`. The four views are:

| View | Query | Asset name |
| --- | --- | --- |
| Subscription, Chinese | none | `subscription-overview-2.2.png` |
| Subscription, English | `?lang=en` | `subscription-overview-2.2-en.png` |
| Creative, Chinese | `?view=creative` | `creative-overview-2.2.png` |
| Creative, English | `?view=creative&lang=en` | `creative-overview-2.2-en.png` |

Capture each complete view at **1600 × 1050**. On account views, click Show full
email and then the heading to remove focus styling. Use PNG encoding (some browser
capture tools return JPEG bytes regardless of the destination extension). Keep
both languages at the same dimensions and verify text, controls, and margins.

The build stays in ignored `.artifacts/showcase`. These files are not part of the
plugin runtime or npm package. Update both READMEs and `screenshots.json` when
changing the published assets.
