import {makeAutoObservable, runInAction} from "mobx";

const MODAL_CONFIG = {
  remap: {
    title: "Remapping Stream Confirmation",
    descriptionSingular: "This output is already mapped to a stream. Continuing will replace the existing mapping with the new one.",
    descriptionPlural: "One or more selected outputs are already mapped to a stream. Continuing will replace the existing mapping with the new one.",
    confirmLabel: "Continue",
    closeOnConfirm: false
  },
  unmap: {
    title: "Unmap Stream Confirmation",
    descriptionSingular: "Unmapping this output will disconnect it from its stream and interrupt any ongoing activity.",
    descriptionPlural: "Unmapping these outputs will disconnect them from their streams and interrupt any ongoing activity.",
    confirmLabel: "Unmap",
    closeOnConfirm: true
  },
  enable: {
    title: "Enable Output Confirmation",
    descriptionSingular: "This output will become available for streaming.",
    descriptionPlural: "These outputs will become available for streaming.",
    confirmLabel: "Enable",
    closeOnConfirm: true
  },
  disable: {
    title: "Disable Output Confirmation",
    descriptionSingular: "Disabling this output will interrupt any ongoing activity.",
    descriptionPlural: "Disabling these outputs will interrupt any ongoing activity.",
    confirmLabel: "Disable",
    closeOnConfirm: true
  },
  reset: {
    title: "Reset Output Confirmation",
    descriptionSingular: "Resetting this output will interrupt any ongoing activity.",
    descriptionPlural: "Resetting these outputs will interrupt any ongoing activity.",
    confirmLabel: "Reset",
    closeOnConfirm: true
  }
};

class OutputModalStore {
  activeModal = null;
  modalSlugs = [];

  constructor(rootStore) {
    makeAutoObservable(this);
    this.rootStore = rootStore;
  }

  get outputStore() {
    return this.rootStore.outputStore;
  }

  get isConfirmModalOpen() {
    return this.activeModal in MODAL_CONFIG;
  }

  get confirmConfig() {
    const config = MODAL_CONFIG[this.activeModal];
    if(!config) { return null; }
    return {
      ...config,
      description: this.modalSlugs.length === 1 ? config.descriptionSingular : config.descriptionPlural
    };
  }

  OpenModal = (modal, slugs = []) => {
    this.modalSlugs = slugs;

    if(modal === "map") {
      const hasExistingMappings = slugs.some(slug => this.outputStore.outputs[slug]?.input?.stream);
      this.activeModal = hasExistingMappings ? "remap" : "map";
    } else {
      this.activeModal = modal;
    }
  };

  CloseModal = () => {
    this.activeModal = null;
  };

  Confirm = async () => {
    if(this.activeModal === "remap") {
      runInAction(() => {
        this.activeModal = "map";
      });
      return;
    }

    if(this.activeModal === "unmap") {
      await this.outputStore.UnmapStreamBatch({outputs: [...this.modalSlugs]});
    }

    // enable: yield this.outputStore.EnableOutputs({outputs: [...this.modalSlugs]});
    // disable: yield this.outputStore.DisableOutputs({outputs: [...this.modalSlugs]});
    // reset: yield this.outputStore.ResetOutputs({outputs: [...this.modalSlugs]});

    this.CloseModal();
  };
}

export default OutputModalStore;
