interface WriteTokenClient {
  ContentObjectLibraryId: (args: {objectId: string}) => Promise<string>;
  EditContentObject: (args: {libraryId: string, objectId: string}) => Promise<{writeToken: string}>;
  FinalizeContentObject: (args: {
    libraryId: string,
    objectId: string,
    writeToken: string,
    commitMessage?: string,
    awaitCommitConfirmation?: boolean
  }) => Promise<unknown>;
}

export interface WithWriteTokenParams {
  client: WriteTokenClient;
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
