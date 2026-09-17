import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";
import {useForm} from "@mantine/form";
import {notifications} from "@mantine/notifications";
import AudioTracksTable from "@/pages/streams/details/recording/audio-tracks-table/AudioTracksTable.jsx";
import AlternateTranscodesTable from "@/pages/streams/details/recording/alternate-transcodes/AlternateTranscodesTable.jsx";
import JsonEditorCard from "@/components/json-editor-card/JsonEditorCard.jsx";
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
  active,
  checkVersion
}) => {
  const params = useParams();
  const [audioTracks, setAudioTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(null);

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
      copyPackagingFormats: [],
      alternateTranscodes: [],
      programPidSelection: {activeProgramId: null, selections: {}},
      advancedEncodingParams: null,
      multiPathEnabled: false
    },
    onValuesChange: () => streamSaveStore.SetDirty({id: "recording", isDirty: form.isDirty()})
  });

  const {
    audioFormData,
    copyMpegTs,
    fabricPackagingFMP4,
    alternateTranscodes,
    advancedEncodingParams
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
        multiPath: multiPathMeta,
        copyPackagingFormats: copyPackagingFormatsMeta,
        alternateTranscodes: alternateTranscodesMeta,
        programPidSelection: programPidSelectionMeta,
        advancedEncodingParams: advancedEncodingParamsMeta
      } = await streamStore.LoadRecordingConfigData({objectId: params.id, slug});

      retentionMeta = persistentMeta ? "indefinite" : retentionMeta ? retentionMeta.toString() : null;
      connectionTimeoutMeta = connectionTimeoutMeta ? connectionTimeoutMeta.toString() : null;
      reconnectionTimeoutMeta = reconnectionTimeoutMeta ? reconnectionTimeoutMeta.toString() : null;

      setAudioTracks(audioStreams);

      // Existing streams predate copyPackagingFormats - fall back to a
      // single-item array derived from the legacy copy_packaging/copy_mode
      // fields so their previously-selected format still shows as checked.
      const legacyPackagingFormats = inputCfg?.copy_mode ? (inputCfg?.copy_packaging ? [inputCfg.copy_packaging] : []) : [];

      const values = {
        audioFormData: audioData,
        retention: retentionMeta,
        connectionTimeout: connectionTimeoutMeta === null ? "600" : CONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(connectionTimeoutMeta) ? connectionTimeoutMeta : null,
        reconnectionTimeout: RECONNECTION_TIMEOUT_OPTIONS.map(item => item.value).includes(reconnectionTimeoutMeta) ? reconnectionTimeoutMeta : null,
        multiPathEnabled: multiPathMeta?.enabled ?? false,
        copyMpegTs: copyMpegTsMeta === undefined ? false : copyMpegTsMeta,
        inputPackaging: inputCfg?.input_packaging ?? "raw_ts",
        fabricPackagingFMP4: inputCfg?.copy_mode ? inputCfg?.copy_mode === "raw" : true,
        copyPackagingFormats: copyPackagingFormatsMeta?.length ? copyPackagingFormatsMeta : legacyPackagingFormats,
        alternateTranscodes: alternateTranscodesMeta ?? [],
        programPidSelection: programPidSelectionMeta ?? {activeProgramId: null, selections: {}},
        advancedEncodingParams: advancedEncodingParamsMeta ?? null
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
    // Defer until this tab is first shown - every detail panel is mounted at
    // once (keepMountedMode="display-none"), so an unconditional load fires
    // all panels' fetches on page open.
    const loadKey = `${params.id}:${checkVersion}`;
    if(params.id && active && loadedRef.current !== loadKey) {
      loadedRef.current = loadKey;
      LoadConfigData();
    }
  }, [params.id, active, checkVersion]);

  const Save = async() => {
    const values = form.getValues();

    if(!values.copyMpegTs && !values.fabricPackagingFMP4) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "Enable at least one of Transport Stream or FMP4 packaging"
      });
      return;
    }

    let retentionData = null;
    let persistent = false;

    if(values.retention) {
      if(values.retention === "indefinite") {
        persistent = true;
      } else {
        retentionData = parseInt(values.retention);
      }
    }

    // Legacy single-value fields, derived from the new multi-select
    // Fabric Packaging checkboxes for backward compatibility - the fabric's
    // input_cfg.copy_packaging is still a single string. The full array is
    // also written separately (copyPackagingFormats, see StreamEditStore) -
    // whether the fabric can actually apply more than one simultaneously is
    // an open question pending fabric-team confirmation.
    const fabricPackagingMpegTs = values.copyPackagingFormats.length > 0;
    const copyPackaging = values.copyPackagingFormats[0] || "raw_ts";

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
        fabricPackagingMpegTs,
        copyPackaging,
        copyPackagingFormats: values.copyPackagingFormats
      },
      fmp4FormData: {
        // Disabled - not saved/updated until fabric support for program/PID
        // selection is exposed. See ProgramPidSelector.
        // programPidSelection: values.programPidSelection,
        advancedEncodingParams: values.advancedEncodingParams
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

      {
        !(streamStore.streams?.[slug].originUrl || "").includes("rtmp") &&
        <>
          <DisabledTooltipWrapper
            disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
            tooltipLabel="Transport Stream configuration is disabled when the stream is running"
          >
            <SectionTitle mb={16}>Transport Stream Packaging</SectionTitle>
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
                      disabled={!streamStore.streams[slug]?.source?.includes("rtp")}
                    />
                  </Group>
                </Radio.Group>
                <Checkbox.Group
                  label="Fabric Packaging"
                  description="Choose the desired formats available in the Content Fabric."
                  key={form.key("copyPackagingFormats")}
                  {...form.getInputProps("copyPackagingFormats")}
                >
                  <Stack gap={18} mt={12}>
                    <Checkbox value="rtp_ts" label="RTP wrapped MPEG-TS (ST 2022-2, ST 2022-7)" />
                    <Checkbox value="ats_ts" label="MPEG-TS with arrival timestamps" />
                    <Checkbox value="raw_ts" label="MPEG-TS (For MPEG-TS routing and RTP/TS/SRT outputs)" />
                  </Stack>
                </Checkbox.Group>
              </SimpleGrid>

              <Box ml={34} mb={29}>
                <Box mt={16}>
                  <Text fz="0.875rem" fw={600} c="elv-black.3" mb={4}>Alternate Transcodes</Text>
                  <Text fz="0.875rem" c="elv-gray.8" mb={12}>Create additional transcoded versions of this stream at different resolutions, bitrates, or nodes.</Text>
                  <AlternateTranscodesTable
                    records={alternateTranscodes}
                    onChange={(value) => {
                      // Row actions are immediate fabric writes, not panel-dirty
                      // state - reset only this field's baseline so other
                      // unsaved fields stay dirty.
                      form.setFieldValue("alternateTranscodes", value);
                      form.resetDirty({...form.getInitialValues(), alternateTranscodes: value});
                      streamSaveStore.SetDirty({id: "recording", isDirty: form.isDirty()});
                    }}
                    parentObjectId={params.id}
                    parentLibraryId={streamStore.streams[slug]?.libraryId}
                    parentSlug={slug}
                  />
                </Box>
              </Box>
            </Collapse>
            <Divider mb={29} />
          </DisabledTooltipWrapper>

          <DisabledTooltipWrapper
            disabled={![STATUS_MAP.UNINITIALIZED, STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(status)}
            tooltipLabel="FMP4/CMAF configuration is disabled when the stream is running"
          >
            <SectionTitle mb={16}>FMP4/CMAF Packaging</SectionTitle>
            <SimpleGrid cols={2} spacing={150} mb={14}>
              <Checkbox
                label="Enable FMP4"
                key={form.key("fabricPackagingFMP4")}
                {...form.getInputProps("fabricPackagingFMP4", {type: "checkbox"})}
              />
            </SimpleGrid>

            <Collapse expanded={fabricPackagingFMP4}>
              <Box ml={34} mb={29}>
                {/* Disabled - see fmp4FormData comment in Save() above.
                <Stack gap={4} mb={12}>
                  <Input.Label>Program</Input.Label>
                  <Input.Description>Choose a program (if multiprogram) and select the video/audio PIDs to include in the output.</Input.Description>
                </Stack>
                <ProgramPidSelector
                  value={programPidSelection}
                  onChange={(value) => form.setFieldValue("programPidSelection", value)}
                />
                */}

                <Box mt={16}>
                  <JsonEditorCard
                    value={advancedEncodingParams}
                    onChange={(value) => form.setFieldValue("advancedEncodingParams", value)}
                    shaded={false}
                  />
                </Box>
              </Box>
            </Collapse>
            <Divider mb={29} />
          </DisabledTooltipWrapper>

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
        </>
      }
    </Box>
  );
});

export default RecordingPanel;
