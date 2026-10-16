// Output helpers: type derivation, default rtmp input, and the shared read-modify-write for stored outputs.
import type {Output, OutputType} from "@/stores/outputs/types";

/** Display type for an output: its transport, plus RTP/TS packaging for SRT outputs. */
export const DeriveOutputType = (output: Output, streamSource?: string[]): OutputType[] | undefined => {
  const stripRtp = output.srt_pull?.strip_rtp ?? output.srt_push?.strip_rtp;
  const packaging: OutputType = streamSource?.includes("rtp") && !stripRtp ? "RTP" : "TS";

  if(output.rtp) return ["RTP"];
  if(output.udp) return ["UDP"];
  if(output.rtmp) return [/^rtmps:/i.test(output.rtmp.url ?? "") ? "RTMPS" : "RTMP"];
  if(output.srt_push) return ["SRT PUSH", packaging];
  if(output.srt_pull) return ["SRT PULL", packaging];
  return undefined;
};

/** Default `input.fmp4` for rtmp outputs: the top video rung and the default (else first) audio track. */
export const DefaultFmp4 = async ({client, streamObjectId}: {client: any, streamObjectId: string}) => {
  const streamLibraryId = await client.ContentObjectLibraryId({objectId: streamObjectId});
  const ladderSpecs: any[] = await client.ContentObjectMetadata({
    libraryId: streamLibraryId,
    objectId: streamObjectId,
    metadataSubtree: "live_recording/recording_config/recording_params/ladder_specs"
  }) || [];

  const video = ladderSpecs
    .filter(spec => spec.media_type === 1)
    .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0];
  const audioSpecs = ladderSpecs.filter(spec => spec.media_type === 2);
  const audio = audioSpecs.find(spec => spec.default) ?? audioSpecs[0];

  if(!video) { throw new Error("Stream has no video ladder to publish over RTMP"); }

  return {
    representation: video.representation,
    ...(audio && {audio_name: audio.stream_name}),
    latency: "750ms"
  };
};

/**
 * Read each output's stored config, apply `Update`, and write them back - one
 * OutputsModify call, or a single OutputsModifyBatch when `batch`. Returns the
 * written outputs keyed by id. All reads finish before any write, so an `Update`
 * that throws leaves every output untouched.
 */
export const ModifyOutputs = async ({client, objectId, outputIds, batch, Update}: {
  client: any,
  objectId: string,
  outputIds: string[],
  batch: boolean,
  Update: (existing: any, outputId: string) => any
}): Promise<Record<string, any>> => {
  const libraryId = await client.ContentObjectLibraryId({objectId});

  const entries = await Promise.all(outputIds.map(async outputId => {
    const existing = await client.ContentObjectMetadata({
      libraryId,
      objectId,
      metadataSubtree: `live_outputs/${outputId}`
    }) || {};

    return [outputId, JSON.parse(JSON.stringify(await Update(existing, outputId)))];
  }));
  const outputs: Record<string, any> = Object.fromEntries(entries);

  if(batch) {
    await client.OutputsModifyBatch({libraryId, objectId, outputs});
  } else {
    await client.OutputsModify({libraryId, objectId, outputId: outputIds[0], output: outputs[outputIds[0]]});
  }

  return outputs;
};
