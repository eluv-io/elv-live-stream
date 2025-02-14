import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import AudioTracksTable from "@/pages/create/audio-tracks-table/AudioTracksTable.jsx";
import {dataStore, editStore, streamStore} from "@/stores";
import {useParams} from "react-router-dom";
import {Box, Loader} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {Select} from "@/components/Inputs.jsx";
import {
  CONNECTION_TIMEOUT_OPTIONS,
  RECONNECTION_TIMEOUT_OPTIONS,
  RETENTION_OPTIONS, STATUS_MAP
} from "@/utils/constants";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";

const RecordingPanel = observer(({
  title,
  slug,
  status,
  currentRetention,
  currentConnectionTimeout,
  currentReconnectionTimeout
}) => {
  const params = useParams();
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioFormData, setAudioFormData] = useState(null);
  const [retention, setRetention] = useState(currentRetention);
  const [connectionTimeout, setConnectionTimeout] = useState(currentConnectionTimeout === undefined ? 600 : CONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(currentConnectionTimeout) ? currentConnectionTimeout : undefined);
  const [reconnectionTimeout, setReconnectionTimeout] = useState(RECONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(currentReconnectionTimeout) ? currentReconnectionTimeout : undefined);
  const [applyingChanges, setApplyingChanges] = useState(false);

  const LoadConfigData = async () => {
    const {audioStreams, audioData} = await dataStore.LoadStreamProbeData({
      objectId: params.id
    });

    setAudioTracks(audioStreams);
    setAudioFormData(audioData);
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

      await streamStore.UpdateStreamAudioSettings({
        objectId: params.id,
        slug,
        audioData: audioFormData
      });

      await editStore.UpdateConfigMetadata({
        objectId: params.id,
        slug,
        retention,
        connectionTimeout,
        reconnectionTimeout
      });

      await LoadConfigData();

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

  return (
    <Box w="700px" mb={24}>
      <form onSubmit={HandleSubmit} className="form">
        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Retention Period configuration is disabled when the stream is running"
        >
          <div className="form__section-header">Retention Period</div>
          <Select
            labelDescription="Select a retention period for how long stream parts will exist until they are removed from the fabric."
            formName="retention"
            options={RETENTION_OPTIONS}
            value={retention}
            onChange={event => setRetention(event.target.value)}
          />
        </DisabledTooltipWrapper>

        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Timeout configuration is disabled when the stream is running"
        >
          <div className="form__section-header">Timeout</div>
          <Select
            label="Connection Timeout"
            labelDescription="The stream will remain active and wait for an input feed for this duration."
            formName="connectionTimeout"
            options={CONNECTION_TIMEOUT_OPTIONS}
            style={{width: "100%"}}
            defaultOption={{
              value: "",
              label: "Select Time Duration"
            }}
            value={connectionTimeout}
            onChange={(event) => setConnectionTimeout(event.target.value)}
          />
          <Select
            label="Reconnection Timeout"
            labelDescription="If the input feed is disconnected, the stream will remain active and wait for a reconnection for this duration."
            formName="reconnectionTimeout"
            options={RECONNECTION_TIMEOUT_OPTIONS}
            style={{width: "100%"}}
            defaultOption={{
              value: "",
              label: "Select Time Duration"
            }}
            value={reconnectionTimeout}
            onChange={(event) => setReconnectionTimeout(event.target.value)}
          />
        </DisabledTooltipWrapper>

        <DisabledTooltipWrapper
          disabled={![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          tooltipLabel="Audio Track configuration is disabled when the stream is running"
        >
          <div className="form__section-header">Audio Tracks</div>
          <AudioTracksTable
            records={audioTracks}
            audioFormData={audioFormData}
            setAudioFormData={setAudioFormData}
          />
        </DisabledTooltipWrapper>

        <Box mt="24px">
          <button
            type="submit"
            className="button__primary"
            disabled={applyingChanges || ![STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
          >
            {applyingChanges ? <Loader type="dots" size="xs" style={{margin: "0 auto"}} /> : "Apply"}
          </button>
        </Box>
      </form>
    </Box>
  );
});

export default RecordingPanel;
