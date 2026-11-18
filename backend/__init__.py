"""The backend: a separate process that works a graph (graph.js) out in floating point. README.md has how to run it.

    limits.py    the five limits, together, and the smaller bounds that keep any one step short
    formula.py   a parser for the formula language (expression.js): text in, a tree out. Nothing is ever executed.
    check.py     validate, the same checks as graph.js makes, written again from its table of operations
    data.py      where a project's data files are, and what a numeric CSV is
    arrays.py    every array there is: the one module that imports NumPy
    evaluate.py  what each operation comes to, and the bindings a node is worked out under (evaluate.js)
    run.py       one request to /run or /data answered: plain data in, plain data out
    service.py   the process: an HTTP server on the loopback address, and the workers a run is done in

Only arrays.py imports NumPy, so another library can take its place there; formula.py, check.py, data.py and
limits.py need nothing but the standard library, and are tested without it."""
