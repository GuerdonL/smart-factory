"""Every array there is. This is the one module that imports NumPy: another library takes its place by giving
these same functions, and nothing else in the backend would change.

An array is 32-bit floats with its rows and columns as its LAST two axes: shape (..., rows, cols). Everything here
reads and writes from the end (a[..., r, c], axis -2 and -1), so leading axes can be added later and every
function below repeats over them. An entry that has no value (a division by zero, ∞ − ∞, 0 × ∞, the root or the
logarithm of a negative number: the browser's error value) is NaN, and stays NaN through whatever is made of it;
an infinity is an infinity. Nothing here raises for what the numbers are.

Making them
    number(x)                        one number
    full(rows, cols, x)              every entry x
    identity(rows, cols)             1 where the column is the row, else 0
    blank(rows, cols)                every entry without a value, to be set into (place, put)
    table(text, skip)                the numbers of a CSV already seen to be one (data.py: inspect), skip lines passed over
    row(values)                      Python numbers as one row
    spread(a, rows, cols)            one entry, one row or one column spread over a whole matrix (a matrix is itself)
    grid(rows, cols)                 (i, j): each entry's column and its row, from 1, as arrays that spread over the matrix
    noise(seed, key, rows, cols, dist, tick, cells)     see below
Putting them together
    matmul(a, b)                     the matrix product
    transpose(a)
    binary(op, a, b)                 entry by entry: + - * / ^, == != < > <= >= (1 or 0), && ||. A side that is one
                                     entry, one row or one column is spread over the other
    call(fn, [args])                 entry by entry: neg ! abs sqrt exp ln tanh erf; max min; select(c, a, b), which
                                     takes a where c is not 0 and b elsewhere: both sides are whole arrays already,
                                     and what is not chosen is dropped, so an error there does no harm
    part(a, row, col, rows, cols)    a range of it, from 0
    place(out, a, row, col)          a set into out with its top-left corner there
    repeat(a, down, across)          a set down across by down times
    take(a, rs, cs)                  the entries at those rows and columns (lists, from 0), as one row
    put(out, rs, cs, row)            and such a row set back at those places
Reading them
    shape(a) -> (rows, cols);  size(a) -> how many bytes it takes
    item(a, r, c) -> one entry as a Python float (from 0)
    summary(a) -> (least, most, mean) of the entries that have a value, as Python floats, or (None, None, None)

How the arithmetic differs from plain floating point, so that it is the browser's (values.js) wherever both have an
answer: dividing by zero has no value (never an infinity); 0 to a power below 0 likewise; an infinity to the power
0, 1 to an infinite power and a number below 0 to an infinite power have none; an odd root of a number below 0 is
the real one ((-8)^(1/3) is -2), found by reading the power as a fraction with an odd number under the line of at
most 1023; an even root of one has none. A comparison with something that has no value has none. Sums, products
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
mix(mix(k xor cx) xor cy), except for cell (1, 1), which leaves k as it is. It is worked out for the whole matrix at
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
BELOW_ONE = np.nextafter(F(1), F(0))
def quiet():
    return np.errstate(all='ignore')


def number(x):
    return np.asarray(x, dtype=F)


def full(rows, cols, x):
    return np.full((rows, cols), x, dtype=F)


def identity(rows, cols):
    return np.eye(rows, cols, dtype=F)


def blank(rows, cols):
    return np.full((rows, cols), NAN, dtype=F)


def table(text, skip):
    plain = text.replace('\r\n', '\n').replace('\r', '\n').replace('"', '').replace(' ', '').replace('\t', '')      # (it has been seen to hold numbers, commas, quotes and spaces, and nothing else)
    return np.loadtxt(io.StringIO(plain), delimiter=',', skiprows=skip, dtype=np.float64, ndmin=2, comments=None).astype(F)


def row(values):
    return np.asarray(values, dtype=F)[None, :]


def spread(a, rows, cols):
    return np.array(np.broadcast_to(a, np.shape(a)[:-2] + (rows, cols)), dtype=F)


def grid(rows, cols):
    return np.arange(1, cols + 1, dtype=F)[None, :], np.arange(1, rows + 1, dtype=F)[:, None]


def matmul(a, b):
    with quiet():
        return np.matmul(a, b)


def transpose(a):
    return np.swapaxes(a, -1, -2)


def part(a, row, col, rows, cols):
    return a[..., row:row + rows, col:col + cols]


def place(out, a, row, col):
    out[..., row:row + a.shape[-2], col:col + a.shape[-1]] = a


def repeat(a, down, across):
    return np.tile(a, (1,) * (a.ndim - 2) + (down, across))


def take(a, rs, cs):
    return a[..., rs, cs][..., None, :]


def put(out, rs, cs, row):
    out[..., rs, cs] = np.broadcast_to(row, row.shape[:-2] + (1, len(rs)))[..., 0, :]


def shape(a):
    return int(a.shape[-2]), int(a.shape[-1])


def size(a):
    return int(a.nbytes)


def item(a, r, c):
    return float(a[..., r, c])


def summary(a):
    with quiet():
        known = a[~np.isnan(a)]
        if not known.size:
            return None, None, None
        mean = float(known.mean(dtype=D))
        return float(known.min()), float(known.max()), None if math.isnan(mean) else mean      # (an infinity and its opposite have no mean)


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
    odd = (x < 0) & np.isfinite(x) & np.isfinite(y) & ~whole      # a root of a number below 0: the real one where the root is odd
    if odd.any():
        at = np.nonzero(odd)
        xs, ys = x[at].astype(np.float64), y[at].astype(np.float64)
        got, left = np.full(xs.shape, np.nan), np.ones(xs.shape, dtype=bool)
        for q in range(2, 1024):
            p = np.rint(ys * q)
            fits = left & (np.abs(ys * q - p) <= 1.2e-7 * q * np.maximum(np.abs(ys), 1e-30))
            if fits.any():
                if q % 2:
                    got[fits] = np.where(p[fits] % 2 == 0, 1.0, -1.0) * np.power(-xs[fits], ys[fits])
                left &= ~fits      # (under an even number it is an even root: none)
                if not left.any():
                    break
        out[at] = got.astype(F)
    return out.reshape(as_it_was)


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


def binary(op, a, b):
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


def noise(seed, key, rows, cols, dist, tick=0, cells=()):
    k = int.from_bytes(hashlib.sha256(('%d:%s' % (seed, key)).encode('utf8')).digest()[:8], 'big')
    with quiet():
        for cx, cy in cells:
            if (cx, cy) != (1, 1):
                k = _mix1(_mix1(k ^ (cx & M64)) ^ (cy & M64))
        c = np.arange(1, cols + 1, dtype=np.uint64)[None, :]
        r = np.arange(1, rows + 1, dtype=np.uint64)[:, None]
        base = _mix(_mix(_mix(np.uint64(k) ^ c) ^ r) ^ np.uint64(tick & M64))
        u = lambda n: (_mix(base ^ np.uint64(n)) >> np.uint64(11)).astype(np.float64) / float(1 << 53)
        if dist == 'normal':
            return (np.sqrt(-2.0 * np.log(1.0 - u(0))) * np.cos(2.0 * math.pi * u(1))).astype(F)
        return np.minimum(u(0).astype(F), BELOW_ONE)
