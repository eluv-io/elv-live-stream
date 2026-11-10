import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex, Group,
  Input,
  Loader,
  Modal,
  RangeSlider,
  Select, SimpleGrid,
  Stack,
  Text,
  TextInput
} from "@mantine/core";
import {recordingCopyStore, tenantStore} from "@/stores/index.ts";
import {isNotEmpty, useForm} from "@mantine/form";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import {DateTimePicker} from "@mantine/dates";
import dayjs from "dayjs";
import {FormatTime as FormatElapsed} from "@/utils/formatters.ts";

const FormatTime = (epochSec) => Number.isFinite(epochSec) && epochSec ? dayjs(epochSec * 1000).format("YYYY-MM-DD HH:mm:ss") : "";
const DISPLAY_FORMAT = "MMM D, YYYY, HH:mm:ss";
const MARK_COUNT = 5;
const TICK_MS = 1000;
const SLIDER_REFRESH_SEC = 5;
const ToIso = (time) => dayjs(time).toISOString();

const CopyToVodModal = observer(({
  show,
  close,
  defaultTitle,
  objectId,
  selectedPeriods,
  supportsTimeRange,
  retention,
  persistent,
  onCopied,
  onSubmittingChange
}) => {
  const [error, setError] = useState();
  const [loadingLibraries, setLoadingLibraries] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const SetBusy = (busy) => {
    setSubmitting(busy);
    onSubmittingChange?.(busy);
  };

  const ends = selectedPeriods.map(period => period.end_time_epoch_sec);
  const startSec = Math.min(...selectedPeriods.map(period => period.start_time_epoch_sec));
  // A period with no end is still recording; leave blank so the store uses the current time
  const endSec = ends.every(Boolean) ? Math.max(...ends) : undefined;

  // With 2.56s segments, expired periods are copyable but only within the TTL window
  const ttlSec = persistent || !supportsTimeRange ? 0 : (parseInt(retention) || 0);
  const [windowStart, setWindowStart] = useState(startSec);

  const streamIsLive = !endSec;
  const [tracking, setTracking] = useState(true);
  const draggingRef = useRef(false);
  const [hoverThumb, setHoverThumb] = useState(null);
  const [dragThumb, setDragThumb] = useState(null);
  const lastSliderUpdateRef = useRef(0);
  const [latest, setLatest] = useState(0);

  useEffect(() => {
    const EndDrag = () => { draggingRef.current = false; setDragThumb(null); };
    window.addEventListener("pointerup", EndDrag);

    return () => window.removeEventListener("pointerup", EndDrag);
  }, []);
  const isLive = streamIsLive && tracking;
  const badgeColors = isLive ?
    {background: "rgba(255, 0, 0, 0.12)", color: "#FF0000CC"} :
    {background: "#F3F4F6", color: "#6B7280"};

  // Slider domain in epoch seconds; a still-recording selection runs up to when the modal opened
  const [bounds, setBounds] = useState({min: 0, max: 0});
  const [range, setRange] = useState([0, 0]);
  const hasRange = Number.isFinite(startSec) && bounds.max > bounds.min;

  const marks = Array.from({length: MARK_COUNT}, (_, i) => ({
    value: bounds.min + Math.round(((bounds.max - bounds.min) * (i + 1)) / (MARK_COUNT + 1))
  }));

  const HandleSliderChange = ([low, high]) => {
    // While tracking, the end moves each tick, so a start drag can report a stale `high`; ignore it
    if(low !== range[0]) {
      form.setFieldValue("startTime", FormatTime(low));
      setRange([low, range[1]]);
      return;
    }

    if(high !== range[1]) {
      setTracking(false);
      form.setFieldValue("endTime", FormatTime(high));
      setRange([low, high]);
    }
  };

  // Shift the tooltip toward the slider's center near the ends so it stays inside the modal
  const ThumbIndex = (event) => {
    const thumb = event.target.closest?.("[role=slider]");

    return thumb ? [...event.currentTarget.querySelectorAll("[role=slider]")].indexOf(thumb) : null;
  };

  const SliderLabel = (sec) => {
    const index = sec === range[0] ? 0 : 1;
    const visible = (dragThumb ?? hoverThumb) === index;

    const pct = bounds.max > bounds.min ? (sec - bounds.min) / (bounds.max - bounds.min) : 0.5;

    return (
      <span
        style={{
          display: "block",
          padding: "4px 8px",
          borderRadius: 4,
          background: "var(--mantine-color-dark-9, #000)",
          color: "white",
          whiteSpace: "nowrap",
          opacity: visible ? 1 : 0,
          pointerEvents: "none",
          transform: `translateX(${(0.5 - pct) * 140}px)`
        }}
      >
        { dayjs(sec * 1000).format(DISPLAY_FORMAT) }
      </span>
    );
  };

  const pickerLimits = hasRange ? {minDate: new Date(bounds.min * 1000), maxDate: new Date(bounds.max * 1000)} : {};

  const MoveSliderToTime = ({index, time}) => {
    if(!time) {
      setRange(([low, high]) => index === 0 ? [bounds.min, high] : [low, bounds.max]);
      return;
    }

    const sec = dayjs(time).unix();

    if(Number.isNaN(sec)) { return; }

    const clamped = Math.min(Math.max(sec, bounds.min), bounds.max);
    setRange(([low, high]) => index === 0 ? [Math.min(clamped, high), high] : [low, Math.max(clamped, low)]);
  };

  useEffect(() => {
    const SetDefaultLibrary = () => {
      // Default to title mezzanine library
      const libraryMatchMezz = Object.keys(tenantStore.libraries || {}).find(libId => tenantStore.libraries[libId].name.toLowerCase().includes("title mezzanines"));

      if(libraryMatchMezz) {
        form.setFieldValue("libraryId", libraryMatchMezz);
      }
    };

    const SetDefaultGroup = () => {
      // Default to content admin group
      const groupMatchAdmin = Object.keys(tenantStore.accessGroups || {})
        .find(groupName => groupName.toLowerCase().includes("content admin"));

      if(groupMatchAdmin) {
        form.setFieldValue("accessGroup", groupMatchAdmin);
      }
    };

    const LoadLibraries = async() => {
      try {
        setLoadingLibraries(true);

        await tenantStore.LoadLibraries();

        SetDefaultLibrary();
      } finally {
        setLoadingLibraries(false);
      }
    };

    const LoadGroups = async() => {
      try {
        setLoadingGroups(true);

        await tenantStore.LoadAccessGroups();
        SetDefaultGroup();
      } finally {
        setLoadingGroups(false);
      }
    };

    if(!tenantStore.libraries) {
      LoadLibraries();
    } else {
      SetDefaultLibrary();
    }

    if(!tenantStore.accessGroups) {
      LoadGroups();
    } else {
      SetDefaultGroup();
    }
  }, []);

  const Tick = (forceTrack=false) => {
    const now = Math.floor(Date.now() / 1000);
    setLatest(now);

    // Changing the scale under the thumb makes the dragged time jump
    if(draggingRef.current && forceTrack !== true) { return; }

    const follow = forceTrack === true || tracking;

    if(follow) { form.setFieldValue("endTime", FormatTime(now)); }

    // Slider scale and marks refresh slower than the End Time field and duration
    if(forceTrack === true || now - lastSliderUpdateRef.current >= SLIDER_REFRESH_SEC) {
      lastSliderUpdateRef.current = now;
      setBounds(prev => ({...prev, max: now}));

      if(follow) { setRange(([low]) => [low, now]); }
    }
  };

  useEffect(() => {
    if(!show || !supportsTimeRange || !streamIsLive) { return; }

    const interval = setInterval(() => Tick(), TICK_MS);

    return () => clearInterval(interval);
  }, [show, supportsTimeRange, streamIsLive, tracking]);

  useEffect(() => {
    if(show === true) {
      setError(undefined);
      setTracking(true);

      const max = endSec ?? Math.floor(Date.now() / 1000);
      lastSliderUpdateRef.current = max;
      setLatest(max);
      const floor = ttlSec ? Math.min(Math.max(startSec, max - ttlSec), max - 1) : startSec;
      setWindowStart(floor);
      setBounds({min: floor, max});
      setRange([floor, max]);

      // setFieldValue (not setValues) so uncontrolled inputs re-render with the new value
      form.setFieldValue("title", defaultTitle);
      form.setFieldValue("startTime", FormatTime(floor));
      form.setFieldValue("endTime", streamIsLive ? FormatTime(max) : "");
    }
  }, [show]);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      title: defaultTitle,
      libraryId: "",
      accessGroup: "",
      startTime: "",
      endTime: ""
    },
    validate: {
      libraryId: isNotEmpty("Name is required"),
      title: isNotEmpty("Title is required"),
      endTime: (value, values) => {
        if(!value && !values.startTime) { return null; }

        // Blank sides fall back to the selection's bounds; compare full timestamps so multi-day ranges work
        const start = values.startTime ? dayjs(values.startTime).unix() : windowStart;
        const end = value ? dayjs(value).unix() : (endSec ?? Math.floor(Date.now() / 1000));

        return end <= start ? "End Time must be after Start Time" : null;
      }
    }
  });

  const HandleSubmit = async() => {
    try {
      setError(undefined);
      SetBusy(true);

      const {title, libraryId, accessGroup, startTime, endTime} = form.getValues();

      const response = await recordingCopyStore.CopyToVod({
        objectId,
        targetLibraryId: libraryId,
        accessGroup: accessGroup,
        selectedPeriods,
        title,
        // Blank inputs mean the full range; the store derives them from the periods
        startTime: !supportsTimeRange ? undefined :
          startTime ? ToIso(startTime) :
            (windowStart > startSec ? dayjs.unix(windowStart).toISOString() : undefined),
        endTime: supportsTimeRange && endTime && !isLive ? ToIso(endTime) : undefined
      });

      await onCopied(title);

      notifications.show({
        title: <NotificationMessage>Copied to VoD: {title || objectId}</NotificationMessage>,
        message: <NotificationMessage>Successfully created {response?.target_object_id}</NotificationMessage>,
        autoClose: false
      });

      form.reset();
      close();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(error);
      setError(error?.message || error.kind || error.toString());

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to copy to VoD"
      });
    } finally {
      SetBusy(false);
    }
  };

  return (
    <Modal
      opened={show}
      onClose={close}
      title="Copy to VoD"
      padding="32px"
      radius="6px"
      size="xl"
      centered
      styles={{
        content: {display: "flex", flexDirection: "column", overflow: "hidden"},
        body: {display: "flex", flexDirection: "column", flex: 1, minHeight: 0}
      }}
    >
      <form
        onSubmit={form.onSubmit(HandleSubmit)}
        style={{display: "flex", flexDirection: "column", flex: 1, minHeight: 0}}
      >
        <Box style={{flex: 1, minHeight: 0, overflowY: "auto"}}>
        <Flex w="100%" direction="column" gap={20}>
          {
            (!tenantStore.libraries || loadingLibraries) ?
              <Box><Loader /></Box> :
              (
                <Select
                  label="Library"
                  required={true}
                  data={
                    Object.keys(tenantStore.libraries || {}).map(libraryId => (
                      {
                        label: tenantStore.libraries[libraryId].name || "",
                        value: libraryId
                      }
                    ))
                  }
                  placeholder="Select Library"
                  key={form.key("libraryId")}
                  {...form.getInputProps("libraryId")}
                />
              )
          }

          {
            (!tenantStore.accessGroups || loadingGroups) ?
              <Box mt={12}><Loader /></Box> :
              (
                <Select
                  label="Access Group"
                  description="This is the Access Group that will manage your live stream object."
                  data={
                    Object.keys(tenantStore.accessGroups || {}).map(accessGroupName => (
                      {
                        label: accessGroupName,
                        value: accessGroupName
                      }
                    ))
                  }
                  placeholder="Select Access Group"
                  key={form.key("accessGroup")}
                  {...form.getInputProps("accessGroup")}
                />
              )
          }

          <TextInput
            label="Enter a title for the VoD"
            name="title"
            required={true}
            key={form.key("title")}
            {...form.getInputProps("title")}
          />

          <Divider c="elv-gray.2" />

          {
            !supportsTimeRange ? null :
              <>
                  <Flex direction="row" gap={16} align="flex-start">
                    <Box style={{flex: 1, minWidth: 0}}>
                      <Input.Label>Time Range <Text c="elv-gray.6" fw={600} fz=".875rem" span>(Optional)</Text></Input.Label>
                      <Input.Description>Select a start and/or end time to copy a specific portion of the stream.</Input.Description>
                    </Box>
                    <Group gap={16} wrap="nowrap" align="flex-start" style={{flexShrink: 0}}>
                      <Stack gap={2}>
                        <Text fz=".675rem" c="elv-gray.7" fw={400} pt={4}>Available Duration</Text>
                        <Text fz=".75rem" c="elv-gray.9" fw={600}>
                          {hasRange ? FormatElapsed({milliseconds: (Math.max(latest, bounds.max) - bounds.min) * 1000, format: "hh:mm:ss"}) : ""}
                        </Text>
                      </Stack>
                      <Stack gap={2}>
                        <Text fz=".675rem" c="elv-gray.7" fw={400} pt={4}>Selected Duration</Text>
                        <Text fz=".75rem" c="elv-gray.9" fw={600}>
                          {hasRange ? FormatElapsed({milliseconds: Math.max((tracking ? latest : range[1]) - range[0], 0) * 1000, format: "hh:mm:ss"}) : ""}
                        </Text>
                      </Stack>
                    </Group>
                  </Flex>
                  {
                    !hasRange ? null :
                      <Box
                        style={{overflowX: "clip"}}
                        onPointerOver={event => setHoverThumb(ThumbIndex(event))}
                        onPointerOut={() => setHoverThumb(null)}
                        onPointerDownCapture={event => {
                          draggingRef.current = true;
                          setDragThumb(ThumbIndex(event));
                        }}
                      >
                        <RangeSlider
                          mt={20}
                          size="lg"
                          color="elv-blue.3"
                          styles={{
                            label: {background: "transparent", padding: 0},
                            track: {"--slider-track-bg": "var(--mantine-color-elv-gray-3)"},
                            mark: {
                              width: 6,
                              height: 6,
                              borderWidth: 1,
                              // Keep the smaller mark centered on its value
                              marginInlineStart: "calc(var(--slider-size) / 2 - 3px)",
                              marginTop: "calc(var(--slider-size) / 2 - 3px)"
                            }
                          }}
                          min={bounds.min}
                          max={bounds.max}
                          step={1}
                          minRange={1}
                          marks={marks}
                          value={range}
                          onChange={HandleSliderChange}
                          label={SliderLabel}
                          labelAlwaysOn
                          mb={8}
                        />
                        <Flex justify="space-between">
                          <Text fz=".5625rem" c="elv-gray.6" fw={500}>00:00:00</Text>
                          <Text fz=".5625rem" c="elv-gray.6" fw={500}>{ FormatElapsed({milliseconds: (Math.max(latest, bounds.max) - bounds.min) * 1000, format: "hh:mm:ss"}) }</Text>
                        </Flex>
                      </Box>
                  }

                  <SimpleGrid cols={2} spacing={12}>
                    <DateTimePicker
                      label="Start Time"
                      clearable
                      {...pickerLimits}
                      withSeconds
                      valueFormat={DISPLAY_FORMAT}
                      name="startTime"
                      key={form.key("startTime")}
                      {...form.getInputProps("startTime")}
                      onChange={value => {
                        form.getInputProps("startTime").onChange(value);
                        MoveSliderToTime({index: 0, time: value});
                      }}
                    />
                    <DateTimePicker
                      label={
                        <Group gap={8}>
                          End Time
                          {streamIsLive && <Badge
                            component="button"
                            type="button"
                            size="md"
                            onClick={event => {
                              event.preventDefault();

                              if(tracking) {
                                setTracking(false);
                              } else {
                                setTracking(true);
                                Tick(true);
                              }
                            }}
                            leftSection={<Box w={6} h={6} bg={badgeColors.color} style={{borderRadius: "50%"}} />}
                            styles={{
                              root: {
                                borderRadius: "23px",
                                cursor: "pointer",
                                opacity: tracking ? 1 : 0.6,
                                background: badgeColors.background,
                                color: badgeColors.color
                              }
                            }}
                          >
                            LIVE
                          </Badge>}
                        </Group>
                      }
                      clearable
                      {...pickerLimits}
                      withSeconds
                      valueFormat={DISPLAY_FORMAT}
                      name="endTime"
                      key={form.key("endTime")}
                      {...form.getInputProps("endTime")}
                      onChange={value => {
                        form.getInputProps("endTime").onChange(value);
                        setTracking(false);
                        MoveSliderToTime({index: 1, time: value});
                      }}
                    />
                  </SimpleGrid>

                  <Text fz=".875rem" c="elv-gray.6" fw={400}>*Leave both fields empty to copy the full available content{ttlSec ? " within the retention window" : ""}.</Text>
              </>
          }

          <Divider c="elv-gray.2" />

          <Text fw={500} fz="0.875rem" c="elv-gray.9">This process takes around 30 seconds per hour of content.</Text>
        </Flex>
        </Box>
        {
          !error ? null :
            <Text c="elv-red.7" mt={8}>
              Error: { error }
            </Text>
        }
        <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
          <Button variant="outline" onClick={close} mr="0.5rem">
            Cancel
          </Button>
          <Button
            disabled={submitting}
            loading={submitting}
            type="submit"
          >
            Copy
          </Button>
        </Flex>
      </form>
    </Modal>
  );
});

export default CopyToVodModal;
