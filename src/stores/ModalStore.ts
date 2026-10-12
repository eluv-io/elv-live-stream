import {makeAutoObservable, observable} from "mobx";
import {STATUS_MAP, StreamStatus} from "@/utils/constants";
import type RootStore from "@/stores/RootStore";
import {StreamRecord} from "@/utils/stream";

export type StreamOp = "CHECK" | "START" | "STOP" | "RESTART" | "DEACTIVATE" | "DELETE";

interface BatchActionProps {
  statuses: StreamStatus[];
  skipLabel: string;
}

interface DetailData {
  id: string | null;
  idKey: string;
  name: string;
  nameKey: string;
}

interface BatchSummary {
  readyCount: number;
  notReadyCount: number;
  op: StreamOp;
  skipLabel: string;
}

interface ModalDataProps {
  objectId: string | null;
  show?: boolean;
  title: string;
  message: string;
  name: string;
  loadingText: string;
  ConfirmCallback: (() => any) | null;
  CloseCallback: (() => any) | null;
  confirmText: string;
  detailData?: DetailData | null;
  batchSummary?: BatchSummary | null;
  customMessage?: string;
  dependentsLoading?: boolean;
  dependentCount?: number;
  includeDependents?: boolean;
  OnIncludeDependentsChange?: ((include: boolean) => void) | null;
}

interface NotificationResult {
  success: { title: string; message: string };
  error: { title: string; message: string };
}

interface OpConfig {
  title: string;
  message: string;
  messageInactive?: string;
  confirmText: string;
  Method: (params: { objectId?: string; slug?: string }) => any;
  notification: (params?: { objectId?: string }) => NotificationResult;
  batchNotification?: (count: number) => NotificationResult;
  errorMessage: string;
}

interface NotificationSystem {
  show: (notification: { title: string; message: string; color?: string }) => void;
}

interface BatchStreamRecord extends StreamRecord {
  status: StreamStatus;
}

type BatchOp = Exclude<StreamOp, "CHECK">;

interface HandleStreamActionParams {
  records: StreamRecord[];
  op: StreamOp;
  Callback?: () => void | Promise<void>;
  notifications?: NotificationSystem;
}

interface SetBatchModalParams {
  records: BatchStreamRecord[];
  op: BatchOp;
  Callback?: () => void | Promise<void>;
  notifications?: NotificationSystem;
}

interface SetModalParams {
  data: Partial<Omit<ModalDataProps, "ConfirmCallback" | "CloseCallback">> & { objectId?: string | null; name?: string };
  op: StreamOp;
  activeMessage?: boolean;
  slug: string;
  Callback?: () => void | Promise<void>;
  notifications?: NotificationSystem;
}

const BATCH_READY_STATUSES: Record<BatchOp, BatchActionProps> = {
  START: {statuses: [STATUS_MAP.INACTIVE, STATUS_MAP.STOPPED], skipLabel: "already active or not configured"},
  STOP: {statuses: [STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED], skipLabel: "not currently running"},
  RESTART: {statuses: [STATUS_MAP.STARTING, STATUS_MAP.RUNNING, STATUS_MAP.STALLED, STATUS_MAP.STOPPED], skipLabel: "has no active recording session"},
  DEACTIVATE: {statuses: [STATUS_MAP.STOPPED], skipLabel: "not in a stopped state"},
  DELETE: {statuses: [STATUS_MAP.INACTIVE, STATUS_MAP.UNINITIALIZED, STATUS_MAP.UNCONFIGURED, STATUS_MAP.INITIALIZED], skipLabel: "currently active"}
};

// Centralizes control over all modal windows, managing their visibility, content, and properties.
class ModalStore {
  rootStore: RootStore;
  modalData: ModalDataProps = {
    objectId: null,
    show: false,
    title: "",
    message: "",
    name: "",
    loadingText: "",
    ConfirmCallback: null,
    CloseCallback: null,
    confirmText: "",
  };

