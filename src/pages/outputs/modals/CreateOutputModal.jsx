import {useForm} from "@mantine/form";
import {settingsStore, outputStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";
import {toJS} from "mobx";
import {FABRIC_NODE_REGIONS, RTMP_STREAM_KEY_DESCRIPTION, RTMP_URL_DESCRIPTION} from "@/utils/constants.ts";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import {
  Button,
  Checkbox,
  Input,
  Loader,
  Flex,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  PasswordInput, Collapse, Tabs
} from "@mantine/core";
import styles from "./modals.module.css";
import {useEffect, useRef, useState} from "react";
import SelectFailoverStreamModal from "@/pages/outputs/modals/SelectFailoverStreamModal.jsx";

const CreateOutputModal = observer(({show, onCloseModal}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [streamInfo, setStreamInfo] = useState(undefined);

  const urlCache = useRef({});

  const form = useForm({
    mode: "controlled",
    initialValues: {
      name: "",
      geo: "",
      geoNode: "",
      node: "",
      encryption: false,
      stripRtp: false,
      passphrase: "",
      url: "",
      streamKey: "",
      streamObjectId: "",
      streamTitle: "",
      type: "srt_pull", // rtp | srt_pull | srt_push | udp | rtmp
      nodeType: "public" // public | dedicated
    },
    validate: {
      node: (value, values) => values.nodeType === "dedicated" ? (value ? null : "Node is required") : null,
      passphrase: (value, values) => {
        if(!values.encryption) { return null; }
        if(value && (value.length < 10 || value.length > 79)) {
           return "Passphrase must be between 10 and 79 characters long";
        }
        return null;
      },
      url: (value, values) => {
        if(values.type === "srt_pull") { return null; }
        if(!value) { return "URL is required"; }
        return values.type === "rtmp" && !/^rtmps?:\/\//i.test(value) ? "URL must use the rtmp:// or rtmps:// protocol" : null;
      },
      streamKey: (value, values) => values.type === "rtmp" && !value ? "Stream key is required" : null,
      streamObjectId: (value, values) => values.type === "rtmp" && !value ? "Stream is required" : null
    }
  });

  useEffect(() => {
    if(!show) { return; }
    if(!settingsStore.loadedDedicatedNodes) { settingsStore.LoadDedicatedNodes(); }
  }, [show]);

  const {type, nodeType} = form.getValues();
  // Protocol-specific example shown in the Target URL field
  const urlPlaceholder = type === "rtmp" ? "rtmps://example.com/live2" : `${type === "srt_push" ? "srt" : type}://example.com:1234`;

  const HandleSubmit = async() => {
    try {
      setIsSaving(true);
      const {name, geo, geoNode, node, nodeType, encryption, stripRtp, passphrase, type, url, streamKey, streamObjectId} = form.getValues();
      const isDedicated = nodeType === "dedicated";

      await outputStore.CreateOutput({
        name,
        type,
        nodeType,
        passphrase,
        encryption,
        stripRtp,
        // URL field is only shown for non-srt_pull types
        url: type === "srt_pull" ? undefined : url,
        streamKey: type === "rtmp" ? streamKey : undefined,
        streamObjectId: streamObjectId || undefined,
        streamInfo,
        // public outputs target a fabric region, optionally pinned to a node within
        // it; dedicated outputs target a curated node
        region: isDedicated ? undefined : (geo || undefined),
        node: isDedicated ? node : undefined,
        nodeHost: isDedicated ? undefined : (geoNode || undefined)
      });

      const locationLabel = isDedicated ?
        (settingsStore.dedicatedNodesList.find(data => data.value === node)?.label || "") :
        (geoNode || (FABRIC_NODE_REGIONS.find(data => data.value === geo)?.label || "Automatic"));

      notifications.show({
        title: "New output created",
        message: <NotificationMessage>Successfully created output for {locationLabel}</NotificationMessage>
      });

      onCloseModal();
      form.reset();
      urlCache.current = {};
      setStreamInfo(undefined);
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to create output", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: typeof error === "string" ? error : "Unable to create output"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      opened={show}
      onClose={() => {
        onCloseModal();
        form.reset();
        urlCache.current = {};
        setStreamInfo(undefined);
      }}
      title={
        <Stack gap={0} mb={20}>
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600}>Create New Output</Title>
          <Text fz="0.875rem" c="elv-gray.8">Create a new output to configure how the stream is delivered.</Text>
        </Stack>
      }
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: styles.modalHeader}}
      closeOnClickOutside={false}
      centered
    >
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <Stack gap={20}>
          <TextInput
            label="Name"
            placeholder="Sample Name"
            key={form.key("name")}
            {...form.getInputProps("name")}
          />
          <Select
            label="Type"
            description="Defines the output type"
            placeholder="Output Type"
            allowDeselect={false}
            data={[
              {label: "SRT PULL", value: "srt_pull"},
              {label: "SRT PUSH", value: "srt_push"},
              {label: "RTP", value: "rtp"},
              {label: "UDP", value: "udp"},
              {label: "RTMP / RTMPS", value: "rtmp"}
            ]}
            key={form.key("type")}
            {...form.getInputProps("type")}
            onChange={(value) => {
              urlCache.current[form.getValues().type] = form.getValues().url;
              form.setFieldValue("type", value);
              form.setFieldValue("url", urlCache.current[value] ?? "");
            }}
          />
          <Input.Wrapper
            label="Stream"
            description={type === "rtmp" ?
              "The stream to publish. Its video and audio are selected automatically." :
              "The stream this output delivers."}
            error={form.errors.streamObjectId}
            withAsterisk={type === "rtmp"}
          >
            <Flex align="center" gap={12} mt={4}>
              <Text fz="0.875rem" flex={1} truncate>{form.getValues().streamTitle || "No stream selected"}</Text>
              <Button variant="outline" onClick={() => setShowStreamModal(true)}>
                {form.getValues().streamObjectId ? "Change" : "Select"}
              </Button>
            </Flex>
          </Input.Wrapper>
          <Tabs
            value={nodeType}
            onChange={(value) => {
              form.setFieldValue("nodeType", value);
              form.setFieldValue("geoNode", "");
            }}
          >
            <Tabs.List w="fit-content" mb={20}>
              {
                settingsStore.dedicatedNodesList.length > 0 &&
                <Tabs.Tab value="dedicated">Dedicated</Tabs.Tab>
              }
              <Tabs.Tab value="public">Public</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="dedicated">
              <Stack gap={20}>
                <Select
                  label="Node"
                  placeholder={settingsStore.loadedDedicatedNodes ? "Select Node" : "Loading Nodes..."}
                  data={settingsStore.dedicatedNodesList}
                  allowDeselect={false}
                  withAsterisk
                  key={form.key("node")}
                  {...form.getInputProps("node")}
                />
                {
                  form.getValues().type !== "srt_pull" &&
                  <TextInput
                    label="Target URL"
                    description={type === "rtmp" ? RTMP_URL_DESCRIPTION : undefined}
                    placeholder={urlPlaceholder}
                    key={form.key("url")}
                    withAsterisk
                    {...form.getInputProps("url")
                  }
                />
              }
              {form.getValues().type === "rtmp" &&
                <PasswordInput
                  label="Stream Key"
                  description={RTMP_STREAM_KEY_DESCRIPTION}
                  key={form.key("streamKey")}
                  withAsterisk
                  {...form.getInputProps("streamKey")}
                />
              }
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="public">
              <Stack gap={20}>
                <Select
                  label="Fabric Geo"
                  description="Automatic lets the fabric choose a region"
                  data={[{value: "", label: "Automatic"}, ...FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))]}
                  allowDeselect={false}
                  key={form.key("geo")}
                  {...form.getInputProps("geo")}
                  onChange={(value) => {
                    form.setFieldValue("geo", value || "");
                    form.setFieldValue("geoNode", "");
                    if(value) { outputStore.LoadNodesByRegion({region: value}); }
                  }}
                />
                <Select
                  label="Node"
                  description="Automatic lets the fabric choose a node"
                  // "" is the Automatic option; specific nodes need a chosen geo
                  data={[{value: "", label: "Automatic"}, ...(outputStore.nodesByRegion[form.getValues().geo] || [])]}
                  disabled={!form.getValues().geo}
                  allowDeselect={false}
                  key={form.key("geoNode")}
                  {...form.getInputProps("geoNode")}
                  onChange={(value) => form.setFieldValue("geoNode", value || "")}
                  rightSection={
                    form.getValues().geo && outputStore.loadingNodesRegion === form.getValues().geo ?
                      <Loader size={14} /> : undefined
                  }
                />
                {form.getValues().type !== "srt_pull" &&
                  <TextInput
                    label="Target URL"
                    description={type === "rtmp" ? RTMP_URL_DESCRIPTION : undefined}
                    placeholder={urlPlaceholder}
                    key={form.key("url")}
                    withAsterisk
                    {...form.getInputProps("url")}
                  />
                }
                {form.getValues().type === "rtmp" &&
                  <PasswordInput
                    label="Stream Key"
                    description={RTMP_STREAM_KEY_DESCRIPTION}
                    key={form.key("streamKey")}
                    withAsterisk
                    {...form.getInputProps("streamKey")}
                  />
                }
              </Stack>
            </Tabs.Panel>
          </Tabs>

          <Collapse expanded={form.getValues().type?.includes("srt")}>
            <Stack gap={20}>
              <Stack gap={12}>
                <Input.Label>Encryption</Input.Label>
                <Checkbox
                  label="Enable Encryption"
                  description="If encryption is enabled, a passphrase is required to decrypt the stream. If not provided, one will be auto-generated."
                  key={form.key("encryption")}
                  {...form.getInputProps("encryption")}
                />
                <Collapse expanded={form.getValues().encryption}>
                  <PasswordInput
                    label="Passphrase"
                    placeholder="e.g. my-secure-passphrase"
                    key={form.key("passphrase")}
                    {...form.getInputProps("passphrase")}
                  />
                </Collapse>
              </Stack>
              <Stack gap={12}>
                <Input.Label>Strip RTP</Input.Label>
                <Checkbox
                  label="Enable Strip RTP"
                  description="Remove RTP encapsulation from the incoming stream"
                  key={form.key("stripRtp")}
                  {...form.getInputProps("stripRtp")}
                />
              </Stack>
            </Stack>
          </Collapse>
        </Stack>
        <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
          <Button type="submit" loading={isSaving} disabled={isSaving}>Create</Button>
        </Flex>
      </form>
      {showStreamModal &&
        <SelectFailoverStreamModal
          show={showStreamModal}
          onCloseModal={() => setShowStreamModal(false)}
          onSelect={({objectId, title, record}) => {
            form.setFieldValue("streamObjectId", objectId);
            form.setFieldValue("streamTitle", title || objectId);
            setStreamInfo({
              name: title,
              status: record.status,
              url: record.originUrl,
              source: toJS(record.source),
              packaging: toJS(record.packaging)
            });
          }}
          title="Select Stream"
          description="Select the stream to map to this output (TS streams only. Unconfigured streams can't be selected)."
          requireConfigured
        />
      }
    </Modal>
  );
});

export default CreateOutputModal;
