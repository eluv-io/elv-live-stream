import {useEffect, useState} from "react";
import {useForm} from "@mantine/form";
import {observer} from "mobx-react-lite";
import {dataStore} from "@/stores/index.ts";
import {ALTERNATE_TRANSCODE_PROTOCOLS, FABRIC_NODE_REGIONS, RESOLUTION_OPTIONS} from "@/utils/constants.ts";
import {Button, Flex, Modal, NumberInput, Select, Stack, Tabs, Text, TextInput, Title} from "@mantine/core";
import JsonEditorCard from "@/components/json-editor-card/JsonEditorCard.jsx";
import modalStyles from "@/pages/outputs/modals/modals.module.css";

const DEFAULT_VALUES = {
  name: "",
  nodeType: "dedicated",
  node: "",
  geo: "",
  protocol: ALTERNATE_TRANSCODE_PROTOCOLS[0]?.value ?? "",
  resolution: "",
  videoBitrate: "",
  streamBitrate: "",
  advancedEncodingParams: null
};

// Reused for both add and edit - the DedicatedNodes.jsx + NodeModal.jsx pattern.
const AlternateTranscodeModal = observer(({opened, transcode, onClose, onSave}) => {
  const [saving, setSaving] = useState(false);
  const form = useForm({
    mode: "controlled",
    initialValues: DEFAULT_VALUES,
    validate: {
      name: (value) => value ? null : "Name is required",
      node: (value, values) => values.nodeType === "dedicated" ? (value ? null : "Node is required") : null,
      geo: (value, values) => values.nodeType === "public" ? (value ? null : "Geo is required") : null,
      protocol: (value) => value ? null : "Protocol is required",
      streamBitrate: (value, values) =>
        (value && values.videoBitrate && Number(value) <= Number(values.videoBitrate)) ?
          "Stream bitrate must be larger than video bitrate" :
          null
    }
  });

  useEffect(() => {
    if(!opened) { return; }

    const knownFields = transcode ?
      Object.fromEntries(Object.entries(transcode).filter(([, value]) => value !== undefined)) :
      null;

    form.setValues(knownFields ? {...DEFAULT_VALUES, ...knownFields} : DEFAULT_VALUES);
    form.resetDirty();

    if(!dataStore.loadedDedicatedNodes) { dataStore.LoadDedicatedNodes(); }

  }, [opened, transcode]);

  const {nodeType} = form.getValues();

  const HandleSubmit = async(values) => {
    setSaving(true);
    try {
      await onSave({
        id: transcode?.id,
        ...values
      });
      onClose();
    } catch(error) {
      // Error already surfaced via notification; keep the modal open to retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap={0} mb={20}>
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600}>{transcode ? "Edit" : "Create"} Alternate Transcode</Title>
          <Text fz="0.875rem" c="elv-gray.8">Configure alternate transcode setting and save to create a new configuration.</Text>
        </Stack>
      }
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: modalStyles.modalHeader}}
      closeOnClickOutside={false}
      centered
    >
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <Stack gap={20}>
          <TextInput
            label="Name"
            placeholder="Enter a name"
            withAsterisk
            key={form.key("name")}
            {...form.getInputProps("name")}
          />

          <Stack gap={8}>
            <Text fz="1.125rem" fw={600} c="elv-blue.3">Streaming Protocol</Text>
            <Text fz="0.875rem" c="elv-gray.8">Select a protocol to see available pre-allocated URLs.</Text>
            <Tabs
              value={nodeType}
              onChange={(value) => form.setFieldValue("nodeType", value)}
            >
              <Tabs.List w="fit-content" mb={20}>
                {
                  dataStore.dedicatedNodesList.length > 0 &&
                  <Tabs.Tab value="dedicated">Dedicated</Tabs.Tab>
                }
                <Tabs.Tab value="public">Public</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="dedicated">
                <Stack gap={20}>
                  <Select
                    label="Node"
                    placeholder={dataStore.loadedDedicatedNodes ? "Select a node" : "Loading Nodes..."}
                    data={dataStore.dedicatedNodesList}
                    allowDeselect={false}
                    withAsterisk
                    key={form.key("node")}
                    {...form.getInputProps("node")}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="public">
                <Stack gap={20}>
                  <Select
                    label="Fabric Geo"
                    withAsterisk
                    data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
                    placeholder="Select a geo"
                    clearable
                    key={form.key("geo")}
                    {...form.getInputProps("geo")}
                  />
                </Stack>
              </Tabs.Panel>
            </Tabs>
            <Select
              label="Protocol"
              withAsterisk
              data={ALTERNATE_TRANSCODE_PROTOCOLS}
              allowDeselect={false}
              key={form.key("protocol")}
              {...form.getInputProps("protocol")}
            />
          </Stack>

          <Stack gap={12}>
            <Text fz="1.125rem" fw={600} c="elv-blue.3">Encoding Parameters</Text>
            <Text fz="0.875rem" c="elv-gray.8">Configure encoding setting for the alternate transcoding.</Text>
            <Select
              label="Resolution"
              data={RESOLUTION_OPTIONS}
              placeholder="Select a resolution"
              clearable
              key={form.key("resolution")}
              {...form.getInputProps("resolution")}
            />
            <NumberInput
              label="Video bitrate"
              placeholder="Enter video bitrate (e.g., 9500000)"
              min={0}
              hideControls
              key={form.key("videoBitrate")}
              {...form.getInputProps("videoBitrate")}
            />
            <NumberInput
              label="Stream bitrate"
              placeholder="Enter stream bitrate (e.g., 192000)"
              min={0}
              hideControls
              key={form.key("streamBitrate")}
              {...form.getInputProps("streamBitrate")}
            />
            <Text fz="0.875rem" fw={500} c="elv-black.3">Advanced</Text>
            <JsonEditorCard
              value={form.getValues().advancedEncodingParams}
              onChange={(value) => form.setFieldValue("advancedEncodingParams", value)}
              shaded={false}
            />
          </Stack>
        </Stack>

        <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
          <Button type="submit" loading={saving} disabled={saving}>{transcode ? "Save" : "Create"}</Button>
        </Flex>
      </form>
    </Modal>
  );
});

export default AlternateTranscodeModal;
