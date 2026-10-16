// Resolve fabric regions (elvgeo) and service endpoints to nodes.

type FabricService = "fabric_api" | "live_egress";

/** Endpoint URLs for one service from the fabric's /config, optionally scoped to a region. */
const ServiceUrls = async ({client, service, geo}: {client: any, service: FabricService, geo?: string}): Promise<string[]> => {
  const configUrl = new URL(await client.ConfigUrl());
  configUrl.pathname = "/config";
  if(geo) { configUrl.searchParams.set("elvgeo", geo); }

  const fabricInfo = await (await fetch(configUrl.toString())).json();
  return fabricInfo?.network?.services?.[service] || [];
};

/** Node ID whose endpoint matches the hostname. */
export const NodeIdForHostname = async ({client, hostname, service="live_egress"}: {client: any, hostname: string, service?: FabricService}): Promise<string> => {
  const nodes = await client.SpaceNodes({matchEndpoint: hostname});
  if(!nodes?.length) {
    throw new Error(`No node found matching ${service} endpoint: ${hostname}`);
  }

  return nodes[0].id;
};

/** Node ID for a region, matched via the service's first endpoint. */
const ResolveNodeId = async ({client, service, geo}: {client: any, service: FabricService, geo?: string}): Promise<string> => {
  const urls = await ServiceUrls({client, service, geo});
  if(!urls.length) {
    throw new Error(`No ${service} endpoints found in fabric config`);
  }

  return NodeIdForHostname({client, hostname: new URL(urls[0]).hostname, service});
};

/** Ingest node ID for a region (fabric_api endpoint). */
export const ResolveIngestNodeId = ({client, geo}: {client: any, geo?: string}): Promise<string> =>
  ResolveNodeId({client, service: "fabric_api", geo});

/**
 * Egress node ID for a region (live_egress endpoint).
 * OutputsModify doesn't resolve elvgeo like OutputsCreate does, so edits must send a node ID.
 * Mirrors elv-client-js's private LiveStream.RetrieveOutputNodeId.
 */
export const ResolveEgressNodeId = ({client, geo}: {client: any, geo?: string}): Promise<string> =>
  ResolveNodeId({client, service: "live_egress", geo});

/**
 * Egress host names for a region, as select options.
 * The picked host is resolved to a node via NodeIdForHostname at save time.
 */
export const EgressNodesForRegion = async ({client, region}: {client: any, region: string}): Promise<{value: string, label: string}[]> => {
  const urls = await ServiceUrls({client, service: "live_egress", geo: region});
  const hosts = new Set(urls.map(url => new URL(url).hostname));

  return Array.from(hosts).map(host => ({value: host, label: host}));
};
