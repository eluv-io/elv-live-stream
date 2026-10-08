import {describe, it, expect, vi, beforeEach} from "vitest";

vi.mock("mobx", async () => ({
  ...(await vi.importActual("mobx")),
  configure: vi.fn(),
}));

vi.mock("@/stores", () => ({}));

import DataStore from "./DataStore";

const makeStore = () => {
  const client = {
    ContentObjectMetadata: vi.fn().mockResolvedValue(undefined),
    EditContentObject: vi.fn().mockResolvedValue({writeToken: "wt"}),
    ReplaceMetadata: vi.fn().mockResolvedValue(undefined),
    FinalizeContentObject: vi.fn().mockResolvedValue(undefined),
    DeleteWriteToken: vi.fn().mockResolvedValue(undefined)
  };
  const store = new DataStore({client} as any) as any;
  store.siteId = "iq__site";
  store.siteLibraryId = "ilib-site";
  return {store, client};
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DataStore declared tags", () => {
  it("loads tags from the site object, defaulting to an empty list", async () => {
    const {store, client} = makeStore();

    await store.LoadDeclaredTags();
    expect(client.ContentObjectMetadata).toHaveBeenCalledWith(
      {libraryId: "ilib-site", objectId: "iq__site", metadataSubtree: "/declared_tags"}
    );
    expect(store.declaredTags).toEqual([]);
    expect(store.loadedDeclaredTags).toBe(true);

    client.ContentObjectMetadata.mockResolvedValue(["Finals"]);
    await store.LoadDeclaredTags();
    expect(store.declaredTags).toEqual(["Finals"]);
  });

  it("leaves loadedDeclaredTags false when the read fails", async () => {
    const {store, client} = makeStore();
    client.ContentObjectMetadata.mockRejectedValue(new Error("boom"));

    await store.LoadDeclaredTags();
    expect(store.loadedDeclaredTags).toBe(false);
  });

  it("saves tags with edit, replace and finalize, then updates the store", async () => {
    const {store, client} = makeStore();

    await store.SaveDeclaredTags({tags: ["Finals", "Semis"]});

    expect(client.ReplaceMetadata).toHaveBeenCalledWith({
      libraryId: "ilib-site", objectId: "iq__site", writeToken: "wt",
      metadataSubtree: "/declared_tags", metadata: ["Finals", "Semis"]
    });
    expect(client.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({writeToken: "wt", commitMessage: "Update declared tags", awaitCommitConfirmation: true})
    );
    expect(store.declaredTags).toEqual(["Finals", "Semis"]);
  });

  it("discards the write token, keeps the old tags and rethrows when the save fails", async () => {
    const {store, client} = makeStore();
    store.declaredTags = ["Old"];
    client.FinalizeContentObject.mockRejectedValue(new Error("finalize failed"));

    await expect(store.SaveDeclaredTags({tags: ["New"]})).rejects.toThrow("finalize failed");
    expect(client.DeleteWriteToken).toHaveBeenCalledWith({writeToken: "wt"});
    expect(store.declaredTags).toEqual(["Old"]);
  });
});

describe("DataStore custom domain", () => {
  it("loads the domain, defaulting to empty", async () => {
    const {store, client} = makeStore();

    await store.LoadCustomDomain();
    expect(client.ContentObjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "/custom_domain"})
    );
    expect(store.customDomain).toBe("");
    expect(store.loadedCustomDomain).toBe(true);
  });

  it("saves the domain and updates the store", async () => {
    const {store, client} = makeStore();

    await store.SaveCustomDomain({customDomain: "https://live.example.com"});

    expect(client.ReplaceMetadata).toHaveBeenCalledWith(
      expect.objectContaining({metadataSubtree: "/custom_domain", metadata: "https://live.example.com"})
    );
    expect(client.FinalizeContentObject).toHaveBeenCalledWith(
      expect.objectContaining({commitMessage: "Update custom domain"})
    );
    expect(store.customDomain).toBe("https://live.example.com");
  });
});
