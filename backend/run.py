"""One request answered: plain data in, plain data out. No sockets here (service.py has those).

    run(body, root=None)                  -> what POST /run answers, for the bytes it was sent:
                                             { "results": { key: { cols, rows, cells: [[c, r, value], …], min, max, mean } },
                                               "errors":  { key: "why" } }
                                             A node whose entries hold inner data answers with inner too, the
                                             lengths of its inner axes ({ cols, rows, inner: [2, 4], cells, … }),
                                             and its cells are [[c, r, k1, k2, value], …]: one more number, from
                                             1, for each inner axis. A node that holds none answers as it always did.
                                             It never raises: whatever is wrong is said in errors. What is wrong
                                             with the request as a whole is under the key "*".
    upload(project, path, body, root=None) -> what POST /data answers: { "path", "cols", "rows" } (and "small" where it has numbers too small for 32 bits); raises
                                             data.Refused(why)
    health()                              -> { "ok": true, "version": 3 }: the graph version (check.py: VERSION)

The request to /run:
    { "graph": { … },                     a graph (graph.js). It is checked by validate (check.py) before anything
                                          is worked out, and refused whole if it is not well formed
      "want": [ { "node": "<id>",         a node to work out
                  "cells": [[c, r], …],   the entries wanted of it, column then row, from 1; of a node whose entries
                                          hold inner data, [[c, r, k1, k2, …], …], with the inner position after
                  "binding": { … },       where it is looked at from, inside a function or a tile (evaluate.js); may be left out
                  "as": "<key>" } ],      what to call the answer in results and errors; left out, the node's id
      "tick": 0,                          which draw of the noise: a whole number, 0 where left out
      "project": "<name>" }               the project whose data/ a file source reads; may be left out where there is none
A value is a number; "inf" or "-inf"; or { "err": "that has no value" } for an entry that has none (a division by
zero, ∞ − ∞); or { "none": true } for an entry that is None. min, max and mean are of the entries that have a
value and are not None, written the same way (null where none has).

Nothing in a request is executed: the graph is data, a formula is read by formula.py, and a file's path is
resolved inside the named project's data/ directory by data.py."""
import json
import math
import sys

from . import arrays as A
from .check import VERSION, is_int, is_obj, lengths, validate
from .data import NAME, Refused, inspect, read_text, take
from .evaluate import Run, Trouble
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

    work = Run(graph, read_file, int(tick), room)
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
        except (MemoryError, RecursionError):
            raise
        except Exception as e:      # this one alone has no answer; the others have theirs. What went wrong is the log's to say, not the answer's
            sys.stderr.write('%s could not be worked out: %s: %s\n' % (key, type(e).__name__, e))
            errors[key] = BROKEN
            results.pop(key, None)
    return {'results': results, 'errors': errors}


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
    need = work.needs(node)
    if need['most'] > MAX_ENTRIES:
        at = graph['nodes'][need['where']]['type']
        raise Trouble('%s %s%s, more than the %s that are worked out' % (' × '.join(format(int(x), ',') for x in (at['cols'], at['rows']) + lengths(at)), 'numbers',
                                                                         '' if need['where'] == node else ' in what it is worked out from', format(MAX_ENTRIES, ',')))
    if need['bad']:
        raise Trouble(need['bad'])
    # refused before anything is made: what it is worked out from, all held at once, and room to work on the largest of it
    wanted = BYTES_AN_ENTRY * (work.weight(node) + ROOM_TO_WORK * need['most'])
    if wanted > work.room:
        raise Trouble('it is worked out from %s entries in all, which needs about %s of memory, more than the %s this backend may take for a run' % (format(work.weight(node), ','), megabytes(wanted) if wanted >= 2 ** 20 else 'a megabyte', megabytes(work.room)))
    value = work.value(node, w.get('binding'))
    least, most, mean = A.summary(value)
    def read(c):
        at = (int(c[1]) - 1, int(c[0]) - 1, tuple(int(k) - 1 for k in c[2:]))
        return [int(x) for x in c] + [{'none': True} if A.is_none(value, *at) else written(A.item(value, *at))]
    out = {'cols': cols, 'rows': rows}
    if inner:
        out['inner'] = list(inner)      # only where it holds inner data: a node that holds none answers as it always did
    out.update({'cells': [read(c) for c in cells], 'min': written(least), 'max': written(most), 'mean': written(mean)})
    return out


def upload(project, path, body, root=None):
    cols, rows, small = take(project, path, body, root)
    return {'path': path, 'cols': cols, 'rows': rows, **({'small': small} if small else {})}      # small: how many of its numbers are too small for 32 bits and are read as 0 (only where some are)
