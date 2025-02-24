import {useEffect, useState} from "react";
import StatusText from "@/components/status-text/StatusText.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {streamStore, editStore, dataStore} from "@/stores";
import {observer} from "mobx-react-lite";
import {Loader, Tabs, Text} from "@mantine/core";
import {useDebouncedCallback, useDisclosure} from "@mantine/hooks";
import {DETAILS_TABS, STATUS_MAP} from "@/utils/constants";
import styles from "@/pages/stream-details/StreamDetails.module.css";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {StreamIsActive} from "@/utils/helpers";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {notifications} from "@mantine/notifications";

const StreamDetailsPage = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  let streamSlug, stream;
  const [showModal, {open, close}] = useDisclosure(false);
  const [pageVersion, setPageVersion] = useState(0);
  const [activeTab, setActiveTab] = useState(DETAILS_TABS[0].value);
  const [recordingInfo, setRecordingInfo] = useState(null);

  const initModalData = {
    title: "",
    message: "",
    name: "",
    loadingText: "",
    objectId: "",
    confirmText: "",
    ConfirmCallback: null,
    CloseCallback: null
  };

  const [modalData, setModalData] = useState(initModalData);

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
        setModalData({
          title: "Delete Stream Confirmation",
          message: "Are you sure you want to delete the stream?",
          confirmText: "Delete Stream",
          danger: true,
          objectId: streamStore.streams?.[streamSlug].objectId,
          name: streamStore.streams?.[streamSlug].title,
          ConfirmCallback: async () => {
            try {
              await editStore.DeleteStream({objectId: stream.objectId});
            } catch(_e) {
              notifications.show({
                title: "Error",
                color: "red",
                message: "Unable to delete object"
              });
            } finally {
              notifications.show({
                title: "Content object deleted",
                message: `${stream.objectId} successfully deleted`
              });

              navigate("/streams");
            }
          }
        });

        open();
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
      variant: "outline",
      onClick: () => {
        setModalData({
          title: "Start Stream Confirmation",
          message: "Are you sure you want to start the stream? Once started, the stream will go live, and any changes may require restarting. Please confirm before proceeding.",
          objectId: streamStore.streams?.[streamSlug].objectId,
          name: streamStore.streams?.[streamSlug].title,
          confirmText: "Start Stream",
          ConfirmCallback: async () => {
            await streamStore.StartStream({slug: streamSlug});
            await LoadEdgeWriteTokenMeta();
            close();
          }
        });
        open();
      }
    });
  }

  if([STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED].includes(streamStore.streams?.[streamSlug]?.status)) {
    actions.push({
      label: "Stop",
      variant: "outline",
      onClick: () => {
        setModalData({
          title: "Stop Stream Confirmation",
          confirmText: "Stop Stream",
          message: "Are you sure you want to stop the stream? Once stopped, viewers will be disconnected, and the stream cannot be resumed. You can start a new session later if needed.",
          objectId: streamStore.streams?.[streamSlug].objectId,
          name: streamStore.streams?.[streamSlug].title,
          ConfirmCallback: async () => {
            await streamStore.OperateLRO({
              objectId: stream.objectId,
              slug: streamSlug,
              operation: "STOP"
            });
            close();

            DebouncedRefresh();
          }
        });
        open();
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
                <Text fw="400" size="md">{tab.label}</Text>
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
      <ConfirmModal
        {...modalData}
        show={showModal}
        CloseCallback={close}
      />
    </PageContainer>
  );
});

export default StreamDetailsPage;
