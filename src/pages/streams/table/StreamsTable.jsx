import {observer} from "mobx-react-lite";
import {ActionIcon, Badge, Box, Group, Stack, Text, Title, UnstyledButton} from "@mantine/core";
import {DataTable} from "mantine-datatable";
import {SanitizeUrl} from "@/utils/helpers.js";
import StatusText from "@/components/status-text/StatusText.jsx";
import {GetStreamActions} from "@/utils/streamActions.jsx";
import sharedStyles from "@/assets/shared.module.css";
import {COLOR_MAP} from "@/utils/constants.js";

const StreamsTable = observer(({
  records,
  sortStatus,
  onSortStatusChange,
  fetching,
  onRowClick,
  rowStyle,
  selectedRecords,
  onSelectedRecordsChange,
  showActions=true,
  minHeight,
  maxHeight
}) => {
  const columns = [
    {
      accessor: "title",
      title: "Name",
      sortable: true,
      render: record => (
        <Stack gap={0} maw="100%">
          <UnstyledButton
            disabled={!record.objectId}
            style={{pointerEvents: record.objectId ? "auto" : "none"}}
          >
            <Title order={3} lineClamp={1} title={record.title || record.slug} style={{wordBreak: "break-all"}}>
              {record.title || record.slug}
            </Title>
          </UnstyledButton>
          <Title order={6} c="elv-gray.6" lineClamp={1}>
            {record.objectId}
          </Title>
        </Stack>
      )
    },
    {
      accessor: "originUrl",
      title: "URL",
      width: "30%",
      render: record => (
        <Text fz={14} lineClamp={1} c="elv-gray.9" fw={500} style={{wordBreak: "break-all"}}>
          {SanitizeUrl({url: record.originUrl})}
        </Text>
      )
    },
    {
      accessor: "source",
      title: "Source",
      render: record => (
        <Group gap={4} wrap="nowrap">
          {record.source?.map(el => (
            <Badge key={`source-${el}`} radius={2} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>
              {el}
            </Badge>
          ))}
        </Group>
      )
    },
    {
      accessor: "packaging",
      title: "Packaging",
      render: record => (
        <Group gap={4} wrap="nowrap">
          {(record.packaging || []).map(el => (
            <Badge key={`packaging-${el}`} radius={2} color={COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>
              {el}
            </Badge>
          ))}
        </Group>
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
          fw={400}
        />
    },
    ...(showActions ? [{
      accessor: "actions",
      title: "",
      render: record => (
        <Group gap={7} justify="right" wrap="nowrap">
          {GetStreamActions({record})
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
      )
    }] : [])
  ];

  return (
    <Box className={sharedStyles.tableWrapper} mah={maxHeight} style={maxHeight ? {overflowY: "auto"} : undefined}>
      <DataTable
        highlightOnHover
        idAccessor="objectId"
        minHeight={minHeight ?? ((!records || records.length === 0) ? 130 : 75)}
        fetching={fetching}
        records={records}
        sortStatus={sortStatus}
        onSortStatusChange={onSortStatusChange}
        onRowClick={onRowClick}
        rowStyle={rowStyle}
        selectedRecords={selectedRecords}
        onSelectedRecordsChange={onSelectedRecordsChange}
        columns={columns}
      />
    </Box>
  );
});

export default StreamsTable;
