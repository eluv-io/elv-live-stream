// Live recording copies (VoD copies of a stream's recording periods): list, rename, delete, and CopyToVod.
import {makeAutoObservable} from "mobx";
import {FinalizeContentObjectResponse, RecordingPeriod} from "@/utils/stream/stream";
import {type StreamStatus} from "@/utils/constants";
import type RootStore from "@/stores/RootStore";
import {CopyToVodRange, SupportsTimeRange} from "@/stores/lib/recordingCopy";

// Thrown when a live recording copy's content object can no longer be reached
// (most likely deleted from the Fabric) while attempting to edit it. The UI
// uses this to offer a "remove from list" remediation instead of a raw error.
export class RecordingCopyMissingError extends Error {
  constructor(recordingCopyId: string) {
    super(`Live recording copy ${recordingCopyId} no longer exists`);
    this.name = "RecordingCopyMissingError";
  }
}

interface CopyToVodParams {
  objectId: string;
  targetLibraryId?: string;
  accessGroup?: string;
  selectedPeriods?: RecordingPeriod[];
  title?: string;
  startTime?: string;
  endTime?: string;
}

class RecordingCopyStore {
  rootStore: RootStore;

  constructor(rootStore: RootStore | Record<string, unknown>) {
    this.rootStore = rootStore as RootStore;
    makeAutoObservable(this, {rootStore: false}, {autoBind: true});
  }

  get client() {
    return this.rootStore.client;
  }

  *FetchSupportsTimeRange({objectId}: {objectId: string}): Generator<any, boolean> {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const xcParams = yield this.client.ContentObjectMetadata({
      objectId,
      libraryId,
      metadataSubtree: "live_recording/recording_config/recording_params/xc_params"
    });

    return SupportsTimeRange(xcParams);
  }

