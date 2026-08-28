import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";
import {ActionIcon, Badge, Box, Button, Center, Checkbox, Group, Loader, LoadingOverlay, Stack, Text, Title, Tooltip, UnstyledButton} from "@mantine/core";
import {useVirtualizer} from "@tanstack/react-virtual";
import {IconArrowNarrowDown, IconArrowNarrowUp, IconArrowsVertical, IconChevronRight} from "@tabler/icons-react";
import {SanitizeUrl, FormatStreamDate} from "@/utils/helpers.ts";
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
// Space left below the table so its bottom edge clears the page's bottom padding
// and the page itself never needs to scroll - only the table does.
const VIEWPORT_BOTTOM_GAP = 48;

// Minimum pixel width of a column track: the fixed width, or the first arg of minmax().
// Summed across columns it gives the row/header width when columns overflow the viewport,
// so their bottom borders span the full width the user can scroll to.
const MinTrackWidth = width => {
  const match = /(\d+(?:\.\d+)?)px/.exec(width);
  return match ? parseFloat(match[1]) : 0;
};

const BuildColumns = ({showActions, onNameClick, onViewSummary, getRowActions}) => [
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
    ),
    renderGroup: record => (
      <Group gap={8} wrap="nowrap" maw="100%">
        <UnstyledButton onClick={() => onViewSummary?.(record)}>
          <Title order={3} lineClamp={1} title={record.titleId} style={{wordBreak: "break-all"}}>
            {record.titleId}
          </Title>
        </UnstyledButton>
        <Badge
          radius="sm"
          c="elv-gray.7"
          fw={600}
          style={{background: "rgba(34, 139, 230, 0.20)", flexShrink: 0}}
        >
          {record.streamCount}
        </Badge>
      </Group>
    )
  },
  {
    accessor: "date",
    title: "Date",
    sortable: true,
    width: "minmax(120px, 0.75fr)",
    render: record => (
      <Text fz={14} lineClamp={1} c="elv-gray.9" fw={500}>
        {FormatStreamDate(record.date)}
      </Text>
    ),
    renderGroup: record => (
      <Text fz={14} lineClamp={1} c="elv-gray.9" fw={500}>
        {FormatStreamDate(record.date)}
      </Text>
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
    renderGroup: record => (
      <Group justify="right" wrap="nowrap" w="100%">
        <Button
          size="xs"
          variant="subtle"
          color="elv-blue.3"
          styles={{label: {overflow: "visible"}}}
          onClick={() => onViewSummary?.(record)}
        >
          View Summary
        </Button>
      </Group>
    ),
    render: record => (
      <Group gap={7} justify="right" wrap="nowrap" w="100%">
        {(getRowActions ? getRowActions(record) : GetStreamActions({record}))
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
  minGridWidth,
  sortStatus,
  onSortStatusChange,
  fetching,
  onRowClick,
  rowStyle,
  selectedRecords,
  onSelectedRecordsChange,
  isRecordSelectable,
  scrollContainerProps,
  scrollAreaProps,
  headerRef,
  scrollMargin,
  virtualItems,
  totalSize,
  measureElement,
  loadingMore,
  expandedGroups,
  onToggleGroup
}) => {
  const selectionEnabled = !!onSelectedRecordsChange;

  const IsGroupRow = record => record?._type === "group";
  const IsGroupChildRow = record => record?._type === "groupChild";
  const IsSelectable = (record, index) =>
    !IsGroupRow(record) && (!isRecordSelectable || isRecordSelectable(record, index));
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
    // While fetching, a min height gives the loading spinner room to sit below the header rather than at the top edge
    <Box
      className={sharedStyles.tableWrapper}
      {...scrollContainerProps}
      mih={fetching ? 220 : undefined}
      style={{position: "relative", display: "flex", flexDirection: "column", ...scrollContainerProps?.style}}
    >
      <LoadingOverlay visible={!!fetching} zIndex={1} overlayProps={{radius: "sm", blur: 1}} />

      {/* This div is the scroll box. The header lives inside it so the browser scrolls the
          header horizontally with the rows (no JS lag); it sticks to the top on vertical
          scroll. The "loading more" spinner also lives inside it, after the rows, so it
          sits above this element's own horizontal scrollbar. */}
      <div {...scrollAreaProps} className={styles.scrollArea}>
        <div ref={headerRef} className={styles.header} style={{gridTemplateColumns, minWidth: minGridWidth}} role="row">
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
                  <Text fz="0.875rem" fw={700} c="#000">{column.title}</Text>
                  {
                    column.sortable && (
                      sortStatus?.columnAccessor === column.accessor ?
                        (sortStatus.direction === "desc" ? <IconArrowNarrowUp size={14} /> : <IconArrowNarrowDown size={14} />) :
                        <IconArrowsVertical size={14} color="var(--mantine-color-gray-5)" />
                    )
                  }
                </Group>
              </UnstyledButton>
            ))
          }
        </div>

        {
          !fetching && records.length === 0 ?
            <Text ta="center" c="elv-gray.6" py="xl">No records found</Text> :
            <div style={{height: totalSize, position: "relative"}}>
              {
                virtualItems.map(virtualRow => {
                  const record = records[virtualRow.index];
                  const customStyle = typeof rowStyle === "function" ? rowStyle(record, virtualRow.index) : undefined;
                  const selectable = IsSelectable(record, virtualRow.index);
                  const isGroup = IsGroupRow(record);
                  const isGroupChild = IsGroupChildRow(record);
                  const expanded = isGroup && (expandedGroups || []).includes(record.titleId);

                  return (
                    <div
                      key={record.objectId || virtualRow.key}
                      data-index={virtualRow.index}
                      data-record-slug={record.slug}
                      ref={measureElement}
                      className={isGroupChild ? `${styles.row} ${styles.groupChildRow}` : styles.row}
                      role="row"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        minWidth: minGridWidth,
                        transform: `translateY(${virtualRow.start - (scrollMargin || 0)}px)`,
                        gridTemplateColumns,
                        ...customStyle
                      }}
                      onClick={event => onRowClick?.({record, index: virtualRow.index, event})}
                    >
                      {
                        selectionEnabled &&
                        <div className={styles.cell} onClick={event => event.stopPropagation()}>
                          {
                            isGroup ?
                              <ActionIcon
                                aria-label={`toggle-group-${record.titleId}`}
                                variant="subtle"
                                size="sm"
                                color="elv-gray.6"
                                onClick={() => onToggleGroup?.(record.titleId)}
                              >
                                <IconChevronRight
                                  size={16}
                                  style={{transform: expanded ? "rotate(90deg)" : "none", transition: "transform 150ms ease"}}
                                />
                              </ActionIcon> :
                              <Checkbox
                                aria-label={`select-row-${record.slug}`}
                                checked={IsSelected(record)}
                                disabled={!selectable}
                                onChange={event => ToggleRecord(record, event.currentTarget.checked)}
                              />
                          }
                        </div>
                      }
                      {
                        columns.map(column => (
                          <div key={column.accessor} className={styles.cell} role="cell">
                            {isGroup ? column.renderGroup?.(record) : column.render(record)}
                          </div>
                        ))
                      }
                    </div>
                  );
                })
              }
            </div>
        }

        {
          loadingMore &&
          <Center className={styles.loadingMore}>
            <Loader size="sm" />
          </Center>
        }
      </div>
    </Box>
  );
};

