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

  CONFIRM_MODAL_OP_DATA = {
    "START": {
      title: "Start Stream Configuration",
      message: "Are you sure you want to start the stream? Once started, the stream will go live, and any changes may require restarting. Please confirm before proceeding.",
      confirmText: "Start Stream"
    },
    "STOP": {
      title: "Stop Stream Confirmation",
      message: "Are you sure you want to stop the stream? Once stopped, viewers will be disconnected, and the stream cannot be resumed. You can start a new session later if needed.",
      confirmText: "Stop Stream"
    },
    "DEACTIVATE": {
      title: "Deactivate Stream Confirmation",
      message: "Are you sure you want to deactivate the stream? You will lose all recording data.",
      confirmText: "Deactivate Stream"
    },
    "DELETE": {
      title: "Delete Stream Confirmation",
      message: "Are you sure you want to delete the stream?",
      confirmText: "Delete Stream"
    },
    "CHECK": {
      title: "Check Stream Confirmation",
      message: "Are you sure you want to check the stream?",
      messageInactive: "Are you sure you want to check the stream? This will override your saved configuration.",
      confirmText: "Check Stream"
    }
  };

  constructor(rootStore) {
    makeAutoObservable(this);

    this.rootStore = rootStore;
  }

  GetMessaging = ({op, activeMessage=true}) => {
    const {title, message, messageInactive, confirmText} = this.CONFIRM_MODAL_OP_DATA[op];
    let printMessage = activeMessage ? message : messageInactive;

    return {
      message: printMessage,
      title,
      confirmText
    };
  };

  SetModal = ({data, op, activeMessage}) => {
    this.modalData = {
      ...this.modalData,
      ...this.GetMessaging({op, activeMessage}),
      ...data,
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
