import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Group,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from "@mantine/core";
import {outputStore, rootStore} from "@/stores/index.js";
import {DataTable} from "mantine-datatable";
import {SanitizeUrl} from "@/utils/helpers.js";
import {BasicTableRowText} from "@/pages/streams/details/common/DetailsCommon.jsx";
import {IconCheck, IconCopy, IconExternalLink, IconSearch, IconTrash} from "@tabler/icons-react";
import {useEffect, useState} from "react";
import {useClipboard, useDebouncedCallback} from "@mantine/hooks";
import StatusText from "@/components/status-text/StatusText.jsx";
import styles from "./Outputs.module.css";
import sharedStyles from "@/assets/shared.module.css";
import BatchActions from "@/pages/outputs/batch-actions/BatchActions.jsx";
import CreateOutputModal from "@/pages/outputs/batch-actions/modals/CreateOutputModal.jsx";
import {useNavigate} from "react-router-dom";
import MapToStreamModal from "@/pages/outputs/batch-actions/modals/MapToStreamModal.jsx";

const Actions = ({onRefreshClick, mb, onSetActiveModal}) => {
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
            variant="filled"
            onClick={() => onSetActiveModal("create")}
          >
            Create
          </Button>
          <Button
            onClick={onRefreshClick}
            variant="outline"
          >
            Refresh
          </Button>
        </Group>
      </Flex>

    </>
  );
};

const Outputs = observer(() => {
  const [loading, setLoading] = useState(false);
  const [sortStatus, setSortStatus] = useState({columnAccessor: "name", direction: "asc"});
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [activeModal, setActiveModal] = useState(null);
  const [modalRecords, setModalRecords] = useState([]);

  const navigate = useNavigate();
  const clipboard = useClipboard();

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
    <>
      <PageContainer
        title="Outputs"
      >
        <Stack gap={0}>
          <Actions
            onRefreshClick={DebouncedRefresh}
            onSetActiveModal={setActiveModal}
            mb={20}
          />
          <BatchActions
            selectedRecords={selectedRecords}
            SelectAll={() => setSelectedRecords(records)}
            ClearSelection={() => setSelectedRecords([])}
            mb={20}
            onSetActiveModal={(modal) => {
              if(modal === "map") { setModalRecords(selectedRecords.map(r => r.slug)); }
              setActiveModal(modal);
            }}
          />
        </Stack>
        <Box className={sharedStyles.tableWrapper}>
          <DataTable
            idAccessor="slug"
            minHeight={(!records || records.length === 0) ? 130 : 75}
            highlightOnHover
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
                    <UnstyledButton onClick={() => navigate(`/outputs/${record.slug}`)}>
                      <Title order={3} lineClamp={1} title={record.name} style={{wordBreak: "break-all"}} c="elv-gray.9">
                        {record.name}
                      </Title>
                    </UnstyledButton>
                    <Title order={6} c="elv-gray.6" lineClamp={1}>
                      {record.slug}
                    </Title>
                  </Stack>
                )
              },
              {
                accessor: "stream",
                title: "Stream",
                width: "20%",
                render: record => {
                  if(!record.input?.stream) {
                    return (
                      <UnstyledButton onClick={() => {
                        setModalRecords([record.slug]);
                        setActiveModal("map");
                      }}>
                        <Text fw={600} td="underline" c="elv-blue.5" fz={14}>Map to a Stream</Text>
                        </UnstyledButton>
                    );
                  }
                  return (
                    <Stack gap={0}>
                      <Group gap={8}>
                        <BasicTableRowText title={SanitizeUrl({url: record.originUrl})} lineClamp={1}>
                          { record.input?.name }
                        </BasicTableRowText>
                        <ActionIcon
                          variant="transparent"
                          c="elv-gray.6"
                          size={18}
                          onClick={() => rootStore.OpenInFabricBrowser({
                            objectId: record.input.stream
                          })}
                        >
                          <IconExternalLink />
                        </ActionIcon>
                      </Group>
                      <Group wrap="nowrap" gap={6}>
                        <StatusText status={record.input.status} size="xs" fw={400} c="elv-gray.6" fz="0.75rem" />
                        <Box h={10}>
                          <Divider orientation="vertical" c="elv-gray.6" size="sm" h="100%" />
                        </Box>
                        <Text fz="0.75rem" fw={400} c="elv-gray.6">{ record.input?.stream }</Text>
                      </Group>
                    </Stack>
                  );
                }
              },
              {
                accessor: "srt_url",
                title: "URL",
                width: "30%",
                render: record => (
                  <Group gap={0} wrap="nowrap">
                    <Text fz={14} lineClamp={1} c="elv-gray.9" fw={500} style={{wordBreak: "break-all"}}>{ record.srt_url }</Text>
                    <ActionIcon
                      variant="transparent"
                      c="elv-gray.6"
                      size={18}
                      onClick={() => clipboard.copy(record.srt_url)}
                    >
                      {
                        clipboard.copied ?
                          <IconCheck /> :
                          <IconCopy />
                      }
                    </ActionIcon>
                  </Group>
                )
              },
              {
                accessor: "clients",
                title: "Clients",
                width: 90,
                render: record => (
                  <BasicTableRowText textWrap="nowrap">
                    {record.state?.connected_clients ?? 0}
                  </BasicTableRowText>
                )
              },
              {
                accessor: "enabled",
                title: "Enabled",
                width: 90,
                sortable: true,
                render: record => (
                  <Switch
                    classNames={{label: styles.switchLabel}}
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
      <CreateOutputModal
        show={activeModal === "create"}
        onCloseModal={() => setActiveModal(null)}
      />
      <MapToStreamModal
        show={activeModal === "map"}
        onCloseModal={() => setActiveModal(null) }
        outputs={modalRecords}
      />
    </>
  );
});

export default Outputs;