// styles.scrollArea is the single scroll container, so the sticky header and the rows
// scroll together horizontally. Its height is bounded so only the table scrolls vertically,
// never the page.
const BoundedVirtualizedTable = ({maxHeight, minHeight, ...props}) => {
  const scrollRef = useRef(null);
  const headerRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [autoMaxHeight, setAutoMaxHeight] = useState(null);

  // Callers that pass an explicit maxHeight (e.g. "100%" inside a modal) keep it; otherwise
  // fit the table to the gap between its top and the bottom of the viewport so the page
  // itself never needs a scrollbar.
  const useAutoHeight = maxHeight === DEFAULT_MAX_HEIGHT;

  useLayoutEffect(() => {
    if(!useAutoHeight) { return; }

    const Measure = () => {
      const el = scrollRef.current;
      if(!el) { return; }

      const top = el.getBoundingClientRect().top + window.scrollY;
      setAutoMaxHeight(Math.max(minHeight, Math.round(window.innerHeight - top - VIEWPORT_BOTTOM_GAP)));
    };

    Measure();
    window.addEventListener("resize", Measure);

    // Re-measure when content above the table changes height (filters, batch actions row).
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(Measure);
    observer?.observe(document.body);

    return () => {
      window.removeEventListener("resize", Measure);
      observer?.disconnect();
    };
  }, [useAutoHeight, minHeight]);

  const effectiveMaxHeight = useAutoHeight ? (autoMaxHeight ?? maxHeight) : maxHeight;

  // The rows viewport starts below the sticky header inside the same scroll element,
  // so the virtualizer needs that offset to map scrollTop -> row range correctly.
  useLayoutEffect(() => {
    const Measure = () => setScrollMargin(headerRef.current?.offsetHeight ?? 0);
    Measure();

    if(!headerRef.current || typeof ResizeObserver === "undefined") { return; }
    const observer = new ResizeObserver(Measure);
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: props.records.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8,
    scrollMargin
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Fetch the next page once the last row (within overscan) is rendered. Skip while the
  // table is doing its main load/reload (fetching) - the current records are stale and
  // the bottom is trivially "in view".
  const {onLoadMore, hasMore, loadingMore, fetching, records} = props;
  useEffect(() => {
    if(!onLoadMore || !hasMore || loadingMore || fetching || records.length === 0) { return; }

    const lastItem = virtualItems[virtualItems.length - 1];
    if(lastItem && lastItem.index >= records.length - 1) {
      onLoadMore();
    }
  }, [virtualItems, hasMore, loadingMore, fetching, records.length, onLoadMore]);

  return (
    <TableShell
      {...props}
      headerRef={headerRef}
      scrollMargin={scrollMargin}
      loadingMore={loadingMore}
      scrollContainerProps={{style: {maxHeight: effectiveMaxHeight, minHeight}}}
      scrollAreaProps={{ref: scrollRef}}
      virtualItems={virtualItems}
      totalSize={rowVirtualizer.getTotalSize()}
      measureElement={rowVirtualizer.measureElement}
    />
  );
};

// Flattens groups (with their expanded stream children) followed by ungrouped streams
// into a single ordered row list for the virtualizer. Group order follows the active
// sort via each group's first member's position in `records`.
const BuildGroupedRows = ({records, groups, expandedGroups}) => {
  if(!groups || groups.length === 0) { return records; }

  const grouped = groups
    .map(group => ({
      group,
      members: records.filter(record => group.streamIds?.includes(record.objectId))
    }))
    .filter(({members}) => members.length > 0)
    .sort((a, b) => records.indexOf(a.members[0]) - records.indexOf(b.members[0]));

  const groupedIds = new Set(grouped.flatMap(({members}) => members.map(m => m.objectId)));
  const rows = [];

  grouped.forEach(({group, members}) => {
    rows.push({
      _type: "group",
      objectId: `group-${group.titleId}`,
      titleId: group.titleId,
      streamCount: group.streamIds?.length ?? members.length,
      // Group date - falls back to a member's date until real group data is wired.
      date: group.data?.date ?? members[0]?.date
    });

    if((expandedGroups || []).includes(group.titleId)) {
      members.forEach(member => rows.push({...member, _type: "groupChild"}));
    }
  });

  records.forEach(record => {
    if(!groupedIds.has(record.objectId)) { rows.push(record); }
  });

  return rows;
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
  maxHeight = DEFAULT_MAX_HEIGHT,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  groups = [],
  expandedGroups = [],
  onToggleGroup,
  onViewSummary,
  getRowActions
}) => {
  const allRecords = records || [];
  const rows = BuildGroupedRows({records: allRecords, groups, expandedGroups});
  const columns = BuildColumns({showActions, onNameClick, onViewSummary, getRowActions});

  const columnWidths = [
    onSelectedRecordsChange ? SELECTION_COLUMN_WIDTH : null,
    ...columns.map(column => column.width)
  ].filter(Boolean);
  const gridTemplateColumns = columnWidths.join(" ");
  const minGridWidth = columnWidths.reduce((sum, width) => sum + MinTrackWidth(width), 0);

  return (
    <BoundedVirtualizedTable
      records={rows}
      columns={columns}
      gridTemplateColumns={gridTemplateColumns}
      minGridWidth={minGridWidth}
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
      onLoadMore={onLoadMore}
      hasMore={hasMore}
      loadingMore={loadingMore}
      expandedGroups={expandedGroups}
      onToggleGroup={onToggleGroup}
    />
  );
});

export default StreamsTable;
