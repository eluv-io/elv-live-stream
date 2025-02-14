import {useEffect, useState} from "react";
import PageHeader from "@/components/header/PageHeader";
import {useNavigate, useParams} from "react-router-dom";
import {streamStore, editStore, dataStore} from "@/stores";
import {observer} from "mobx-react-lite";
import {Loader, Tabs, Text} from "@mantine/core";
import {useDebouncedCallback, useDisclosure} from "@mantine/hooks";
import {DETAILS_TABS, STATUS_MAP} from "@/utils/constants";
import classes from "@/pages/stream-details/StreamDetails.module.css";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {StreamIsActive} from "@/utils/helpers";

const StreamDetailsPage = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  let streamSlug, stream;
  const [showModal, {open, close}] = useDisclosure(false);
  const [modalData, setModalData] = useState({});
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
        setModalData({
          title: "Delete Stream",
          message: "Are you sure you want to delete the stream? This action cannot be undone.",
          confirmText: "Delete",
          ConfirmCallback: async () => await editStore.DeleteStream({objectId: stream.objectId})
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
          title: "Start Stream",
          message: "Are you sure you want to start the stream?",
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
          title: "Stop Stream",
          message: "Are you sure you want to stop the stream?",
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
    <div key={`stream-details-${pageVersion}`}>
      <PageHeader
        title={`Edit ${streamStore.streams?.[streamSlug]?.display_title || streamStore.streams?.[streamSlug]?.title || stream.objectId}`}
        subtitle={stream.objectId}
        status={stream.status}
        quality={streamStore.streams?.[streamSlug]?.quality}
        actions={actions}
      />
      <Tabs className={classes.root} value={activeTab} onChange={setActiveTab}>
        <Tabs.List className={classes.list}>
          {
            DETAILS_TABS.map(tab => (
              <Tabs.Tab value={tab.value} key={`details-tabs-${tab.value}`} className={classes.tab}>
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
        title={modalData.title}
        message={modalData.message}
        confirmText={modalData.confirmText}
        show={showModal}
        CloseCallback={close}
        ConfirmCallback={modalData.ConfirmCallback}
      />
    </div>
  );
});

export default StreamDetailsPage;
