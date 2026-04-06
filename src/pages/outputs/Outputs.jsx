import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from "@mantine/core";
import styles from "@/pages/streams/Streams.module.css";
import {outputStore} from "@/stores/index.js";
import {DataTable} from "mantine-datatable";
import {SanitizeUrl} from "@/utils/helpers.js";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";
import {IconSearch, IconTrash} from "@tabler/icons-react";
import {useEffect, useState} from "react";
import {useDebouncedCallback} from "@mantine/hooks";

const Outputs = observer(() => {
  const [loading, setLoading] = useState(false);
  const [sortStatus, setSortStatus] = useState({columnAccessor: "name", direction: "asc"});

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

  if(loading) { return <Loader />; }

  return (
    <PageContainer
      title="Outputs"
    >
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
        <Button
          onClick={DebouncedRefresh}
          variant="outline"
          ml="auto"
        >
          Refresh
        </Button>
      </Flex>

      <Box className={styles.tableWrapper}>
        <DataTable
          idAccessor=""
          minHeight={(!records || records.length === 0) ? 130 : 75}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          records={records || []}
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
                  <BasicTableRowText title={SanitizeUrl({url: record.originUrl})} lineClamp={1}>
                    {record.input?.stream}
                  </BasicTableRowText>
                );
              }
            },
            {
              accessor: "clients",
              title: "Clients",
              width: 80
            },
            {
              accessor: "enabled",
              title: "Status",
              width: 110,
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
