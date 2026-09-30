import { useEffect, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { CapturedRequest, LiveMessage, RequestPage, RequestSummary } from "@inb/shared";
import { liveSocketUrl } from "./api.ts";
import { keys } from "./queries.ts";

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Subscribe to an endpoint's live stream and fold messages into the query
 * cache: new requests are prepended to every cached list page of that
 * endpoint, timeline events are appended to a cached request detail.
 *
 * `paused` keeps the socket open but buffers new requests, so the list
 * doesn't move while someone is reading it.
 */
export function useLiveRequests(endpointId: string, opts: { paused: boolean; onRequest?: (r: RequestSummary) => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [buffered, setBuffered] = useState<RequestSummary[]>([]);
  const pausedRef = useRef(opts.paused);
  const onRequestRef = useRef(opts.onRequest);
  pausedRef.current = opts.paused;
  onRequestRef.current = opts.onRequest;

  const prepend = (items: RequestSummary[]) => {
    // newest-first lists get the item on top; oldest-first lists refetch
    // lazily since the new item belongs on their (possibly unloaded) last page
    const isDesc = (key: readonly unknown[]) => (key[2] as { order?: string } | undefined)?.order !== "asc";
    void qc.invalidateQueries({ queryKey: keys.requestsFor(endpointId), predicate: (q) => !isDesc(q.queryKey) });
    qc.setQueriesData<InfiniteData<RequestPage>>({ queryKey: keys.requestsFor(endpointId), predicate: (q) => isDesc(q.queryKey) }, (data) => {
      if (!data?.pages.length) return data;
      const [first, ...rest] = data.pages;
      const known = new Set(first!.items.map((i) => i.id));
      const fresh = items.filter((i) => !known.has(i.id));
      if (!fresh.length) return data;
      const counts = { ...first!.counts };
      for (const item of fresh) {
        counts.all += 1;
        if (item.status >= 200 && item.status < 300) counts["2xx"] += 1;
        else if (item.status >= 400 && item.status < 500) counts["4xx"] += 1;
        else if (item.status >= 500) counts["5xx"] += 1;
      }
      return {
        ...data,
        pages: [{ ...first!, items: [...fresh, ...first!.items], total: first!.total + fresh.length, counts }, ...rest],
      };
    });
  };

  useEffect(() => {
    if (!opts.paused && buffered.length) {
      prepend([...buffered].reverse());
      setBuffered([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.paused]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const connect = () => {
      setStatus("connecting");
      socket = new WebSocket(liveSocketUrl(endpointId));
      socket.onopen = () => {
        retry = 0;
        setStatus("live");
        ping = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), 25_000);
        // anything that arrived while we were disconnected
        void qc.invalidateQueries({ queryKey: keys.requestsFor(endpointId) });
      };
      socket.onmessage = (ev) => {
        if (ev.data === "pong") return;
        const msg = JSON.parse(ev.data as string) as LiveMessage;
        switch (msg.type) {
          case "request":
            onRequestRef.current?.(msg.request);
            if (pausedRef.current) setBuffered((b) => [...b, msg.request]);
            else prepend([msg.request]);
            void qc.invalidateQueries({ queryKey: keys.endpoints });
            break;
          case "request_updated":
            qc.setQueriesData<InfiniteData<RequestPage>>({ queryKey: keys.requestsFor(endpointId) }, (data) =>
              data
                ? {
                    ...data,
                    pages: data.pages.map((p) => ({
                      ...p,
                      items: p.items.map((i) => (i.id === msg.request.id ? msg.request : i)),
                    })),
                  }
                : data,
            );
            break;
          case "event":
            qc.setQueryData<CapturedRequest>(keys.request(endpointId, msg.requestId), (req) =>
              req ? { ...req, events: [...req.events, msg.event] } : req,
            );
            void qc.invalidateQueries({ queryKey: keys.requestDeliveries(endpointId, msg.requestId) });
            break;
          case "cleared":
            void qc.invalidateQueries({ queryKey: keys.requestsFor(endpointId) });
            break;
          case "hello":
            break;
        }
      };
      socket.onclose = () => {
        clearInterval(ping);
        if (closed) return;
        setStatus("offline");
        timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpointId]);

  return { status, buffered: buffered.length };
}
