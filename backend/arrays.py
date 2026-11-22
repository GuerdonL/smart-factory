"""Every array there is. This is the one module that imports NumPy: another library takes its place by giving
these same functions, and nothing else in the backend would change.

An array is 32-bit floats with its rows and columns as its LAST two axes: shape (..., rows, cols). The axes before
them are the inner axes of a matrix whose entries hold inner data (graph.js: a type's inner), in their order: entry
"column,row,k1,k2" is a[k1 - 1, k2 - 1, row - 1, column - 1]. Everything here reads and writes from the end
(a[..., r, c], axis -2 and -1), so every function below repeats over the leading axes, and an array with none of
them is used at every inner position of one that has them. inner, where a function takes it, is the lengths of
those axes, () for none. An entry that has no value (a division by zero, ∞ − ∞, 0 × ∞, the root or the
logarithm of a negative number: the browser's error value) is NaN, and stays NaN through whatever is made of it;
an infinity is an infinity. Nothing here raises for what the numbers are.

None. NaN already says "no value", so an entry that holds None (values.js: nothing, said outright) is said by a
mask beside the array: Held(values, none), none an array of true and false the shape of values, true where the
entry is None, and the number under a None is 0. Only an array that holds a None is a Held: every function below
takes a plain array or a Held and gives a plain array wherever no entry of what it made is None, so a graph with no
None in it is worked out exactly as it was before there was one, by the same code on the same arrays. The rules are
values.js's: an entry with no value against None has no value; otherwise None with anything is None (a product
entry with one None term is None); None counts as false (so !None is 1, None && x is 0, and select(None, a, b) is
b); and None == None is 1, None against anything else under == is 0.
    nothing()                        the one value None
    is_none(a, r, c, ks)             whether that entry is None (from 0, as item)
    nones(a)                         how many of its entries are None
place and put give back what was set into, which is a Held once a None has been set into it: use what they give.

Making them
    number(x)                        one number
    full(rows, cols, x, inner)       every entry x
    empty(rows, cols, inner)         every entry None
    identity(rows, cols, inner)      1 where the column is the row, else 0, at every inner position
    blank(rows, cols, inner)         every entry without a value, to be set into (place, put)
    table(text, skip)                the numbers of a CSV already seen to be one (data.py: inspect), skip lines passed over
    row(values)                      Python numbers as one row (None among them: that entry is None)
    spread(a, rows, cols, inner)     one entry, one row or one column spread over a whole matrix (a matrix is itself).
                                     inner given: over every inner position too; left out: the leading axes a has
    grid(rows, cols)                 (i, j): each entry's column and its row, from 1, as arrays that spread over the matrix
    along(inner)                     [k1, k2, …]: each entry's place along each inner axis, from 1, likewise
    noise(seed, key, rows, cols, dist, tick, cells, inner)     see below
Putting them together
    matmul(a, b)                     the matrix product
    transpose(a)
    root(a, p, q)                    a to the power p/q, q odd (see below)
    binary(op, a, b, chain)          entry by entry: + - * / ^, == != < > <= >= (1 or 0), && ||. A side that is one
                                     entry, one row or one column is spread over the other. chain: for a step of a
                                     sum or product of several terms, which are looked at all together (see the
                                     function)
    call(fn, [args])                 entry by entry: neg ! abs sqrt exp ln tanh erf; max min; select(c, a, b), which
                                     takes a where c is not 0 and b elsewhere: both sides are whole arrays already,
                                     and what is not chosen is dropped, so an error there does no harm
    part(a, row, col, rows, cols)    a range of it, from 0
    place(out, a, row, col)          a set into out with its top-left corner there
    repeat(a, down, across)          a set down across by down times
    take(a, rs, cs, ks)              the entries at those rows and columns (lists, from 0), as one row. ks: for each
                                     inner axis, the places along it (lists, from 0); an array with no inner axes
                                     is read at its rows and columns alone
    put(out, rs, cs, row, ks)        and such a row set back at those places
    reorder(a, order)                its axes moved: axis k of the result is axis order[k] of a, counted as a type
                                     counts them (graph.js: axes), 0 the columns, 1 the rows, 2 the first inner axis
    stack(parts, at, rows, cols)     matrices put into the entries of one: part k is entry at[k] = (col, row), from
                                     0. The result's inner axes are a part's columns, its rows, then its own
    entry(a, col, row)               one entry taken out again: its columns and rows are a's first two inner axes
                                     (one inner axis: that many columns in one row)
    at_position(a, where)            the matrix at one inner position (a tuple, from 0)
    join(parts, inner)               and matrices, one for each inner position in order, joined into one array
Reading them
    outside(a, space, none)          the first entry that lies outside a number space, or None (see the function)
    truth(a)                         whether a whole matrix counts as true (values.js: truthOf): True where any
                                     entry is a number other than 0; False where every entry is 0 or None; None
                                     where neither is so, which is where an entry has no value and none is true
    shape(a) -> (rows, cols);  inner(a) -> the lengths of its inner axes;  size(a) -> how many bytes it takes
    item(a, r, c, ks) -> one entry as a Python float (from 0; ks: its inner position, from 0)
    summary(a) -> (least, most, mean) of the entries that have a value and are not None, as Python floats, or
                  (None, None, None)

How the arithmetic differs from plain floating point, so that it is the browser's (values.js) wherever both have an
answer: dividing by zero has no value (never an infinity); 0 to a power below 0 likewise; an infinity to the power
0, 1 to an infinite power and a number below 0 to an infinite power have none. A number below 0 to a power that is
no whole number has none either, but for one case: root(a, p, q), which formula.py calls where the exponent is
written in the formula as a fraction with an odd number under the line, is the real odd root ((-8)^(1/3) is -2).
Whether a power is such a root is never guessed from a float. A comparison with something that has no value has none. Sums, products
and quotients are 32-bit arithmetic; a power, a root, exp, ln, tanh and erf are worked out in 64 bits and then made
32, so that each is the nearest 32-bit number to what it should be (exp(1) is 2.71828175).

Noise. The generator is the specification's, written out so that any implementation gives the same numbers:
    mix(z):  z = (z + 0x9E3779B97F4A7C15) mod 2^64          (all arithmetic on unsigned 64-bit integers)
             z = (z xor (z >> 30)) * 0xBF58476D1CE4E5B9 mod 2^64
             z = (z xor (z >> 27)) * 0x94D049BB133111EB mod 2^64
             return z xor (z >> 31)
    k    = first 8 bytes, big-endian, of SHA-256 of the text "<seed>:<block id>"
    h(n) = mix(mix(mix(mix(k xor c) xor r) xor tick) xor n)       c, r from 1; tick from 0
    u(n) = (h(n) >> 11) / 2^53                                    a float in [0, 1)
    uniform:  u(0)
    normal:   sqrt(-2 * ln(1 - u(0))) * cos(2 * pi * u(1))
In a tile the cell joins the key: for each cell (cx, cy) the block is in, outermost first, k becomes
mix(mix(k xor cx xor d * 2^32) xor cy), d the tile's depth (0 for the outermost, 1 for the tile inside it, …),
except for cell (1, 1), which leaves k as it is: so the outermost tile's step is mix(mix(k xor cx) xor cy). Inner
data joins the key after the cells: at inner position (k1, k2, …), all from 1, k becomes
mix(… mix(mix(k xor k1 xor 2^63) xor k2) …), one mix for each inner axis in order, except at the first position
(every one of them 1), which leaves k as it is: so giving a noise block inner data changes none of the numbers it
already had. The depth and 2^63 are there so that a step at one depth is never the step at another, and a step
along the inner axes never a cell's: without them cell (2, 1) of an outer tile with cell (1, 1) of an inner one had
the key of cell (1, 1) with cell (2, 1), and cell (2, 1) at inner position (1, 1) that of cell (1, 1) at (2, 1).
(A cell's number is below 2^32 and an axis is at most 16,000,000 long, so neither reaches those bits.) It is worked out for the whole matrix at
once in 64-bit numbers and made 32-bit at the end; a uniform number that would round up to 1 is the largest 32-bit
number below 1, so it is always less than 1."""
import hashlib
import io
import math

