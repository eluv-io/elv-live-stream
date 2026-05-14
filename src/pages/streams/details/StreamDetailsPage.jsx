import {useEffect, useState} from "react";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {rootStore, streamStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";
import {ActionIcon, Loader, Tabs, Title} from "@mantine/core";
import {useDebouncedCallback} from "@mantine/hooks";
import {DETAILS_TABS} from "@/utils/tabs.js";
import styles from "@/pages/streams/details/StreamDetails.module.css";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {GetStreamActions} from "@/utils/streamActions.jsx";
import {QUALITY_MAP} from "@/utils/constants.js";
import {IconExternalLink} from "@tabler/icons-react";

const StreamDetailsPage = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  let streamSlug, stream;
  const [pageVersion, setPageVersion] = useState(0);
  const [activeTab, setActiveTab] = useState(DETAILS_TABS[0].value);
  const [recordingInfo, setRecordingInfo] = useState(null);
  const [checkVersion, setCheckVersion] = useState(0);

  if(!streamSlug) {
    streamSlug = Object.keys(streamStore.streams || {}).find(slug => (
      streamStore.streams[slug].objectId === params.id
    ));
  }

  if(streamSlug) {
    stream = undefined;
    stream = streamStore.streams[streamSlug];
  }

  const GetStatus = async () => {
    await streamStore.CheckStatus({
      objectId: params.id,
      update: true
    });
  };

  const LoadEdgeWriteTokenMeta = async() => {
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
  };

  useEffect(() => {
    if(params.id) {
      GetStatus();
      LoadEdgeWriteTokenMeta();
    }
  }, [params.id]);

  const Refresh = () => {
    setPageVersion(prev => prev + 1);
    GetStatus();
    LoadEdgeWriteTokenMeta();
  };

  const DebouncedRefresh = useDebouncedCallback(Refresh, 500);

  if(!stream) {
    return <Loader />;
  }

  const streamActions = GetStreamActions({
    record: streamStore.streams?.[streamSlug],
    onCheckComplete: () => setCheckVersion(prev => prev + 1),
    onDeleteComplete: () => navigate("/streams"),
    view: "stream-details"
  });

  const primaryActions = streamActions.filter(a => a.primary && !a.hidden)
    .map(a => {
      a.buttonVariant = "filled";
      return a;
    });
  const secondaryActions = streamActions.filter(a => !a.primary && !a.hidden);

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
      key={`stream-details-${pageVersion}`}
      title={`Edit ${streamStore.streams?.[streamSlug]?.title || stream.objectId}`}
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
                  checkVersion={checkVersion}
                  active={activeTab === tab.value}
                  status={stream.status}
                  slug={stream.slug}
                  currentDrm={stream.drm}
                  simpleWatermark={stream.simpleWatermark}
                  imageWatermark={stream.imageWatermark}
                  forensicWatermark={stream.forensicWatermark}
                  title={stream.title}
                  embedUrl={stream.embedUrl}
                  url={stream.originUrl}
                  recordingInfo={recordingInfo}
                  currentRetention={stream.partTtl}
                  currentPersistent={stream.persistent}
                  currentConnectionTimeout={stream.connectionTimeout}
                  currentReconnectionTimeout={stream.reconnectionTimeout}
                  currentDvrEnabled={stream.dvrEnabled}
                  currentDvrMaxDuration={stream.dvrMaxDuration}
                  currentDvrStartTime={stream.dvrStartTime}
                  currentConfigProfile={stream.configProfile}
                  libraryId={stream.libraryId}
                  currentWatermarkType={stream.watermarkType}
                  PageVersionCallback={setPageVersion}
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
