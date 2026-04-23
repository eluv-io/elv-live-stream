// Handles all metadata reads — tenant info, stream metadata, recording/playout config, probe data, permissions, and ladder profiles.
import {flow, makeAutoObservable, runInAction, toJS} from "mobx";

class DataStore {
  rootStore;
  loaded = false;
  tenantId;
  libraries;
  accessGroups;
  contentType;
  titleContentType;
  siteId;
  siteLibraryId;
  liveStreamUrls;
  dedicatedNodes;
  srtUrlsByStream;
  loadedDedicatedNodes = false;

  constructor(rootStore) {
    makeAutoObservable(this);

    runInAction(() => {
      this.rootStore = rootStore;
    });
  }

  get client() {
    return this.rootStore.client;
  }

  get dedicatedNodesList() {
    return Object.entries(this.dedicatedNodes ?? {})
      .map(([key, value]) => ({label: value.name, value: key}));
  }

  DedicatedNodeUrls({nodeId, protocol}) {
    if(!this.dedicatedNodes) { return []; }

    return this.dedicatedNodes?.[nodeId]?.urls?.[protocol] ?? [];
  }

  Initialize = flow(function * (reload=false) {
    this.loaded = false;
    try {
      const tenantContractId = yield this.LoadTenantInfo();
      const {streamMetadata, siteObjectId, siteLibraryId} = yield this.LoadTenantData({tenantContractId});

      this.siteId = siteObjectId;
      this.siteLibraryId = siteLibraryId;

      yield this.rootStore.streamStore.LoadStreams({streamMetadata});
      yield this.rootStore.outputStore.LoadOutputSettingsId();
      this.loaded = true;
      yield this.rootStore.streamStore.AllStreamsStatus(reload);
    } catch(error) {
      this.loaded = true;
    }
  });

  LoadTenantInfo = flow(function * () {
    try {
      if(!this.tenantId) {
        const wallet = yield this.client.userProfileClient.UserWalletObjectInfo();
        let tenantId = yield this.client.userProfileClient.TenantContractId();

        if(!tenantId) {
          tenantId = yield this.client.ContentObjectMetadata({
            libraryId: yield this.client.ContentObjectLibraryId({objectId: wallet.objectId}),
            objectId: wallet.objectId,
            metadataSubtree: "tenantContractId",
          });
        }

        this.tenantId = tenantId;

        if(!this.tenantId) {
          throw "Tenant ID not found";
        }
      }

      return this.tenantId;
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to determine tenant info");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error("No tenant contract ID found.");
    }
  });

  LoadTenantData = flow(function * ({tenantContractId}) {
    try {
      const siteObjectId = yield this.client.ContentObjectMetadata({
        libraryId: tenantContractId.replace("iten", "ilib"),
        objectId: tenantContractId.replace("iten", "iq__"),
        metadataSubtree: "public/sites/live_streams",
      });
      const siteLibraryId = yield this.client.ContentObjectLibraryId({objectId: siteObjectId});
      const streamMetadata = yield this.client.ContentObjectMetadata({
        libraryId: siteLibraryId,
        objectId: siteObjectId,
        metadataSubtree: "public/asset_metadata/live_streams",
        resolveLinks: true,
        resolveIncludeSource: true,
        resolveIgnoreErrors: true
      });

      const response = yield this.client.ContentObjectMetadata({
        libraryId: tenantContractId.replace("iten", "ilib"),
        objectId: tenantContractId.replace("iten", "iq__"),
        metadataSubtree: "public/content_types",
        select: [
          "live_stream",
          "title"
        ]
      });
      const {live_stream, title} = response;

      if(live_stream) {
        this.contentType = live_stream;
      }

      if(title) {
        this.titleContentType = title;
      }

      return {
        siteLibraryId,
        siteObjectId,
        streamMetadata
      };
    } catch(error) {
      this.rootStore.SetErrorMessage("Error: Unable to load tenant sites");
      // eslint-disable-next-line no-console
      console.error(error);
      throw Error(`Unable to load sites for tenant ${tenantContractId}.`);
    }
  });

  LoadLibraries = flow(function * () {
    if(this.libraries) { return; }

    try {
      let loadedLibraries = {};

      const libraryIds = yield this.client.ContentLibraries() || [];
      yield Promise.all(
        libraryIds.map(async libraryId => {
          let response;
          try {
            response = (await this.client.ContentObjectMetadata({
              libraryId,
              objectId: libraryId.replace(/^ilib/, "iq__"),
              metadataSubtree: "public/name"
            }));

            if(!response) { return; }

            loadedLibraries[libraryId] = {
              libraryId,
              name: response || libraryId
            };
          } catch(error) {
            // eslint-disable-next-line no-console
            console.error(`Unable to load info for library: ${libraryId}`);
          }
        })
      );

      // eslint-disable-next-line no-unused-vars
      const sortedArray = Object.entries(loadedLibraries).sort(([id1, obj1], [id2, obj2]) => obj1.name.localeCompare(obj2.name));
      this.libraries = Object.fromEntries(sortedArray);
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load libraries", error);
    }
  });

