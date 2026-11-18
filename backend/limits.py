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
MAX_ALL_CELLS = 65_536              # entries asked for in one run, over all its nodes: an answer then stays well under MAX_ANSWER
MAX_DATA_FILES = 64                 # files under one project's data/
MAX_DATA_BYTES = 200 * 1024 * 1024  # bytes under one project's data/, all its files together
UPLOADS = 2                         # files being taken at once; a third is refused, to be sent again
MAX_BINDING_CELLS = 16              # tile cells a node may be asked for under (tiles nest 8 deep: tiles.js)
WORKERS = 2                         # runs worked out at once; a third waits
MEMORY_SHARE = 0.5                  # the part of the machine's physical memory the workers may take between them
MEMORY_LEAST = 256 * 1024 * 1024    # and the least one worker is given for its arrays, however small the machine
BYTES_AN_ENTRY = 4                  # a 32-bit float
ROOM_TO_WORK = 6                    # how many arrays the size of the largest a step may hold at once while it works (a formula's steps, a power worked out in 64 bits)
MAX_WAIT = 30                       # seconds a run waits for a free worker before it is refused
MAX_ANSWER = 8 * 1024 * 1024        # bytes in an answer (server.py reads no more of one)


def physical_memory():
    """The machine's physical memory in bytes, or None where it cannot be told."""
    try:
        import os
        return os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
    except (ValueError, OSError, AttributeError):
        return None


def memory_for_arrays(given=None, workers=WORKERS):
    """The bytes one worker may hold in arrays. given: SMART_FACTORY_BACKEND_MEMORY, a number of megabytes for each
    worker, where it is set. Otherwise MEMORY_SHARE of the machine's physical memory, divided among the workers
    (a quarter each of a machine's memory, with two workers), and never less than MEMORY_LEAST."""
    if given:
        return max(int(given), 1) * 1024 * 1024
    have = physical_memory()
    return max(MEMORY_LEAST, int((have or 2 * MEMORY_LEAST * workers) * MEMORY_SHARE / workers))


def plural(n, word):
    return '%s %s%s' % (format(n, ','), word, '' if n == 1 else 's')


def megabytes(n):
    return '%d MB' % (n // (1024 * 1024))
