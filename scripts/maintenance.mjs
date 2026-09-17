import { createServer } from "node:http";

// Run from the release image during incompatible schema upgrades. No database access.
createServer((request, response) => {
  if (request.url === "/api/health") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("maintenance ready");
    return;
  }
  response.writeHead(503, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Retry-After": "300"
  });
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NeighborVote · Brief maintenance</title><body style="margin:0;background:#f5f7f2;color:#183e32;font:18px system-ui;display:grid;min-height:100vh;place-items:center"><main style="max-width:34rem;padding:2rem"><p>NeighborVote</p><h1>We’ll be right back.</h1><p>We’re updating NeighborVote. Your existing votes are safe. Please try again in a few minutes.</p></main></body></html>`);
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
