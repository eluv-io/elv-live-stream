import {useForm} from "@mantine/form";
import {dataStore, outputStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.ts";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import {
  Button,
  Checkbox,
  Input,
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
import {useEffect, useState} from "react";

const CreateOutputModal = observer(({show, onCloseModal}) => {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm({
    mode: "controlled",
    initialValues: {
      name: "",
      geo: "",
      node: "",
      encryption: false,
      stripRtp: false,
      passphrase: "",
      url: "",
      type: "srt_pull", // rtp | srt_pull | srt_push | udp
      nodeType: "public" // public | dedicated
    },
    validate: {
      geo: (value, values) =>
        values.nodeType === "public" ? (value ? null : "Geo is required") : null,
      passphrase: (value, values) => {
        if(!values.encryption) { return null; }
        if(value && (value.length < 10 || value.length > 79)) {
           return "Passphrase must be between 10 and 79 characters long";
        }
        return null;
      }
    }
  });

  useEffect(() => {
    if(!show) { return; }
    if(!dataStore.loadedDedicatedNodes) { dataStore.LoadDedicatedNodes(); }
  }, [show]);

  const {type, nodeType} = form.getValues();
  // Protocol-specific example shown in the Target URL field
  const urlPlaceholder = `${type === "srt_push" ? "srt" : type}://example.com:1234`;

  const HandleSubmit = async() => {
    try {
      setIsSaving(true);
      const {name, geo, node, nodeType, encryption, stripRtp, passphrase, type, url} = form.getValues();
      const isDedicated = nodeType === "dedicated";

      await outputStore.CreateOutput({
        name,
        type,
        passphrase,
        encryption,
        stripRtp,
        // URL field is only shown for non-srt_pull types
        url: type === "srt_pull" ? undefined : url,
        // public outputs target a fabric region; dedicated outputs target a node
        region: isDedicated ? undefined : geo,
        node: isDedicated ? node : undefined
      });

      const locationLabel = isDedicated ?
        (dataStore.dedicatedNodesList.find(data => data.value === node)?.label || "") :
        (FABRIC_NODE_REGIONS.find(data => data.value === geo)?.label || "");

      notifications.show({
        title: "New output created",
        message: <NotificationMessage>Successfully created output for {locationLabel}</NotificationMessage>
      });

      onCloseModal();
      form.reset();
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
              {label: "UDP", value: "udp"}
            ]}
            key={form.key("type")}
            {...form.getInputProps("type")}
          />
          <Tabs
            value={nodeType}
            onChange={(value) => {
              form.setFieldValue("nodeType", value);
              form.setFieldValue("url", "");
            }}
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
                  placeholder={dataStore.loadedDedicatedNodes ? "Select Node" : "Loading Nodes..."}
                  data={dataStore.dedicatedNodesList}
                  allowDeselect={false}
                  key={form.key("node")}
                  {...form.getInputProps("node")}
                />
                {
                  form.getValues().type !== "srt_pull" &&
                  <TextInput
                    label="Target URL"
                    placeholder={urlPlaceholder}
                    key={form.key("url")}
                    withAsterisk
                    {...form.getInputProps("url")
                  }
                />
              }
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="public">
              <Stack gap={20}>
                <Select
                  label="Fabric Geo"
                  withAsterisk
                  data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
                  placeholder="Select Geo"
                  clearable
                  key={form.key("geo")}
                  {...form.getInputProps("geo")}
                />
                {form.getValues().type !== "srt_pull" &&
                  <TextInput
                    label="Target URL"
                    placeholder={urlPlaceholder}
                    key={form.key("url")}
                    withAsterisk
                    {...form.getInputProps("url")}
                  />
                }
              </Stack>
            </Tabs.Panel>
          </Tabs>

          <Stack gap={12}>
            <Input.Label>Encryption</Input.Label>
            <Collapse expanded={form.getValues().type?.includes("srt")}>
              <Checkbox
                label="Enable Encryption"
                description="If encryption is enabled, a passphrase is required to decrypt the stream. If not provided, one will be auto-generated."
                key={form.key("encryption")}
                {...form.getInputProps("encryption")}
              />
            </Collapse>
            <Collapse expanded={form.getValues().encryption}>
              <PasswordInput
                label="Passphrase"
                placeholder="e.g. my-secure-passphrase"
                key={form.key("passphrase")}
                {...form.getInputProps("passphrase")}
              />
            </Collapse>
          </Stack>
          <Collapse expanded={form.getValues().type?.includes("srt")}>
            <Stack gap={12}>
              <Input.Label>Strip RTP</Input.Label>
              <Checkbox
                label="Enable Strip RTP"
                description="Remove RTP encapsulation from the incoming stream"
                key={form.key("stripRtp")}
                {...form.getInputProps("stripRtp")}
              />
            </Stack>
          </Collapse>
        </Stack>
        <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
          <Button type="submit" loading={isSaving} disabled={isSaving}>Create</Button>
        </Flex>
      </form>
    </Modal>
  );
});

export default CreateOutputModal;
