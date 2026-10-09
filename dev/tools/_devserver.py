#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地开发服务器 = 静态服务 + 崩溃上报端点。

为什么不用 `python -m http.server`：
    它只收 GET/HEAD，而「第十层黑屏」那类故障**没有服务端就取不到证据** ——
    玩家的浏览器里有什么错、当时是第几层、room.bg 在不在，全在页面上下文里。
    本脚本加一个 POST `/__diag`，把游戏自己报上来的诊断追加进
    `dev/data/_crashlog.jsonl`；下次黑屏不用截图、不用让玩家翻控制台，读文件即可。

用法（仓库根目录）：
    python dev/tools/_devserver.py            # 默认 8848
    python dev/tools/_devserver.py 8849       # 换端口

接口：
    GET  /__diag   -> 返回最近的上报原文（ndjson），浏览器直接打开就能看
    POST /__diag   -> 游戏端 recordDiag() 回传，追加一行；返回 204
    其余路径        -> 静态文件（根目录 = 仓库根），并对 html/js/css 打 no-store，
                       免得改完代码刷新还是旧构建（排查时最怕这个）
"""
import json
import os
import sys
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LOG = os.path.join(ROOT, 'dev', 'data', '_crashlog.jsonl')
NO_STORE_EXT = ('.html', '.htm', '.js', '.css')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        kw['directory'] = ROOT
        super().__init__(*a, **kw)

    # ---- 上报端点 ----
    def _diag_post(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = 0
        raw = self.rfile.read(n) if n > 0 else b''
        try:
            rec = json.loads(raw.decode('utf-8'))
        except Exception:
            rec = {'raw': raw.decode('utf-8', 'replace')}
        rec['_serverAt'] = datetime.now().isoformat(timespec='seconds')
        try:
            os.makedirs(os.path.dirname(LOG), exist_ok=True)
            with open(LOG, 'a', encoding='utf-8') as f:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        except Exception as e:
            sys.stderr.write('[diag] 写日志失败: %r\n' % (e,))
        # 顺手在终端回显一行摘要，跑在后台时也能一眼看到「刚报了个什么错」
        snap = rec.get('snap') or {}
        sys.stderr.write('[diag] %s @ %s层 %s :: %s\n' % (
            rec.get('kind'), snap.get('depth'), snap.get('style'), rec.get('msg')))
        sys.stderr.flush()
        self.send_response(204)
        self.end_headers()

    def _diag_get(self):
        body = b''
        if os.path.exists(LOG):
            with open(LOG, 'rb') as f:
                body = f.read()[-400000:]
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split('?')[0] == '/__diag':
            return self._diag_post()
        self.send_error(405, 'only POST /__diag is supported')

    def do_GET(self):
        if self.path.split('?')[0] == '/__diag':
            return self._diag_get()
        return super().do_GET()

    # ---- 静态：防旧缓存 ----
    def end_headers(self):
        path = self.path.split('?')[0].lower()
        if path.endswith(NO_STORE_EXT):
            self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 静态请求静音（逐帧刷新时太吵）；上报走 _diag_post 自己打
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8848
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print('serving %s' % ROOT)
    print('  game : http://127.0.0.1:%d/index.html' % port)
    print('  diag : http://127.0.0.1:%d/__diag   (最近上报原文)' % port)
    print('  log  : %s' % LOG)
    srv.serve_forever()


if __name__ == '__main__':
    main()