import numpy as np

F = np.float32
D = np.float64
NAN = F('nan')
M64 = (1 << 64) - 1
INNER = 1 << 63      # joins the key with the first inner axis, so that a step along the inner axes is never a tile cell's
BELOW_ONE = np.nextafter(F(1), F(0))
def quiet():
    return np.errstate(all='ignore')


class Held:
    """An array some of whose entries are None: values, and none, true where the entry is None (the number there is 0).

    rest, of: where it is a sum or a product of several terms (binary, chain), what the terms that were not None
    came to at each entry that is None, as far as the next term needs it: of is '+' or '*', and rest a byte an
    entry, 0, 1 or 2 (see _class). Kept only where some entry's is not 0, and read only by the next step of the same
    sum or product: everything else makes its Held anew, without it."""
    __slots__ = ('values', 'none', 'rest', 'of')

    def __init__(self, values, none, rest=None, of=None):
        self.values, self.none, self.rest, self.of = values, none, rest, of


def _split(a):
    return (a.values, a.none) if isinstance(a, Held) else (a, None)


def _held(values, none):
    """What was made, with which of it is None: a plain array where none of it is."""
    if none is None or not none.any():
        return values
    none = np.broadcast_to(none, np.shape(values))
    values = np.array(values, dtype=F)
    values[none] = 0
    return Held(values, np.array(none))


