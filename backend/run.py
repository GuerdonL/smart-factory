"""One request answered: plain data in, plain data out. No sockets here (service.py has those).

    run(body, root=None)                  -> what POST /run answers, for the bytes it was sent:
                                             { "results": { key: { cols, rows, cells: [[c, r, value], …], min, max, mean, truth } },
                                             (and "stopped": k on a loop that its stop block ended at cell k),
                                               "errors":  { key: "why" } }
                                             and, where a stream that stops at its file's end was asked for past it,
                                               "ended":   [ "<the stream's node id>", … ]
                                             with, for each key that has no answer because of it, the stream and the
                                             first tick at which it has no value,
                                               "codes":   { key: { "code": "ended", "node": "<id>", "tick": 40 } }
                                             beside that key's error ("it ended at tick 40: data/rows.csv has 40
                                             rows, and it stops at its end"); and, only where a promise is broken by a number worked out here
                                             (a variable's holds, what a function's input promises to take),
                                               "codes":   { key: { "code": "type", "node": "<id>" } }
                                             beside that key's error, which is then the page's own sentence,
                                             "W is not natural: it holds ∞ at 3, 1"; node is whose promise it is.
                                             A node whose entries hold inner data answers with inner too, the
                                             lengths of its inner axes ({ cols, rows, inner: [2, 4], cells, … }),
                                             and its cells are [[c, r, k1, k2, value], …]: one more number, from
                                             1, for each inner axis. A node that holds none answers as it always did.
                                             It never raises: whatever is wrong is said in errors. What is wrong
                                             with the request as a whole is under the key "*".
    upload(project, path, body, root=None) -> what POST /data answers: { "path", "cols", "rows", "length" } (and "small" where it has numbers too small for 32 bits); raises
                                             data.Refused(why). The file is a CSV, a text or a .npy, by its
                                             path's ending: cols and rows are a CSV's table, one character of a
                                             text (1 by 1) and one value of a .npy; length is how many units a
                                             stream of it has: rows, characters, or indices along the first axis
    health()                              -> { "ok": true, "version": 6 }: the graph version (check.py: VERSION)

The request to /run:
    { "graph": { … },                     a graph (graph.js). It is checked by validate (check.py) before anything
                                          is worked out, and refused whole if it is not well formed
      "want": [ { "node": "<id>",         a node to work out
                  "cells": [[c, r], …],   the entries wanted of it, column then row, from 1; of a node whose entries
                                          hold inner data, [[c, r, k1, k2, …], …], with the inner position after
                  "binding": { … },       where it is looked at from, inside a function or a tile (evaluate.js); may be left out
                  "as": "<key>" } ],      what to call the answer in results and errors; left out, the node's id
      "tick": 0,                          the project's clock: a whole number, 0 where left out. Where a stream
                                          stands, and how many steps a loop with no last cell has taken, follow
                                          from it; a noise block is the same at every tick (evaluate.py)
      "counts": { "<loop's id>": 3 },     the counts the page has settled exactly, for loops whose count is settled
                                          only when run: taken as given where the count's node is in no function
                                          and no tile, so that a natural is not looked for in 32-bit floats; may be
                                          left out, and then every such count is worked out here (evaluate.py: v_loop)
      "project": "<name>" }               the project whose data/ a file source reads; may be left out where there is none
A value is a number; "inf" or "-inf"; or { "err": "that has no value" } for an entry that has none (a division by
zero, ∞ − ∞); or { "none": true } for an entry that is None. min, max and mean are of the entries that have a
value and are not None, written the same way (null where none has). truth is whether the whole matrix counts as
true, every entry of it and not only those asked for (values.js: truthOf): true where any entry is a number other
than 0; false where every entry is 0 or None; null where neither is so (an entry has no value, and none is true).
The page draws a shape that is false sunk, and has only this to go by where it does not hold the numbers.

Nothing in a request is executed: the graph is data, a formula is read by formula.py, and a file's path is
resolved inside the named project's data/ directory by data.py."""
import json
import math
import sys

from . import arrays as A
from .check import VERSION, file_kind, is_int, is_obj, lengths, validate
from .data import NAME, Refused, inspect, looked, read_bytes, read_text, taken, text_of
from .evaluate import Broken, Ended, Run, Trouble, too_many
from .limits import BYTES_AN_ENTRY, MAX_ALL_CELLS, MAX_BODY, MAX_CELLS, MAX_ENTRIES, MAX_NODES, MAX_WANTS, ROOM_TO_WORK, megabytes, memory_for_arrays, plural

