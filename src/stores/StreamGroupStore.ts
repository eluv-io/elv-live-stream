// Manages stream groups — organizing streams under a named group and controlling a group's streams together.
import {makeAutoObservable} from "mobx";
import type RootStore from "@/stores/RootStore";

// Group data fetched for a title_id. Shape TBD - real fetch not wired yet.
export type GroupData = Record<string, unknown>;

export interface StreamGroup {
  titleId: string;
  streamIds: string[]; // objectIds of streams whose query_fields.title_id === titleId
  data?: GroupData;    // fetched group metadata - populated by LoadGroupData (placeholder)
}

// Keyed by title_id (from the tenant query's query_fields).
type StreamGroupMap = Record<string, StreamGroup>;

class StreamGroupStore {
  state: "pending" | "loaded" | "error" = "pending";
  groups: StreamGroupMap = {};
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  BuildGroups(streams: Record<string, {objectId?: string; titleId?: string}>): void {
    const next: StreamGroupMap = {};

    Object.values(streams || {}).forEach(stream => {
      const {objectId, titleId} = stream || {};
      if(!titleId || !objectId) { return; }

      if(!next[titleId]) {
        next[titleId] = {titleId, streamIds: [], data: this.groups[titleId]?.data};
      }

      if(!next[titleId].streamIds.includes(objectId)) {
        next[titleId].streamIds.push(objectId);
      }
    });

    this.groups = next;
  }

  // Placeholder - fetches the group data for a title_id and stashes it on the group.
  // TODO: wire the real group-data source once the API is identified.
  *LoadGroupData({titleId}: {titleId: string}): Generator<any, void> {
    if(!titleId || !this.groups[titleId]) { return; }

    try {
      // TODO: replace with the real fetch.
      const data: GroupData = yield Promise.resolve({});
      this.groups[titleId] = {...this.groups[titleId], data};
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load group data.", error);
    }
  }

  *CreateStreamGroup({libraryId, name}): Generator<any, void> {
    try {
      const { objectId: groupId, writeToken } = yield this.client.CreateContentFolder({
        libraryId,
        name,
        tags: ["live-stream"],
        // queryFields: { region: "us-west" }
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId: groupId,
        writeToken,
        commitMessage: "Create live stream group"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to create stream group.", error);
    }
  }

  *ListGroups(): Generator<any, any> {
    try {
      return yield this.client.TenantContent({
        filter: ["tags:co:elv:folder"],
        select: ["public/name", "public/asset_metadata/display_title"],
        start: 0,
        limit: 100
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to list stream groups.", error);
    }
  }

  *StreamGroups({libraryId, objectId}): Generator<any, any> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      return yield this.client.ContentObjectFolders({
        libraryId,
        objectId
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load stream groups.", error);
    }
  }

  *GroupTagsAndFields({libraryId, objectId}): Generator<any, {tags: any, fields: any} | undefined> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const [tags, fields] = yield Promise.all([
        this.client.ContentTags({libraryId, objectId}),
        this.client.ContentQueryFields({libraryId, objectId})
      ]);

      return {tags, fields};
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load group tags and query fields.", error);
    }
  }

  *AddStreamToGroup({libraryId, objectId, groupId}): Generator<any, void> {
    try {
      if(!libraryId) {
        libraryId = yield this.client.ContentObjectLibraryId({objectId});
      }

      const { writeToken } = yield this.client.EditContentObject({
        libraryId,
        objectId
      });

      yield this.client.AddContentObjectFolders({
        libraryId,
        writeToken,
        groupIds: [groupId]
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        commitMessage: "Add to live stream group"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to add stream to group.", error);
    }
  }
}

export default StreamGroupStore;
