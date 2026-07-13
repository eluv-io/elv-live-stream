import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";
import {useForm} from "@mantine/form";
import AudioTracksTable from "@/pages/streams/details/recording/audio-tracks-table/AudioTracksTable.jsx";
import {outputStore, streamEditStore, streamStore, streamSaveStore} from "@/stores/index.ts";
import {useParams} from "react-router-dom";
import {
  Box,
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
import {
  CONNECTION_TIMEOUT_OPTIONS,
  RECONNECTION_TIMEOUT_OPTIONS,
  RETENTION_OPTIONS, STATUS_MAP
} from "@/utils/constants.ts";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";

const RecordingPanel = observer(({
  slug,
  status,
  checkVersion
}) => {
  const params = useParams();
  const [audioTracks, setAudioTracks] = useState([]);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      audioFormData: null,
      retention: "",
      connectionTimeout: "",
      reconnectionTimeout: "",
      copyMpegTs: false,
      inputPackaging: "raw_ts",
      fabricPackagingFMP4: true,
      fabricPackagingMpegTs: false,
      copyPackaging: "raw_ts",
      multiPathEnabled: false
    },
    onValuesChange: () => streamSaveStore.SetDirty({id: "recording", isDirty: form.isDirty()})
  });

  const {
    audioFormData,
    copyMpegTs,
    inputPackaging,
    fabricPackagingFMP4,
    fabricPackagingMpegTs
  } = form.getValues();

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

      const values = {
        audioFormData: audioData,
        retention: retentionMeta,
        connectionTimeout: connectionTimeoutMeta === null ? "600" : CONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(connectionTimeoutMeta) ? connectionTimeoutMeta : null,
        reconnectionTimeout: RECONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(reconnectionTimeoutMeta) ? reconnectionTimeoutMeta : null,
        multiPathEnabled: multiPathMeta?.enabled ?? false,
        copyMpegTs: copyMpegTsMeta === undefined ? false : copyMpegTsMeta,
        copyPackaging: inputCfg?.copy_packaging ?? "raw_ts",
        inputPackaging: inputCfg?.input_packaging ?? "raw_ts",
        fabricPackagingFMP4: inputCfg?.copy_mode ? inputCfg?.copy_mode === "raw" : true,
        fabricPackagingMpegTs: inputCfg?.copy_mode ? true : false
      };

      // resetDirty before setValues - see comment in GeneralPanel.jsx's
      // equivalent load effect for why the order matters here.
      form.resetDirty(values);
      form.setValues(values);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if(params.id) {
      LoadConfigData();
    }
     
  }, [params.id, checkVersion]);

  const Save = async() => {
    const values = form.getValues();

    let retentionData = null;
    let persistent = false;

    if(values.retention) {
      if(values.retention === "indefinite") {
        persistent = true;
      } else {
        retentionData = parseInt(values.retention);
      }
    }

    await streamEditStore.UpdateRecordingConfig({
      objectId: params.id,
      slug,
      audioFormData: values.audioFormData,
      configFormData: {
        retention: retentionData,
        persistent,
        connectionTimeout: values.connectionTimeout ? parseInt(values.connectionTimeout) : null,
        reconnectionTimeout: values.reconnectionTimeout ? parseInt(values.reconnectionTimeout) : null
      },
      tsFormData: {
        copyMpegTs: values.copyMpegTs,
        inputPackaging: values.inputPackaging,
        fabricPackagingFMP4: values.fabricPackagingFMP4,
        fabricPackagingMpegTs: values.fabricPackagingMpegTs,
        copyPackaging: values.copyPackaging
      },
      edit: true,
      multiPathEnabled: values.multiPathEnabled
    });

    await outputStore.LoadOutputStreamInfo({streamObjectId: params.id, slug});

    form.resetDirty(values);
  };

  const SaveRef = useRef();
  SaveRef.current = Save;

  useEffect(() => {
    streamSaveStore.Register({
      id: "recording",
      Save: () => SaveRef.current(),
      Discard: () => form.reset()
    });

    return () => streamSaveStore.Unregister("recording");
  }, []);

  if(loading) { return <Loader />; }

  return (
    <Box maw="80%" mb={24}>
      <DisabledTooltipWrapper
        disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
        tooltipLabel="Retention Period configuration is disabled when the stream is running"
      >
        <SectionTitle mb={8}>Retention</SectionTitle>
        <SimpleGrid cols={2} spacing={150} mb={29}>
          <Select
            description="Select a retention period for how long stream parts will exist until they are removed from the fabric."
            data={RETENTION_OPTIONS}
            placeholder="Select Time Duration"
            key={form.key("retention")}
            {...form.getInputProps("retention")}
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
            data={CONNECTION_TIMEOUT_OPTIONS}
            placeholder="Select Connection Timeout"
            key={form.key("connectionTimeout")}
            {...form.getInputProps("connectionTimeout")}
            allowDeselect={false}
          />
          <Select
            label="Reconnection Timeout"
            description="If the input feed is disconnected, the stream will remain active and wait for a reconnection for this duration."
            data={RECONNECTION_TIMEOUT_OPTIONS}
            placeholder="Select Reconnection Timeout"
            key={form.key("reconnectionTimeout")}
            {...form.getInputProps("reconnectionTimeout")}
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
              key={form.key("copyMpegTs")}
              {...form.getInputProps("copyMpegTs", {type: "checkbox"})}
            />
          </SimpleGrid>

          <Collapse expanded={copyMpegTs}>
            <SimpleGrid cols={2} spacing={150} mb={29} ml={34}>
              <Radio.Group
                label="Input Packaging"
                description="Choose the format of your incoming stream. Use TS for standard broadcast signals or RTP TS for IP networks requiring better timing and jitter management."
                key={form.key("inputPackaging")}
                {...form.getInputProps("inputPackaging")}
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
                  label="FMP4 (For DASH/HLS, VOD, clipping, downloads)"
                  key={form.key("fabricPackagingFMP4")}
                  {...form.getInputProps("fabricPackagingFMP4", {type: "checkbox"})}
                />
                <Checkbox
                  label="MPEG-TS (For MPEG-TS routing and RTP/TS/SRT outputs)"
                  key={form.key("fabricPackagingMpegTs")}
                  {...form.getInputProps("fabricPackagingMpegTs", {type: "checkbox"})}
                />
                <Collapse expanded={fabricPackagingMpegTs}>
                  <Radio.Group
                    ml={34}
                    key={form.key("copyPackaging")}
                    {...form.getInputProps("copyPackaging")}
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
            setAudioFormData={(value) => form.setFieldValue("audioFormData", value)}
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
            key={form.key("multiPathEnabled")}
            {...form.getInputProps("multiPathEnabled", {type: "checkbox"})}
          />
        </SimpleGrid>
      </DisabledTooltipWrapper>
    </Box>
  );
});

export default RecordingPanel;
