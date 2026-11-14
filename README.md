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

## Running a graph from the editor

A graph predicts whenever its inputs are connected and trains whenever a loss is wired back through it; there is no
Train switch. With `serve.py` behind the page, right-clicking any block of a graph offers:

- **Run locally**: on the machine running `serve.py`, not in the browser. It times a few steps first and shows how long
  the run would take. One run at a time, one processor core, low priority, stopped after 10 minutes (`SF_LOCAL_MINUTES`)
  with whatever it has learned. Needs PyTorch for the Python that runs `serve.py`
  (`python3 -m pip install torch --index-url https://download.pytorch.org/whl/cpu`); set `SF_PYTHON` to train with a
  different Python, such as a virtualenv's.
- **Run on GPU**: through box-boy (`bb doctor` must pass on that machine, as the user `serve.py` runs as, and `git push`
  must work from this clone). `bb` is looked for on the PATH and in `~/.local/bin`, where box-boy's setup puts it; set
  `SF_BB=/full/path/to/bb` if it lives elsewhere. The
  dialog shows the machine and hourly price `bb launch --dry-run` found, the expected cost, and the most it can cost
  (the run is stopped after four times the estimate, at least half an hour). Nothing is rented until **Rent and run** is
  pressed; that commits and pushes the model file to this public repo and runs `bb launch`.

Either way only the blocks behind that graph's Cost function are sent: other models on the page and loose blocks are
never included. The run is followed from the page and its weights are loaded into the blocks it trained. The GPU time
is a rule of thumb, so the expected cost is too; the hourly price is box-boy's. Without `serve.py` (the claude.ai copy,
or a plain file server) the menu offers **Train in this browser** instead.

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

**Export model** saves everything behind the selected frame's Cost function as one file: the blocks with their settings
and weights, the wires, and which blocks to train (those a gradient reaches through the backprop wires). `graph.py` runs it. Blocks it understands: Dataset (built-in digits, Kaggle or Hugging Face
images, Hugging Face text), Text buffer, Pixel array, Distribution, Random sampler, Tokenizer (Characters), Linearize,
Attention, Evaluation frame and Cost function. Not yet: Waveform, the Tokenizer's Words mode, a folder loaded in the
browser, more than one Dataset block. With no Dataset block a "pass" is 10,000 draws from the samplers. Each trained
block keeps its own rate from the editor.

Checked against the editor to 1e-15 (`--batch 1 --no-shuffle --val 0 --double`) on three graphs: digits → attention →
frame; text → tokenizer → causal attention → frame with per-token cross-entropy; and frame → attention → frame.
Two known differences: a block whose output feeds two blocks gets the gradient from both here but only from the one
wired to its backprop port in the editor, and a character outside the Basic Multilingual Plane (an emoji, say) counts
as two tokens here and one in the editor.

The toolbar's Evaluation frame is defined by its row sizes alone (input, any number of hidden rows, output), every row
fully connected to the next; its weights are one matrix per pair of rows. The older hand-built frame, with draggable
neurons and individual connections, is still in the right-click menu as "Hand-built frame".

Older single-frame files still work, and this is what they compute:


The editor's rule, checked against the editor to 1e-15 with `--batch 1 --no-shuffle --val 0 --double`:
each neuron outputs `f(w * (x + sum of c * source output))`; input neurons, and output neurons with
"Linear output layer" on, skip `f`; neuron weights `w` and connection weights `c` both train by plain
gradient descent. Larger batches average the gradient over the batch, which the editor does not do.

`make_model.py` writes a fully connected model file directly, for sizes too large to draw. The editor
cannot open those; it only imports weights into a frame it already has.

## Files

- `graph.py` trains a whole exported graph (attention, text, samplers, several frames); `trainer.py` hands it such files.
- `trainer.py` trains one model file and writes `weights.json`, `metrics.json`, `log.csv`, `ckpt.pkl` (resume state) to `--out`.
- `run.py` decides where to train and starts it.
- `remote.py` plans, launches and follows rented runs for the editor.
- `serve.py` serves the editor and its Kaggle panel; `kaggle_data.py` and `hf_data.py` find, fetch and pack Kaggle and Hugging Face datasets.
- `boxboy.toml` is the box-boy configuration (GPU type, price cap, setup and check commands).
- `editor/` holds a standalone copy of the editor page and its digits file.
- `tests/` checks the trainer against hand-computed and cross-checked results.

Needs Python 3.11+, `torch`, `numpy`, `pillow`; Kaggle needs the `kaggle` CLI; renting also needs `bb` set up (`bb doctor`).
