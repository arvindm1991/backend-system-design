"""A stand-in for the Pyodide CDN, used by test/run.py when cdn.jsdelivr.net is unreachable.

It serves a tiny `pyodide.js` whose loadPyodide() returns an object with the few Pyodide APIs the
page's worker uses (runPython, loadPackagesFromImports, globals.get(name)(...args), version). Calls
into Python are forwarded with a synchronous XHR to this server, which runs them in CPython with the
same src/py_harness.py. So the whole in-page path is exercised for real (lazy load + loading state,
Web Worker protocol, per-test timeout that terminates the worker, restart, result rendering) with
CPython standing in for the WebAssembly interpreter.
"""
import http.server
import json
import pathlib
import subprocess
import sys
import threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
HARNESS = ROOT / 'src' / 'py_harness.py'

STUB_JS = r'''
self.loadPyodide = async function (opts) {
  const base = opts.indexURL;
  await new Promise((r) => setTimeout(r, 400)); // pretend to download
  return {
    version: 'stub-cpython',
    runPython(code) { return undefined; },               // the harness is loaded server-side
    async loadPackagesFromImports(code) { return []; },
    globals: {
      get(name) {
        const f = (...args) => {
          const x = new XMLHttpRequest();
          x.open('POST', base + 'call', false);              // synchronous, like a real in-worker call
          x.setRequestHeader('Content-Type', 'text/plain');
          x.send(JSON.stringify({ fn: name, args }));
          if (x.status !== 200) throw new Error('stub call failed: ' + x.status + ' ' + x.responseText);
          return JSON.parse(x.responseText).result;
        };
        f.destroy = () => {};
        return f;
      },
    },
  };
};
'''

CHILD = r'''
import json, sys
req = json.loads(sys.stdin.read())
H = {'__name__': '_py_harness'}
exec(compile(open(sys.argv[1]).read(), sys.argv[1], 'exec'), H)
print(json.dumps({'result': H[req['fn']](*req['args'])}))
'''


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        b = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.endswith('/pyodide.js'):
            self._send(200, STUB_JS, 'text/javascript')
        else:
            self._send(404, 'not found', 'text/plain')

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n).decode()
        try:
            cp = subprocess.run([sys.executable, '-I', '-c', CHILD, str(HARNESS)], input=body,
                                capture_output=True, text=True, timeout=20, cwd='/tmp')
            if cp.returncode != 0:
                self._send(500, cp.stderr[-2000:], 'text/plain')
            else:
                self._send(200, cp.stdout, 'application/json')
        except subprocess.TimeoutExpired:
            self._send(500, 'timed out in stub', 'text/plain')
        except (BrokenPipeError, ConnectionResetError):
            pass


def start():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    srv.daemon_threads = True
    srv.handle_error = lambda request, client_address: None  # a terminated worker closes its socket mid-call
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'
