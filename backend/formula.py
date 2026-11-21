"""The formula language, read. Text in, a tree out; nothing here is ever executed.

This is expression.js's grammar written again, for the formulas a graph holds (graph.js): a variable's entries, a
map's and a mapalong's formula, an attribute's. From what binds loosest to what binds tightest:

    a || b                    or
    a && b                    and
    == != < > <= >=           a comparison (≠ ≤ ≥ are read too)
    + -
    * /                       × · ÷ − are read as * * / -, and a number or a bracket set straight against a bracket,
                              a name or a root multiplies: 2(3+1), 2x, 2√3
    -a  !a                    minus, and not
    a ^ b                     a power, right to left
    √a  ∜a                    a square or fourth root of the number, name or bracket that follows
    numbers, brackets, names, and select(c, a, b), max(a, b), min(a, b), abs(a), sqrt(a), exp(a), ln(a), tanh(a),
    erf(a), inf, infinity, ∞, true, false, and none or ∅: None (values.js), which evaluate asks ops.nothing() for

A name is a letter or _ and then letters, digits, _ and dots (index.x), or $ and digits ($1: an input of the node).
What a name stands for is the caller's to say. A capsule (@[…]) is refused: a graph's formula holds none.

The text is read by the functions below and by nothing else: no part of it reaches eval, exec, a shell or an import.
It is bounded (limits.py: MAX_FORMULA characters, MAX_NESTING deep), so reading it is quick whatever it holds, and
the tree is walked with a list of its own, so a long sum is no deeper than a short one.

    parse(text)                 -> a tree; raises Wrong(why) where the text cannot be read
    names_in(text)              -> the names in it that are not words of the language, in order; raises Wrong
    formula_ok(text, most, arrow=False, empty=False)
                                -> whether it is a formula a graph may hold (graph.js: formulaOk): it reads, and
                                   every name is $1 to $most, index.x or index.y, k1 to k6 (the inner position
                                   of the entry: INNER), or (arrow) x, i or j
    axis_of(name)               -> 'x' | 'y' for index.x and index.y, else None
    evaluate(tree, leaf, ops)   -> what it comes to. leaf(name) gives a name's value; ops does the arithmetic:
                                   ops.number(float), ops.binary(op, a, b) for + - * / ^ == != < > <= >= && ||,
                                   ops.call(fn, [args]) for neg ! select max min abs sqrt exp ln tanh erf, and
                                   ops.root(a, p, q) for a to the power p/q where the exponent is written in the
                                   formula as a fraction with an odd number under the line ((0-8)^(1/3), x^0.2):
                                   only then has a number below 0 a real power, as in the browser. Whether it is
                                   one is read off the formula's own text, exactly, never off a float.
    rational(tree), odd_root(tree)   -> a tree of numbers alone as a Fraction; an exponent as (p, q) with q odd
                                   Every argument of a select is worked out: what is not chosen is dropped by ops.
    parse_symbolic(text)        -> the tree of a symbolic value's text ({ "sym": "1+sqrt(2)" }), as the browser's
                                   solver writes it: the same grammar, with log for ln and the names e and pi
    SYMBOLIC                    -> { 'e': …, 'pi': … }

A tree is ('num', float, Fraction | None) | ('name', text) | ('op', sign, a, b) | ('fn', name, [trees]). A number
typed with more than 40 characters has no Fraction and is ('num', float, None, True): spaces.py tells it so from ∞."""
import math
import re
from fractions import Fraction

from .limits import MAX_FORMULA, MAX_NESTING


class Wrong(ValueError):
    """The text cannot be read; str() says why."""