NO_VALUE = 'that has no value'
NO_MEMORY = 'the run needs more memory than the backend may take'
BROKEN = 'the backend could not work this out: what went wrong is in its log'
WHOLE = '*'


def health():
    return {'ok': True, 'version': VERSION}      # the version of graph it writes and reads (check.py: VERSIONS has every one it accepts)


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


def run(body, root=None, room=None):
    """room: the bytes this run's arrays may take (limits.py: memory_for_arrays); left out, what the machine allows."""
    try:
        return answer(body, root, memory_for_arrays() if room is None else room)
    except MemoryError:
        return refuse(NO_MEMORY)
    except RecursionError:
        return refuse('the graph is nested too deep to be worked out')
    except Exception as e:      # nothing is let out as a crash: the process goes on, and the page is told, in words of the backend's own
        sys.stderr.write('a run could not be worked out: %s: %s\n' % (type(e).__name__, e))
        return refuse(BROKEN)


def answer(body, root, room):
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
    asked_cells = sum(len(w['cells']) for w in want if is_obj(w) and isinstance(w.get('cells'), list))
    if asked_cells > MAX_ALL_CELLS:
        return refuse('the request asks for %s in all, more than the %s one run gives' % (plural(asked_cells, 'entry').replace('entrys', 'entries'), format(MAX_ALL_CELLS, ',')))
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

    def read_roll(kind, path):
        """A stream's file as its units (arrays.py: a roll): a CSV's rows, a text's characters, a .npy's first axis."""
        if project is None:
            raise Trouble('%s: the project has to be saved under a name before its data files can be read' % path)
        try:
            if kind == 'csv':
                text = read_text(project, path, root)
                return A.rows_of(A.table(text, inspect(text)[0]))
            body = read_bytes(project, path, root)
            return A.points(text_of(body, path)) if kind == 'text' else roll_of(body, path)
        except Refused as e:
            raise Trouble(str(e))

    counts = asked.get('counts', {})
    if not is_obj(counts) or not all(is_obj(graph['nodes'].get(i)) and graph['nodes'][i]['op'] == 'loop' and is_obj(graph['nodes'][i]['count']) and is_int(v) and not isinstance(v, bool) and 1 <= v < 2 ** 53 for i, v in counts.items()):
        return refuse('counts gives a whole number, at least 1, to loops whose count is settled when they are run')
    work = Run(graph, read_file, int(tick), room, {i: int(v) for i, v in counts.items()}, read_roll)
    results, errors, codes, ended = {}, {}, {}, []
    last = {}      # of several wants under one key the last is the answer, as it always was
    for k, w in enumerate(want):
        key = w.get('as', w.get('node')) if is_obj(w) else None
        if isinstance(key, str):
            last[key] = k
    for k, w in sorted(enumerate(want), key=lambda kw: in_turn(graph, kw[1]) + (kw[0],)):
        key = w.get('as', w.get('node')) if is_obj(w) else None
        if not isinstance(key, str):
            errors[WHOLE] = 'want holds what names no node'
            continue
        if last[key] != k:
            continue
        try:
            results[key] = one(work, graph, w)
            errors.pop(key, None)
            codes.pop(key, None)
        except Trouble as e:
            errors[key] = str(e)
            results.pop(key, None)
            codes.pop(key, None)
            if isinstance(e, Broken):      # a promise broken by a number worked out here: the error type, and whose promise it is
                codes[key] = {'code': e.code, 'node': e.node}
            if isinstance(e, Ended):      # a stream past its file's end: which, and the first tick at which it has no value
                codes[key] = {'code': 'ended', 'node': e.node, 'tick': e.tick}
                if e.node not in ended:
                    ended.append(e.node)
        except (MemoryError, RecursionError):
            raise
        except Exception as e:      # this one alone has no answer; the others have theirs. What went wrong is the log's to say, not the answer's
            sys.stderr.write('%s could not be worked out: %s: %s\n' % (key, type(e).__name__, e))
            errors[key] = BROKEN
            results.pop(key, None)
            codes.pop(key, None)
    out = {'results': results, 'errors': errors}
    if codes:
        out['codes'] = codes
    if ended:
        out['ended'] = ended
    return out


def roll_of(body, path):
    try:
        return A.npy(body)
    except ValueError as e:
        raise Refused('%s is not read: %s' % (path, e))


