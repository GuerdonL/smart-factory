# smart-factory

Trains models built in the Perceptron Editor outside the browser: on this machine when that is quick,
on a rented Vast.ai GPU through [box-boy](https://github.com/GuerdonL/box-boy) (`bb`) when it is not.

## The loop

1. In the editor, select an evaluation frame wired as Dataset → Linearize → frame → Cost function
   (with the Dataset's label on the cost function's ground truth) and click **Export model**.
   Put the file in `models/`.
2. `python run.py models/<file>.json` (add `--epochs`, `--batch`, `--data`, `--lr` as needed).
3. In the editor, select the same frame, click **Import weights** and choose `runs/<name>/weights.json`.

`run.py` times a few training steps here and multiplies up. Under 5 minutes (`--target-min`) it trains
here. Over that, it writes `jobs/<name>.txt`, commits and pushes the model file if GitHub does not have
it yet (it asks), shows `bb launch --dry-run`, and then runs `bb launch`, which asks before renting.
`--plan` prints the decision and the dry run and starts nothing. `--wait` stays until the job ends and
downloads the result; without it, run `bb wait <name> && bb collect <name>` yourself.

A rented run is stopped after a time limit `run.py` sets from its estimate (at least half an hour), and
the trainer saves what it has just before that.

## Data

`--data` takes `digits` (the editor's built-in 8×8 set, in `data/`), `mnist` (28×28, downloaded on first
use), a folder of same-sized images inside this repo (label = subfolder, else the file name before `_`,
as in the editor), or `hf:<dataset repo>` holding such a folder. A model exported while a browser-loaded
folder was in the Dataset block needs `--data`, because the browser never keeps the files.

## What the trainer computes

The editor's rule, checked against the editor to 1e-15 with `--batch 1 --no-shuffle --val 0 --double`:
each neuron outputs `f(w * (x + sum of c * source output))`; input neurons, and output neurons with
"Linear output layer" on, skip `f`; neuron weights `w` and connection weights `c` both train by plain
gradient descent. Larger batches average the gradient over the batch, which the editor does not do.

`make_model.py` writes a fully connected model file directly, for sizes too large to draw. The editor
cannot open those; it only imports weights into a frame it already has.

## Files

- `trainer.py` trains one model file and writes `weights.json`, `metrics.json`, `log.csv`, `ckpt.pkl` (resume state) to `--out`.
- `run.py` decides where to train and starts it.
- `boxboy.toml` is the box-boy configuration (GPU type, price cap, setup and check commands).
- `editor/` holds the editor page's source and its digits file.
- `tests/` checks the trainer against hand-computed and cross-checked results.

Needs Python 3.11+, `torch`, `numpy`, `pillow`; renting also needs `bb` set up (`bb doctor`).
