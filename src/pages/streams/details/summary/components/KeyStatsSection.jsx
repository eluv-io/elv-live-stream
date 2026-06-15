import {Flex, Select, SimpleGrid} from "@mantine/core";
import {useState, useMemo} from "react";
import {CODEC_TEXT} from "@/utils/constants.ts";
import {AudioBitrateReadable, SampleRateReadable, VideoBitrateReadable} from "@/utils/formatters.ts";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import DetailCard, {DetailCardBody, SubDetailCard} from "@/components/detail-card/DetailCard.jsx";
import {BuildSourceData, BuildPackagingData} from "@/pages/streams/details/summary/SummarySelectors.tsx";
import styles from "@/pages/streams/details/summary/SummaryPanel.module.css";

const KeyStatsSection = ({stream, status, loadingStatus}) => {
  const [selectedSourceAudio, setSelectedSourceAudio] = useState(0);
  const [selectedPackagingAudio, setSelectedPackagingAudio] = useState(1);

  const sourceAudioOptions = useMemo(
    () => Object.keys(stream?.audioStreams || {}).map(key => ({value: key, label: String(parseInt(key) + 1)})),
    [stream?.audioStreams]
  );

  const packagingAudioOptions = useMemo(
    () => Object.keys(stream?.audioData || {}).map(key => ({value: key, label: key})),
    [stream?.audioData]
  );

  const sourceData = useMemo(() => BuildSourceData({stream, status}), [stream, status]);
  const packagingData = useMemo(() => BuildPackagingData({stream, status, loadingStatus}), [stream, status, loadingStatus]);

  return (
    <Flex direction="column" flex={1} gap={8}>
      <SectionTitle>Key Stats</SectionTitle>
      <SimpleGrid cols={2} spacing={20}>
        <DetailCard title="Source">
          <DetailCardBody id="source" data={sourceData} />
          <SubDetailCard
            title="Video"
            data={[
              {label: "Stream ID", value: stream?.videoStreamProbe?.stream_id},
              {label: "Bitrate", value: VideoBitrateReadable(stream?.videoStreamProbe?.bit_rate)},
              {label: "Frame Rate", value: stream?.videoStreamProbe?.frame_rate ? `${stream?.videoStreamProbe?.frame_rate} fps` : ""},
              {label: "Resolution", value: stream?.videoStreamProbe ? `${stream?.videoStreamProbe?.width}x${stream?.videoStreamProbe?.height}p` : ""},
              {label: "Codec", value: stream?.videoStreamProbe?.codec_name ? CODEC_TEXT[stream?.videoStreamProbe?.codec_name] : ""}
            ]}
          />
          <SubDetailCard
            title="Audio"
            titleRightSection={
              <Select
                value={String(selectedSourceAudio)}
                onChange={(value) => setSelectedSourceAudio(parseInt(value))}
                data={sourceAudioOptions}
                classNames={{input: styles.audioSelectInput, wrapper: styles.audioSelectWrapper}}
                allowDeselect={false}
              />
            }
            data={[
              {label: "Stream ID", value: stream?.audioStreams?.[selectedSourceAudio]?.stream_id},
              {label: "Bitrate", value: AudioBitrateReadable(stream?.audioStreams?.[selectedSourceAudio]?.bit_rate)},
              {label: "Sample Rate", value: SampleRateReadable(stream?.audioStreams?.[selectedSourceAudio]?.sample_rate)},
              {label: "Channels", value: stream?.audioStreams?.[selectedSourceAudio]?.channels},
              {label: "Codec", value: stream?.audioStreams?.[selectedSourceAudio]?.codec_name}
            ]}
          />
        </DetailCard>

        <DetailCard title="Publishing">
          <DetailCardBody id="packaging" data={packagingData} />
          <SubDetailCard
            title="Video"
            data={[
              {label: "Stream ID", value: stream?.videoStreamProbe?.stream_id},
              {label: "Bitrate", value: VideoBitrateReadable(stream?.publishingVideo?.bit_rate)},
              {label: "Frame Rate", value: stream?.publishingVideo?.frame_rate ? `${stream?.publishingVideo?.frame_rate} fps` : ""},
              {label: "Resolution", value: stream?.publishingVideo?.resolution},
              {label: "Codec", value: stream?.publishingVideo?.codec}
            ]}
          />
          <SubDetailCard
            title="Audio"
            titleRightSection={
              <Select
                value={String(selectedPackagingAudio)}
                onChange={(value) => setSelectedPackagingAudio(value)}
                data={packagingAudioOptions}
                classNames={{input: styles.audioSelectInput, wrapper: styles.audioSelectWrapper}}
                allowDeselect={false}
              />
            }
            data={[
              {label: "Stream ID", value: selectedPackagingAudio},
              {label: "Bitrate", value: AudioBitrateReadable(stream?.audioData?.[selectedPackagingAudio]?.recording_bitrate)},
              {label: "Sample Rate", value: SampleRateReadable(stream?.publishingAudio?.sample_rate)},
              {label: "Channels", value: stream?.audioData?.[selectedPackagingAudio]?.recording_channels},
              {label: "Codec", value: stream?.audioData?.[selectedPackagingAudio]?.codec}
            ]}
          />
        </DetailCard>
      </SimpleGrid>
    </Flex>
  );
};

export default KeyStatsSection;
