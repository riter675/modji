import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const originalKey = process.env.HERE_TRAFFIC_API_KEY;

beforeEach(() => { process.env.HERE_TRAFFIC_API_KEY = "test-key"; });
afterEach(() => {
  if (originalKey === undefined) delete process.env.HERE_TRAFFIC_API_KEY;
  else process.env.HERE_TRAFFIC_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

describe("HERE traffic adapter", () => {
  it("requires a server-side HERE key", async () => {
    delete process.env.HERE_TRAFFIC_API_KEY;
    const response = await GET(new NextRequest("http://localhost/api/traffic?bbox=2.2,48.8,2.4,48.9"));
    expect(response.status).toBe(503);
  });

  it("normalizes current flow, incident geometry and provider timestamps", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sourceUpdated: "2026-11-08T01:00:00Z", results: [{ location: { description: "Rue de Rivoli", shape: { links: [{ points: [{ lat: 48.86, lng: 2.3 }, { lat: 48.861, lng: 2.301 }] }] } }, currentFlow: { jamFactor: 5, speed: 4, freeFlow: 12, confidence: 0.9, traversability: "open" } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sourceUpdated: "2026-11-08T00:59:00Z", results: [{ location: { description: "Rue de Rivoli", shape: { links: [{ points: [{ lat: 48.86, lng: 2.3 }, { lat: 48.861, lng: 2.301 }] }] } }, incidentDetails: { originalId: "incident-1", type: "construction", criticality: "minor", roadClosed: false, summary: { value: "Roadworks" } } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new NextRequest("http://localhost/api/traffic?bbox=2.2,48.8,2.4,48.9"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.counts).toEqual({ flow: 1, incidents: 1 });
    expect(data.flow.features[0].properties.jamFactor).toBe(5);
    expect(data.incidents.features[0].properties.summary).toBe("Roadworks");
    expect(data.updatedAt.flow).toBe("2026-11-08T01:00:00Z");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
