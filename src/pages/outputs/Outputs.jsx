import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {Box, Button, Flex, Stack, TextInput, Title} from "@mantine/core";
import styles from "@/pages/streams/Streams.module.css";
import {MagnifyingGlassIcon} from "@/assets/icons/index.js";
import {outputStore, streamBrowseStore} from "@/stores/index.js";
import {DataTable} from "mantine-datatable";
import {SanitizeUrl} from "@/utils/helpers.js";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";

const Outputs = observer(() => {
  const DebouncedRefresh = () => {};

  const records = outputStore.outputList;

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
          leftSection={<MagnifyingGlassIcon width={15} height={15} />}
          mb={14}
          value={streamBrowseStore.streamFilter}
          onChange={event => streamBrowseStore.SetStreamFilter({filter: event.target.value})}
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
          records={records || []}
          columns={[
            {
              accessor: "name",
              title: "Name",
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
              accessor: "url",
              title: "URL"
            },
            {
              accessor: "stream",
              title: "Stream",
              render: record => {
                return (
                  <BasicTableRowText title={SanitizeUrl({url: record.originUrl})} lineClamp={1}>
                    {record.input?.stream}
                  </BasicTableRowText>
                );
              }
            }
          ]}
        />
      </Box>
    </PageContainer>
  );
});

export default Outputs;
