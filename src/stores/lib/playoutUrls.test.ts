import {describe, it, expect, vi} from "vitest";
import {DropEmbedAuth, NamedNetworkUrl, PublicLicenseServerUrl, SdkPlayoutUrl, SrtPlayoutUrl} from "@/stores/lib/playoutUrls";

vi.spyOn(console, "error").mockImplementation(() => {});

describe("SrtPlayoutUrl", () => {
  it("builds a per-network URL with the token in the streamid", () => {
    expect(SrtPlayoutUrl({network: "demo", objectId: "iq__1", token: "tok"}))
      .toBe("srt://demo.glb.contentfabric.io:11090?streamid=live-ts.iq__1.tok");
  });

  it("defaults to main and omits a missing token", () => {
    expect(SrtPlayoutUrl({objectId: "iq__1"}))
      .toBe("srt://main.glb.contentfabric.io:11080?streamid=live-ts.iq__1");
  });

  it("returns undefined without an object id", () => {
    expect(SrtPlayoutUrl({objectId: ""})).toBeUndefined();
  });
});

describe("SdkPlayoutUrl", () => {
  it("swaps in the signed token", () => {
    expect(SdkPlayoutUrl({url: "https://host/p.m3u8?authorization=old", signedToken: "new"}))
      .toBe("https://host/p.m3u8?authorization=new");
  });

  it("returns undefined for missing or unparseable URLs", () => {
    expect(SdkPlayoutUrl({})).toBeUndefined();
    expect(SdkPlayoutUrl({url: "not a url"})).toBeUndefined();
  });
});

describe("DropEmbedAuth", () => {
  it("removes the ath param", () => {
    expect(DropEmbedAuth("https://embed.v3.contentfabric.io/?oid=iq__1&ath=tok"))
      .toBe("https://embed.v3.contentfabric.io/?oid=iq__1");
  });

  it("returns the input unchanged when it can't be parsed", () => {
    expect(DropEmbedAuth("not a url")).toBe("not a url");
  });
});

describe("NamedNetworkUrl", () => {
  const url = "https://node.example.com/qlibs/ilib1/q/hq__1/rep/playout/default/hls-clear/playlist.m3u8?authorization=tok&foo=1";

  it("rebuilds an authorized URL against the network host", () => {
    expect(NamedNetworkUrl({url, objectId: "iq__1", network: "main"}))
      .toBe("https://main.net955305.contentfabric.io/q/iq__1/rep/playout/default/hls-clear/playlist.m3u8?foo=1&authorization=tok");
  });

  it("drops authorization and adds the s/<network> prefix for the public variant", () => {
    expect(NamedNetworkUrl({url, objectId: "iq__1", network: "demo", dropAuthorization: true}))
      .toBe("https://demov3.net955210.contentfabric.io/s/demo/q/iq__1/rep/playout/default/hls-clear/playlist.m3u8?foo=1");
  });

  it("uses the custom domain when set", () => {
    expect(NamedNetworkUrl({url, objectId: "iq__1", customDomain: " https://live.example.org/ignored "}))
      .toBe("https://live.example.org/q/iq__1/rep/playout/default/hls-clear/playlist.m3u8?foo=1&authorization=tok");
  });
});

describe("PublicLicenseServerUrl", () => {
  it("sets qhash and swaps the auth token", () => {
    expect(PublicLicenseServerUrl({url: "https://drm.example.com/wv?authorization=old", versionHash: "hq__1", authorizationToken: "anon"}))
      .toBe("https://drm.example.com/wv?authorization=anon&qhash=hq__1");
  });
});
