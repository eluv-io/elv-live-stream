import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Group,
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
import styles from "./Outputs.module.css";
import sharedStyles from "@/assets/shared.module.css";
import BatchActions from "@/pages/outputs/batch-actions/BatchActions.jsx";
import CreateOutputModal from "@/pages/outputs/batch-actions/modals/CreateOutputModal.jsx";

const Actions = ({onRefreshClick, mb}) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Flex w="100%" align="start" mb={mb}>
        <TextInput
          flex={2}
          maw={400}
          classNames={{input: styles.searchBar}}
          placeholder="Search by object name or ID"
          leftSection={<IconSearch width={15} height={15} />}
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
      <CreateOutputModal
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
      {
        selectedRecords.length ?
          <BatchActions
            selectedRecords={selectedRecords}
            SelectAll={() => setSelectedRecords(records)}
            ClearSelection={() => setSelectedRecords([])}
            mb={20}
          /> :
          <Actions onRefreshClick={DebouncedRefresh} mb={20} />
      }
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
                  <Title order={3} lineClamp={1} title={record.name} style={{wordBreak: "break-all"}} c="elv-gray.9">
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
                <Text fz={14} lineClamp={1} c="elv-gray.9" style={{wordBreak: "break-all"}}>{ record.srt_url }</Text>
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
                  classNames={{label: styles.switchLabel}}
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