def _both(fn, a):
    """A rule that only moves entries about, applied to the numbers and to which of them are None alike."""
    values, none = _split(a)
    return fn(values) if none is None else _held(fn(values), fn(none))


def nothing():
    return Held(np.zeros((), dtype=F), np.ones((), dtype=bool))


def number(x):
    return np.asarray(x, dtype=F)


def full(rows, cols, x, inner=()):
    return np.full(tuple(inner) + (rows, cols), x, dtype=F)


def empty(rows, cols, inner=()):
    to = tuple(inner) + (rows, cols)
    return Held(np.zeros(to, dtype=F), np.ones(to, dtype=bool))


def identity(rows, cols, inner=()):
    return np.array(np.broadcast_to(np.eye(rows, cols, dtype=F), tuple(inner) + (rows, cols)))


def blank(rows, cols, inner=()):
    return np.full(tuple(inner) + (rows, cols), NAN, dtype=F)


def table(text, skip):
    plain = text.replace('\r\n', '\n').replace('\r', '\n').replace('"', '').replace(' ', '').replace('\t', '')      # (it has been seen to hold numbers, commas, quotes and spaces, and nothing else)
    return np.loadtxt(io.StringIO(plain), delimiter=',', skiprows=skip, dtype=np.float64, ndmin=2, comments=None).astype(F)


def row(values):
    if any(v is None for v in values):
        return Held(np.asarray([0.0 if v is None else v for v in values], dtype=F)[None, :], np.asarray([v is None for v in values], dtype=bool)[None, :])
    return np.asarray(values, dtype=F)[None, :]


def spread(a, rows, cols, inner=None):
    whole = a
    a, none = _split(a)
    to = (np.shape(a)[:-2] if inner is None else tuple(inner)) + (rows, cols)
    out = np.array(np.broadcast_to(a, to), dtype=F)
    if none is None:
        return out
    made = _held(out, np.array(np.broadcast_to(none, to)))
    if isinstance(whole, Held) and whole.rest is not None and isinstance(made, Held):      # a sum or product spread over a matrix is that sum or product still
        made.rest, made.of = np.array(np.broadcast_to(whole.rest, to)), whole.of
    return made


def along(inner):
    n = len(inner)
    return [np.arange(1, length + 1, dtype=F).reshape((length,) + (1,) * (n - k + 1)) for k, length in enumerate(inner)]


def grid(rows, cols):
    return np.arange(1, cols + 1, dtype=F)[None, :], np.arange(1, rows + 1, dtype=F)[:, None]


EPS = F(2.0 ** -60)      # what stands for a None while a product is asked which of its terms are infinite: see _told
ERR, UP, DOWN = 1, 2, 4      # what the terms of an entry that are not None come to: no value; some of them ∞; some of them -∞


def _along(flags, axis):
    """Flags brought down to one axis (counted from the end): true at a place where any of them is."""
    return flags.any(axis=tuple(k for k in range(flags.ndim) if k != flags.ndim + axis))


