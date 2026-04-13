import {isNotEmpty, useForm} from "@mantine/form";
import {outputStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
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
  TextInput, Title
} from "@mantine/core";
import styles from "./modals.module.css";
import {useState} from "react";

const CreateOutputModal = observer(({show, onCloseModal}) => {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      geo: "",
      encryption: false,
      stripRtp: false
    },
    validate: {
      geo: isNotEmpty("Geo is required")
    }
  });

  const HandleSubmit = async() => {
    try {
      setIsSaving(true);
      const {name, geo, encryption, stripRtp} = form.getValues();
      await outputStore.CreateOutput({
        name,
        geos: [geo],
        encryption,
        stripRtp
      });

      const geoLabel = FABRIC_NODE_REGIONS.find(data => data.value === geo)?.label || "";

      notifications.show({
        title: "New output created",
        message: <NotificationMessage>Successfully created output for {geoLabel}</NotificationMessage>
      });

      onCloseModal();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to create output", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to create output"
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
            label="Fabric Geo"
            withAsterisk
            data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
            placeholder="Select Geo"
            clearable
            key={form.key("geo")}
            {...form.getInputProps("geo")}
          />

          <Stack gap={12}>
            <Input.Label>Encryption</Input.Label>
            <Checkbox
              label="Enable Encryption"
              description="If enabled, encryption will be applied to the stream. A passphrase is required to complete setup."
              key={form.key("encryption")}
              {...form.getInputProps("encryption")}
            />
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
        <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
          <Button type="submit" loading={isSaving} disabled={isSaving}>Create</Button>
        </Flex>
      </form>
    </Modal>
  );
});

export default CreateOutputModal;
