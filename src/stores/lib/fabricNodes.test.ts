import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {EgressNodesForRegion, NodeIdForHostname, ResolveEgressNodeId, ResolveIngestNodeId} from "@/stores/lib/fabricNodes";

const services = {
  fabric_api: ["https://ingest-1.example.com"],
  live_egress: ["https://egress-1.example.com/a", "https://egress-2.example.com", "https://egress-1.example.com/b"]
};

const MockClient = (nodes = [{id: "inod1"}]) => ({
  ConfigUrl: vi.fn().mockResolvedValue("https://host.example.com/config?self"),
  SpaceNodes: vi.fn().mockResolvedValue(nodes)
});

describe("fabricNodes", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({json: async () => ({network: {services}})}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves an ingest node from the region's fabric_api endpoint", async () => {
    const client = MockClient();

    await expect(ResolveIngestNodeId({client, geo: "na-east-north"})).resolves.toBe("inod1");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("elvgeo=na-east-north");
    expect(client.SpaceNodes).toHaveBeenCalledWith({matchEndpoint: "ingest-1.example.com"});
  });

  it("resolves an egress node from the first live_egress endpoint, without elvgeo when no geo", async () => {
    const client = MockClient();

    await expect(ResolveEgressNodeId({client})).resolves.toBe("inod1");
    expect(vi.mocked(fetch).mock.calls[0][0]).not.toContain("elvgeo");
    expect(client.SpaceNodes).toHaveBeenCalledWith({matchEndpoint: "egress-1.example.com"});
  });

  it("throws when the service has no endpoints", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({json: async () => ({})}));

    await expect(ResolveEgressNodeId({client: MockClient()})).rejects.toThrow("No live_egress endpoints found");
  });

  it("throws when no node matches the hostname", async () => {
    await expect(NodeIdForHostname({client: MockClient([]), hostname: "x.example.com"}))
      .rejects.toThrow("No node found matching live_egress endpoint: x.example.com");
  });

  it("lists unique egress hostnames for a region", async () => {
    await expect(EgressNodesForRegion({client: MockClient(), region: "eu-west-north"})).resolves.toEqual([
      {value: "egress-1.example.com", label: "egress-1.example.com"},
      {value: "egress-2.example.com", label: "egress-2.example.com"}
    ]);
  });
});