def _told(a, ma, b, mb, s, none, lone, keep=True):
    """What the terms of each entry of a product that are not None come to, for the infinities of one sign s (1: ∞,
    -1: -∞): the product made with them, and a byte an entry of ERR, UP and DOWN.

    A None is held as 0, and 0 × ∞ is no number: so the product as it stands cannot say, of an entry one of whose
    None terms meets an infinity, whether the terms that are not None have a value. Two products can. In both a None
    is a number so small that it adds nothing to speak of (EPS, and then -EPS), and the infinities of the other sign
    are 1 or -1, so that every infinity left has the sign s. What a None makes against an infinity is then an
    infinity of the sign s in the first product and of the other sign in the second, and the two answers together
    say what was there without it:

        first, second      the terms that are not None
        a number, any      none of them infinite
        -s∞, any           some -s∞, none s∞
        s∞, -s∞            none infinite (both infinities are the None's)
        s∞, s∞ or none     some s∞, none -s∞
        none, -s∞          some -s∞, none s∞
        none, none         no value: 0 × ∞, ∞ − ∞ or an error among them

    An entry none of whose terms is None is told by the first alone. The second is asked only for the rows and the
    columns where the first leaves a doubt, which with one None and one infinity is one row and one column.
    lone: there are no infinities of the other sign at all, so only ERR is wanted of an entry with a None term, and
    the first product is the product itself at every other entry. keep: whether the first product is wanted back
    (it is let go before the second is made where it is not). Each product is one result of room, and the bytes a
    quarter of one."""
    other, big, small = F(-s * math.inf), F(s * math.inf), F(-s * math.inf)
    up, down = (UP, DOWN) if s > 0 else (DOWN, UP)

    def side(x, m):
        swap = x == other
        mine = bool(swap.any())
        if mine:
            x = np.where(swap, F(-s), x)
        del swap
        if m is not None:
            if mine:
                np.copyto(x, EPS, where=m)
            else:
                x = np.where(m, EPS, x)
        return x

    a2, b2 = side(a, ma), side(b, mb)
    first = np.matmul(a2, b2)
    code = np.isnan(first).astype(np.uint8)      # ERR is 1
    code[first == big] = up
    code[first == small] = down
    need = none & ((code & (ERR if lone else ERR | up)) != 0)
    if not keep:
        first = None
    if not need.any():
        return first, code
    rows, cols = np.flatnonzero(_along(need, -2)), np.flatnonzero(_along(need, -1))
    every, each = rows.size == need.shape[-2], cols.size == need.shape[-1]
    whole = rows.size * cols.size * 4 >= need.shape[-2] * need.shape[-1]      # a part that is a quarter of the whole or more is asked whole: picking rows and columns out copies them, and that room is then better spent on the product
    if ma is not None:
        np.copyto(a2, -EPS, where=ma)
    if mb is not None:
        np.copyto(b2, -EPS, where=mb)
    second = np.matmul(a2 if whole or every else a2[..., rows, :], b2 if whole or each else b2[..., :, cols])
    del a2, b2
    lost, low = np.isnan(second), second == small
    del second
    at = (Ellipsis, rows[:, None], cols)
    sub, need = (code, need) if whole else (code[at], need[at])
    was_lost = need & ((sub & ERR) != 0)
    was_big = need & ((sub & up) != 0)
    np.copyto(sub, lost.astype(np.uint8) | np.where(low, np.uint8(down), np.uint8(0)), where=was_lost)
    np.copyto(sub, np.where(low, np.uint8(0), np.uint8(up)), where=was_big)
    if not whole:
        code[at] = sub
    return first, code


def matmul(a, b):
    a, ma = _split(a)
    b, mb = _split(b)
    with quiet():
        if ma is None and mb is None:
            return np.matmul(a, b)
        # an entry is None where a term of it is: a None anywhere in its row of the one, or its column of the other
        shape = np.broadcast_shapes(a.shape[:-2], b.shape[:-2]) + (a.shape[-2], b.shape[-1])
        none = np.broadcast_to((ma.any(axis=-1, keepdims=True) if ma is not None else False) | (mb.any(axis=-2, keepdims=True) if mb is not None else False), shape)
        # An entry with no value stays one, None term or no. As numbers that is told by the product itself, but for
        # one case: a None (held as 0) set against an infinity is 0 × ∞, which is no term at all. Where no None of
        # the one lies at a place along the joined axis where the other has an infinity, that cannot be, and the
        # product is asked once. Otherwise it is asked twice for each sign of infinity there is (_told): at most
        # four products, whatever is in them and however much of it, and never more than five results of room.
        meets = (ma is not None and bool((ma & _along(np.isinf(b), -2)).any())) or (mb is not None and bool((mb & _along(np.isinf(a), -1)[:, None]).any()))
        signs = [s for s in (1, -1) if bool((a == F(s * math.inf)).any()) or bool((b == F(s * math.inf)).any())] if meets else []
        if not signs:
            out = np.matmul(a, b)
            wrong = none & np.isnan(out)
        elif len(signs) == 1:
            out, code = _told(a, ma, b, mb, signs[0], none, True)
            wrong = none & ((code & ERR) != 0)
            del code
        else:
            out, code = _told(a, ma, b, mb, 1, none, False)      # (out is the product with every -∞ taken as -1 or 1: right wherever no term is infinite)
            code |= _told(a, ma, b, mb, -1, none, False, False)[1]
            wrong = ((code & ERR) != 0) | (code >= (UP | DOWN))      # ∞ − ∞ among the terms: no value
            np.putmask(out, code == UP, F(math.inf))
            np.putmask(out, code == DOWN, F(-math.inf))
            del code
            np.putmask(out, wrong, NAN)
            wrong &= none
        keep = none & ~wrong
        np.putmask(out, wrong, NAN)
        np.putmask(out, keep, F(0))
        return Held(out, keep) if keep.any() else out


def transpose(a):
    return _both(lambda x: np.swapaxes(x, -1, -2), a)


def part(a, row, col, rows, cols):
    return _both(lambda x: x[..., row:row + rows, col:col + cols], a)


