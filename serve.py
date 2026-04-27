import http.server
import socketserver

class UTF8Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.endswith('.html') or self.path == '/':
            self.send_header('Content-Type', 'text/html; charset=utf-8')
        # Security headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        # Google's OAuth / GSI flow loads scripts from multiple subdomains
        # (accounts.google.com, apis.google.com, www.gstatic.com, and others
        # at runtime). Wildcards keep the OAuth flow working without a fight.
        # script-src-elem must be set explicitly or modern browsers warn.
        google_scripts = (
            "https://*.google.com https://*.googleapis.com "
            "https://*.gstatic.com https://accounts.google.com"
        )
        self.send_header('Content-Security-Policy',
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' " + google_scripts + "; "
            "script-src-elem 'self' 'unsafe-inline' " + google_scripts + "; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.gstatic.com; "
            "font-src 'self' data: https://fonts.gstatic.com https://*.gstatic.com; "
            "img-src 'self' data: https: blob:; "
            "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com "
            "https://*.gstatic.com https://*.google.com wss://*.firebaseio.com; "
            "frame-src https://accounts.google.com https://*.firebaseapp.com;"
        )
        super().end_headers()

with socketserver.TCPServer(("", 8080), UTF8Handler) as httpd:
    print("Serving on http://localhost:8080")
    httpd.serve_forever()