  // Alternate transcodes of the stream in the open START/STOP modal, with live status.
  dependents: {id: string, status: StreamStatus}[] = [];

  OP_MAP: Record<StreamOp, OpConfig> = {
    "CHECK": {
      title: "Check Stream Confirmation",
      message: "Are you sure you want to check the stream?",
      messageInactive: "Are you sure you want to check the stream? This will override your saved configuration.",
      confirmText: "Check Stream",
      Method: ({objectId, slug}) => this.rootStore.streamEditStore.ConfigureStream({
        objectId,
        slug
      }),
      notification: () => {
        return {
          success: {
            title: "Probed Stream",
            message: "Stream object was successfully probed",
          },
          error: {
            title: "Error",
            message: "Unable to probe stream",
          }
        };
      },
      errorMessage: "Configure Modal - Failed to check stream"
    },
    "START": {
      title: "Start Stream Confirmation",
      message: "Are you sure you want to start the stream? Once started, the stream will go live, and any changes may require restarting. Please confirm before proceeding.",
      confirmText: "Start Stream",
      Method: ({objectId, slug}) => this.rootStore.streamStore.StartStream({objectId, slug}),
      notification: () => ({
        success: {title: "Started Stream", message: "Stream was successfully started"},
        error: {title: "Error", message: "Unable to start stream"}
      }),
      batchNotification: (count) => ({
        success: {title: "Started Streams", message: `${count} ${count === 1 ? "stream" : "streams"} successfully started`},
        error: {title: "Error", message: "Unable to start one or more streams"}
      }),
      errorMessage: ""
    },
    "STOP": {
      title: "Stop Stream Confirmation",
      message: "Are you sure you want to stop the stream? Once stopped, viewers will be disconnected, and the stream cannot be resumed. You can start a new session later if needed.",
      confirmText: "Stop Stream",
      Method: ({objectId, slug}) => this.rootStore.streamStore.OperateLRO({
        objectId,
        slug,
        operation: "STOP"
      }),
      notification: () => ({
        success: {title: "Stopped Stream", message: "Stream was successfully stopped"},
        error: {title: "Error", message: "Unable to stop stream"}
      }),
      batchNotification: (count) => ({
        success: {title: "Stopped Streams", message: `${count} ${count === 1 ? "stream" : "streams"} successfully stopped`},
        error: {title: "Error", message: "Unable to stop one or more streams"}
      }),
      errorMessage: ""
    },
    "RESTART": {
      title: "Restart Recording Confirmation",
      message: "Are you sure you want to restart the recording? The current recording session will be stopped and a new one started with a new edge write token.",
      confirmText: "Restart Recording",
      Method: ({objectId, slug}) => this.rootStore.streamStore.RestartRecording({
        objectId,
        slug
      }),
      notification: () => ({
        success: {title: "Restarted Recording", message: "Stream recording was successfully restarted"},
        error: {title: "Error", message: "Unable to restart stream recording"}
      }),
      batchNotification: (count) => ({
        success: {title: "Restarted Recordings", message: `${count} ${count === 1 ? "stream" : "streams"} successfully restarted`},
        error: {title: "Error", message: "Unable to restart one or more recordings"}
      }),
      errorMessage: ""
    },
    "DEACTIVATE": {
      title: "Deactivate Stream Confirmation",
      message: "Are you sure you want to deactivate the stream?",
      confirmText: "Deactivate Stream",
      Method: ({objectId, slug}) => this.rootStore.streamStore.DeactivateStream({
        objectId,
        slug
      }),
      notification: () => ({
        success: {title: "Deactivated Stream", message: "Stream was successfully deactivated"},
        error: {title: "Error", message: "Unable to deactivate stream"}
      }),
      batchNotification: (count) => ({
        success: {title: "Deactivated Streams", message: `${count} ${count === 1 ? "stream" : "streams"} successfully deactivated`},
        error: {title: "Error", message: "Unable to deactivate one or more streams"}
      }),
      errorMessage: ""
    },
    "DELETE": {
      title: "Delete Stream Confirmation",
      message: "Are you sure you want to delete the stream?",
      confirmText: "Delete Stream",
      Method: ({objectId}) => this.rootStore.streamEditStore.DeleteStream({objectId}),
      notification: ({objectId}) => ({
        success: {title: "Stream Deleted", message: `${objectId} was successfully deleted`},
        error: {title: "Error", message: "Unable to delete object"}
      }),
      batchNotification: (count) => ({
        success: {title: "Streams Deleted", message: `${count} ${count === 1 ? "stream" : "streams"} successfully deleted`},
        error: {title: "Error", message: "Unable to delete one or more streams"}
      }),
      errorMessage: ""
    }
  };

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {
      OP_MAP: false,
      dependents: observable.ref,
      // modalData holds JSX React elements (customMessage, loadingText). MobX
      // deep-observes plain objects, and a React element is a plain object — in
      // dev it carries a `_debugTask` whose `run` method gets wrapped by MobX's
      // action machinery, throwing "'run' called with illegal receiver". Keeping
      // modalData as a ref stops MobX from converting the elements inside it.
      modalData: observable.ref
    }, {autoBind: true});
  }