def _into(out, a, write):
    """a set into out by write(target, source), the numbers and which of them are None alike; gives out back."""
    out, into = _split(out)
    a, none = _split(a)
    write(out, a)
    if into is None and none is None:
        return out
    if into is None:
        into = np.zeros(out.shape, dtype=bool)
    write(into, np.zeros((), dtype=bool) if none is None else none)
    return Held(out, into) if into.any() else out


def place(out, a, row, col):
    rows, cols = _split(a)[0].shape[-2:]

    def write(target, source):
        target[..., row:row + rows, col:col + cols] = source
    return _into(out, a, write)


def repeat(a, down, across):
    return _both(lambda x: np.tile(x, (1,) * (x.ndim - 2) + (down, across)), a)


def take(a, rs, cs, ks=()):
    if ks and np.ndim(_split(a)[0]) == 2 + len(ks):
        return _both(lambda x: x[tuple(ks) + (rs, cs)][None, :], a)
    return _both(lambda x: x[..., rs, cs][..., None, :], a)


def put(out, rs, cs, row, ks=()):
    def write(target, source):
        if ks:
            target[tuple(ks) + (rs, cs)] = np.broadcast_to(source, (1, len(rs)))[0]
        else:
            target[..., rs, cs] = np.broadcast_to(source, np.shape(source)[:-2] + (1, len(rs)))[..., 0, :]
    return _into(out, row, write)


def _dim(axis, n):
    """Where a type's axis is among an array's: the columns last, the rows before them, the n inner axes first."""
    return n + 1 if axis == 0 else n if axis == 1 else axis - 2


def reorder(a, order):
    n = len(order) - 2
    perm = [0] * len(order)
    for k, source in enumerate(order):
        perm[_dim(k, n)] = _dim(source, n)
    return _both(lambda x: np.ascontiguousarray(np.transpose(x, perm)), a)


def stack(parts, at, rows, cols):
    n = _split(parts[0])[0].ndim - 2
    turn = (n + 1, n) + tuple(range(n))      # a part's columns and rows become the first two inner axes, its own follow

    def of(pick, fill, dtype):
        first = np.transpose(pick(parts[0]), turn)
        out = np.full(first.shape + (rows, cols), fill, dtype=dtype)
        for part, (col, row) in zip(parts, at):
            out[..., row, col] = np.transpose(pick(part), turn)
        return out
    out = of(lambda p: _split(p)[0], NAN, F)
    if not any(isinstance(p, Held) for p in parts):
        return out
    return _held(out, of(lambda p: p.none if isinstance(p, Held) else np.zeros(p.shape, dtype=bool), False, bool))


def entry(a, col, row):
    def of(x):
        got = x[..., row, col]
        if got.ndim == 1:
            return np.array(got[None, :])
        n = got.ndim
        return np.ascontiguousarray(np.transpose(got, tuple(range(2, n)) + (1, 0)))
    return _both(of, a)


def at_position(a, where):
    return _both(lambda x: x[tuple(where)], a)


def join(parts, inner):
    out = np.stack([_split(p)[0] for p in parts]).reshape(tuple(inner) + _split(parts[0])[0].shape)
    if not any(isinstance(p, Held) for p in parts):
        return out
    return _held(out, np.stack([p.none if isinstance(p, Held) else np.zeros(p.shape, dtype=bool) for p in parts]).reshape(out.shape))


def shape(a):
    a = _split(a)[0]
    return int(a.shape[-2]), int(a.shape[-1])


def inner(a):
    return tuple(int(x) for x in _split(a)[0].shape[:-2])


def size(a):
    rest = a.rest if isinstance(a, Held) else None
    a, none = _split(a)
    return int(a.nbytes) + (0 if none is None else int(none.nbytes)) + (0 if rest is None else int(rest.nbytes))


def item(a, r, c, ks=()):
    a = _split(a)[0]
    return float(a[tuple(ks) + (r, c)] if ks else a[..., r, c])


def is_none(a, r, c, ks=()):
    none = _split(a)[1]
    return none is not None and bool(none[tuple(ks) + (r, c)] if ks else none[..., r, c])


def nones(a):
    none = _split(a)[1]
    return 0 if none is None else int(none.sum())


TRUTH_AT_ONCE = 1 << 20      # entries looked at together by truth


def _pieces(values, none, most):
    """An array, and what says which of it is None, cut along their first axes into parts of at most so many entries
    (a part is a view: nothing is copied)."""
    if values.size <= most or values.ndim == 0:
        yield values, none
        return
    each = values.size // values.shape[0]
    if each > most:      # one step along this axis is too much: each is cut along the next
        for k in range(values.shape[0]):
            yield from _pieces(values[k], None if none is None else none[k], most)
        return
    step = most // each
    for k in range(0, values.shape[0], step):
        yield values[k:k + step], None if none is None else none[k:k + step]


