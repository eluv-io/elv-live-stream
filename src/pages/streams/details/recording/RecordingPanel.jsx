import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import AudioTracksTable from "@/pages/create/audio-tracks-table/AudioTracksTable.jsx";
import {outputStore, streamEditStore, streamStore} from "@/stores/index.js";
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
  Collapse
} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {
  CONNECTION_TIMEOUT_OPTIONS,
  RECONNECTION_TIMEOUT_OPTIONS,
  RETENTION_OPTIONS, STATUS_MAP
} from "@/utils/constants.js";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const RecordingPanel = observer(({
  title,
  slug,
  status,
  PageVersionCallback,
  url,
  checkVersion
}) => {
  const params = useParams();
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioFormData, setAudioFormData] = useState(null);
  const [retention, setRetention] = useState("");
  const [connectionTimeout, setConnectionTimeout] = useState("");
  const [reconnectionTimeout, setReconnectionTimeout] = useState("");

  const [copyMpegTs, setCopyMpegTs] = useState(false);
  const [inputPackaging, setInputPackaging] = useState("rtp_ts");
  const [customReadLoop, setCustomReadLoop] = useState(false);
  const [copyMode, setCopyMode] = useState("raw_only");
  const [multiPathEnabled, setMultiPathEnabled] = useState(false);

  const [applyingChanges, setApplyingChanges] = useState(false);
  const [loading, setLoading] = useState(false);

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
      } = await streamStore.LoadRecordingConfigData({objectId: params.id});

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
      setCopyMode(inputCfg?.copy_mode ?? "raw");
      setInputPackaging(inputCfg?.input_packaging ?? "rtp_ts");
      setCustomReadLoop(inputCfg?.custom_read_loop_enabled ?? true);
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
          copyMode,
          customReadLoop
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
          !(url || "").includes("rtmp") &&
          <DisabledTooltipWrapper
            disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
            tooltipLabel="Transport Stream configuration is disabled when the stream is running"
          >
            <SectionTitle mb={8}>Transport Stream</SectionTitle>
            <SimpleGrid cols={2} spacing={150} mb={29}>
              <Checkbox
                label="Enable Transport Stream"
                checked={copyMpegTs}
                onChange={(event) => setCopyMpegTs(event.target.checked)}
              />
            </SimpleGrid>

            <Collapse in={copyMpegTs}>
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
                      value="ts"
                      label="TS"
                      description=""
                    />
                    <Radio
                      value="rtp_ts"
                      label="RTP TS"
                      description=""
                      disabled={streamStore.streams[params.id]?.protocol !== "rtp"}
                    />
                  </Group>
                </Radio.Group>
                <Radio.Group
                  name="copy-mode"
                  label="Copy Mode"
                  description="Select Raw for high throughput with minimal overhead, or Raw Only for bit-for-bit passthrough without metadata modification."
                  value={copyMode}
                  onChange={setCopyMode}
                >
                  <Group mt={20} gap={18}>
                    <Radio
                      value="raw"
                      label="Raw"
                      description=""
                    />
                    <Radio
                      value="raw_only"
                      label="Raw Only"
                      description=""
                    />
                  </Group>
                </Radio.Group>
              </SimpleGrid>
              <SimpleGrid cols={2} spacing={150} mb={29} ml={34}>
                <Box>
                  <Checkbox
                    label="Enable Legacy Reader"
                    description="Enable for compatibility with older hardware or legacy playback engines."
                    checked={customReadLoop}
                    onChange={(event) => setCustomReadLoop(event.target.checked)}
                  />
                </Box>
              </SimpleGrid>
            </Collapse>
            <Divider mb={29} />
          </DisabledTooltipWrapper>
        }

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
          <Divider mb={29} />
        </DisabledTooltipWrapper>

        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Audio Track configuration is disabled when the stream is running"
        >
          <SectionTitle mb={16}>Audio</SectionTitle>
          <AudioTracksTable
            records={audioTracks}
            audioFormData={audioFormData}
            setAudioFormData={setAudioFormData}
          />
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