  LoadAccessGroups = flow(function * () {
    if(this.accessGroups) { return; }

    try {
      if(!this.accessGroups) {
        this.accessGroups = {};
        const accessGroups = yield this.client.ListAccessGroups() || [];
        accessGroups
          .sort((a, b) => (a.meta.name || a.id).localeCompare(b.meta.name || b.id))
          .map(async accessGroup => {
            if(accessGroup.meta["name"]){
              this.accessGroups[accessGroup.meta["name"]] = accessGroup;
            } else {
              this.accessGroups[accessGroup.id] = accessGroup;
            }
          });
      }
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load access groups", error);
    }
  });

  LoadPermission = flow(function * ({libraryId, objectId}) {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      return this.client.Permission({
        libraryId,
        objectId
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to load permission for ${objectId}`, error);
    }
  });

  LoadAccessGroupPermissions = flow(function * ({objectId}) {
    try {
      let groupAddress = "";

      const permissions = yield this.client.ContentObjectGroupPermissions({objectId});

      for(let address of Object.keys(permissions || {})) {
        if(permissions[address].includes("manage")) {
          groupAddress = address;
          break;
        }
      }

      return groupAddress;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Unable to load access group permissions for ${objectId}`, error);
    }
  });

  LoadDedicatedNodes = flow(function * (){
    this.loadedDedicatedNodes = false;
    try {
      if(!this.siteLibraryId) {
        const tenantContractId = yield this.LoadTenantInfo();
        yield this.LoadTenantData({tenantContractId});
      }

      const nodes = yield this.client.ContentObjectMetadata({
        libraryId: this.siteLibraryId,
        objectId: this.siteId,
        metadataSubtree: "/dedicated_nodes"
      });
      this.UpdateDedicatedNodes({nodes});
      this.loadedDedicatedNodes = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load dedicated stream URLs", error);
    }
  });

  LoadStreamUrls = flow(function * () {
    this.UpdateStreamUrls({});
    this.loadedUrls = false;
    try {
      const response = yield this.client.StreamListUrls({siteId: this.siteId});

      const urls = {};
      Object.keys(response || {}).forEach(protocol => {
        response[protocol].forEach(protocolObject => {
          urls[protocolObject.url] = {
            ...protocolObject,
            protocol
          };
        });
      });

      this.UpdateStreamUrls({urls});
      this.loadedUrls = true;
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load stream URLs", error);
    }
  });

  LoadSrtPlayoutUrls = flow(function * () {
    const srtUrls = yield this.client.ContentObjectMetadata({
      libraryId: yield this.client.ContentObjectLibraryId({objectId: this.siteId}),
      objectId: this.siteId,
      metadataSubtree: "srt_playout_info"
    });

    this.srtUrlsByStream = srtUrls || {};
  });

  // TODO: Move this to client-js
  SrtPlayoutUrl = flow(function * ({objectId, originUrl, fabricNode, tokenData=null, quickLink=false}){
    try {
      let token = "", url, port;
      const networkName = this.rootStore.networkInfo?.name || "";

      if(networkName.includes("main")) {
        port = 11080;
      } else if(networkName.includes("demo")) {
        port = 11090;
      } else if(networkName.includes("test")) {
        port = 11091;
      }

      if(quickLink) {
        const permission = yield this.client.Permission({objectId, clearCache: true});
        let urlObject;

        if(fabricNode) {
          urlObject = new URL(fabricNode);
        } else {
          const nodes = yield this.client.UseRegion({region: tokenData.region});
          urlObject = new URL(nodes.fabricURIs[0]);
          yield this.client.ResetRegion();
        }

        if(permission === "public") {
          const contentSpaceId = yield this.client.ContentSpaceId();
          token = this.client.utils.B64(
            JSON.stringify({ qspace_id: contentSpaceId })
          );
        } else {
          token = yield this.client.CreateSignedToken({
            objectId,
            duration: 14 * 24 * 60 * 60 * 1000 // 2 weeks
          });
        }

        url = new URL(`srt://${urlObject.hostname}:${port}`);
      } else if(tokenData) {
        const {issueTime, expirationTime, label, useSecure, region} = tokenData;
        let urlObject;

        if(fabricNode) {
          urlObject = new URL(fabricNode);
        } else {
          const nodes = yield this.client.UseRegion({region});
          urlObject = new URL(nodes.fabricURIs[0]);
          yield this.client.ResetRegion();
        }

        url = new URL(`srt://${urlObject.hostname}:${port}`);
        if(useSecure) {
          token = yield this.client.CreateSignedToken({
            objectId,
            issueTime,
            expirationTime,
            context: {
              usr: {
                label
              }
            }
          });
        } else {
          // TODO: For unsecure signature, b58 encode JSON and use as token
        }
      } else {
        // Used to extract hostname
        const originUrlObject = new URL(originUrl);

        if(!originUrlObject) {
          // eslint-disable-next-line no-console
          console.error(`Invalid origin url: ${originUrl}`);
          return "";
        }

        url = new URL(`srt://${originUrlObject.hostname}:${port}`);

        token = yield this.client.CreateSignedToken({
          objectId,
          duration: 86400000
        });
      }

      if(!url) { return ""; }

      url.searchParams.set("streamid", `live-ts.${objectId}${token ? `.${token}` : ""}`);

      return url.toString();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return "";
    }
  });