def truth(a):
    values, none = _split(a)
    values = np.asarray(values)
    none = None if none is None else np.broadcast_to(none, values.shape)
    lost = False
    for part, gone in _pieces(values, none, TRUTH_AT_ONCE):      # in pieces: the flags made on the way are a few megabytes whatever the size of the matrix
        nan = np.isnan(part)
        if gone is not None:
            nan &= ~gone      # what lies under a None is not looked at: None is false whatever number is held beside it
        yes = ~nan & (part != 0)
        if gone is not None:
            yes &= ~gone
        if bool(yes.any()):
            return True
        lost = lost or bool(nan.any())
    return None if lost else False


def summary(a):
    a, none = _split(a)
    with quiet():
        known = a[~np.isnan(a)] if none is None else a[~np.isnan(a) & ~none]
        if not known.size:
            return None, None, None
        mean = float(known.mean(dtype=D))
        return float(known.min()), float(known.max()), None if math.isnan(mean) else mean      # (an infinity and its opposite have no mean)


IN_SPACE = {      # what a number has to be to lie in each number space (spaces.js), asked of the numbers that have a value
    'boolean': lambda v: (v == 0) | (v == 1),
    'ternary': lambda v: (v == 0) | (v == 1) | (v == -1),
    'natural': lambda v: np.isfinite(v) & (v == np.floor(v)) & (v >= 1),
    'whole': lambda v: np.isfinite(v) & (v == np.floor(v)) & (v >= 0),
    'integer': lambda v: np.isfinite(v) & (v == np.floor(v)),
    'rational': np.isfinite,      # a float is a ratio of whole numbers where it is finite: that it is one is all that can be asked of it
    'probability': lambda v: (v >= 0) & (v <= 1),
    'real': np.isfinite,
}


def outside(a, space, none):
    """The first entry of a that lies outside a number space, by row, then column, then inner position:
    (row, col, ks, what it holds) from 0, what it holds a Python float or None for None; or None where every entry
    lies in it. space: one of the ten words, or None for the space of None alone; none: whether None is admitted.
    An entry with no value (NaN: the browser's error) is no number to break a promise, as on the page, so extended
    and any are broken by nothing but a None that is not admitted."""
    values, mask = _split(a)
    with quiet():
        valued = ~np.isnan(values)
        if space is None:
            bad = valued if mask is None else valued & ~mask
        elif space in IN_SPACE:
            bad = valued & ~IN_SPACE[space](values)
            if mask is not None:
                bad &= ~mask
        else:
            bad = np.zeros(np.shape(values), dtype=bool)
        if mask is not None and not none:
            bad = bad | mask
        if not bad.any():
            return None
        n = bad.ndim - 2
        first = np.moveaxis(bad, (n, n + 1), (0, 1))      # rows, then columns, then the inner axes
        r, c, *ks = (int(x) for x in np.unravel_index(int(np.argmax(first)), first.shape))
        where = tuple(ks) + (r, c)
        return r, c, tuple(ks), (None if mask is not None and bool(mask[where]) else float(values[where]))


def _lost(*xs):
    out = np.isnan(xs[0])
    for x in xs[1:]:
        out = out | np.isnan(x)
    return out


def _yes(x):
    return x != 0


def _truth(flags, *of):
    return np.where(_lost(*of), NAN, flags.astype(F)).astype(F)


def _power(x, y):
    x, y = np.broadcast_arrays(np.asarray(x, dtype=F), np.asarray(y, dtype=F))
    as_it_was = x.shape
    x, y = np.atleast_1d(x), np.atleast_1d(y)
    out = np.power(x.astype(D), y.astype(D)).astype(F)
    whole = y == np.floor(y)
    none = np.isnan(x) | np.isnan(y) | ((x == 0) & (y < 0)) | (np.isinf(x) & (y == 0)) | (np.isinf(y) & ((x < 0) | (x == 1))) | ((x == -np.inf) & (y > 0) & ~whole)
    out[none] = NAN
    return out.reshape(as_it_was)


def root(a, p, q):
    """a to the power p/q, q odd: for a number below 0 the real one, the odd root ((-8)^(1/3) is -2)."""
    a, none = _split(a)
    if none is not None:
        return _held(root(a, p, q), none)
    with quiet():
        a = np.asarray(a, dtype=F)
        y = F(p / q)
        out = np.atleast_1d(_power(a, y))
        x = np.atleast_1d(a)
        below = (x < 0) & np.isfinite(x)
        out[below] = ((-1.0 if p % 2 else 1.0) * np.power(-x[below].astype(D), p / q)).astype(F)
        return out.reshape(np.shape(a))