  *FetchLiveRecordingCopies({objectId, libraryId}: {objectId: string, libraryId?: string}): Generator<any, Record<string, {create_time: number, endTime: number, startTime: number, title: string, unavailable?: boolean}>> {
    if(!libraryId) {
      libraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    const copiesMeta = yield this.client.ContentObjectMetadata({
      objectId,
      libraryId,
      metadataSubtree: "live_recording_copies"
    });

    yield Promise.all(
      Object.keys(copiesMeta || {}).map(async(copyId) => {
        try {
          copiesMeta[copyId].title = await this.client.ContentObjectMetadata({
            libraryId: await this.client.ContentObjectLibraryId({objectId: copyId}),
            objectId: copyId,
            metadataSubtree: "public/name"
          });
        } catch(error) {
          // The metadata entry exists but its content object could not be
          // reached - most likely it was deleted from the Fabric. Flag it so
          // the UI can mark the row as unavailable and disable edit actions.
          copiesMeta[copyId].unavailable = true;
          // eslint-disable-next-line no-console
          console.error(`Failed to load name. Has object ${copyId} been deleted?`, error);
        }
      })
    );

    return copiesMeta;
  }

  *DeleteLiveRecordingCopy({streamId, recordingCopyId}: {streamId: string, recordingCopyId: string}) : Generator<any, FinalizeContentObjectResponse> {
    return yield this.DeleteLiveRecordingCopies({streamId, recordingCopyIds: [recordingCopyId]});
  }

  // One write for all ids: parallel read-modify-write calls on the same metadata would drop each other's removals.
  *DeleteLiveRecordingCopies({streamId, recordingCopyIds}: {streamId: string, recordingCopyIds: string[]}) : Generator<any, FinalizeContentObjectResponse> {
    const liveRecordingCopies = yield this.FetchLiveRecordingCopies({objectId: streamId});

    recordingCopyIds.forEach(id => delete liveRecordingCopies[id]);

    const libraryId = yield this.client.ContentObjectLibraryId({objectId: streamId});
    const {writeToken} = yield this.client.EditContentObject({
      objectId: streamId,
      libraryId
    });

    yield this.client.ReplaceMetadata({
      objectId: streamId,
      libraryId,
      writeToken,
      metadataSubtree: "live_recording_copies",
      metadata: liveRecordingCopies
    });

    return this.client.FinalizeContentObject({
      objectId: streamId,
      libraryId,
      writeToken,
      commitMessage: recordingCopyIds.length > 1 ? "Remove live recording copies" : "Remove live recording copy"
    });
  }

  *EditLiveRecordingCopy({streamId, recordingCopyId, title}: {streamId: string, recordingCopyId: string, title: string}) : Generator<any, FinalizeContentObjectResponse> {
    try {
      const liveRecordingCopies = yield this.FetchLiveRecordingCopies({objectId: streamId});

      if(!liveRecordingCopies?.[recordingCopyId]) {
        throw Error(`Live recording copy ${recordingCopyId} not found`);
      }

      // The metadata entry is present but its content object is unreachable -
      // it was deleted between table load and this edit. Signal the UI so it
      // can offer to remove the stale entry rather than surfacing a raw error.
      if(liveRecordingCopies[recordingCopyId].unavailable) {
        throw new RecordingCopyMissingError(recordingCopyId);
      }

      liveRecordingCopies[recordingCopyId].title = title;

      // Update the recording copy content object's own name
      const recordingLibraryId = yield this.client.ContentObjectLibraryId({objectId: recordingCopyId});
      const {writeToken: recordingWriteToken} = yield this.client.EditContentObject({
        objectId: recordingCopyId,
        libraryId: recordingLibraryId
      });

      yield this.client.ReplaceMetadata({
        objectId: recordingCopyId,
        libraryId: recordingLibraryId,
        writeToken: recordingWriteToken,
        metadataSubtree: "public/name",
        metadata: title
      });

      yield this.client.FinalizeContentObject({
        objectId: recordingCopyId,
        libraryId: recordingLibraryId,
        writeToken: recordingWriteToken,
        commitMessage: "Update name"
      });

      // Update stream object copies meta
      const libraryId = yield this.client.ContentObjectLibraryId({objectId: streamId});
      const {writeToken} = yield this.client.EditContentObject({
        objectId: streamId,
        libraryId
      });

      yield this.client.ReplaceMetadata({
        objectId: streamId,
        libraryId,
        writeToken,
        metadataSubtree: "live_recording_copies",
        metadata: liveRecordingCopies
      });

      return this.client.FinalizeContentObject({
        objectId: streamId,
        libraryId,
        writeToken,
        commitMessage: "Update live recording copy"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update live recording copy.", error);
      throw error;
    }
  }

  *_CreateVodObject({libraryId, title}: {libraryId: string, title: string}): Generator<any, string> {
    const titleType = this.rootStore.tenantStore.titleContentType;

    const {id: objectId, writeToken} = yield this.client.CreateContentObject({
      libraryId,
      options: titleType ?
        {type: titleType, meta: {public: {name: title}}} :
        {}
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      awaitCommitConfirmation: true,
      commitMessage: "Create VoD object"
    });

    yield this.client.SetPermission({objectId, permission: "editable"});

    return objectId;
  }

  *_SaveRecordingCopy({objectId, copyId, copy}: {
    objectId: string,
    copyId: string,
    copy: {startTime: number, endTime: number, create_time: number, title: string}
  }) {
    const libraryId = yield this.client.ContentObjectLibraryId({objectId});
    const {writeToken} = yield this.client.EditContentObject({objectId, libraryId});

    const copiesMetadata = yield this.client.ContentObjectMetadata({
      objectId,
      libraryId,
      metadataSubtree: "live_recording_copies"
    });

    yield this.client.ReplaceMetadata({
      objectId,
      libraryId,
      writeToken,
      metadataSubtree: "/live_recording_copies",
      metadata: {...copiesMetadata, [copyId]: copy}
    });

    yield this.client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      awaitCommitConfirmation: true,
      commitMessage: "Update live recording copies"
    });
  }

  *CopyToVod({
    objectId,
    targetLibraryId,
    accessGroup,
    selectedPeriods=[],
    title,
    startTime,
    endTime
  }: CopyToVodParams): Generator<any, StreamStatus> {
    const now = Date.now();
    // Resolved first so a bad time fails before anything is created
    const {startSec, endSec, ...selection} = CopyToVodRange({
      periods: selectedPeriods,
      startTime,
      endTime,
      nowSec: Math.floor(now / 1000)
    });

    if(!targetLibraryId) {
      targetLibraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    const stream = Object.values(this.rootStore.streamStatusStore.streams || {})
      .find(({objectId: streamObjectId}) => streamObjectId === objectId);
    const targetTitle = title || `${stream?.title || objectId} VoD`;

    const targetObjectId = yield this._CreateVodObject({libraryId: targetLibraryId, title: targetTitle});

    if(accessGroup) {
      this.rootStore.streamEditStore.AddAccessGroupPermission({
        objectId: targetObjectId,
        groupName: accessGroup
      });
    }

    const response: StreamStatus = yield this.client.StreamCopyToVod({
      name: objectId,
      targetObjectId,
      ...selection,
      fcTimeout: 900
    });

    if(!response) {
      throw Error("Unable to copy to VoD. Is part available?");
    }

    yield this._SaveRecordingCopy({
      objectId,
      copyId: targetObjectId,
      copy: {startTime: startSec, endTime: endSec, create_time: now, title: targetTitle}
    });

    return response;
  }
}

export default RecordingCopyStore;