  UpdateStreamUrls = ({urls}) => {
    this.liveStreamUrls = urls;
  };

  UpdateDedicatedNodes = ({nodes}) => {
    this.dedicatedNodes = nodes;
  };

  UpdateSrtUrls({objectId, newData={}, removeData={}}) {
    const urlsByStream = this.srtUrlsByStream[objectId];
    let srtUrls = urlsByStream?.srt_urls || [];

    if(removeData?.url) {
      srtUrls = srtUrls.filter(el => removeData.url !== el.url);
    }

    const {url, region, label} = newData;
    const newValue = {url, region, label};

    if(urlsByStream) {
      urlsByStream.srt_urls = [
        ...srtUrls || [],
        newValue
      ];
    } else {
      this.srtUrlsByStream[objectId] = {
        ...this.srtUrlsByStream[objectId],
        srt_urls: [newValue]
      };
    }
  }

  UpdateSrtQuickLinks({objectId, newData={}, removeData={}}) {
    const {region} = newData;
    if(!this.srtUrlsByStream[objectId]) {
      this.srtUrlsByStream[objectId] = {
        quick_link_regions: {
          [region]: true
        }
      };
    } else {
      const urlsByStream = this.srtUrlsByStream[objectId];
      let quickLinkRegions = urlsByStream?.quick_link_regions;

      if(removeData?.region) {
        delete quickLinkRegions.region;
      }

      if(!quickLinkRegions) {
        urlsByStream["quick_link_regions"] = {
          [region]: true
        };
      } else {
        quickLinkRegions[region] = true;
      }
    }
  }

  DeleteSrtUrl = flow(function * ({objectId, region}) {
    const urlsByStream = this.srtUrlsByStream[objectId];
    const newSrtUrls = [];
    urlsByStream.srt_urls.forEach(urlObj => {
      if(urlObj.region !== region) {
        newSrtUrls.push(toJS(urlObj));
      }
    });

    const libraryId = yield this.client.ContentObjectLibraryId({objectId: this.siteId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId: this.siteId
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId: this.siteId,
      writeToken,
      metadataSubtree: `/srt_playout_info/${objectId}/srt_urls`,
      metadata: newSrtUrls
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId: this.siteId,
      writeToken,
      commitMessage: "Delete srt url"
    });

    this.srtUrlsByStream[objectId].srt_urls = newSrtUrls;
  });

  UpdateSiteSrtLinks = flow(function * ({
    objectId,
    url,
    region,
    label,
    removeData={}
  }) {
    if(!this.siteId) { return; }

    const libraryId = yield this.client.ContentObjectLibraryId({objectId: this.siteId});
    const {writeToken} = yield this.client.EditContentObject({
      libraryId,
      objectId: this.siteId
    });

    this.UpdateSrtUrls({
      objectId,
      newData: {
        url,
        region,
        label,
      },
      removeData
    });

    yield this.client.ReplaceMetadata({
      libraryId,
      objectId: this.siteId,
      writeToken,
      metadataSubtree: `/srt_playout_info/${objectId}/srt_urls`,
      metadata: toJS(this.srtUrlsByStream[objectId]?.srt_urls || [])
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId: this.siteId,
      writeToken,
      commitMessage: "Update srt url"
    });
  });

  UpdateSiteQuickLinks = flow(function * ({
    objectId,
    region,
    removeData={}
  }) {
    try {
      if(!this.siteId) { return; }

      const libraryId = yield this.client.ContentObjectLibraryId({objectId: this.siteId});
      const {writeToken} = yield this.client.EditContentObject({
        libraryId,
        objectId: this.siteId
      });

      this.UpdateSrtQuickLinks({
        objectId,
        newData: {
          region
        },
        removeData
      });

      yield this.client.ReplaceMetadata({
        libraryId,
        objectId: this.siteId,
        writeToken,
        metadataSubtree: `/srt_playout_info/${objectId}/quick_link_regions`,
        metadata: toJS(this.srtUrlsByStream[objectId]?.quick_link_regions || {})
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId: this.siteId,
        writeToken,
        commitMessage: "Update srt quick link"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to update site", error);
      throw error;
    }
  });

  LoadNodes = flow(function * ({region}) {
    yield this.client.UseRegion({region});
    const nodes = this.client.Nodes();

    if(region) {
      yield this.client.ResetRegion();
    }

    return nodes;
  });
}

export default DataStore;
