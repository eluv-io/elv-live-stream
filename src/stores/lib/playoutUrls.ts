// Playout URL builders: SRT, named-network rewrites, and auth-token swaps.
import UrlJoin from "url-join";

// All DRM schemes to ask PlayoutOptions about, so the response covers every method.
export const ALL_DRMS = ["clear", "aes-128", "sample-aes", "widevine", "fairplay", "playready"];

// Playout-format keys (PLAYOUT_FORMAT_OPTIONS) -> manifest filename + {protocol, drm},
// so each row builds deterministically (before first run) and gets a license URL when live.
export const PLAYOUT_FORMATS: Record<string, {label: string, manifest: string, protocol: string, drm: string}> = {
  "hls-clear":          {label: "HLS Clear",      manifest: "playlist.m3u8", protocol: "hls",  drm: "clear"},
  "hls-aes128":         {label: "HLS AES-128",    manifest: "playlist.m3u8", protocol: "hls",  drm: "aes-128"},
  "hls-sample-aes":     {label: "HLS Sample AES", manifest: "playlist.m3u8", protocol: "hls",  drm: "sample-aes"},
  "hls-fairplay":       {label: "HLS FairPlay",   manifest: "playlist.m3u8", protocol: "hls",  drm: "fairplay"},
  "hls-widevine-cenc":  {label: "HLS Widevine",   manifest: "playlist.m3u8", protocol: "hls",  drm: "widevine"},
  "hls-playready-cenc": {label: "HLS PlayReady",  manifest: "playlist.m3u8", protocol: "hls",  drm: "playready"},
  "dash-clear":         {label: "Dash Clear",     manifest: "dash.mpd",      protocol: "dash", drm: "clear"},
  "dash-widevine":      {label: "Dash Widevine",  manifest: "dash.mpd",      protocol: "dash", drm: "widevine"}
};

// Named-network hosts for public playout URLs - mirrors elv-client-js's NetworkUrls.
// Resolves close to the viewer rather than the node that served the original URL.
const NETWORK_HOSTS: Record<string, string> = {
  main: "main.net955305.contentfabric.io",
  demo: "demov3.net955210.contentfabric.io",
  test: "test.net955203.contentfabric.io"
};

const SRT_PLAYOUT_PORTS: Record<string, number> = {main: 11080, demo: 11090, test: 11091};

/** SRT playout port for a network name; unknown or missing networks use main's. */
export const SrtPlayoutPort = (network?: string): number => SRT_PLAYOUT_PORTS[network || "main"] || SRT_PLAYOUT_PORTS.main;

/**
 * SRT playout URL for TS packaging.
 * The token goes in the streamid (live-ts.<objectId>.<token>), not a query param.
 */
export const SrtPlayoutUrl = ({network, objectId, token}: {network?: string, objectId: string, token?: string}): string | undefined => {
  if(!objectId) { return undefined; }
  const networkName = network || "main";
  const port = SrtPlayoutPort(networkName);
  const streamId = `live-ts.${objectId}${token ? `.${token}` : ""}`;
  return `srt://${networkName}.glb.contentfabric.io:${port}?streamid=${streamId}`;
};

/** PlayoutOptions URL with the signed token swapped in; undefined if missing or invalid. */
export const SdkPlayoutUrl = ({url, signedToken}: {url?: string, signedToken?: string}): string | undefined => {
  if(!url) { return undefined; }
  try {
    const playoutUrl = new URL(url);
    if(signedToken) { playoutUrl.searchParams.set("authorization", signedToken); }
    return playoutUrl.toString();
  } catch(error) {
    // eslint-disable-next-line no-console
    console.error(`Unable to parse playout URL ${url}`, error);
    return undefined;
  }
};

/** Embed URL with the signed token (`ath`) removed, for the public variant. */
export const DropEmbedAuth = (url?: string): string | undefined => {
  if(!url) { return undefined; }
  try {
    const embedUrl = new URL(url);
    embedUrl.searchParams.delete("ath");
    return embedUrl.toString();
  } catch(error) {
    // eslint-disable-next-line no-console
    console.error(`Unable to strip auth from embed URL ${url}`, error);
    return url;
  }
};

/**
 * Fabric URL rebuilt on the named-network host (or customDomain), anchored to the object ID so it always resolves latest.
 * dropAuthorization gives the public variant, which also needs the `s/<network>` path prefix.
 */
export const NamedNetworkUrl = ({url, objectId, network, customDomain, dropAuthorization=false}: {
  url: string,
  objectId: string,
  network?: string,
  customDomain?: string,
  dropAuthorization?: boolean
}): string | undefined => {
  try {
    const networkName = network || "main";
    const domain = customDomain?.trim();
    const host = domain ? new URL(domain).origin : `https://${NETWORK_HOSTS[networkName] || NETWORK_HOSTS.main}`;

    const originalUrl = new URL(url);
    let path = UrlJoin("rep", originalUrl.pathname.split("/rep")[1] || "");
    if(originalUrl.pathname.includes("/meta")) {
      path = UrlJoin("meta", originalUrl.pathname.split("/meta")[1]);
    }

    const namedNetworkUrl = new URL(host);
    namedNetworkUrl.pathname = dropAuthorization ? UrlJoin("s", networkName, "q", objectId, path) : UrlJoin("q", objectId, path);
    originalUrl.searchParams.forEach((value, key) => {
      if(key !== "authorization") { namedNetworkUrl.searchParams.set(key, value); }
    });
    if(!dropAuthorization) {
      namedNetworkUrl.searchParams.set("authorization", originalUrl.searchParams.get("authorization") || "");
    }

    return namedNetworkUrl.toString();
  } catch(error) {
    // eslint-disable-next-line no-console
    console.error(`Unable to build named-network URL for ${url}`, error);
    return undefined;
  }
};

/**
 * License server URL with an anonymous token and qhash, for the public variant.
 * License servers are a separate DRM proxy, so host and path are kept as-is.
 */
export const PublicLicenseServerUrl = ({url, versionHash, authorizationToken}: {url: string, versionHash: string, authorizationToken: string}): string | undefined => {
  try {
    const licenseServerUrl = new URL(url);
    licenseServerUrl.searchParams.set("qhash", versionHash);
    licenseServerUrl.searchParams.set("authorization", authorizationToken);

    return licenseServerUrl.toString();
  } catch(error) {
    // eslint-disable-next-line no-console
    console.error(`Unable to build public license server URL for ${url}`, error);
    return undefined;
  }
};
