import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import AudioTracksTable from "@/pages/streams/details/recording/audio-tracks-table/AudioTracksTable.jsx";
import {outputStore, streamEditStore, streamStore} from "@/stores/index.ts";
import {useParams} from "react-router-dom";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Radio,
  Select,
  SimpleGrid,
  Collapse,
  Input,
  Stack,
  Text
} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {
  CONNECTION_TIMEOUT_OPTIONS,
  RECONNECTION_TIMEOUT_OPTIONS,
  RETENTION_OPTIONS, STATUS_MAP
} from "@/utils/constants.ts";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const RecordingPanel = observer(({
  slug,
  status,
  PageVersionCallback,
  checkVersion
}) => {
  const params = useParams();
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioFormData, setAudioFormData] = useState(null);
  const [retention, setRetention] = useState("");
  const [connectionTimeout, setConnectionTimeout] = useState("");
  const [reconnectionTimeout, setReconnectionTimeout] = useState("");

  const [copyMpegTs, setCopyMpegTs] = useState(false);
  const [inputPackaging, setInputPackaging] = useState("raw_ts");
  const [fabricPackagingFMP4, setFabricPackagingFMP4] = useState(true);
  const [fabricPackagingMpegTs, setFabricPackagingMpegTs] = useState(false);
  const [copyPackaging, setCopyPackaging] = useState("raw_ts");
  const [multiPathEnabled, setMultiPathEnabled] = useState(false);

  const [applyingChanges, setApplyingChanges] = useState(false);
  const [loading, setLoading] = useState(false);

  const title = streamStore.streams?.[slug].title;

  const LoadConfigData = async () => {
    try {
      setLoading(true);

      let {
        audioStreams,
        audioData,
        retention: retentionMeta,
        persistent: persistentMeta,
        connectionTimeout: connectionTimeoutMeta,
        reconnectionTimeout: reconnectionTimeoutMeta,
        copyMpegTs: copyMpegTsMeta,
        inputCfg,
        multiPath: multiPathMeta
      } = await streamStore.LoadRecordingConfigData({objectId: params.id, slug});

      retentionMeta = persistentMeta ? "indefinite" : retentionMeta ? retentionMeta.toString() : null;
      connectionTimeoutMeta = connectionTimeoutMeta ? connectionTimeoutMeta.toString() : null;
      reconnectionTimeoutMeta = reconnectionTimeoutMeta ? reconnectionTimeoutMeta.toString() : null;

      setAudioTracks(audioStreams);
      setAudioFormData(audioData);
      setRetention(retentionMeta);
      setConnectionTimeout(
        connectionTimeoutMeta === null ? "600" : CONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(connectionTimeoutMeta) ? connectionTimeoutMeta : null
      );
      setReconnectionTimeout(
        RECONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(reconnectionTimeoutMeta) ? reconnectionTimeoutMeta : null
      );
      setMultiPathEnabled(multiPathMeta?.enabled ?? false);
      setCopyMpegTs(copyMpegTsMeta === undefined ? false : copyMpegTsMeta);
      setCopyPackaging(inputCfg?.copy_packaging ?? "raw_ts");
      setInputPackaging(inputCfg?.input_packaging ?? "raw_ts");
      if(inputCfg?.copy_mode) {
        setFabricPackagingFMP4(inputCfg?.copy_mode === "raw");
        setFabricPackagingMpegTs(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if(params.id) {
      LoadConfigData();
    }
  }, [params.id, checkVersion]);

  const HandleSubmit = async(event) => {
    event.preventDefault();
    try {
      setApplyingChanges(true);

      let retentionData = null;
      let persistent = false;

      if(retention) {
        if(retention === "indefinite") {
          persistent = true;
        } else {
          retentionData = parseInt(retention);
        }
      }

      await streamEditStore.UpdateRecordingConfig({
        objectId: params.id,
        slug,
        audioFormData,
        configFormData: {
          retention: retentionData,
          persistent,
          connectionTimeout: connectionTimeout ? parseInt(connectionTimeout) : null,
          reconnectionTimeout: reconnectionTimeout ? parseInt(reconnectionTimeout) : null
        },
        tsFormData: {
          copyMpegTs,
          inputPackaging,
          fabricPackagingFMP4,
          fabricPackagingMpegTs,
          copyPackaging
        },
        edit: true,
        multiPathEnabled
      });

      await outputStore.LoadOutputStreamInfo({streamObjectId: params.id, slug});

      PageVersionCallback(prev => prev + 1);

      notifications.show({
        title: <NotificationMessage>Updated {title || params.id}</NotificationMessage>,
        message: "Settings have been saved successfully"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to configure audio settings", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to save settings"
      });
    } finally {
      setApplyingChanges(false);
    }
  };

  if(loading) { return <Loader />; }

  return (
    <Box maw="80%" mb={24}>
      <form onSubmit={HandleSubmit}>
        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Retention Period configuration is disabled when the stream is running"
        >
          <SectionTitle mb={8}>Retention</SectionTitle>
          <SimpleGrid cols={2} spacing={150} mb={29}>
            <Select
              description="Select a retention period for how long stream parts will exist until they are removed from the fabric."
              name="retention"
              data={RETENTION_OPTIONS}
              placeholder="Select Time Duration"
              value={retention}
              onChange={value => setRetention(value)}
              allowDeselect={false}
            />
          </SimpleGrid>
        </DisabledTooltipWrapper>

        <Divider mb={29} />

        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Timeout configuration is disabled when the stream is running"
        >
          <SectionTitle mb={8}>Timeout</SectionTitle>
          <SimpleGrid cols={2} spacing={150} mb={29}>
            <Select
              label="Connection Timeout"
              description="The stream will remain active and wait for an input feed for this duration."
              name="connectionTimeout"
              data={CONNECTION_TIMEOUT_OPTIONS}
              placeholder="Select Connection Timeout"
              value={connectionTimeout}
              onChange={(value) => setConnectionTimeout(value)}
              allowDeselect={false}
            />
            <Select
              label="Reconnection Timeout"
              description="If the input feed is disconnected, the stream will remain active and wait for a reconnection for this duration."
              name="reconnectionTimeout"
              data={RECONNECTION_TIMEOUT_OPTIONS}
              placeholder="Select Reconnection Timeout"
              value={reconnectionTimeout}
              onChange={(value) => setReconnectionTimeout(value)}
              allowDeselect={false}
            />
          </SimpleGrid>
        </DisabledTooltipWrapper>

        {
          !(streamStore.streams?.[slug].originUrl || "").includes("rtmp") &&
          <DisabledTooltipWrapper
            disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
            tooltipLabel="Transport Stream configuration is disabled when the stream is running"
          >
            <SectionTitle mb={16}>Transport Stream</SectionTitle>
            <SimpleGrid cols={2} spacing={150} mb={14}>
              <Checkbox
                label="Enable Transport Stream"
                checked={copyMpegTs}
                onChange={(event) => setCopyMpegTs(event.target.checked)}
              />
            </SimpleGrid>

            <Collapse expanded={copyMpegTs}>
              <SimpleGrid cols={2} spacing={150} mb={29} ml={34}>
                <Radio.Group
                  name="input-packaging"
                  label="Input Packaging"
                  description="Choose the format of your incoming stream. Use TS for standard broadcast signals or RTP TS for IP networks requiring better timing and jitter management."
                  value={inputPackaging}
                  onChange={setInputPackaging}
                >
                  <Group mt={20} gap={18}>
                    <Radio
                      value="raw_ts"
                      label="MPEG-TS (Raw MPEG-TS over UDP)"
                      description=""
                    />
                    <Radio
                      value="rtp_ts"
                      label="RTP wrapped MPEG-TS (ST 2022-2, ST 2022-7)"
                      description=""
                      disabled={streamStore.streams[params.id]?.protocol !== "rtp"}
                    />
                  </Group>
                </Radio.Group>
                <Stack gap={18}>
                  <div>
                    <Input.Label>Fabric Packaging</Input.Label>
                    <Input.Description>Choose the desired formats available in the Content Fabric.</Input.Description>
                  </div>
                  <Checkbox
                    checked={fabricPackagingFMP4}
                    label="FMP4 (For DASH/HLS, VOD, clipping, downloads)"
                    onChange={(event) => setFabricPackagingFMP4(event.target.checked)}
                  />
                  <Checkbox
                    checked={fabricPackagingMpegTs}
                    label="MPEG-TS (For MPEG-TS routing and RTP/TS/SRT outputs)"
                    onChange={(event) => setFabricPackagingMpegTs(event.target.checked)}
                  />
                  <Collapse expanded={fabricPackagingMpegTs}>
                    <Radio.Group
                      ml={34}
                      name="copy-packaging"
                      value={copyPackaging}
                      onChange={setCopyPackaging}
                    >
                      <Stack gap={18}>
                        <Radio
                          label="MPEG-TS (Raw MPEG-TS over UDP)"
                          value="raw_ts"
                        />
                        <Radio
                          value="rtp_ts"
                          label="RTP wrapped MPEG-TS (ST 2022-2, ST 2022-7)"
                          disabled={inputPackaging !== "rtp_ts"}
                        />
                      </Stack>
                    </Radio.Group>
                  </Collapse>
                </Stack>
              </SimpleGrid>

            </Collapse>
            <Divider mb={29} />
          </DisabledTooltipWrapper>
        }

        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Audio Track configuration is disabled when the stream is running"
        >
          <SectionTitle mb={16}>Audio</SectionTitle>
          <Collapse expanded={fabricPackagingFMP4}>
            <AudioTracksTable
              records={audioTracks}
              audioFormData={audioFormData}
              setAudioFormData={setAudioFormData}
            />
          </Collapse>
          <Collapse expanded={!fabricPackagingFMP4}>
            <Text fs="italic" fz={14}>Audio configuration is unavailable when FMP4 Fabric Packaging is disabled.</Text>
          </Collapse>
          <Divider mb={29} mt={29} />
        </DisabledTooltipWrapper>

        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Network configuration is disabled when the stream is running"
        >
          <SectionTitle mb={16}>Network</SectionTitle>
          <SimpleGrid cols={2} spacing={150} mb={29}>
            <Checkbox
              label="Enable Multi-Path Distribution"
              description="Distribute content across multiple delivery paths"
              checked={multiPathEnabled}
              onChange={(event) => setMultiPathEnabled(event.target.checked)}
            />
          </SimpleGrid>
        </DisabledTooltipWrapper>

        <Box mt={25}>
          <Button
            type="submit"
            loading={applyingChanges}
            disabled={applyingChanges || ![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          >
            Save
          </Button>
        </Box>
      </form>
    </Box>
  );
});

export default RecordingPanel;
