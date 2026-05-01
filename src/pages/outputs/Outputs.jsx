import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton
} from "@mantine/core";
import {outputModalStore, outputStore, rootStore} from "@/stores/index.js";
import {DataTable} from "mantine-datatable";
import {SanitizeUrl} from "@/utils/helpers.js";
import {BasicTableRowText} from "@/pages/streams/details/common/DetailsCommon.jsx";
import {
  IconCancel,
  IconCheck,
  IconCopy,
  IconExternalLink, IconRotateClockwise,
  IconRoute,
  IconRouteOff,
  IconTrash
} from "@tabler/icons-react";
import {useEffect, useState} from "react";
import {useDebouncedCallback} from "@mantine/hooks";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import styles from "./Outputs.module.css";
import sharedStyles from "@/assets/shared.module.css";
import BatchActions from "@/components/table/batch-actions/BatchActions.jsx";
import {useNavigate} from "react-router-dom";
import Actions from "@/components/table/actions/Actions.jsx";


const Outputs = observer(() => {
  const [loading, setLoading] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState([]);
  const [copiedSlug, setCopiedSlug] = useState(null);

  const navigate = useNavigate();

  const LoadData = async(reload=false) => {
    if(outputStore.state !== "loaded" || reload) {
      try {
        setLoading(true);
        await outputStore.LoadOutputs();
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    LoadData();
  }, []);

  const DebouncedRefresh = useDebouncedCallback(async() => {
    await LoadData(true);
  }, 500);

  const records = outputStore.outputList;
  const selectedRecords = records.filter(r => selectedSlugs.includes(r.slug));

  const noSelectedRecords = selectedRecords.length === 0;
  const slugs = () => selectedRecords.map(r => r.slug);

  const actions = [
    {icon: IconRoute, label: "Map to a stream", id: "batch-map-stream", onClick: () => outputModalStore.OpenModal("map", slugs()), disabled: noSelectedRecords},
    {icon: IconRouteOff, label: "Unmap", id: "batch-unmap-stream", onClick: () => outputModalStore.OpenModal("unmap", slugs()), disabled: noSelectedRecords},
    {icon: IconCheck, label: "Enable", id: "batch-enable", onClick: () => outputModalStore.OpenModal("enable", slugs()), disabled: (noSelectedRecords || !selectedRecords.some(r => !r.enabled))},
    {icon: IconCancel, label: "Disable", id: "batch-disable", onClick: () => outputModalStore.OpenModal("disable", slugs()), disabled: (noSelectedRecords || !selectedRecords.some(r => r.enabled))},
    {icon: IconRotateClockwise, label: "Reset", id: "batch-reset", onClick: () => outputModalStore.OpenModal("reset", slugs()), disabled: (noSelectedRecords || !selectedRecords.some(r => !r.reset))},
    {icon: IconTrash, label: "Delete", id: "batch-delete", onClick: () => outputModalStore.OpenModal("delete", slugs()), disabled: (noSelectedRecords)}
  ];

  return (
    <>
      <PageContainer
        title="Outputs"
      >
        <Stack gap={0}>
          <Actions
            actions={[
              {label: "Create", id: "create-action", variant: "filled", onClick: () => outputModalStore.OpenModal("create")},
              {label: "Refresh", id: "refresh-action", variant: "outline", onClick: DebouncedRefresh}
            ]}
            searchValue={outputStore.tableFilter}
            onSearchChange={event => outputStore.SetTableFilter(event.target.value)}
          />
          <BatchActions
            actions={actions}
            selectedRecords={selectedRecords}
            SelectAll={() => setSelectedSlugs(records.map(r => r.slug))}
            ClearSelection={() => setSelectedSlugs([])}
          />
        </Stack>
        <Box className={sharedStyles.tableWrapper}>
          <DataTable
            idAccessor="slug"
            minHeight={(!records || records.length === 0) ? 130 : 75}
            highlightOnHover
            sortStatus={outputStore.sortStatus}
            fetching={loading}
            onSortStatusChange={outputStore.SetSortStatus}
            records={records || []}
            selectedRecords={selectedRecords}
            onSelectedRecordsChange={rows => setSelectedSlugs(rows.map(r => r.slug))}
            selectionColumnClassName={sharedStyles.selectionColumn}
            columns={[
              {
                accessor: "name",
                title: "Name",
                sortable: true,
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
                accessor: "streamName",
                title: "Stream",
                sortable: true,
                render: record => {
                  if(!record.input?.stream) {
                    return (
                      <UnstyledButton onClick={() => outputModalStore.OpenModal("map", [record.slug])}>
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
                        <StatusIndicator
                          status={record.input.status}
                          size="xs"
                          fw={400}
                          c="elv-gray.6"
                          fz="0.75rem"
                        />
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
                    <Text fz={14} lineClamp={1} c="elv-gray.9" fw={500} style={{wordBreak: "break-all"}}>{ record.srt_pull?.urls?.[0] }</Text>
                    <ActionIcon
                      variant="transparent"
                      c="elv-gray.6"
                      size={18}
                      onClick={() => {
                        navigator.clipboard.writeText(record.srt_pull?.urls?.[0]);
                        setCopiedSlug(record.slug);
                        setTimeout(() => setCopiedSlug(null), 2000);
                      }}
                    >
                      {
                        copiedSlug === record.slug ?
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
                width: 70,
                textAlign: "center",
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
                    onChange={() => outputModalStore.OpenModal(record.enabled ? "disable" : "enable", [record.slug])}
                  />
                )
              },
              {
                accessor: "actions",
                title: "",
                width: 50,
                render: record => (
                  <ActionIcon
                    variant="subtle"
                    title="Delete Output"
                    color="gray.6"
                    onClick={() => outputModalStore.OpenModal("delete", [record.slug])}
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
    </>
  );
});

export default Outputs;
