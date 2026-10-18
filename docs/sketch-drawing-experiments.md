# Agent drawing experiments (2026-10)

What was measured, what the model's own tool traces showed, and what changed because of it. The tools only measure and show; an automatic tracer that copied the reference was built, scored 2.7% error and was removed again because copying pixels is not drawing.

Error is the mean absolute colour difference to the reference in percent (0 = identical), measured the same way for every run (reference fitted into the canvas on white, every second pixel).

## Hatsune Miku, 3:4, GPT-6.1-Sol Xhigh, one reference attached

Prompt: "Use the sketch board to draw her from this reference, portrait, as close to 100% as possible: composition, proportions, pose, colours and details all the same."

| Run | Tools | Final error | Time | Strokes |
| --- | --- | --- | --- | --- |
| Before | compare overlay and grid only | 6.7% | n/a | n/a |
| A | side-by-side and difference preview, zoom box, measure, undo, progress | 5.1% | n/a | n/a |
| B | A plus scan, colour regions, clip, blend, drawing guide | 5.2% | 21 min | 685 |

Reading the tool trace of run B (58 calls):

- Four SVG stages in 3.4 minutes took the error from 18% to 6.5%, which is where the old tools ended. The next 17 minutes of detail work (stitching, panel read-outs, shading) moved it from 6.5% to 5.2%.
- Even at 1/16 scale (48x64 pixels, colour layout only) the final error is 3.3%. The remaining error is therefore tone and colour of large masses (hair shading, skin, legs), not edge misalignment. The worst cells (13-15%) sit around the head, face and tie, where the drawing is 5-8 levels lighter and the legs 10-12 levels darker than the reference.
- The model used zoomed previews (about 8 times) and scans (4 times) but never worked through the picture region by region.
- At minute 9-14 the model wrote helper scripts (python was missing, then node). The drawing run unlocked after three minutes without a tool call and the next apply failed with "Start drawing with inspect". The run timeout is now fifteen minutes.

Changes made after this: a guide asking for refinement passes region by region with zoomed side-by-side checks before finishing; `measure` with `cells:true` returns all cells with `tone` (how much lighter or darker the drawing is); the run timeout.

## DeepSeek-chan meme, 1:1, GPT-6-Astra Medium, drawing only

| Run | Tools | Final error | Time | Strokes |
| --- | --- | --- | --- | --- |
| Best earlier run | compare overlay and grid | 8.8% | 20 min 57 s | 686 |
| Now | full tool set | 9.3% | 8 min 11 s | 481 |

Same fidelity by the numbers; the new drawing gets the hands-on-hips pose and the small whale on the apron right, and takes 40% of the time. Trace: error 20% -> 12.7% -> 11.4% -> 10.1% -> 9.9% in five applies, then finish. Findings: `undo` without `revision` was refused with a misleading "Sketch changed" message and, like every unexpected error, ended the run so the model had to inspect again. `undo` now needs no revision and a stale or missing revision no longer ends the run.

## Method notes

- The first full draft decides most of the result; refinement is slow and the pixel error hardly moves, so fine detail should be judged by the zoomed preview as well as by the number.
- One run per variant is noise-prone (runs A and B differ by 0.1-0.2%); conclusions need repeats.
- Never judge a run by its final picture alone: read the tool trace (`session.v4.jsonl.zstd` in the DSH home is a sequence of concatenated zstd frames; decompress each frame from its magic number).
