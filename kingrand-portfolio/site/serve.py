"""Dev server for the KinGrand portfolio site.

Windows' mimetypes registry has no .webp mapping, so the stock
`python -m http.server` serves posters as application/octet-stream and
browsers refuse to decode them. Production hosts serve WebP correctly;
this shim only exists so local preview behaves like production.
"""
import functools
import http.server
import mimetypes
import os
import sys

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("video/mp4", ".mp4")

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
handler = functools.partial(
    http.server.SimpleHTTPRequestHandler,
    directory=os.path.dirname(os.path.abspath(__file__)),
)
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
