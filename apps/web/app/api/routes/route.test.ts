import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { decodeShape } from "../../../lib/valhalla";

describe("Valhalla route API", () => {
  it("decodes precision-six route geometry into longitude/latitude pairs", () => {
    expect(decodeShape("??AA")).toEqual([[0, 0], [0.000001, 0.000001]]);
  });

  it("rejects coordinates outside geographic bounds before calling a provider", async () => {
    const request = new NextRequest("http://localhost/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { lat: 95, lon: 2 }, destination: { lat: 48, lon: 2 } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Choose valid origin and destination coordinates." });
  });

  it("rejects unsupported travel modes", async () => {
    const request = new NextRequest("http://localhost/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: { lat: 48, lon: 2 }, destination: { lat: 48.1, lon: 2.1 }, costing: "train" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