def _erf(x):
    x = np.asarray(x, dtype=F)
    flat = np.ascontiguousarray(x).reshape(-1)
    out = np.empty(flat.shape, dtype=F)
    each = np.frompyfunc(math.erf, 1, 1)
    for i in range(0, flat.size, 1 << 18):      # a piece at a time, so that no more than a piece is ever held as Python numbers
        out[i:i + (1 << 18)] = each(flat[i:i + (1 << 18)].astype(np.float64)).astype(F)
    return out.reshape(x.shape)


def _wide(fn, a):
    """A function worked out in 64 bits and then made 32: so exp(1) is e as a 32-bit float holds it, to the last digit."""
    return fn(np.asarray(a, dtype=D)).astype(F)


COMPARE = {'==': np.equal, '!=': np.not_equal, '<': np.less, '>': np.greater, '<=': np.less_equal, '>=': np.greater_equal}


def _class(of, values, none, held, keep, minus):
    """What each entry says to the rest of a sum or a product it is a term of, a byte an entry: for a product 1 where
    it is 0 and 2 where it is an infinity; for a sum 1 where it is ∞ and 2 where it is -∞ (the two changed about for
    a term that is taken away); 0 otherwise. A 1 and a 2 among the terms that are not None is an entry with no value
    (0 × ∞, ∞ − ∞), and nothing else among them is. Where the entry is None it is what the terms set aside in it
    said (held.rest, where keep: the term is itself a step of this sum or product), and 0 where there were none."""
    # (bytes throughout: a flag is a byte, and two flags that are never both true are one byte, 1 or 2)
    if of == '*':
        out = np.asarray((values == 0).view(np.int8) | (np.isinf(values).view(np.int8) << 1))      # (asarray: one number alone is an array still)
    else:
        out = np.asarray((values == (-np.inf if minus else np.inf)).view(np.int8) | ((values == (np.inf if minus else -np.inf)).view(np.int8) << 1))
    if none is None:
        return out
    under = held.rest if keep and isinstance(held, Held) and held.rest is not None and held.of == of else None
    if under is None:
        out[np.broadcast_to(none, out.shape)] = 0
        return out
    if minus:
        under = SWAPPED[under]
    return np.where(none, under, out)


SWAPPED = np.array([0, 2, 1, 0], dtype=np.int8)      # a term taken away says the other thing: ∞ for -∞


def binary(op, a, b, chain=None):
    """chain: where this is a step of a sum or product of several terms, all of which are looked at together
    (values.js: together), (whether a is itself a step of it, whether b is). Then an entry one of whose terms is
    None is still an entry with no value where the others make one between them (∞ + −∞, 0 × ∞), in whatever order
    they stand. Left out: the two are a pair, and None with anything is None."""
    held_a, held_b = a, b
    a, ma = _split(a)
    b, mb = _split(b)
    if ma is None and mb is None:
        return _binary(op, a, b)
    with quiet():
        out = _binary(op, a, b)
        if op in ('&&', '||'):
            return out      # None is false, and the number under it is 0
        off = np.zeros((), dtype=bool)
        ma, mb = off if ma is None else ma, off if mb is None else mb
        lost = _lost(a, b)      # what has no value has none still: it comes before None
        if op in ('==', '!='):      # None is equal to None and to nothing else
            return np.where(lost, NAN, np.where(ma | mb, (ma & mb) == (op == '=='), out)).astype(F)
        none = (ma | mb) & ~lost
        if chain is None or op not in ('+', '-', '*'):
            return _held(np.where(lost, NAN, out).astype(F), none)
        of = '*' if op == '*' else '+'
        said = _class(of, a, ma if isinstance(held_a, Held) else None, held_a, chain[0], False) | _class(of, b, mb if isinstance(held_b, Held) else None, held_b, chain[1], op == '-')
        wrong = none & (said == 3)      # a 1 and a 2 among the terms that are not None
        none = none & ~wrong
        made = _held(np.where(lost | wrong, NAN, out).astype(F), none)
        if isinstance(made, Held):
            said = np.array(np.broadcast_to(said, made.none.shape))
            said[~made.none] = 0
            if said.any():
                made.rest, made.of = said, of
        return made


def step(op, a, b, steps):
    """One step of a sum or a product of several terms (+ - *): binary, with which of the two is itself a step of it."""
    return binary(op, a, b, steps)


def _binary(op, a, b):
    with quiet():
        if op == '+':
            return np.add(a, b, dtype=F)
        if op == '-':
            return np.subtract(a, b, dtype=F)
        if op == '*':
            return np.multiply(a, b, dtype=F)
        if op == '/':
            return np.where(np.equal(b, 0), NAN, np.divide(a, b, dtype=F)).astype(F)
        if op == '^':
            return _power(a, b)
        if op in COMPARE:
            return _truth(COMPARE[op](a, b), a, b)
        if op == '&&':
            return _truth(_yes(a) & _yes(b), a, b)
        if op == '||':
            return _truth(_yes(a) | _yes(b), a, b)
    raise ValueError('no such sign: %s' % op)


