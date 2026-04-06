import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Flex,
  Group,
  Input,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from "@mantine/core";
import {outputStore} from "@/stores/index.js";
import {DataTable} from "mantine-datatable";
import {SanitizeUrl} from "@/utils/helpers.js";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";
import {IconSearch, IconTrash} from "@tabler/icons-react";
import {useEffect, useState} from "react";
import {useDebouncedCallback} from "@mantine/hooks";
import StatusText from "@/components/status-text/StatusText.jsx";
import {isNotEmpty, useForm} from "@mantine/form";
import styles from "./Outputs.module.css";
import sharedStyles from "@/assets/shared.module.css";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";

const CreateModal = ({show, onCloseModal}) => {
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
      title="Create New Output"
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: styles.modalHeader}}
      centered
    >
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <Stack gap={20}>
          <Text fz="0.875rem" c="elv-gray.8">Create a new output to configure how the stream is delivered.</Text>
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
};

const Actions = ({onRefreshClick}) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Flex w="100%" align="center" mb={16}>
        <TextInput
          flex={2}
          maw={400}
          classNames={{input: styles.searchBar}}
          placeholder="Search by object name or ID"
          leftSection={<IconSearch width={15} height={15} />}
          mb={14}
          value={outputStore.tableFilter}
          onChange={event => outputStore.SetTableFilter({filter: event.target.value})}
        />
        <Group ml="auto" gap={8}>
          <Button
            onClick={onRefreshClick}
            variant="outline"
          >
            Refresh
          </Button>
          <Button
            variant="filled"
            onClick={() => setShowModal(true)}
          >
            Create
          </Button>
        </Group>
      </Flex>
      <CreateModal
        show={showModal}
        onCloseModal={() => setShowModal(false)}
      />
    </>
  );
};

const Outputs = observer(() => {
  const [loading, setLoading] = useState(false);
  const [sortStatus, setSortStatus] = useState({columnAccessor: "name", direction: "asc"});
  const [selectedRecords, setSelectedRecords] = useState([]);

  const LoadData = async() => {
    try {
      setLoading(true);
      await outputStore.LoadOutputs();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    LoadData();
  }, []);

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await LoadData();
  }, 500);

  const records = outputStore.outputList;

  return (
    <PageContainer
      title="Outputs"
    >
      <Actions onRefreshClick={DebouncedRefresh} />
      <Box className={sharedStyles.tableWrapper}>
        <DataTable
          idAccessor="slug"
          // TODO: idAccessor should be external_id
          // idAccessor="external_id"
          minHeight={(!records || records.length === 0) ? 130 : 75}
          sortStatus={sortStatus}
          fetching={loading}
          onSortStatusChange={setSortStatus}
          records={records || []}
          selectedRecords={selectedRecords}
          onSelectedRecordsChange={setSelectedRecords}
          columns={[
            {
              accessor: "name",
              title: "Name",
              sortable: true,
              width: "25%",
              render: record => (
                <Stack gap={0} maw="100%">
                  <Title order={3} lineClamp={1} title={record.name} style={{wordBreak: "break-all"}}>
                    {record.name}
                  </Title>
                  <Title order={6} c="elv-gray.6" lineClamp={1}>
                    {record.external_id}
                  </Title>
                </Stack>
              )
            },
            {
              accessor: "srt_url",
              title: "URL",
              width: "30%",
              render: record => (
                <BasicTableRowText lineClamp={1}>{ record.srt_url }</BasicTableRowText>
              )
            },
            {
              accessor: "stream",
              title: "Stream",
              width: "20%",
              render: record => {
                if(!record.input?.stream) {
                  return (
                    <UnstyledButton>
                      <Text fw={600} td="underline" c="elv-blue.5" fz={14}>Map to a Stream</Text>
                      </UnstyledButton>
                  );
                }
                return (
                  <Stack gap={3}>
                    <BasicTableRowText title={SanitizeUrl({url: record.originUrl})} lineClamp={1}>
                      {record.input?.name}
                    </BasicTableRowText>
                    <StatusText status={record.input.status} size="xs" />
                  </Stack>
                );
              }
            },
            {
              accessor: "clients",
              title: "Clients",
              width: 150,
              render: record => (
                <BasicTableRowText textWrap="nowrap">
                  {record.state?.connected_clients ?? 0} Connections
                </BasicTableRowText>
              )
            },
            {
              accessor: "enabled",
              title: "Status",
              width: 160,
              sortable: true,
              render: record => (
                <Switch
                  label={record.enabled ? "Enabled" : "Disabled"}
                  checked={record.enabled}
                />
              )
            },
            {
              accessor: "actions",
              title: "",
              width: 50,
              render: () => (
                <ActionIcon
                  variant="subtle"
                  title="Delete Output"
                  color="gray.6"
                  onClick={() => {}}
                  disabled={false}
                >
                  <IconTrash />
                </ActionIcon>
              )
            }
          ]}
        />
      </Box>
    </PageContainer>
  );
});

export default Outputs;