def in_turn(graph, w):
    """Where a want comes in the order they are worked out in, so that one pass over a tile with a step serves all
    that is wanted of it (evaluate.py keeps a tile's last two states, and what its matrix came to): first the
    matrices of tiles with a step, then what is looked at from a cell, the cells in order, then everything else as
    it was asked. The answers are the same in any order; only the time differs."""
    if not is_obj(w):
        return (3, ())
    n = graph['nodes'].get(w.get('node')) if isinstance(w.get('node'), str) else None
    binding = w.get('binding')
    cells = binding.get('cells') if is_obj(binding) and isinstance(binding.get('cells'), list) else []
    if is_obj(n) and n.get('op') == 'repeat' and 'fn' in n and not cells:
        return (0, ())
    if cells:
        number = lambda v: v if is_int(v) else 0
        return (1, tuple((number(c.get('cy')), number(c.get('cx'))) if is_obj(c) else (0, 0) for c in cells))
    return (2, ())


def one(work, graph, w):
    node, cells = w.get('node'), w.get('cells', [])
    if not isinstance(node, str) or node not in graph['nodes']:
        raise Trouble('no such node')
    t = graph['nodes'][node]['type']
    cols, rows, inner = int(t['cols']), int(t['rows']), lengths(t)
    most = (cols, rows) + inner
    said = ' × '.join(str(x) for x in most)
    if not isinstance(cells, list) or len(cells) > MAX_CELLS:
        raise Trouble('cells is a list of at most %s' % plural(MAX_CELLS, 'entry').replace('entrys', 'entries'))
    for c in cells:
        if isinstance(c, list) and len(c) != len(most) and len(c) >= 2 and all(is_int(x) for x in c):      # a column and a row, and one more for each inner axis
            raise Trouble('%s names %s, and an entry of it is named by %d: it is %s' % (json.dumps(c)[:40], plural(len(c), 'number'), len(most), said))
        if not (isinstance(c, list) and len(c) == len(most) and all(is_int(x) and 1 <= x <= m for x, m in zip(c, most))):
            raise Trouble('it has no entry %s: it is %s' % (json.dumps(c)[:40], said))
    binding = w.get('binding')
    bound = []
    if is_obj(binding) and is_obj(binding.get('params')):
        for fn, spec in binding['params'].items():
            of = spec if isinstance(spec, str) else spec.get('of') if is_obj(spec) else None
            if fn in graph['functions'] and isinstance(of, str) and of in graph['nodes']:
                bound.append(of)
    most, where, bad = 0, node, None
    for s in [node] + bound:
        need = work.needs(s)
        if need['most'] > most:
            most, where = need['most'], need['where']
        bad = bad or need['bad']
    if most > MAX_ENTRIES:
        raise Trouble(too_many(graph['nodes'], {'most': most, 'where': where}, node))
    if bad:
        raise Trouble(bad)
    # refused before anything is made: what it is worked out from, all held at once, and room to work on the largest of it
    wanted = work.bytes_for(node, ROOM_TO_WORK, BYTES_AN_ENTRY, bound)      # 4 bytes a number, and one more where an entry may be None
    if wanted > work.room:
        raise Trouble('it is worked out from %s entries in all, which needs about %s of memory, more than the %s this backend may take for a run' % (format(work.weight(node, bound), ','), megabytes(wanted) if wanted >= 2 ** 20 else 'a megabyte', megabytes(work.room)))
    value = work.value(node, binding)
    least, most, mean = A.summary(value)
    def read(c):
        at = (int(c[1]) - 1, int(c[0]) - 1, tuple(int(k) - 1 for k in c[2:]))
        return [int(x) for x in c] + [{'none': True} if A.is_none(value, *at) else written(A.item(value, *at))]
    out = {'cols': cols, 'rows': rows}
    if inner:
        out['inner'] = list(inner)      # only where it holds inner data: a node that holds none answers as it always did
    if graph['nodes'][node]['op'] == 'loop' and not w.get('binding') and node in work.stops:
        out['stopped'] = work.stops[node]      # the cell its stop block ended it at, from 1: for the page to say (only on a loop that was stopped so)
    out.update({'cells': [read(c) for c in cells], 'min': written(least), 'max': written(most), 'mean': written(mean), 'truth': A.truth(value)})
    return out


def look(body, path):
    """What an uploaded file is (data.py: looked), a .npy among them, which arrays.py reads."""
    if file_kind(path) != 'npy':
        return looked(body, path)
    roll = roll_of(body, path)
    rows, cols = A.unit(roll)
    return {'cols': cols, 'rows': rows, 'length': A.units(roll)}


def upload(project, path, body, root=None):
    got = taken(project, path, body, root, look)
    cols, rows, small = got['cols'], got['rows'], got.get('small', 0)
    return {'path': path, 'cols': cols, 'rows': rows, 'length': got['length'], **({'small': small} if small else {})}      # small: how many of its numbers are too small for 32 bits and are read as 0 (only where some are)
