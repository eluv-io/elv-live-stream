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
  TextInput, Title, PasswordInput
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
      stripRtp: false,
      passphrase: ""
    },
    validate: {
      geo: isNotEmpty("Geo is required"),
      passphrase: (value, values) => {
        if(!values.encryption) { return null; }
        if(value && (value.length < 10 || value.length > 79)) {
           return "Passphrase must be between 10 and 79 characters long";
        }
        return null;
      }
    }
  });

  const HandleSubmit = async() => {
    try {
      setIsSaving(true);
      const {name, geo, encryption, stripRtp, passphrase} = form.getValues();
      await outputStore.CreateOutput({
        name,
        geos: [geo],
        passphrase,
        encryption,
        stripRtp
      });

      const geoLabel = FABRIC_NODE_REGIONS.find(data => data.value === geo)?.label || "";

      notifications.show({
        title: "New output created",
        message: <NotificationMessage>Successfully created output for {geoLabel}</NotificationMessage>
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
              description="If encryption is enabled, a passphrase is required to decrypt the stream. If not provided, one will be auto-generated."
              key={form.key("encryption")}
              {...form.getInputProps("encryption")}
            />
            {
              form.getValues().encryption ?
              <PasswordInput
                label="Passphrase"
                placeholder="e.g. my-secure-passphrase"
                key={form.key("passphrase")}
                {...form.getInputProps("passphrase")}
              /> : null
            }
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
