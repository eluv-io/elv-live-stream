import {observer} from "mobx-react-lite";
import {Box, Button, Flex, Modal, Stack, Text, Title, UnstyledButton} from "@mantine/core";
import styles from "./modals.module.css";
import {DataTable} from "mantine-datatable";
import {SanitizeUrl, SortTable} from "@/utils/helpers.js";
import StatusText from "@/components/status-text/StatusText.jsx";
import {useState} from "react";
import {streamBrowseStore} from "@/stores/index.js";
import sharedStyles from "@/assets/shared.module.css";
import modalStyles from "./modals.module.css";

const MapToStreamModal = observer(({show, onCloseModal}) => {
  const [sortStatus, setSortStatus] = useState({columnAccessor: "title", direction: "asc"});
  const [selectedRecords, setSelectedRecords] = useState([]);

  const records = Object.values(streamBrowseStore.streams || {})
    .sort(SortTable({sortStatus}));

  return (
    <Modal
      opened={show}
      onClose={onCloseModal}
      title={
        <Stack gap={0} mb={20}>
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600}>Map to A Stream</Title>
          <Text fz="0.875rem" c="elv-gray.8">Choose the stream this output will send to.</Text>
        </Stack>
      }
      padding="24px"
      radius="6px"
      size="75%"
      classNames={{header: styles.modalHeader}}
      centered
    >
      <Box className={`${sharedStyles.tableWrapper} ${modalStyles.modalRoot}`}>
        <DataTable
          highlightOnHover
          idAccessor="objectId"
          minHeight={(!records || records.length === 0) ? 130 : 75}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          records={records}
          onRowClick={record => setSelectedRecords([record])}
          rowStyle={record => (selectedRecords?.[0]?.record?.objectId === record.objectId) ? {backgroundColor: "var(--mantine-color-elv-gray-0)"} : undefined}
          columns={[
            {
              accessor: "title",
              title: "Name",
              sortable: true,
              width: "25%",
              render: record => (
                <Stack gap={0}>
                  <UnstyledButton onClick={() => {}} disabled={!record.objectId} style={{pointerEvents: record.objectId ? "auto" : "none"}}>
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
                <Text fz={14} lineClamp={1} c="elv-gray.9" style={{wordBreak: "break-all"}}>
                  { SanitizeUrl({url: record.originUrl}) }
                </Text>
              )
            },
            {
              accessor: "source",
              title: "Source",
              width: "80px",
              render: record => (
                (record.source || []).map(el => (
                  <Text key={`source-${el}`} tt="uppercase" fz={14}>{el}</Text>
                ))
              )
            },
            {
              accessor: "packaging",
              title: "Packaging",
              width: "100px",
              render: record => (
                (record.packaging || []).map(el => (
                  <Text key={`packaging-${el}`} tt="uppercase" fz={14}>{el}</Text>
                ))
              )
            },
            {
              accessor: "status",
              title: "Status",
              sortable: true,
              width: "125px",
              render: record => !record.status ? null :
                <StatusText
                  status={record.status}
                  quality={record.quality}
                  size="md"
                />
            }
          ]}
        />
      </Box>
      <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
        <Button type="submit">Map</Button>
      </Flex>
    </Modal>
  );
});

export default MapToStreamModal;