*HandleStreamAction({records, op, Callback, notifications}: HandleStreamActionParams) {
    const {Method, errorMessage, batchNotification, notification} = this.OP_MAP[op];
    const isBatch = records.length > 1;
    const notif = isBatch ? batchNotification(records.length) : notification({objectId: records[0]?.objectId});

    try {
      if(isBatch && op === "DELETE") {
        yield this.rootStore.streamEditStore.DeleteStreamBatch({objects: records});
      } else {
        yield Promise.all(records.map(record => Method({objectId: record.objectId, slug: record.slug})));
      }

      if(notifications && notif) {
        notifications.show({title: notif.success.title, message: notif.success.message});
      }

      if(Callback && typeof Callback === "function") {
        const result = Callback();
        if(result instanceof Promise) { yield result; }
      }
    } catch(error) {
      if(errorMessage) {
        // eslint-disable-next-line no-console
        console.error(errorMessage, error);
      }

      if(notifications && notif) {
        notifications.show({title: notif.error.title, color: "red", message: notif.error.message});
      }

      throw error;
    }
  }

  StreamOpMessaging = ({
    op,
    activeMessage=true,
    customMessage
  }: {op: StreamOp, activeMessage?: boolean, customMessage?: string}) : {message: string, customMessage: string, title: string, confirmText: string} => {

    if(!this.OP_MAP[op]) {
      // eslint-disable-next-line no-console
      console.error(`Unknown operation: ${op}`);
      return;
    }

    const {title, message, messageInactive, confirmText} = this.OP_MAP[op];
    let printMessage = activeMessage ? message : messageInactive;

    return {
      message: printMessage,
      customMessage,
      title,
      confirmText
    };
  };

  SetModal = ({
    data,
    op,
    activeMessage,
    slug,
    Callback,
    notifications
  }: SetModalParams): void => {
    this.dependents = [];
    const checkDependents = (op === "START" || op === "STOP") && !!data.objectId;

    this.modalData = {
      ...this.modalData,
      ...this.StreamOpMessaging({
        op,
        activeMessage,
        customMessage: data.customMessage
      }),
      ...data,
      detailData: {
        id: data.objectId,
        idKey: "Stream ID:",
        name: data.name,
        nameKey: "Stream Name:"
      },
      ConfirmCallback: async() => {
        const dependentIds = await this.ReadyDependentIds(op);
        const parent = this.HandleStreamAction({
          records: [{objectId: data.objectId, slug}],
          op,
          Callback,
          notifications
        });
        const dependents = Promise.allSettled(
          dependentIds.map(id => this.OP_MAP[op].Method({objectId: id, slug: ""}))
        );

        // Dependents are reported separately so one failure doesn't mask the others or the parent.
        let parentError;
        try { await parent; } catch(error) { parentError = error; }

        const failed = (await dependents).filter(result => result.status === "rejected");
        if(failed.length > 0) {
          // eslint-disable-next-line no-console
          console.error(`Unable to ${op.toLowerCase()} dependent streams`, failed);
          notifications?.show({
            title: "Error",
            color: "red",
            message: `Unable to ${op.toLowerCase()} ${failed.length} of ${dependentIds.length} dependent streams`
          });
        }

        if(parentError) { throw parentError; }
      },
      CloseCallback: () => this.ResetModal(),
      show: true,
      dependentsLoading: checkDependents
    };

    if(checkDependents) {
      this.LoadDependents({objectId: data.objectId});
    }
  };

  // Shows the "Include dependent streams" checkbox when the stream has alternate transcodes.
  *LoadDependents({objectId}: {objectId: string}): Generator<any, void> {
    try {
      const client = this.rootStore.streamStore.client;
      const libraryId = yield client.ContentObjectLibraryId({objectId});
      const ids: string[] = (yield client.ContentObjectMetadata({
        libraryId,
        objectId,
        metadataSubtree: "live_recording_config/alternate_transcodes"
      })) || [];

      if(ids.length === 0) { return; }

      const statuses = yield this.rootStore.streamStore.StreamStatuses(ids);

      // Modal was closed or replaced while loading.
      if(this.modalData.objectId !== objectId) { return; }

      this.dependents = ids.map(id => ({id, status: statuses[id]?.status}));
      this.modalData = {
        ...this.modalData,
        dependentCount: ids.length,
        includeDependents: true,
        OnIncludeDependentsChange: this.SetIncludeDependents
      };
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to load dependent streams", error);
    } finally {
      if(this.modalData.objectId === objectId) {
        this.modalData = {...this.modalData, dependentsLoading: false};
      }
    }
  }

  // Re-checks dependent statuses at confirm time, since the open-time snapshot may be stale.
  ReadyDependentIds = async(op: StreamOp): Promise<string[]> => {
    if(!this.modalData.includeDependents || this.dependents.length === 0) { return []; }

    const {statuses: readyStatuses} = BATCH_READY_STATUSES[op as BatchOp];
    const current = await this.rootStore.streamStore.StreamStatuses(this.dependents.map(d => d.id));

    return this.dependents
      .filter(d => readyStatuses.includes(current[d.id]?.status as StreamStatus))
      .map(d => d.id);
  };

  SetIncludeDependents = (include: boolean) => {
    this.modalData = {...this.modalData, includeDependents: include};
  };

  SetBatchModal = ({records, op, Callback, notifications}: SetBatchModalParams): void => {
    const {title, message, confirmText} = this.OP_MAP[op];
    const {statuses: readyStatuses, skipLabel} = BATCH_READY_STATUSES[op];
    const readyCount = records.filter(r => readyStatuses.includes(r.status)).length;
    const notReadyCount = records.length - readyCount;

    this.modalData = {
      ...this.modalData,
      title,
      message,
      confirmText,
      show: true,
      batchSummary: {readyCount, notReadyCount, op, skipLabel},
      ConfirmCallback: () => this.HandleStreamAction({
        records: records.filter(r => readyStatuses.includes(r.status)),
        op,
        Callback,
        notifications
      }),
      CloseCallback: () => this.ResetModal()
    };
  };

  ResetModal = () => {
    // Hide modal, then reset data. modalData is a ref observable, so reassign
    // the whole object rather than mutating a property to trigger reactions.
    this.modalData = {...this.modalData, show: false};

    setTimeout(() => {
      this.modalData = {
        objectId: null,
        title: "",
        message: "",
        name: "",
        detailData: null,
        ConfirmCallback: null,
        CloseCallback: null,
        confirmText: "",
        loadingText: ""
      };
    }, 300);
  };
}

export default ModalStore;
