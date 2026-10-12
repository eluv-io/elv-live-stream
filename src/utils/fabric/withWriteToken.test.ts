import {describe, it, expect, vi, beforeEach} from "vitest";
import {WithWriteToken} from "@/utils/fabric/withWriteToken";

const makeClient = () => ({
  ContentObjectLibraryId: vi.fn().mockResolvedValue("ilib_resolved"),
  EditContentObject: vi.fn().mockResolvedValue({writeToken: "tqw_new"}),
  FinalizeContentObject: vi.fn().mockResolvedValue({})
});

describe("WithWriteToken", () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    client = makeClient();
  });

  it("resolves library, opens a write token, runs fn, and finalizes", async () => {
    const fn = vi.fn().mockResolvedValue("done");

    const out = await WithWriteToken({client, objectId: "iq__1", commitMessage: "msg"}, fn);

    expect(client.ContentObjectLibraryId).toHaveBeenCalledWith({objectId: "iq__1"});
    expect(client.EditContentObject).toHaveBeenCalledWith({libraryId: "ilib_resolved", objectId: "iq__1"});
    expect(fn).toHaveBeenCalledWith({libraryId: "ilib_resolved", objectId: "iq__1", writeToken: "tqw_new"});
    expect(client.FinalizeContentObject).toHaveBeenCalledWith({
      libraryId: "ilib_resolved",
      objectId: "iq__1",
      writeToken: "tqw_new",
      commitMessage: "msg",
      awaitCommitConfirmation: true
    });
    expect(out).toEqual({result: "done", writeToken: "tqw_new"});
  });

  it("skips lookups when libraryId and writeToken are provided", async () => {
    await WithWriteToken(
      {client, objectId: "iq__1", libraryId: "ilib_given", writeToken: "tqw_given"},
      async () => undefined
    );

    expect(client.ContentObjectLibraryId).not.toHaveBeenCalled();
    expect(client.EditContentObject).not.toHaveBeenCalled();
    expect(client.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({libraryId: "ilib_given", writeToken: "tqw_given"})
    );
  });

  it("does not finalize when finalize is false and returns the token", async () => {
    const out = await WithWriteToken({client, objectId: "iq__1", finalize: false}, async () => 1);

    expect(client.FinalizeContentObject).not.toHaveBeenCalled();
    expect(out).toEqual({result: 1, writeToken: "tqw_new"});
  });

  it("does not finalize and rethrows when fn fails", async () => {
    await expect(
      WithWriteToken({client, objectId: "iq__1"}, async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");

    expect(client.FinalizeContentObject).not.toHaveBeenCalled();
  });

  it("propagates finalize errors", async () => {
    client.FinalizeContentObject.mockRejectedValue(new Error("commit failed"));

    await expect(
      WithWriteToken({client, objectId: "iq__1"}, async () => undefined)
    ).rejects.toThrow("commit failed");
  });
});
