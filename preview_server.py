"""Serve the local Planning Agent interactive preview."""

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from planning_preview import PreviewSession, analyze_preview


PREVIEW_FILE = Path(__file__).with_name("preview") / "index.html"
PREVIEW_SESSION = PreviewSession()


class PreviewHandler(BaseHTTPRequestHandler):
    """Small local-only HTTP adapter for the preview UI."""

    server_version = "EventHorizonPlanningPreview/1.0"

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status: HTTPStatus, code: str, message: str) -> None:
        body = json.dumps(
            {
                "status": "error",
                "error": {"code": code, "message": message},
            }
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path in ("/", "/index.html"):
            body = PREVIEW_FILE.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/api/preview":
            self._send_json(analyze_preview(None, session=PREVIEW_SESSION))
            return
        self._send_error_json(HTTPStatus.NOT_FOUND, "not_found", "Preview route not found.")

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path not in {"/api/preview", "/api/decision"}:
            self._send_error_json(HTTPStatus.NOT_FOUND, "not_found", "Preview route not found.")
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length < 0 or content_length > 16_384:
                raise ValueError("Request is too large.")
            request_body = json.loads(self.rfile.read(content_length).decode("utf-8"))
            if not isinstance(request_body, dict):
                raise ValueError("Request must be a JSON object.")
            if self.path == "/api/preview":
                proposed_arrival = request_body.get("proposed_arrival_time")
                if proposed_arrival is not None and not isinstance(proposed_arrival, str):
                    raise ValueError("proposed_arrival_time must be a string or null.")
            else:
                decision = request_body.get("decision")
                if not isinstance(decision, str):
                    raise ValueError("decision must be approve or reject.")
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, "invalid_request", str(error))
            return
        if self.path == "/api/decision":
            result = PREVIEW_SESSION.decide(decision)
            status = (
                HTTPStatus.CONFLICT
                if result["status"] == "error" and result["error"]["code"] == "approval_blocked"
                else HTTPStatus.OK
                if result["status"] == "ok"
                else HTTPStatus.BAD_REQUEST
            )
            self._send_json(result, status)
            return
        result = analyze_preview(proposed_arrival, session=PREVIEW_SESSION)
        self._send_json(
            result, HTTPStatus.BAD_REQUEST if result["status"] == "error" else HTTPStatus.OK
        )

    def log_message(self, format: str, *args) -> None:
        """Keep standard request logs free of request bodies and credentials."""

        super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), PreviewHandler)
    print(f"Planning preview available at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
