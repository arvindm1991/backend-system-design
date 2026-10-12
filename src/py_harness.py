# Python lab harness. Shared by the in-browser runner (Pyodide, in a Web Worker) and
# test/check_py_labs.py (plain CPython), so both use exactly the same semantics:
#   - fresh namespace dict per test; exec(user_code, ns), then the test code runs in the same ns
#   - helpers injected into ns: assert_equal, assert_raises, run
#   - top-level `await` is allowed in test (and user) code: it is compiled with
#     PyCF_ALLOW_TOP_LEVEL_AWAIT and driven to completion by run()
#   - run(coro) drives a coroutine on a private event loop with a *virtual clock*: asyncio.sleep(5)
#     finishes instantly, timeouts are deterministic, and nothing waits on real time.
#   - print() output is captured per test.
import ast as _ast
import asyncio as _asyncio
import contextlib as _contextlib
import io as _io
import json as _json
import linecache as _linecache
import traceback as _traceback

_USER_FILE = '<your code>'
_TEST_FILE = '<test>'


class _VirtualSelector:
    """No I/O: 'waiting' for timeout seconds just advances the loop's virtual clock."""

    def __init__(self, loop):
        self._loop = loop

    def select(self, timeout=None):
        if timeout:
            self._loop._virtual_now += timeout
        return []

    def get_map(self):
        return {}

    def close(self):
        pass


class _VirtualLoop(_asyncio.BaseEventLoop):
    def __init__(self):
        super().__init__()
        self._virtual_now = 0.0
        self._selector = _VirtualSelector(self)

    def time(self):
        return self._virtual_now

    def _process_events(self, event_list):
        pass

    def _write_to_self(self):
        pass


def run(coro):
    """Run a coroutine to completion and return its result (works even inside another loop)."""
    if not _asyncio.iscoroutine(coro) and not _asyncio.isfuture(coro):
        raise TypeError('run() expects a coroutine, got %r. Did you forget to call the async function?' % (coro,))
    loop = _VirtualLoop()
    outer = _asyncio.events._get_running_loop()
    _asyncio.events._set_running_loop(None)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            loop.run_until_complete(loop.shutdown_asyncgens())
        except Exception:
            pass
        loop.close()
        _asyncio.events._set_running_loop(outer)


def _short(v, limit=600):
    s = repr(v)
    return s if len(s) <= limit else s[:limit] + '…'


def assert_equal(actual, expected, msg=None):
    if not (actual == expected):
        raise AssertionError((msg + ': ' if msg else '') + 'expected ' + _short(expected) + ', got ' + _short(actual))


def assert_raises(exc_type, fn, *args, **kwargs):
    name = getattr(exc_type, '__name__', str(exc_type))
    try:
        fn(*args, **kwargs)
    except exc_type as e:
        return e
    except Exception as e:  # noqa: BLE001
        raise AssertionError('expected %s, but got %s: %s' % (name, type(e).__name__, e)) from None
    raise AssertionError('expected %s to be raised, but nothing was raised' % name)


def _register_source(filename, src):
    _linecache.cache[filename] = (len(src), None, src.splitlines(True), filename)


def _exec(src, filename, ns):
    _register_source(filename, src)
    code = compile(src, filename, 'exec', flags=_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, dont_inherit=True)
    result = eval(code, ns)  # a coroutine if the code used top-level await
    if _asyncio.iscoroutine(result):
        run(result)


def _format_error(e):
    """Traceback trimmed to frames in the learner's code and the test, plus the error line."""
    te = _traceback.TracebackException.from_exception(e)
    if isinstance(e, SyntaxError):
        return ''.join(te.format_exception_only()).strip()
    frames = [f for f in te.stack if f.filename in (_USER_FILE, _TEST_FILE)]
    te.stack = _traceback.StackSummary.from_list(frames)
    lines = []
    if frames:
        lines.append('Traceback (most recent call last):\n')
        lines.extend(te.stack.format())
    lines.extend(te.format_exception_only())
    return ''.join(lines).rstrip()


def _message(e):
    if isinstance(e, AssertionError):
        return str(e) or 'assertion failed'
    if isinstance(e, SyntaxError):
        return 'SyntaxError: %s (line %s)' % (e.msg, e.lineno)
    return '%s: %s' % (type(e).__name__, e) if str(e) else type(e).__name__


def _lab_syntax_check(user_code):
    try:
        compile(user_code, _USER_FILE, 'exec', flags=_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, dont_inherit=True)
        return ''
    except SyntaxError as e:
        _register_source(_USER_FILE, user_code)
        return _format_error(e)


def _lab_run_test(user_code, test_code):
    """Run one test in a fresh namespace. Returns a JSON string: {ok, msg, tb, out}."""
    ns = {'__name__': '__lab__', 'assert_equal': assert_equal, 'assert_raises': assert_raises, 'run': run}
    out = _io.StringIO()
    res = {'ok': True, 'msg': '', 'tb': '', 'out': ''}
    phase = 'your code'
    try:
        with _contextlib.redirect_stdout(out), _contextlib.redirect_stderr(out):
            _exec(user_code, _USER_FILE, ns)
            phase = 'test'
            _exec(test_code, _TEST_FILE, ns)
    except BaseException as e:  # noqa: BLE001  (SystemExit, KeyboardInterrupt from a timeout, ...)
        if isinstance(e, KeyboardInterrupt):
            raise
        res['ok'] = False
        msg = _message(e)
        if phase == 'your code' and not isinstance(e, AssertionError):
            msg = 'Error while running your code: ' + msg
        res['msg'] = msg
        res['tb'] = '' if isinstance(e, AssertionError) and not _has_user_frames(e) else _format_error(e)
    res['out'] = out.getvalue()[-4000:]
    return _json.dumps(res)


def _has_user_frames(e):
    tb = e.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == _USER_FILE:
            return True
        tb = tb.tb_next
    return False
