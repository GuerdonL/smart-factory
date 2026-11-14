# smart-factory

Trains models built in the Perceptron Editor outside the browser: on this machine when that is quick,
on a rented Vast.ai GPU through [box-boy](https://github.com/GuerdonL/box-boy) (`bb`) when it is not.

## The editor

    python serve.py                      # then open http://<this machine>:8000

`serve.py` serves the page in `editor/` and adds the Dataset block's **Kaggle** and **Hugging Face** buttons:
search, add a dataset to this machine, and load it into the block. It runs the Kaggle CLI with this machine's Kaggle login
(`pip install kaggle`, then `kaggle auth login`, or a token in `KAGGLE_API_TOKEN`). Those calls need the access
token `serve.py` prints at start (kept in `.serve-token`; set your own with `--token` or `SF_TOKEN`); the page
asks for it once per browser. Anyone who can reach the port can open the editor itself.

To keep it running on a server, as `/etc/systemd/system/smart-factory.service`:

    [Unit]
    Description=Perceptron Editor
    After=network-online.target
    [Service]
    User=<the user that ran kaggle auth login>
    WorkingDirectory=/path/to/smart-factory
    ExecStart=/usr/bin/python3 serve.py --port 8000
    Restart=always
    [Install]
    WantedBy=multi-user.target

then `sudo systemctl enable --now smart-factory`. Without Kaggle, `python -m http.server 8000 -d editor` is enough.
Graphs are kept in each browser's storage.

## Renting from the editor

With `serve.py` running and box-boy set up on the same machine (`bb doctor` passes, and `git push` works from this
clone), the editor can hand a training run to a rented GPU by itself:

- Ticking **Train** on a frame times a few steps. If five passes over the data would take more than five minutes in
  the browser, a dialog opens. **Train on a GPU…** in the frame panel opens the same dialog at any time.
- The dialog shows the run, the machine and hourly price `bb launch --dry-run` found, the expected cost, and the most
  it can cost (the run is stopped after a time limit of four times the estimate, at least half an hour).
- Nothing is rented until **Rent and run** is pressed. That commits and pushes the model file to this public repo,
  runs `bb launch`, follows the run, and loads the finished weights into the frame.

Only what the trainer can train goes this way: Dataset (built-in digits, Kaggle or Hugging Face images) → Linearize →
frame → Cost function. The GPU time is a rule of thumb, so the expected cost is too; the hourly price is box-boy's.

## Hugging Face datasets

    python hf_data.py search "common corpus"
    python hf_data.py add PleIAs/common_corpus --rows 2000 --where language=English
    python hf_data.py add ylecun/mnist --rows 5000

The Dataset block's **Hugging Face** button does the same from the editor (it needs `serve.py`, as Kaggle does).
Rows are read straight from the dataset's Parquet files and reading stops once enough are taken, so a slice of a
multi-terabyte dataset costs a few megabytes and a few seconds. `python hf_data.py parts <name>` lists what a dataset
can be narrowed by (subsets, splits, and columns with a short list of values such as language); the editor shows the
same as tick boxes after Add. `--where language=English|French,collection=Wikipedia` keeps only matching rows, and
`--config` and `--split` pick a subset and split.
Text datasets are saved one document per line and come out of the Dataset block's text port a window of characters
at a time; image datasets need an image column and a label column and become greyscale. Needs
`pip install huggingface_hub pyarrow`; `HF_TOKEN` is only needed for gated or private datasets. The trainer can
train on an image slice with `--data hf:<owner>/<name>`; it has no language-model training yet.

## Kaggle datasets

    python kaggle_data.py search "sign language"
    python kaggle_data.py add datamunge/sign-language-mnist
    python run.py models/<file>.json --data kaggle:datamunge/sign-language-mnist

Two layouts are understood: image files (label = the folder each is in; mixed or large sizes are scaled to 32 px
square unless `--size` says otherwise) and MNIST-style CSVs (a label column plus a square number of pixel columns).
Everything becomes greyscale. Other datasets are refused with a note of what they hold. A model exported while
a Kaggle dataset is in the Dataset block remembers it, so `--data` is not needed. For a rented run, `run.py`
copies the packed dataset to box-boy's private Hugging Face repo, because the instance has no Kaggle login.

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

`--data` takes `kaggle:<owner>/<name>` (above), `digits` (the editor's built-in 8×8 set, in `data/`), `mnist` (28×28, downloaded on first
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
- `remote.py` plans, launches and follows rented runs for the editor.
- `serve.py` serves the editor and its Kaggle panel; `kaggle_data.py` and `hf_data.py` find, fetch and pack Kaggle and Hugging Face datasets.
- `boxboy.toml` is the box-boy configuration (GPU type, price cap, setup and check commands).
- `editor/` holds a standalone copy of the editor page and its digits file.
- `tests/` checks the trainer against hand-computed and cross-checked results.

Needs Python 3.11+, `torch`, `numpy`, `pillow`; Kaggle needs the `kaggle` CLI; renting also needs `bb` set up (`bb doctor`).
