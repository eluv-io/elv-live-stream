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

const CreateOutputModal = observer(({show, onCloseModal}) => {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      region: "",
      encryption: false,
      passphrase: "",
      stripRtp: false
    },
    validate: {
      region: isNotEmpty("Region is required")
    }
  });

  const HandleSubmit = async() => {
    try {
      const {name, region, encryption, passphrase, stripRtp} = form.getValues();
      await outputStore.CreateOutput({
        name,
        geos: [region],
        passphrase,
        encryption,
        stripRtp
      });

      const regionLabel = FABRIC_NODE_REGIONS.find(data => data.value === region)?.label || "";

      notifications.show({
        title: "New output created",
        message: <NotificationMessage>Successfully created output for {regionLabel}</NotificationMessage>
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to create output", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to create output"
      });
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
            label="Region"
            withAsterisk
            data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
            placeholder="Select Region"
            clearable
            key={form.key("region")}
            {...form.getInputProps("region")}
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
          {
            form.getValues().encryption &&
            <TextInput
              name="Passphrase"
              label="Passphrase"
              key={form.key("passphrase")}
              {...form.getInputProps("passphrase")}
            />
          }
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
          <Button type="submit">Create</Button>
        </Flex>
      </form>
    </Modal>
  );
});

export default CreateOutputModal;
