import type { Response } from "express";

/** Server-sent events hub: every connected browser is told to reload after a change. */
export class ChangeEvents {
  private clients = new Set<Response>();
  private version = 0;

  subscribe(res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`retry: 3000\n\nevent: hello\ndata: ${this.version}\n\n`);
    this.clients.add(res);
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
    res.on("close", () => {
      clearInterval(keepAlive);
      this.clients.delete(res);
    });
  }

  publish(): void {
    this.version += 1;
    for (const client of this.clients) client.write(`event: change\ndata: ${this.version}\n\n`);
  }

  closeAll(): void {
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
