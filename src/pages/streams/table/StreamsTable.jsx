import {useRef} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Badge, Box, Checkbox, Group, LoadingOverlay, Stack, Text, Title, Tooltip, UnstyledButton} from "@mantine/core";
import {useVirtualizer} from "@tanstack/react-virtual";
import {IconChevronDown, IconChevronUp} from "@tabler/icons-react";
import {SanitizeUrl} from "@/utils/helpers.ts";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import {GetStreamActions} from "@/utils/streamActions.jsx";
import sharedStyles from "@/assets/shared.module.css";
import styles from "./StreamsTable.module.css";
import {SOURCE_PACKAGING_COLOR_MAP, QUALITY_MAP} from "@/utils/constants.ts";

// Estimate only - actual row height is measured per-row (rowVirtualizer.measureElement),
// so wrapped/variable content (e.g. multiple source badges) still lays out correctly.
const ROW_HEIGHT_ESTIMATE = 64;
const SELECTION_COLUMN_WIDTH = "40px";
const DEFAULT_MAX_HEIGHT = "calc(100vh - 320px)";

const BuildColumns = ({showActions, onNameClick}) => [
  {
    accessor: "title",
    title: "Name",
    sortable: true,
    width: "minmax(240px, 2fr)",
    render: record => (
      <Stack gap={0} maw="100%">
        <UnstyledButton
          disabled={!record.objectId}
          style={{pointerEvents: record.objectId ? "auto" : "none"}}
          onClick={onNameClick ? () => onNameClick(record.objectId) : null}
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
    width: "minmax(200px, 1.5fr)",
    render: record => (
      <Text fz={14} lineClamp={1} c="elv-gray.9" fw={500} style={{wordBreak: "break-all"}}>
        {SanitizeUrl({url: record.originUrl})}
      </Text>
    )
  },
  {
    accessor: "source",
    title: "Source",
    width: "minmax(140px, 1fr)",
    render: record => (
      <Group gap={4} wrap="nowrap">
        {record.source?.map(el => (
          <Badge key={`source-${el}`} radius={2} color={SOURCE_PACKAGING_COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>
            {el}
          </Badge>
        ))}
      </Group>
    )
  },
  {
    accessor: "packaging",
    title: "Packaging",
    width: "minmax(140px, 1fr)",
    render: record => (
      <Group gap={4} wrap="nowrap">
        {(record.packaging || []).map(el => (
          <Badge key={`packaging-${el}`} radius={2} color={SOURCE_PACKAGING_COLOR_MAP[el]} c="elv-gray.7" tt="uppercase" fz={12} fw={400} classNames={{label: sharedStyles.badgeLabel}}>
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
    width: "minmax(140px, 1fr)",
    render: record => !record.status ? null :
      <StatusIndicator
        status={record.status}
        showWarning={record.quality && (record.quality !== QUALITY_MAP.GOOD)}
        size="md"
        fw={400}
      />
  },
  ...(showActions ? [{
    accessor: "actions",
    title: "",
    width: "140px",
    render: record => (
      <Group gap={7} justify="right" wrap="nowrap" w="100%">
        {GetStreamActions({record})
          .filter(item => !item.hidden)
          .map(item => (
            <Tooltip key={`action-${item.title}`} label={item.title}>
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
            </Tooltip>
          ))
        }
      </Group>
    )
  }] : [])
];

// Renders the header + whichever rows the virtualizer says are currently visible.
const TableShell = ({
  records,
  columns,
  gridTemplateColumns,
  sortStatus,
  onSortStatusChange,
  fetching,
  onRowClick,
  rowStyle,
  selectedRecords,
  onSelectedRecordsChange,
  isRecordSelectable,
  scrollContainerProps,
  bodyContainerProps,
  virtualItems,
  totalSize,
  measureElement
}) => {
  const selectionEnabled = !!onSelectedRecordsChange;

  const IsSelectable = (record, index) => !isRecordSelectable || isRecordSelectable(record, index);
  const IsSelected = record => (selectedRecords || []).some(r => r.objectId === record.objectId);

  const ToggleAll = checked => {
    if(!checked) {
      onSelectedRecordsChange([]);
      return;
    }

    onSelectedRecordsChange(records.filter(IsSelectable));
  };

  const ToggleRecord = (record, checked) => {
    onSelectedRecordsChange(
      checked ?
        [...(selectedRecords || []), record] :
        (selectedRecords || []).filter(r => r.objectId !== record.objectId)
    );
  };

  const HandleSort = column => {
    if(!column.sortable || !onSortStatusChange) { return; }

    const direction = sortStatus?.columnAccessor === column.accessor && sortStatus.direction === "asc" ? "desc" : "asc";
    onSortStatusChange({columnAccessor: column.accessor, direction});
  };

  const selectableRecords = records.filter(IsSelectable);
  const allSelected = selectionEnabled && selectableRecords.length > 0 && selectableRecords.every(IsSelected);
  const someSelected = selectionEnabled && !allSelected && selectableRecords.some(IsSelected);

  return (
    <Box
      className={sharedStyles.tableWrapper}
      {...scrollContainerProps}
      style={{position: "relative", ...scrollContainerProps?.style}}
    >
      <LoadingOverlay visible={!!fetching} zIndex={1} overlayProps={{radius: "sm", blur: 1}} />
      <div className={styles.header} style={{gridTemplateColumns}} role="row">
        {
          selectionEnabled &&
          <div className={styles.headerCell}>
            <Checkbox
              aria-label="select-all-rows"
              checked={allSelected}
              indeterminate={someSelected}
              disabled={selectableRecords.length === 0}
              onChange={event => ToggleAll(event.currentTarget.checked)}
            />
          </div>
        }
        {
          columns.map(column => (
            <UnstyledButton
              key={column.accessor}
              className={styles.headerCell}
              onClick={() => HandleSort(column)}
              style={{cursor: column.sortable && onSortStatusChange ? "pointer" : "default"}}
            >
              <Group gap={4} wrap="nowrap">
                <Text fz={13} fw={600} c="elv-black.3">{column.title}</Text>
                {
                  column.sortable && sortStatus?.columnAccessor === column.accessor &&
                  (sortStatus.direction === "asc" ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />)
                }
              </Group>
            </UnstyledButton>
          ))
        }
      </div>

      <div {...bodyContainerProps}>
        {
          !fetching && records.length === 0 ?
            <Text ta="center" c="elv-gray.6" py="xl">No records found</Text> :
            <div style={{height: totalSize, position: "relative"}}>
              {
                virtualItems.map(virtualRow => {
                  const record = records[virtualRow.index];
                  const customStyle = typeof rowStyle === "function" ? rowStyle(record, virtualRow.index) : undefined;
                  const selectable = IsSelectable(record, virtualRow.index);

                  return (
                    <div
                      key={record.objectId || virtualRow.key}
                      data-index={virtualRow.index}
                      data-record-slug={record.slug}
                      ref={measureElement}
                      className={styles.row}
                      role="row"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        gridTemplateColumns,
                        ...customStyle
                      }}
                      onClick={event => onRowClick?.({record, index: virtualRow.index, event})}
                    >
                      {
                        selectionEnabled &&
                        <div className={styles.cell} onClick={event => event.stopPropagation()}>
                          <Checkbox
                            aria-label={`select-row-${record.slug}`}
                            checked={IsSelected(record)}
                            disabled={!selectable}
                            onChange={event => ToggleRecord(record, event.currentTarget.checked)}
                          />
                        </div>
                      }
                      {
                        columns.map(column => (
                          <div key={column.accessor} className={styles.cell} role="cell">
                            {column.render(record)}
                          </div>
                        ))
                      }
                    </div>
                  );
                })
              }
            </div>
        }
      </div>
    </Box>
  );
};

// The table owns both scroll axes itself: vertical scroll is bounded to maxHeight, horizontal
// scroll (via styles.body's overflow: auto) kicks in if columns don't fit the available width.
const BoundedVirtualizedTable = ({maxHeight, minHeight, ...props}) => {
  const scrollRef = useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: props.records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8
  });

  return (
    <TableShell
      {...props}
      scrollContainerProps={{style: {display: "flex", flexDirection: "column", maxHeight, minHeight}}}
      bodyContainerProps={{ref: scrollRef, className: styles.body, style: {flex: 1, minHeight: 0}}}
      virtualItems={rowVirtualizer.getVirtualItems()}
      totalSize={rowVirtualizer.getTotalSize()}
      measureElement={rowVirtualizer.measureElement}
    />
  );
};

const StreamsTable = observer(({
  records,
  sortStatus,
  onSortStatusChange,
  fetching,
  onRowClick,
  onNameClick,
  rowStyle,
  selectedRecords,
  onSelectedRecordsChange,
  isRecordSelectable,
  showActions = true,
  minHeight = 130,
  maxHeight = DEFAULT_MAX_HEIGHT
}) => {
  const allRecords = records || [];
  const columns = BuildColumns({showActions, onNameClick});

  const gridTemplateColumns = [
    onSelectedRecordsChange ? SELECTION_COLUMN_WIDTH : null,
    ...columns.map(column => column.width)
  ].filter(Boolean).join(" ");

  return (
    <BoundedVirtualizedTable
      records={allRecords}
      columns={columns}
      gridTemplateColumns={gridTemplateColumns}
      sortStatus={sortStatus}
      onSortStatusChange={onSortStatusChange}
      fetching={fetching}
      onRowClick={onRowClick}
      rowStyle={rowStyle}
      selectedRecords={selectedRecords}
      onSelectedRecordsChange={onSelectedRecordsChange}
      isRecordSelectable={isRecordSelectable}
      maxHeight={maxHeight}
      minHeight={minHeight}
    />
  );
});

export default StreamsTable;