ARITY = {'select': 3, 'max': 2, 'min': 2, 'abs': 1, 'sqrt': 1, 'exp': 1, 'ln': 1, 'tanh': 1, 'erf': 1}
NOTHING = object()      # what the word none stands for, until ops makes a value of it
CONSTANT = {'inf': math.inf, 'infinity': math.inf, 'true': 1.0, 'false': 0.0, 'none': NOTHING}
SYMBOLIC = {'e': math.e, 'pi': math.pi}
SIGN = {'×': '*', '·': '*', '∙': '*', '÷': '/', '−': '-', '–': '-', '≠': '!=', '≤': '<=', '≥': '>='}
SPACE = set('\t\n\v\f\r                  　﻿​')
NUMBER = re.compile(r'\d+\.?\d*|\.\d+', re.ASCII)
NAME = re.compile(r'[A-Za-z_][\w.]*', re.ASCII)
INPUT = re.compile(r'\$\d+', re.ASCII)
DOLLAR = re.compile(r'\$([1-9]\d*)', re.ASCII)
AXIS = re.compile(r'index\.(x|y)')
INNER = re.compile(r'[kK]([1-6])')      # k1 to k6: the inner position of the entry being worked out (graph.js: INNER)
TWO = ('==', '!=', '<=', '>=', '&&', '||')
ONE = set('+-*/^(),<>!√∜∞∅')
UNREAD = 'that cannot be read as arithmetic'
# what binds how tightly, loosest first; all of them group from the left
LEVEL = {'||': 1, '&&': 2, '==': 3, '!=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 5}
STARTS = ('name', '(', '√', '∜', '∞')      # what, set straight against a number or a bracket, multiplies it


def tokens(text):
    if len(text) > MAX_FORMULA:
        raise Wrong('a formula of more than %d characters' % MAX_FORMULA)
    out, i, n = [], 0, len(text)
    while i < n:
        raw = text[i]
        c = SIGN.get(raw, raw)
        if c in SPACE:
            i += 1
            continue
        if c == '@':
            raise Wrong('a capsule, which a formula of the graph does not hold')
        m = NUMBER.match(text, i)
        if m:
            out.append(('num', (float(m.group()), Fraction(m.group()) if len(m.group()) <= 40 else None, len(m.group()) > 40)))      # as a float, exactly as it was typed (0.2 is 1/5), and whether it is typed long
            i = m.end()
            continue
        m = NAME.match(text, i)
        if m:
            name = m.group().rstrip('.')
            out.append(('name', name))
            i += len(name)
            continue
        m = INPUT.match(text, i)
        if m:
            out.append(('name', m.group()))
            i = m.end()
            continue
        two = c if len(c) == 2 else c + text[i + 1:i + 2]
        if two in TWO:
            out.append((two, None))
            i += 1 if len(c) == 2 else 2
            continue
        if c in ONE:
            out.append((c, None))
            i += 1
            continue
        raise Wrong('cannot read "%s"' % raw)
    return out


def _parse(text, arity):
    ts = tokens(text)
    at = [0]
    depth = [0]

    def peek():
        return ts[at[0]][0] if at[0] < len(ts) else None

    def take(t):
        if peek() == t:
            at[0] += 1
            return True
        return False

    def deeper():
        depth[0] += 1
        if depth[0] > MAX_NESTING:
            raise Wrong('more than %d brackets, signs and powers one inside the next' % MAX_NESTING)

    def atom():
        if at[0] >= len(ts):
            raise Wrong(UNREAD)
        t, v = ts[at[0]]
        at[0] += 1
        if t == 'num':
            return ('num', v[0], v[1], True) if v[2] else ('num', v[0], v[1])
        if t == '∞':
            return ('num', math.inf, None)
        if t == '∅':
            return ('name', 'none')
        if t == '(':
            deeper()
            e = binary(1)
            depth[0] -= 1
            if not take(')'):
                raise Wrong('a bracket is not closed')
            return e
        if t in ('√', '∜'):
            deeper()
            root = ('fn', 'sqrt', [under()])
            depth[0] -= 1
            return ('fn', 'sqrt', [root]) if t == '∜' else root
        if t != 'name':
            raise Wrong(UNREAD)
        fn = v.lower()
        if fn not in arity or peek() != '(':
            return ('name', v)
        at[0] += 1
        deeper()
        args = []
        if not take(')'):
            while True:
                args.append(binary(1))
                if not take(','):
                    break
            if not take(')'):
                raise Wrong('a bracket is not closed')
        depth[0] -= 1
        if len(args) != arity[fn]:
            raise Wrong('%s takes %s value%s' % (fn, ('no', 'one', 'two', 'three')[arity[fn]], '' if arity[fn] == 1 else 's'))
        return ('fn', fn, args)

    def under():      # what a root sign applies to, with any sign it carries: √-4 is √(-4)
        if take('-'):
            deeper()
            e = ('fn', 'neg', [under()])
            depth[0] -= 1
            return e
        if take('+'):
            deeper()
            e = under()
            depth[0] -= 1
            return e
        if peek() not in STARTS and peek() != 'num':
            raise Wrong('a root sign with nothing under it')
        return atom()

    def power():
        a = atom()
        if take('^'):
            deeper()
            a = ('op', '^', a, unary())
            depth[0] -= 1
        return a

    def unary():
        for sign, fn in (('-', 'neg'), ('+', None), ('!', '!')):
            if take(sign):
                deeper()
                e = unary()
                depth[0] -= 1
                return ('fn', fn, [e]) if fn else e
        return power()

    def binary(least):      # every sign that binds at least this tightly, grouped from the left
        a = unary()
        while True:
            t = peek()
            level = LEVEL.get(t)
            if level is not None and level >= least:
                at[0] += 1
                a = ('op', t, a, unary() if level == 5 else binary(level + 1))
            elif t in STARTS and least <= 5:
                a = ('op', '*', a, power())
            else:
                return a

    tree = binary(1)
    if at[0] < len(ts):
        raise Wrong(UNREAD)
    return tree


def parse(text):
    if not isinstance(text, str):
        raise Wrong('a formula is text')
    return _parse(text, ARITY)


def parse_symbolic(text):
    if not isinstance(text, str):
        raise Wrong('a symbolic value is text')
    return _parse(text, dict(ARITY, log=1))


def leaves(tree):
    out, todo = [], [tree]
    while todo:
        n = todo.pop()
        if n[0] == 'name':
            out.append(n[1])
        elif n[0] == 'op':
            todo.append(n[3])
            todo.append(n[2])
        elif n[0] == 'fn':
            todo.extend(reversed(n[2]))
    return out


def names_in(text):
    return [name for name in leaves(parse(text)) if name.lower() not in CONSTANT]


def axis_of(name):
    m = AXIS.fullmatch(name.strip().lower()) if isinstance(name, str) else None
    return m.group(1) if m else None


def reads_index(text):
    """Whether a formula reads the index (tiles.js: reads): a name in it is index.x or index.y."""
    return any(axis_of(w.rstrip('.')) for w in NAME.findall(re.sub(r'@\[[^\]]*\]', ' ', text if isinstance(text, str) else '')))


def formula_ok(text, most, arrow=False, empty=False):
    if not isinstance(text, str):
        return False
    if not text.strip(''.join(SPACE - {'​'})):
        return empty
    try:
        names = names_in(text)
    except Wrong:
        return False
    for name in names:
        m = DOLLAR.fullmatch(name)
        if m:
            if int(m.group(1)) > most:
                return False
        elif axis_of(name) is None and not INNER.fullmatch(name) and not (arrow and name.lower() in ('x', 'i', 'j')):
            return False
    return True


def rational(tree):
    """What a tree comes to exactly, where it is written out of numbers alone with + - * / and brackets: a Fraction.
    None for anything else (a name, a function, a power, an infinity, a division by zero)."""
    out, todo = [], [(tree, False)]
    while todo:
        node, ready = todo.pop()
        kind = node[0]
        if kind == 'num':
            if node[2] is None:
                return None
            out.append(node[2])
        elif kind == 'fn' and node[1] == 'neg':
            if not ready:
                todo.append((node, True))
                todo.append((node[2][0], False))
            else:
                out.append(-out.pop())
        elif kind == 'op' and node[1] in '+-*/' and len(node[1]) == 1:
            if not ready:
                todo.append((node, True))
                todo.append((node[3], False))
                todo.append((node[2], False))
            else:
                b = out.pop()
                a = out.pop()
                if node[1] == '/' and b == 0:
                    return None
                r = a + b if node[1] == '+' else a - b if node[1] == '-' else a * b if node[1] == '*' else a / b
                if r.numerator.bit_length() > 256 or r.denominator.bit_length() > 256:
                    return None
                out.append(r)
        else:
            return None
    return out[0]


def odd_root(tree):
    """For a power's exponent: (p, q) where it is written as a fraction that is no whole number, in lowest terms, with q
    odd: then a number below 0 has a real power, the odd root. None for any other exponent."""
    r = rational(tree)
    return (r.numerator, r.denominator) if r is not None and r.denominator != 1 and r.denominator % 2 == 1 else None


def evaluate(tree, leaf, ops):
    out, todo = [], [(tree, False)]
    while todo:
        node, ready = todo.pop()
        kind = node[0]
        if kind == 'num':
            out.append(ops.number(node[1]))
        elif kind == 'name':
            fixed = CONSTANT.get(node[1].lower())
            out.append(ops.nothing() if fixed is NOTHING else ops.number(fixed) if fixed is not None else leaf(node[1]))
        elif not ready:
            todo.append((node, True))
            for child in reversed((node[2], node[3]) if kind == 'op' else node[2]):
                todo.append((child, False))
        elif kind == 'op':
            b = out.pop()
            a = out.pop()
            odd = odd_root(node[3]) if node[1] == '^' else None      # read off the formula as it is written, never off a float
            out.append(ops.root(a, odd[0], odd[1]) if odd else ops.binary(node[1], a, b))
        else:
            n = len(node[2])
            args = out[len(out) - n:]
            del out[len(out) - n:]
            out.append(ops.call('ln' if node[1] == 'log' else node[1], args))
    return out[0]
