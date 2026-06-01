import {useCallback, useEffect, useMemo, useState} from "react";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {rootStore, streamStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";
import {ActionIcon, Loader, Tabs, Title} from "@mantine/core";
import {useDebouncedCallback} from "@mantine/hooks";
import styles from "@/pages/streams/details/StreamDetails.module.css";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {GetStreamActions} from "@/utils/streamActions.jsx";
import {QUALITY_MAP} from "@/utils/constants.js";
import {IconExternalLink} from "@tabler/icons-react";
import SummaryPanel from "@/pages/streams/details/summary/SummaryPanel.jsx";
import GeneralPanel from "@/pages/streams/details/general/GeneralPanel.jsx";
import RecordingPanel from "@/pages/streams/details/recording/RecordingPanel.jsx";
import PlayoutPanel from "@/pages/streams/details/playout/PlayoutPanel.jsx";
import TransportStreamPanel from "@/pages/streams/details/transport-stream/TransportStreamPanel.jsx";

const DETAILS_TABS = [
  {label: "Summary", value: "status", Component: SummaryPanel},
  {label: "General Config", value: "general", Component: GeneralPanel},
  {label: "Recording Config", value: "recording", Component: RecordingPanel},
  {label: "Playout Config", value: "playout", Component: PlayoutPanel},
  {label: "Transport Stream Distribution", value: "tsDistribution", Component: TransportStreamPanel, HideTab: (stream) => stream.originUrl?.includes("rtmp")}
];


const StreamDetailsPage = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  const [activeTab, setActiveTab] = useState(DETAILS_TABS[0].value);
  const [recordingInfo, setRecordingInfo] = useState(null);
  const [checkVersion, setCheckVersion] = useState(0);

  const streamSlug = streamStore.streamsByObjectId[params.id];
  const stream = streamSlug ? streamStore.streams[streamSlug] : undefined;

  const GetStatus = useCallback(async () => {
    await streamStore.CheckStatus({
      objectId: params.id,
      update: true
    });
  }, [params.id]);

  const LoadEdgeWriteTokenMeta = useCallback(async() => {
    const metadata = await streamStore.LoadEdgeWriteTokenMeta({
      objectId: params.id
    });

    if(metadata) {
      metadata.live_offering = (metadata.live_offering || []).map((item, i) => ({
        ...item,
        id: i
      }));

      setRecordingInfo(metadata);
    }
  }, [params.id]);

  useEffect(() => {
    if(params.id) {
      GetStatus();
      LoadEdgeWriteTokenMeta();
    }
  }, [GetStatus, LoadEdgeWriteTokenMeta]);

  const Refresh = useCallback(() => {
    setCheckVersion(prev => prev + 1);
    GetStatus();
    LoadEdgeWriteTokenMeta();
  }, [GetStatus, LoadEdgeWriteTokenMeta]);

  const DebouncedRefresh = useDebouncedCallback(Refresh, 500);

  if(!stream) {
    return <Loader />;
  }

  const streamActions = useMemo(() => (
    GetStreamActions({
      record: streamStore.streams?.[streamSlug],
      onCheckComplete: () => setCheckVersion(prev => prev + 1),
      onDeleteComplete: () => navigate("/streams"),
      view: "stream-details"
    })
  ));

  const primaryActions = useMemo(() => (
    streamActions.filter(a => a.primary && !a.hidden)
    .map(a => {
      a.buttonVariant = "filled";
      return a;
    })
  ));

  const secondaryActions = useMemo(() => streamActions.filter(a => !a.primary && !a.hidden));

  const actions = [
    {
      label: "Back",
      buttonVariant: "filled",
      color: "elv-gray.6",
      onClick: () => navigate(-1)
    },
    {
      label: "Refresh",
      buttonVariant: "outline",
      onClick: DebouncedRefresh
    },
    ...secondaryActions,
    ...primaryActions
  ]
    .filter(item => !item.hidden);

  return (
    <PageContainer
      title={`${streamStore.streams?.[streamSlug]?.title || stream.objectId}`}
      subtitle={stream.objectId}
      subtitleRightSection={
        <ActionIcon
          variant="subtle"
          color="gray.6"
          title="Open in Fabric Browser"
          size={22}
          onClick={() => {
            rootStore.OpenInFabricBrowser({
              libraryId: stream.libraryId,
              objectId: stream.objectId
            });
          }}
        >
          <IconExternalLink />
        </ActionIcon>
      }
      titleRightSection={
        <StatusIndicator
          status={stream.status}
          showWarning={streamStore.streams?.[streamSlug]?.quality && streamStore.streams[streamSlug].quality !== QUALITY_MAP.GOOD}
          size="md"
          withBorder
        />
      }
      actions={actions}
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List className={styles.list}>
          {
            DETAILS_TABS
              .filter(tab => tab.HideTab ? !tab.HideTab(stream) : tab)
              .map(tab => (
              <Tabs.Tab value={tab.value} key={`details-tabs-${tab.value}`} className={styles.tab}>
                <Title order={3} c="elv-gray.9">{tab.label}</Title>
              </Tabs.Tab>
            ))
          }
        </Tabs.List>
        {
          DETAILS_TABS.map(tab => (
            <Tabs.Panel value={tab.value} key={`details-panel-${tab.value}`}>
              {
                stream.status ?
                <tab.Component
                  key={`${tab.value}-${checkVersion}`}
                  checkVersion={checkVersion}
                  active={activeTab === tab.value}
                  status={stream.status}
                  slug={stream.slug}
                  recordingInfo={recordingInfo}
                  PageVersionCallback={setCheckVersion}
                  Refresh={Refresh}
                /> : <Loader />
              }
            </Tabs.Panel>
          ))
        }
      </Tabs>
    </PageContainer>
  );
});

export default StreamDetailsPage;
