import {makeAutoObservable} from "mobx";

class ModalStore {
  modalData = {
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

  OP_MAP = {
    "CHECK": {
      title: "Check Stream Confirmation",
      message: "Are you sure you want to check the stream?",
      messageInactive: "Are you sure you want to check the stream? This will override your saved configuration.",
      confirmText: "Check Stream",
      Method: ({objectId, slug}) => this.rootStore.streamStore.ConfigureStream({
        objectId,
        slug
      }),
      notification: () => {
        return {
          success: {
            title: "Probed Stream",
            message: "Stream object was successfully created and probed",
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
      title: "Start Stream",
      message: "Are you sure you want to start the stream? Once started, the stream will go live, and any changes may require restarting. Please confirm before proceeding.",
      confirmText: "Start Stream",
      Method: ({slug}) => this.rootStore.streamStore.StartStream({slug}),
      notification: () => {
        return {
          success: {
            title: "Started Stream",
            message: "Stream object was successfully started"
          },
          error: {
            title: "Error",
            message: "Unable to start stream"
          }
        };
      },
      errorMessage: ""
    },
    "STOP": {
      title: "Stop Stream",
      message: "Are you sure you want to stop the stream? Once stopped, viewers will be disconnected, and the stream cannot be resumed. You can start a new session later if needed.",
      confirmText: "Stop Stream",
      Method: ({objectId, slug}) => this.rootStore.streamStore.OperateLRO({
        objectId,
        slug,
        operation: "STOP"
      }),
      notification: () => {
        return {
          success: {
            title: "Stopped Stream",
            message: "Stream object was successfully stopped"
          },
          error: {
            title: "Error",
            message: "Unable to stop stream"
          }
        };
      },
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
      notification: () => {
        return {
          success: {
            title: "Deactivated Stream",
            message: "Stream object was successfully deactivated"
          },
          error: {
            title: "Error",
            message: "Unable to deactivate stream"
          }
        };
      },
      errorMessage: ""
    },
    "DELETE": {
      title: "Delete Stream Confirmation",
      message: "Are you sure you want to delete the stream?",
      confirmText: "Delete Stream",
      Method: ({objectId}) => this.rootStore.editStore.DeleteStream({objectId}),
      notification: ({objectId}) => {
        return {
          success: {
            title: "Stream Deleted",
            message: `${objectId} was successfully deleted`
          },
          error: {
            title: "Error",
            message: "Unable to delete object"
          }
        };
      },
      errorMessage: ""
    }
  };

  constructor(rootStore) {
    makeAutoObservable(this, {
      OP_MAP: false
    });

    this.rootStore = rootStore;
  }

  HandleStreamAction = async({
    objectId,
    slug,
    op,
    Callback,
    notifications
  }) => {
    const {Method, errorMessage} = this.OP_MAP[op];

    const notification = this.OP_MAP[op].notification({objectId});

    try {
      await Method({objectId, slug});

      if(notifications && notification) {
        notifications.show({
          title: notification.success.title,
          message: notification.success.message
        });
      }

      if(Callback && typeof Callback === "function") {
        const result = Callback();

        if(result instanceof Promise) {
          await result;
        }
      }
    } catch(error) {
      if(errorMessage) {
        // eslint-disable-next-line no-console
        console.error(errorMessage, error);
      }

      if(notifications && notification) {
        notifications.show({
          title: notification.error.title,
          color: "red",
          message: notification.error.message
        });
      }

      throw error;
    }
  };

  StreamOpMessaging = ({
    op,
    activeMessage=true,
    customMessage
  }) => {

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
  }) => {
    this.modalData = {
      ...this.modalData,
      ...this.StreamOpMessaging({
        op,
        activeMessage,
        customMessage: data.customMessage
      }),
      ...data,
      ConfirmCallback: () => this.HandleStreamAction({
        objectId: data.objectId,
        op,
        slug,
        Callback,
        notifications
      }),
      CloseCallback: () => this.ResetModal(),
      show: true
    };
  };

  ResetModal = () => {
    // Hide modal, then reset data
    this.modalData.show = false;

    setTimeout(() => {
      this.modalData = {
        objectId: null,
        title: "",
        message: "",
        name: "",
        ConfirmCallback: null,
        CloseCallback: null,
        confirmText: "",
        loadingText: ""
      };
    }, 300);
  };
}

export default ModalStore;
