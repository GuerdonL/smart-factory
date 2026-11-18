"""One request answered: plain data in, plain data out. No sockets here (service.py has those).

    run(body, root=None)                  -> what POST /run answers, for the bytes it was sent:
                                             { "results": { key: { cols, rows, cells: [[c, r, value], …], min, max, mean } },
                                               "errors":  { key: "why" } }
                                             It never raises: whatever is wrong is said in errors. What is wrong
                                             with the request as a whole is under the key "*".
    upload(project, path, body, root=None) -> what POST /data answers: { "path", "cols", "rows" }; raises
                                             data.Refused(why)
    health()                              -> { "ok": true, "version": 1 }

The request to /run:
    { "graph": { … },                     a graph (graph.js). It is checked by validate (check.py) before anything
                                          is worked out, and refused whole if it is not well formed
      "want": [ { "node": "<id>",         a node to work out
                  "cells": [[c, r], …],   the entries wanted of it, column then row, from 1
                  "binding": { … },       where it is looked at from, inside a function or a tile (evaluate.js); may be left out
                  "as": "<key>" } ],      what to call the answer in results and errors; left out, the node's id
      "tick": 0,                          which draw of the noise: a whole number, 0 where left out
      "project": "<name>" }               the project whose data/ a file source reads; may be left out where there is none
A value is a number; "inf" or "-inf"; or { "err": "that has no value" } for an entry that has none (a division by
zero, ∞ − ∞). min, max and mean are of the entries that have a value, written the same way (null where none has).

Nothing in a request is executed: the graph is data, a formula is read by formula.py, and a file's path is
resolved inside the named project's data/ directory by data.py."""
import json
import math

from . import arrays as A
from .check import VERSION, is_int, is_obj, validate
from .data import NAME, Refused, inspect, keep, read_text
from .evaluate import Run, Trouble
from .limits import MAX_BODY, MAX_CELLS, MAX_ENTRIES, MAX_NODES, MAX_WANTS, megabytes, plural

NO_VALUE = 'that has no value'
WHOLE = '*'


def health():
    return {'ok': True, 'version': VERSION}


def refuse(why):
    return {'results': {}, 'errors': {WHOLE: why}}


def written(x):
    """A float as it is written in an answer."""
    if x is None:
        return None
    if math.isnan(x):
        return {'err': NO_VALUE}
    if math.isinf(x):
        return 'inf' if x > 0 else '-inf'
    return x


def no_constant(text):
    raise ValueError('%s is not JSON' % text)


def run(body, root=None):
    try:
        return answer(body, root)
    except MemoryError:
        return refuse('the run needs more memory than the backend may take')
    except RecursionError:
        return refuse('the graph is nested too deep to be worked out')
    except Exception as e:      # nothing is let out as a crash: the process goes on, and the page is told
        return refuse('the backend could not work this out (%s: %s)' % (type(e).__name__, e))


def answer(body, root):
    if len(body) > MAX_BODY:
        return refuse('the request is larger than %s' % megabytes(MAX_BODY))
    try:
        asked = json.loads(body.decode('utf8'), parse_constant=no_constant)
    except RecursionError:
        return refuse('the request is nested too deep to be read')
    except ValueError as e:
        return refuse('the request is not JSON (%s)' % e)
    if not is_obj(asked) or not is_obj(asked.get('graph')):
        return refuse('the request holds no graph')
    graph, want, tick, project = asked['graph'], asked.get('want'), asked.get('tick', 0), asked.get('project')
    if is_obj(graph.get('nodes')) and len(graph['nodes']) > MAX_NODES:
        return refuse('the graph has %s, more than %s' % (plural(len(graph['nodes']), 'node'), format(MAX_NODES, ',')))
    if not isinstance(want, list) or len(want) > MAX_WANTS:
        return refuse('want is a list of at most %s' % plural(MAX_WANTS, 'node'))
    if not is_int(tick) or tick < 0 or tick >= 2 ** 53:
        return refuse('tick is a whole number, from 0')
    if project is not None and not (isinstance(project, str) and NAME.fullmatch(project)):
        return refuse('project is not the name of a project')
    wrong = validate(graph)
    if wrong:
        return refuse('the graph is not well formed: ' + '; '.join(wrong[:3]) + ('; and %d more' % (len(wrong) - 3) if len(wrong) > 3 else ''))

    def read_file(path):
        if project is None:
            raise Trouble('%s: the project has to be saved under a name before its data files can be read' % path)
        try:
            text = read_text(project, path, root)
            skip, cols, rows = inspect(text)
        except Refused as e:
            raise Trouble(str(e))
        return A.table(text, skip)

    work = Run(graph, read_file, int(tick))
    results, errors = {}, {}
    for w in want:
        key = w.get('as', w.get('node')) if is_obj(w) else None
        if not isinstance(key, str):
            errors[WHOLE] = 'want holds what names no node'
            continue
        try:
            results[key] = one(work, graph, w)
            errors.pop(key, None)
        except Trouble as e:
            errors[key] = str(e)
            results.pop(key, None)
    return {'results': results, 'errors': errors}


def one(work, graph, w):
    node, cells = w.get('node'), w.get('cells', [])
    if not isinstance(node, str) or node not in graph['nodes']:
        raise Trouble('no such node')
    t = graph['nodes'][node]['type']
    cols, rows = int(t['cols']), int(t['rows'])
    if not isinstance(cells, list) or len(cells) > MAX_CELLS:
        raise Trouble('cells is a list of at most %s' % plural(MAX_CELLS, 'entry').replace('entrys', 'entries'))
    for c in cells:
        if not (isinstance(c, list) and len(c) == 2 and is_int(c[0]) and is_int(c[1]) and 1 <= c[0] <= cols and 1 <= c[1] <= rows):
            raise Trouble('it has no entry %s: it is %d × %d' % (json.dumps(c)[:40], cols, rows))
    need = work.needs(node)
    if need['most'] > MAX_ENTRIES:
        at = graph['nodes'][need['where']]['type']
        raise Trouble('%s × %s entries%s, more than the %s that are worked out' % (format(at['cols'], ','), format(at['rows'], ','), '' if need['where'] == node else ' in what it is worked out from', format(MAX_ENTRIES, ',')))
    if need['bad']:
        raise Trouble(need['bad'])
    value = work.value(node, w.get('binding'))
    least, most, mean = A.summary(value)
    return {'cols': cols, 'rows': rows, 'cells': [[int(c), int(r), written(A.item(value, int(r) - 1, int(c) - 1))] for c, r in cells],
            'min': written(least), 'max': written(most), 'mean': written(mean)}


def upload(project, path, body, root=None):
    cols, rows = keep(project, path, body, root)
    return {'path': path, 'cols': cols, 'rows': rows}
