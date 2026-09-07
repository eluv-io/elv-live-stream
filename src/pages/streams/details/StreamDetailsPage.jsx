import {useCallback, useEffect, useRef, useState} from "react";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";
import {useBlocker, useNavigate, useParams} from "react-router-dom";
import {rootStore, streamStore, streamSaveStore, dataStore} from "@/stores/index.ts";
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
  const [pendingBack, setPendingBack] = useState(false);

  // Blocks in-app navigation (sidebar links, browser back/forward, navigate())
  // away from this page while a config tab has unsaved changes. Only guards
  // actual route changes - switching within-page tabs doesn't change the
  // pathname, so it's left alone.
  const blocker = useBlocker(
    useCallback(
      ({currentLocation, nextLocation}) =>
        streamSaveStore.anyDirty && currentLocation.pathname !== nextLocation.pathname,
      []
    )
  );

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

  // Reset during render, not in the effect below: on mount, child effects
  // (GeneralPanel/RecordingPanel/PlayoutPanel registering themselves with
  // streamSaveStore) run before this component's own effects, so resetting
  // streamSaveStore.panels from an effect here would wipe out registrations
  // that already happened. Render runs parent-before-child, so this always
  // precedes them.
  const resetStreamIdRef = useRef(null);
  if(params.id && resetStreamIdRef.current !== params.id) {
    resetStreamIdRef.current = params.id;
    streamSaveStore.Reset();
  }

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
    dataStore.LoadAccessGroups({force: true});
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

  // Checks dirty state before ever calling navigate(-1). React Router can only
  // block a POP navigation (browser back/forward, navigate(-1)) after letting
  // it happen and reverting it - a round trip through history that's visibly
  // slow. Pre-checking here means a dirty Back click never becomes a blocked
  // POP in the first place, so it can't hit that delay.
  const HandleBack = () => {
    if(streamSaveStore.anyDirty) {
      setPendingBack(true);
    } else {
      navigate(-1);
    }
  };

  if(!stream) {
    return <Loader />;
  }

  const streamActions = GetStreamActions({
    record: streamStore.streams?.[streamSlug],
    onCheckComplete: () => setCheckVersion(prev => prev + 1),
    onDeleteComplete: () => navigate("/streams"),
    view: "stream-details"
  }).map(action => (
    action.mutatesStream && streamSaveStore.anyDirty ?
      {...action, disabled: true, disabledTooltip: "Save or discard your changes to use stream controls"} :
      action
  ));

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
      onClick: HandleBack
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
      title={streamStore.streams?.[streamSlug]?.title || stream.objectId}
      titleBadge={
        <StatusIndicator
          status={stream.status}
          showWarning={streamStore.streams?.[streamSlug]?.quality && streamStore.streams[streamSlug].quality !== QUALITY_MAP.GOOD}
          size="md"
          withBorder
        />
      }
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
              Discard Changes
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

      <ConfirmModal
        show={blocker.state === "blocked" || pendingBack}
        title="Unsaved Changes"
        message="Are you sure you want to leave this page? Your unsaved changes will be lost."
        confirmText="Leave Without Saving"
        cancelText="Cancel"
        ConfirmCallback={async () => {
          streamSaveStore.DiscardAll();

          if(pendingBack) {
            setPendingBack(false);
            navigate(-1);
          } else {
            blocker.proceed();
          }
        }}
        CloseCallback={() => {
          setPendingBack(false);

          if(blocker.state === "blocked") {
            blocker.reset();
          }
        }}
      />
    </PageContainer>
  );
});

export default StreamDetailsPage;
