"""The backend's own tests (backend/tests), run from here too, so that `python3 -B -m unittest discover tests` holds
the backend to what it can without NumPy: the formula parser, validate against graph.js's on the shared fixtures, the
data files and the limits need only the standard library. The tests that need NumPy are skipped here, each saying so;
run with the backend's environment they all run (README: The backend):

    backend/.venv/bin/python -B -m unittest discover -s backend/tests -t ."""
import os
import sys
import unittest

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_tests(loader, tests, pattern):
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    return unittest.TestLoader().discover(os.path.join(ROOT, 'backend', 'tests'), pattern='test_*.py', top_level_dir=ROOT)
