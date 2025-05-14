import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import AudioTracksTable from "@/pages/create/audio-tracks-table/AudioTracksTable.jsx";
import {dataStore, editStore} from "@/stores";
import {useParams} from "react-router-dom";
import {Box, Button, Checkbox, Divider, Loader, Select, SimpleGrid} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {
  CONNECTION_TIMEOUT_OPTIONS,
  RECONNECTION_TIMEOUT_OPTIONS,
  RETENTION_OPTIONS, STATUS_MAP
} from "@/utils/constants";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";

const RecordingPanel = observer(({
  title,
  slug,
  status,
  PageVersionCallback
}) => {
  const params = useParams();
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioFormData, setAudioFormData] = useState(null);
  const [retention, setRetention] = useState("");
  const [connectionTimeout, setConnectionTimeout] = useState("");
  const [reconnectionTimeout, setReconnectionTimeout] = useState("");
  const [copyMpegTs, setCopyMpegTs] = useState(false);

  const [applyingChanges, setApplyingChanges] = useState(false);
  const [loading, setLoading] = useState(false);

  const LoadConfigData = async () => {
    try {
      setLoading(true);

      let {
        audioStreams,
        audioData,
        retention: retentionMeta,
        connectionTimeout: connectionTimeoutMeta,
        reconnectionTimeout: reconnectionTimeoutMeta,
        copyMpegTs: copyMpegTsMeta
      } = await dataStore.LoadRecordingConfigData({objectId: params.id});

      retentionMeta = retentionMeta ? retentionMeta.toString() : null;
      connectionTimeoutMeta = connectionTimeoutMeta ? connectionTimeoutMeta.toString() : null;
      reconnectionTimeoutMeta =reconnectionTimeoutMeta ? reconnectionTimeoutMeta.toString() : null;

      setAudioTracks(audioStreams);
      setAudioFormData(audioData);
      setRetention(retentionMeta);
      setConnectionTimeout(
        connectionTimeoutMeta === null ? "600" : CONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(connectionTimeoutMeta) ? connectionTimeoutMeta : null
      );
      setReconnectionTimeout(
        RECONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(reconnectionTimeoutMeta) ? reconnectionTimeoutMeta : null
      );
      setCopyMpegTs(copyMpegTsMeta === undefined ? false : copyMpegTsMeta);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if(params.id) {
      LoadConfigData();
    }
  }, [params.id]);

  const HandleSubmit = async(event) => {
    event.preventDefault();
    try {
      setApplyingChanges(true);

      await editStore.UpdateRecordingConfig({
        objectId: params.id,
        slug,
        audioFormData,
        configFormData: {
          retention: retention ? parseInt(retention) : null,
          connectionTimeout: connectionTimeout ? parseInt(connectionTimeout) : null,
          reconnectionTimeout: reconnectionTimeout ? parseInt(reconnectionTimeout) : null
        },
        tsFormData: {
          copyMpegTs
        }
      });

      await LoadConfigData();

      PageVersionCallback(prev => prev + 1);

      notifications.show({
        title: `${title || params.id} updated`,
        message: "Settings have been applied successfully"
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to configure audio settings", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to apply settings"
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
            />
            <Select
              label="Reconnection Timeout"
              description="If the input feed is disconnected, the stream will remain active and wait for a reconnection for this duration."
              name="reconnectionTimeout"
              data={RECONNECTION_TIMEOUT_OPTIONS}
              placeholder="Select Reconnection Timeout"
              value={reconnectionTimeout}
              onChange={(value) => setReconnectionTimeout(value)}
            />
          </SimpleGrid>
        </DisabledTooltipWrapper>

        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Transport Stream configuration is disabled when the stream is running"
        >
          <SectionTitle mb={8}>Transport Stream</SectionTitle>
          <SimpleGrid cols={2} spacing={150} mb={29}>
            <Checkbox
              label="Record Transport Stream Source"
              checked={copyMpegTs}
              onChange={(event) => setCopyMpegTs(event.target.checked)}
              mb={12}
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
            Apply
          </Button>
        </Box>
      </form>
    </Box>
  );
});

export default RecordingPanel;
