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
import {BuildGroupedRows} from "./groupedRows.js";

// Fixed height for every row. No per-row measureElement, so getTotalSize() stays exact
// and there's no scrollMargin/measurement race. Overflowing content is clipped by the cells.
const ROW_HEIGHT = 51;
const SELECTION_COLUMN_WIDTH = "40px";
const DEFAULT_MAX_HEIGHT = "calc(100vh - 320px)";
// Gap below the table so only it scrolls, never the page.
const VIEWPORT_BOTTOM_GAP = 48;

// Min pixel width of a column track (fixed width, or first arg of minmax()). Summed, it's
// the row/header width when columns overflow, so bottom borders span the full scroll width.
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
    renderGroup: record => {
      const groupName = record.displayTitle ? `${record.titleId} - ${record.displayTitle}` : record.titleId;
      return (
      <Group gap={8} wrap="nowrap" maw="100%">
        <UnstyledButton onClick={() => onViewSummary?.(record)}>
          <Title order={3} lineClamp={1} title={groupName} style={{wordBreak: "break-all"}}>
            {groupName}
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
      );
    }
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

// Header + the rows the virtualizer currently reports as visible.
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
    // A min height while fetching keeps the spinner below the header, not at the top edge
    <Box
      className={sharedStyles.tableWrapper}
      {...scrollContainerProps}
      mih={fetching ? 220 : undefined}
      style={{position: "relative", display: "flex", flexDirection: "column", ...scrollContainerProps?.style}}
    >
      <LoadingOverlay visible={!!fetching} zIndex={1} overlayProps={{radius: "sm", blur: 1}} />

      {/* The single scroll box. Header lives inside it so it scrolls horizontally with the
          rows and sticks to the top vertically. The "loading more" spinner sits after the
          rows, above this element's horizontal scrollbar. */}
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
                  const isLastRow = virtualRow.index === records.length - 1;

                  return (
                    <div
                      key={record.objectId || virtualRow.key}
                      data-index={virtualRow.index}
                      data-record-slug={record.slug}
                      className={[
                        styles.row,
                        isGroupChild && styles.groupChildRow,
                        isLastRow && styles.lastRow
                      ].filter(Boolean).join(" ")}
                      role="row"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: ROW_HEIGHT,
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

// Bounds the scroll area's height so only the table scrolls vertically, never the page.
const BoundedVirtualizedTable = ({maxHeight, minHeight, ...props}) => {
  const scrollRef = useRef(null);
  const headerRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [autoMaxHeight, setAutoMaxHeight] = useState(null);

  // An explicit maxHeight (e.g. "100%" in a modal) wins; otherwise fit the table to the
  // space between its top and the viewport bottom so the page never scrolls.
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

    // Re-measure when content above the table changes height (filters, batch actions).
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(Measure);
    observer?.observe(document.body);

    return () => {
      window.removeEventListener("resize", Measure);
      observer?.disconnect();
    };
  }, [useAutoHeight, minHeight]);

  const effectiveMaxHeight = useAutoHeight ? (autoMaxHeight ?? maxHeight) : maxHeight;

  // Don't force `minHeight` when the rows already fit inside it - that leaves dead space
  // below a short list (e.g. a single row).
  const contentHeight = (scrollMargin || 44) + props.records.length * ROW_HEIGHT;
  const effectiveMinHeight = props.records.length === 0 ? minHeight : Math.min(minHeight, contentHeight);

  // Rows start below the sticky header in the same scroll element; the virtualizer needs
  // that offset to map scrollTop -> row range.
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
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    scrollMargin
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // When a group is expanded, scroll its newly revealed rows into view. Without this a
  // group near the bottom expands off-screen and the user sees nothing change.
  const prevExpandedRef = useRef(props.expandedGroups || []);
  useLayoutEffect(() => {
    const prev = prevExpandedRef.current;
    const current = props.expandedGroups || [];
    prevExpandedRef.current = current;

    const opened = current.find(id => !prev.includes(id));
    if(!opened) { return; }

    const groupIndex = props.records.findIndex(r => r._type === "group" && r.titleId === opened);
    if(groupIndex === -1) { return; }

    const childCount = props.records[groupIndex].streamCount || 0;
    const lastChildIndex = groupIndex + childCount;

    // If the whole group fits, bring its last row to the bottom edge; otherwise pin the
    // group header to the top so the user starts at the beginning of the list.
    const visibleRows = Math.floor((scrollRef.current?.clientHeight ?? 0) / ROW_HEIGHT);
    if(childCount + 1 <= visibleRows) {
      rowVirtualizer.scrollToIndex(lastChildIndex, {align: "end"});
    } else {
      rowVirtualizer.scrollToIndex(groupIndex, {align: "start"});
    }
  }, [props.expandedGroups, props.records]);

  // Fetch the next page once the last row is rendered. Skip during the main load/reload
  // (fetching) - records are stale and the bottom is trivially "in view".
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
      scrollContainerProps={{style: {maxHeight: effectiveMaxHeight, minHeight: effectiveMinHeight}}}
      scrollAreaProps={{ref: scrollRef}}
      virtualItems={virtualItems}
      totalSize={rowVirtualizer.getTotalSize()}
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
  maxHeight = DEFAULT_MAX_HEIGHT,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  groups = [],
  expandedGroups = [],
  streamOrder,
  onToggleGroup,
  onViewSummary,
  getRowActions
}) => {
  const allRecords = records || [];
  const rows = BuildGroupedRows({records: allRecords, groups, expandedGroups, streamOrder});
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
