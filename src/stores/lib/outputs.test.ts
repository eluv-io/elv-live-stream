import {describe, it, expect, vi} from "vitest";
import {ModifyOutputs} from "@/stores/lib/outputs";

const MockClient = (stored: Record<string, unknown> = {}) => ({
  ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib-outputs"),
  ContentObjectMetadata: vi.fn().mockImplementation(({metadataSubtree}) =>
    Promise.resolve(stored[metadataSubtree.replace("live_outputs/", "")] ?? null)
  ),
  OutputsModify: vi.fn().mockResolvedValue(undefined),
  OutputsModifyBatch: vi.fn().mockResolvedValue(undefined)
});

describe("ModifyOutputs", () => {
  it("writes a single output with OutputsModify", async () => {
    const client = MockClient({"out-1": {name: "A", enabled: false}});

    const written = await ModifyOutputs({
      client,
      objectId: "iq__settings",
      outputIds: ["out-1"],
      batch: false,
      Update: existing => ({...existing, enabled: true})
    });

    expect(client.OutputsModify).toHaveBeenCalledWith({
      libraryId: "ilib-outputs",
      objectId: "iq__settings",
      outputId: "out-1",
      output: {name: "A", enabled: true}
    });
    expect(client.OutputsModifyBatch).not.toHaveBeenCalled();
    expect(written).toEqual({"out-1": {name: "A", enabled: true}});
  });

  it("uses one OutputsModifyBatch call when batch, even for a single output", async () => {
    const client = MockClient({"out-1": {name: "A"}});

    await ModifyOutputs({client, objectId: "iq__settings", outputIds: ["out-1"], batch: true, Update: existing => existing});

    expect(client.OutputsModifyBatch).toHaveBeenCalledWith({
      libraryId: "ilib-outputs",
      objectId: "iq__settings",
      outputs: {"out-1": {name: "A"}}
    });
    expect(client.OutputsModify).not.toHaveBeenCalled();
  });

  it("treats a missing stored output as empty and drops undefined fields", async () => {
    const client = MockClient();

    const written = await ModifyOutputs({
      client,
      objectId: "iq__settings",
      outputIds: ["out-new"],
      batch: false,
      Update: existing => ({...existing, enabled: true, input: undefined})
    });

    expect(written).toEqual({"out-new": {enabled: true}});
  });

  it("writes nothing when Update throws for any output", async () => {
    const client = MockClient({"out-a": {input: {stream: "iq__s"}}, "out-b": {}});

    await expect(ModifyOutputs({
      client,
      objectId: "iq__settings",
      outputIds: ["out-a", "out-b"],
      batch: true,
      Update: existing => {
        if(!existing.input?.stream) { throw new Error("no stream"); }
        return existing;
      }
    })).rejects.toThrow("no stream");

    expect(client.OutputsModifyBatch).not.toHaveBeenCalled();
  });
});
