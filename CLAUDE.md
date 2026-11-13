# Notes for Claude

Owner: Guerdon (GuerdonL). This project is the off-browser trainer for his Perceptron Editor and a box-boy (`bb`) project.

- **Renting is a purchase.** Never pass `--yes` to `bb launch` or pipe a "y" into it. `run.py` shows the dry run and lets `bb` ask.
- The repo is public because box-boy instances clone it without a login. Do not commit anything private; `runs/` is ignored.
- `trainer.py` must keep matching the editor's arithmetic exactly. `tests/test_trainer.py` holds the checks; the comparison
  against the live editor page (headless Chrome) was done by hand on 2026-11-12 and is not in the test suite.
- Not yet exercised: a real `bb launch` from this project, `--data hf:...`, CUDA and MPS devices, a resumed rented run.
  The GPU time figure in `run.py` is a rule of thumb (`GPU_FLOPS`), not a measurement; correct it after the first real runs.
- `editor/perceptron-editor.html` is a copy of the published artifact's source; the artifact is the live version.
