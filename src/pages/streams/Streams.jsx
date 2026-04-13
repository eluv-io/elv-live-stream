// "use client";

import {useState} from "react";
import {observer} from "mobx-react-lite";
import {Link, useNavigate} from "react-router-dom";
import {
  IconSearch
} from "@tabler/icons-react";

import {dataStore, streamBrowseStore} from "@/stores";
import {SanitizeUrl, SortTable} from "@/utils/helpers";

import {useDebouncedCallback, useDebouncedValue} from "@mantine/hooks";
import {DataTable} from "mantine-datatable";
import {
  ActionIcon,
  Group,
  TextInput,
  Stack,
  Title,
  Box,
  Flex,
  Button,
  UnstyledButton,
  Badge
} from "@mantine/core";

import StatusText from "@/components/status-text/StatusText.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";
import {GetStreamActions} from "@/utils/streamActions.jsx";
import styles from "./Streams.module.css";
import sharedStyles from "@/assets/shared.module.css";
import {COLOR_MAP} from "@/utils/constants.js";

const Streams = observer(() => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [debouncedFilter] = useDebouncedValue(streamBrowseStore.streamFilter, 200);
  const navigate = useNavigate();

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await dataStore.Initialize(true);
  }, 500);

  const records = Object.values(streamBrowseStore.streams || {})
    .filter(record => {
      return (
        !debouncedFilter ||
        record.title?.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
        record.objectId?.toLowerCase().includes(debouncedFilter.toLowerCase())
      );
    })
    .sort(SortTable({sortStatus}));

  return (
    <PageContainer
      title="Streams"
    >
      <Flex w="100%" align="center" mb={16}>
        <TextInput
          flex={2}
          maw={400}
          classNames={{input: styles.searchBar}}
          placeholder="Search by object name or ID"
          leftSection={<IconSearch width={15} height={15} />}
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

      <Box className={sharedStyles.tableWrapper}>
        <DataTable
          highlightOnHover
          idAccessor="objectId"
          minHeight={(!records || records.length === 0) ? 130 : 75}
          fetching={!dataStore.loaded}
          records={records}
          emptyState={
            // Mantine bug where empty state link still present underneath table rows
            !records &&
            <div className={styles.emptyDataTable}>
              <div className={styles.emptyDataTableText}>
                No streams available
              </div>
              <Link className="button button__primary" to="/create">
                <div className="button__link-inner">
                  <span className="button__link-text">
                    Create New Stream
                  </span>
                </div>
              </Link>
            </div>
          }
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          columns={[
            { accessor: "title", title: "Name", sortable: true, render: record => (
              <Stack gap={0} maw="100%">
                <UnstyledButton onClick={() => navigate(`/streams/${record.objectId || record.slug}`)} disabled={!record.objectId} style={{pointerEvents: record.objectId ? "auto" : "none"}}>
                  <Title order={3} lineClamp={1} title={record.title || record.slug} style={{wordBreak: "break-all"}}>
                    {record.title || record.slug}
                  </Title>
                </UnstyledButton>
                <Title order={6} c="elv-gray.6" lineClamp={1}>
                  {record.objectId}
                </Title>
              </Stack>
            )},
            {
              accessor: "originUrl",
              title: "URL",
              render: record => (
                <BasicTableRowText title={SanitizeUrl({url: record.originUrl})} lineClamp={1}>
                  {SanitizeUrl({url: record.originUrl})}
                </BasicTableRowText>
              )
            },
            {
              accessor: "source",
              title: "Source",
              render: record => (
                record.source?.map(el => <Badge key={`source-${el}`} radius={2} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400}>{el}</Badge>
                )
              )
            },
            {
              accessor: "packaging",
              title: "Packaging",
              render: record => (
                (record.packaging || []).map(el => (
                  <Badge key={`packaging-${el}`} radius={2} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400}>{el}</Badge>
                ))
              )
            },
            {
              accessor: "audioStreams",
              title: "Audio",
              render: record => (
                <BasicTableRowText miw="100%" textWrap="nowrap">
                  {record.audioStreamCount ? `${record.audioStreamCount} ${record.audioStreamCount > 1 ? "streams" : "stream"}` : ""}
                </BasicTableRowText>
              )
            },
            {
              accessor: "status",
              title: "Status",
              sortable: true,
              render: record => !record.status ? null :
                <StatusText
                  status={record.status}
                  quality={record.quality}
                  size="md"
                />
            },
            {
              accessor: "actions",
              title: "",
              render: record => {
                return (
                  <Group gap={7} justify="right" wrap="nowrap">
                    {
                      GetStreamActions({record})
                        .filter(item => !item.hidden)
                        .map(item => (
                          <ActionIcon
                            key={`action-${item.title}`}
                            variant={item.iconVariant}
                            component={item.component}
                            to={item.to}
                            title={item.title}
                            color={item.iconColor}
                            onClick={item.onClick}
                            disabled={item.disabled}
                          >
                            {item.icon}
                          </ActionIcon>
                        ))
                    }
                  </Group>
                );
              }
            }
          ]}
        />
      </Box>
    </PageContainer>
  );
});

export default Streams;
