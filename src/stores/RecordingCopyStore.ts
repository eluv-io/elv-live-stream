// Live recording copies (VoD copies of a stream's recording periods): list, rename, delete, and CopyToVod.
import {makeAutoObservable} from "mobx";
import {FinalizeContentObjectResponse, RecordingPeriod} from "@/utils/stream/stream";
import {type StreamStatus} from "@/utils/constants";
import type RootStore from "@/stores/RootStore";

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
    const liveRecordingCopies = yield this.FetchLiveRecordingCopies({objectId: streamId});

    delete liveRecordingCopies[recordingCopyId];

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
      commitMessage: "Remove live recording copy"
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

  *CopyToVod({
    objectId,
    targetLibraryId,
    accessGroup,
    selectedPeriods=[],
    title
  }: CopyToVodParams): Generator<any, StreamStatus> {
    let recordingPeriod: number, startTime: string, endTime: string;
    const timeSeconds: Partial<{startTime: number, endTime: number}> = {};
    const sortedPeriods = [...selectedPeriods].sort((a, b) => a?.start_time_epoch_sec - b?.start_time_epoch_sec);
    const firstPeriod = sortedPeriods[0];
    const currentDateTime = new Date();

    if(sortedPeriods.length > 1) {
      const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
      recordingPeriod = null;
      startTime = new Date(firstPeriod?.start_time_epoch_sec * 1000).toISOString();
      endTime = new Date(lastPeriod?.end_time_epoch_sec * 1000).toISOString();

      timeSeconds.startTime = firstPeriod?.start_time_epoch_sec;
      timeSeconds.endTime = lastPeriod?.end_time_epoch_sec;
    } else {
      recordingPeriod = firstPeriod.id;
      timeSeconds.startTime = firstPeriod?.start_time_epoch_sec;
      timeSeconds.endTime = firstPeriod?.end_time_epoch_sec;
    }

    if(!timeSeconds.endTime) {
      timeSeconds.endTime = Math.floor(currentDateTime.getTime() / 1000);
    }

    const titleType = this.rootStore.dataStore.titleContentType;

    if(!targetLibraryId) {
      targetLibraryId = yield this.client.ContentObjectLibraryId({objectId});
    }

    const streams = this.rootStore.streamStatusStore.streams;
    const streamSlug = Object.keys(streams || {}).find(slug => (
      streams[slug].objectId === objectId
    ));
    const targetTitle = title || `${streams[streamSlug]?.title || objectId} VoD`;

    const createResponse = yield this.client.CreateContentObject({
      libraryId: targetLibraryId,
      options: titleType ?
        {
          type: titleType,
          meta: {
            public: {
              name: targetTitle
            }
          }
        } :
        {}
    });
    const targetObjectId = createResponse.id;

    try {
      yield this.client.FinalizeContentObject({
        libraryId: targetLibraryId,
        objectId: targetObjectId,
        writeToken: createResponse.writeToken,
        awaitCommitConfirmation: true,
        commitMessage: "Create VoD object"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to finalize object", error);
      throw error;
    }

    try {
      yield this.client.SetPermission({
        objectId: targetObjectId,
        permission: "editable"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Failed to set permission", error);
      throw error;
    }

    if(accessGroup) {
      this.rootStore.streamEditStore.AddAccessGroupPermission({
        objectId: targetObjectId,
        groupName: accessGroup
      });
    }

    let response: StreamStatus;
    try {
      response = yield this.client.StreamCopyToVod({
        name: objectId,
        targetObjectId,
        recordingPeriod,
        startTime,
        endTime,
        fcTimeout: 900
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to copy to VoD.", error);
      throw error;
    }

    if(!response) {
      throw Error("Unable to copy to VoD. Is part available?");
    } else if(response) {
      const libraryId = yield this.client.ContentObjectLibraryId({objectId});
      const {writeToken} = yield this.client.EditContentObject({
        objectId,
        libraryId
      });

      let copiesMetadata = yield this.client.ContentObjectMetadata({
        objectId,
        libraryId,
        metadataSubtree: "live_recording_copies"
      });

      if(!copiesMetadata) {
        copiesMetadata = {};
      }

      copiesMetadata[targetObjectId] = {
        startTime: timeSeconds.startTime,
        endTime: timeSeconds.endTime,
        create_time: currentDateTime.getTime(),
        title: targetTitle
      };

      yield this.client.ReplaceMetadata({
        objectId,
        libraryId,
        writeToken,
        metadataSubtree: "/live_recording_copies",
        metadata: copiesMetadata
      });

      yield this.client.FinalizeContentObject({
        libraryId,
        objectId,
        writeToken,
        awaitCommitConfirmation: true,
        commitMessage: "Update live recording copies"
      });

      return response;
    }
  }
}

export default RecordingCopyStore;
