import {useCallback, useEffect, useState} from "react";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {rootStore, streamStore, streamSaveStore} from "@/stores/index.ts";
import {observer} from "mobx-react-lite";
import {ActionIcon, Button, Flex, Indicator, Loader, Tabs, Title} from "@mantine/core";
import {useDebouncedCallback} from "@mantine/hooks";
import {notifications} from "@mantine/notifications";
import styles from "@/pages/streams/details/StreamDetails.module.css";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import {GetStreamActions} from "@/utils/streamActions.jsx";
import {QUALITY_MAP} from "@/utils/constants.ts";
import {IconExternalLink} from "@tabler/icons-react";
import SummaryPanel from "@/pages/streams/details/summary/SummaryPanel.jsx";
import GeneralPanel from "@/pages/streams/details/general/GeneralPanel.jsx";
import RecordingPanel from "@/pages/streams/details/recording/RecordingPanel.jsx";
import PlayoutPanel from "@/pages/streams/details/playout/PlayoutPanel.jsx";
import TransportStreamPanel from "@/pages/streams/details/transport-stream/TransportStreamPanel.jsx";

const DETAILS_TABS = [
  {label: "Summary", value: "status", Component: SummaryPanel},
  {label: "General Config", value: "general", Component: GeneralPanel, savable: true},
  {label: "Recording Config", value: "recording", Component: RecordingPanel, savable: true},
  {label: "Playout Config", value: "playout", Component: PlayoutPanel, savable: true},
  {label: "Transport Stream Distribution", value: "tsDistribution", Component: TransportStreamPanel, HideTab: (stream) => stream.originUrl?.includes("rtmp")}
];


const StreamDetailsPage = observer(() => {
  const navigate = useNavigate();
  const params = useParams();
  const [activeTab, setActiveTab] = useState(DETAILS_TABS[0].value);
  const [recordingInfo, setRecordingInfo] = useState(null);
  const [checkVersion, setCheckVersion] = useState(0);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

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
      streamSaveStore.Reset();
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

  const HandleSaveAll = async () => {
    try {
      await streamSaveStore.SaveAll();

      notifications.show({
        title: <NotificationMessage>Updated {stream.title || stream.objectId}</NotificationMessage>,
        message: "Changes have been applied successfully"
      });

      Refresh();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save changes", error);

      const failedTab = DETAILS_TABS.find(tab => tab.value === streamSaveStore.failedPanelId);

      notifications.show({
        title: "Error",
        color: "red",
        message: `Unable to save ${failedTab?.label ?? "changes"}. Please review that tab and try again.`
      });
    }
  };

  const HandleDiscardAll = () => {
    streamSaveStore.DiscardAll();
  };

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
      {/* keepMountedMode="display-none": Mantine's default "activity" mode hides
          inactive panels via React's Activity component, which runs useEffect
          cleanup on hide and reruns it on show - that would unregister/clear
          each panel's dirty state from streamSaveStore every time its tab is
          switched away from. Plain CSS hiding avoids that effect teardown. */}
      <Tabs value={activeTab} onChange={setActiveTab} keepMountedMode="display-none">
        <Flex justify="space-between" align="center" className={styles.toolbar}>
          <Tabs.List className={styles.list}>
            {
              DETAILS_TABS
                .filter(tab => tab.HideTab ? !tab.HideTab(stream) : tab)
                .map(tab => (
                <Tabs.Tab value={tab.value} key={`details-tabs-${tab.value}`} className={styles.tab}>
                  <Indicator
                    disabled={!(tab.savable && streamSaveStore.IsDirty(tab.value))}
                    color="elv-blue.3"
                    size={8}
                    offset={-4}
                    position="top-end"
                  >
                    <Title order={3} c="elv-gray.9">{tab.label}</Title>
                  </Indicator>
                </Tabs.Tab>
              ))
            }
          </Tabs.List>
          <Flex gap={12} align="center">
            <Button
              variant="outline"
              color="elv-gray.6"
              disabled={!streamSaveStore.anyDirty || streamSaveStore.saving}
              onClick={() => setShowDiscardModal(true)}
            >
              Discard
            </Button>
            <Button
              disabled={!streamSaveStore.anyDirty}
              loading={streamSaveStore.saving}
              onClick={HandleSaveAll}
            >
              Save
            </Button>
          </Flex>
        </Flex>
        {
          DETAILS_TABS.map(tab => (
            <Tabs.Panel value={tab.value} key={`details-panel-${tab.value}`}>
              {
                stream.status ?
                <tab.Component
                  key={`${tab.value}-${params.id}-${checkVersion}`}
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

      <ConfirmModal
        show={showDiscardModal}
        title="Discard Changes"
        message="Are you sure you want to discard your unsaved changes? This cannot be undone."
        confirmText="Discard Changes"
        cancelText="Cancel"
        ConfirmCallback={async () => HandleDiscardAll()}
        CloseCallback={() => setShowDiscardModal(false)}
      />
    </PageContainer>
  );
});

export default StreamDetailsPage;
