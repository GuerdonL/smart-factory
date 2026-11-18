"""The limits. The server is deployed, so the backend refuses what is outsized, with a plain reason, and never runs it.

The five the specification sets, together:"""
MAX_BODY = 5 * 1024 * 1024          # bytes in the body of a request to /run
MAX_NODES = 20_000                  # nodes in a graph
MAX_ENTRIES = 16_000_000            # entries in any one node
MAX_SECONDS = 30                    # seconds a run may take: it is stopped then
MAX_UPLOAD = 50 * 1024 * 1024       # bytes in a file sent to /data

# And the backend's own smaller bounds, which keep any one step short. None of them is reached by a graph the page builds.
MAX_FORMULA = 10_000                # characters in one formula (and in one symbolic value)
MAX_NESTING = 64                    # brackets, signs, roots and powers one inside the next in a formula
MAX_JSON_DEPTH = 200                # objects one inside the next in a request (graph.js: validate reads no deeper)
MAX_WANTS = 2_000                   # nodes asked for in one run
MAX_CELLS = 4_096                   # entries asked for of one node
MAX_BINDING_CELLS = 16              # tile cells a node may be asked for under (tiles nest 8 deep: tiles.js)
MAX_HELD = 1 << 30                  # bytes of results remembered at once during a run; past it the oldest are worked out again if asked for
MAX_MEMORY = 6 << 30                # bytes of address space one worker may take; past it the run ends with "out of memory"
WORKERS = 2                         # runs worked out at once; a third waits
MAX_WAIT = 30                       # seconds a run waits for a free worker before it is refused
MAX_ANSWER = 8 * 1024 * 1024        # bytes in an answer (server.py reads no more of one)


def plural(n, word):
    return '%s %s%s' % (format(n, ','), word, '' if n == 1 else 's')


def megabytes(n):
    return '%d MB' % (n // (1024 * 1024))
