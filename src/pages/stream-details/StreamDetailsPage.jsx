import {useEffect, useState} from "react";
import StatusText from "@/components/status-text/StatusText.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {streamStore, dataStore, modalStore} from "@/stores";
import {observer} from "mobx-react-lite";
import {Loader, Tabs, Title} from "@mantine/core";
import {useDebouncedCallback} from "@mantine/hooks";
import {DETAILS_TABS, STATUS_MAP} from "@/utils/constants";
import styles from "@/pages/stream-details/StreamDetails.module.css";
import {StreamIsActive} from "@/utils/helpers";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {notifications} from "@mantine/notifications";

const StreamDetailsPage = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  let streamSlug, stream;
  const [pageVersion, setPageVersion] = useState(0);
  const [activeTab, setActiveTab] = useState(DETAILS_TABS[0].value);
  const [recordingInfo, setRecordingInfo] = useState(null);

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
    const metadata = await dataStore.LoadEdgeWriteTokenMeta({
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

  const DebouncedRefresh = useDebouncedCallback(() => {
    setPageVersion(prev => prev + 1);
    GetStatus();
    LoadEdgeWriteTokenMeta();
  }, 500);

  if(!stream) {
    return <Loader />;
  }

  const actions = [
    {
      label: "Back",
      variant: "filled",
      uppercase: true,
      onClick: () => navigate(-1)
    },
    {
      label: "Delete",
      variant: "outline",
      uppercase: true,
      disabled: StreamIsActive(streamStore.streams?.[streamSlug]?.status),
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: streamStore.streams?.[streamSlug].objectId,
            name: streamStore.streams?.[streamSlug].title,
          },
          slug: streamSlug,
          Callback: () => navigate("/streams"),
          op: "DELETE",
          notifications
        });
      }
    },
    {
      label: "Refresh",
      variant: "outline",
      onClick: DebouncedRefresh
    }
  ];

  if([STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED].includes(streamStore.streams?.[streamSlug]?.status)) {
    actions.push({
      label: "Start",
      variant: "filled",
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: streamStore.streams?.[streamSlug].objectId,
            name: streamStore.streams?.[streamSlug].title
          },
          Callback: () => LoadEdgeWriteTokenMeta(),
          op: "START",
          slug: stream.slug,
          notifications
        });
      }
    });
  }

  if([STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(streamStore.streams?.[streamSlug]?.status)) {
    actions.push({
      label: "Stop",
      variant: "outline",
      onClick: () => {
        modalStore.SetModal({
          data: {
            objectId: streamStore.streams?.[streamSlug].objectId,
            name: streamStore.streams?.[streamSlug].title,
          },
          Callback: () => DebouncedRefresh(),
          op: "STOP",
          slug: stream.slug,
          notifications
        });
      }
    });
  }

  return (
    <PageContainer
      key={`stream-details-${pageVersion}`}
      title={`Edit ${streamStore.streams?.[streamSlug]?.title || stream.objectId}`}
      subtitle={stream.objectId}
      titleRightSection={
        <StatusText
          status={stream.status}
          quality={streamStore.streams?.[streamSlug]?.quality}
          size="md"
          withBorder
        />
      }
      actions={actions}
    >
      <Tabs className={styles.root} value={activeTab} onChange={setActiveTab}>
        <Tabs.List className={styles.list}>
          {
            DETAILS_TABS.map(tab => (
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
                  currentConnectionTimeout={stream.connectionTimeout}
                  currentReconnectionTimeout={stream.reconnectionTimeout}
                  currentDvrEnabled={stream.dvrEnabled}
                  currentDvrMaxDuration={stream.dvrMaxDuration}
                  currentDvrStartTime={stream.dvrStartTime}
                  currentPlayoutProfile={stream.playoutLadderProfile}
                  libraryId={stream.libraryId}
                  currentWatermarkType={stream.watermarkType}
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
