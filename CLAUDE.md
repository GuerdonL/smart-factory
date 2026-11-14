# Notes for Claude

Owner: Guerdon (GuerdonL). This project is the off-browser trainer for his Perceptron Editor and a box-boy (`bb`) project.

- **Renting is a purchase.** Never pass `--yes` to `bb launch` or pipe a "y" into it. `run.py` shows the dry run and lets `bb` ask.
- The repo is public because box-boy instances clone it without a login. Do not commit anything private; `runs/` is ignored.
- `trainer.py` must keep matching the editor's arithmetic exactly. `tests/test_trainer.py` holds the checks; the comparison
  against the live editor page (headless Chrome) was done by hand on 2026-11-12 and is not in the test suite.
- Kaggle: `kaggle_data.py` shells out to the `kaggle` CLI (written against 2.2.5: `datasets list -s Q --csv`, `datasets download REF -p DIR --unzip`).
  It was tested only against a stand-in CLI with that argument and CSV layout, never against Kaggle itself, and the
  Hugging Face copy for rented runs (`run.py` upload, `kaggle_data.load` download via `BB_HF_REPO`) has never run.
- Hugging Face: `hf_data.py` streams the first rows out of Parquet files with pyarrow over `HfFileSystem` (tested live on
  PleIAs/common_corpus, ylecun/mnist and roneneldan/TinyStories on 2026-11-13). Text slices feed the editor only: neither
  `trainer.py` nor Export model handles text or attention yet. A rented run given `--data hf:<ref>` re-reads the default
  2,000 rows on the instance, not the row count chosen in the editor.
- `serve.py` exposes the Kaggle calls to anyone with the access token; never remove the token check or log the token.
- Not yet exercised: a real `bb launch` from this project, `--data hf:...`, CUDA and MPS devices, a resumed rented run.
  The GPU time figure in `run.py` is a rule of thumb (`GPU_FLOPS`), not a measurement; correct it after the first real runs.
- `editor/index.html` is the published Claude artifact's source wrapped in a plain HTML document; the artifact is edited first and this copy regenerated from it.
