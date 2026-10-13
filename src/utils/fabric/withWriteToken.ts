import type {FrameClient} from "@eluvio/elv-client-js/src/FrameClient";

export interface WithWriteTokenParams {
  client: InstanceType<typeof FrameClient>;
  objectId: string;
  libraryId?: string;
  writeToken?: string;
  finalize?: boolean;
  commitMessage?: string;
}

export interface WriteTokenContext {
  libraryId: string;
  objectId: string;
  writeToken: string;
}

// A caller-supplied writeToken is reused; finalize=false leaves it open for the caller.
export const WithWriteToken = async <T>(
  {client, objectId, libraryId, writeToken, finalize=true, commitMessage}: WithWriteTokenParams,
  fn: (context: WriteTokenContext) => Promise<T>
): Promise<{result: T, writeToken: string}> => {
  if(!libraryId) {
    libraryId = await client.ContentObjectLibraryId({objectId});
  }

  if(!writeToken) {
    ({writeToken} = await client.EditContentObject({libraryId, objectId}));
  }

  const result = await fn({libraryId, objectId, writeToken});

  if(finalize) {
    await client.FinalizeContentObject({
      libraryId,
      objectId,
      writeToken,
      commitMessage,
      awaitCommitConfirmation: true
    });
  }

  return {result, writeToken};
};