def call(fn, args):
    if not any(isinstance(x, Held) for x in args):
        return _call(fn, args)
    with quiet():
        split = [_split(x) for x in args]
        values, off = [v for v, _ in split], np.zeros((), dtype=bool)
        masks = [off if m is None else m for _, m in split]
        out = _call(fn, values)
        if fn == '!':
            return out      # None is false
        if fn == 'select':      # a None that chooses is false and chooses the second; what is chosen may itself be None
            return _held(out, np.where(_yes(values[0]), masks[1], masks[2]) & ~np.isnan(values[0]))
        if fn in ('max', 'min'):
            lost = _lost(values[0], values[1])
            return _held(np.where(lost, NAN, out).astype(F), (masks[0] | masks[1]) & ~lost)
        return _held(out, masks[0])


def _call(fn, args):
    with quiet():
        a = args[0]
        if fn == 'select':
            return np.where(np.isnan(a), NAN, np.where(_yes(a), args[1], args[2])).astype(F)
        if fn == 'max':
            return np.maximum(a, args[1], dtype=F)
        if fn == 'min':
            return np.minimum(a, args[1], dtype=F)
        if fn == 'neg':
            return np.negative(a, dtype=F)
        if fn == '!':
            return _truth(~_yes(a), a)
        if fn == 'abs':
            return np.abs(a, dtype=F)
        if fn == 'sqrt':
            return _wide(np.sqrt, a)
        if fn == 'exp':
            return _wide(np.exp, a)
        if fn == 'ln':
            return _wide(np.log, a)
        if fn == 'tanh':
            return _wide(np.tanh, a)
        if fn == 'erf':
            return _erf(a)
    raise ValueError('no such function: %s' % fn)


def _mix(z):
    z = z + np.uint64(0x9E3779B97F4A7C15)
    z = (z ^ (z >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
    z = (z ^ (z >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
    return z ^ (z >> np.uint64(31))


def _mix1(z):
    return int(_mix(np.array([z & M64], dtype=np.uint64))[0])


def _draw(k, r, c, dist, tick):
    """The numbers at rows r of columns c under keys k: arrays of unsigned 64-bit integers that spread over one another."""
    base = _mix(_mix(_mix(k ^ c) ^ r) ^ np.uint64(tick & M64))
    u = lambda n: (_mix(base ^ np.uint64(n)) >> np.uint64(11)).astype(D) / float(1 << 53)
    if dist == 'normal':
        return (np.sqrt(-2.0 * np.log(1.0 - u(0))) * np.cos(2.0 * math.pi * u(1))).astype(F)
    return np.minimum(u(0).astype(F), BELOW_ONE)


def noise(seed, key, rows, cols, dist, tick=0, cells=(), inner=()):
    k = int.from_bytes(hashlib.sha256(('%d:%s' % (seed, key)).encode('utf8')).digest()[:8], 'big')
    inner = tuple(inner)
    with quiet():
        for depth, (cx, cy) in enumerate(cells):
            if (cx, cy) != (1, 1):
                k = _mix1(_mix1(k ^ (cx & M64) ^ ((depth << 32) & M64)) ^ (cy & M64))
        out = np.empty(inner + (rows, cols), dtype=F)
        c = np.arange(1, cols + 1, dtype=np.uint64)[None, :]
        flat = out.reshape((-1, rows, cols))      # one matrix for each inner position, the first axis slowest
        at_once = max(1, (1 << 18) // (rows * cols))      # how many inner positions' keys are worked out together
        for p in range(0, flat.shape[0], at_once):
            # each position's key: one mix for each inner axis in order, but the first position, which keeps k itself
            where = np.unravel_index(np.arange(p, min(flat.shape[0], p + at_once)), inner) if inner else ()
            keys = np.full(min(flat.shape[0], p + at_once) - p, k, dtype=np.uint64)
            for axis, w in enumerate(where):
                keys = _mix(keys ^ (w.astype(np.uint64) + np.uint64(1)) ^ np.uint64(INNER if axis == 0 else 0))
            if inner and p == 0:
                keys[0] = np.uint64(k)
            keys = keys[:, None, None]
            step = max(1, (1 << 18) // (cols * keys.shape[0]))      # some rows at a time: the 64-bit numbers on the way are never more than a small part of the matrix
            for at in range(0, rows, step):
                r = np.arange(at + 1, min(rows, at + step) + 1, dtype=np.uint64)[None, :, None]
                flat[p:p + at_once, at:at + step] = _draw(keys, r, c[None], dist, tick)
        return out
