import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { Dataset, Visualization, getDatasets, getVisualizations } from "./entities";

const originalFetch = global.fetch;

describe("entities API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  it("lists datasets with default ordering", async () => {
    const payload = { items: [{ id: "d1" }], total: 1, page: 1, page_size: 20 };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    });

    const response = await Dataset.list();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dataset/list?order_by=-created_at&page=1&page_size=20",
      "/api/v1/dataset/list?order_by=-created_at",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    expect(response).toEqual(payload);
  });

  it("performs semantic search with array filters", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    });

    await Dataset.search({
      query: "crime",
      tags: ["crime", "geo"],
      types: ["geospatial"],
      owners: ["Analytics"],
      limit: 25,
      orderBy: "-created_at",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dataset/search?query=crime&tags=crime&tags=geo&dataset_types=geospatial&owners=Analytics&limit=25&order_by=-created_at",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("creates a dataset via POST", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "created" }),
    });

    const payload = { name: "Test" };
    await Dataset.create(payload);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/dataset/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  it("propagates errors with response text", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("failure"),
      statusText: "Server Error",
    });

    await expect(Dataset.get("missing"))
      .rejects.toThrow("failure");
  });

  it("fetches similar datasets and monitoring endpoints", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ similar: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ auto_summary: "summary" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "ok" }),
      });

    await Dataset.similar("abc", { limit: 3 });
    await Dataset.regenerateSummary("abc");
    await Dataset.monitorMetrics({ dataset_id: "abc" });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/dataset/abc/similar?limit=3",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/dataset/abc/auto-summary",
      expect.objectContaining({ method: "POST" })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/dataset/monitor",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ dataset_id: "abc" }),
      })
    );
  });

  it("filters visualizations with POST body", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [{ id: "v1" }] }),
    });

    const filters = { dataset_id: "d1" };
    await Visualization.filter(filters, "created_at");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/visualization/filter",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ filters, order_by: "created_at" }),
      })
    );
  });

  it("exposes convenience getters", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [] }),
    });

    await getDatasets();
    await getVisualizations();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dataset/list?order_by=-created_at&page=1&page_size=20",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/visualization/list?order_by=-created_at&page=1&page_size=20",
      "/api/v1/dataset/list?order_by=-created_at",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/visualization/list?order_by=-created_at",
      expect.any(Object)
    );
  });
});
