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
    closeOnConfirm: true,
    successTitle: "Stream unmapped",
    successMessage: "Successfully unmapped stream from output",
    errorMessage: "Unable to unmap stream from output"
  },
  enable: {
    title: "Enable Output Confirmation",
    descriptionSingular: "This output will become available for streaming.",
    descriptionPlural: "These outputs will become available for streaming.",
    confirmLabel: "Enable",
    closeOnConfirm: true,
    successTitle: "Output enabled",
    successMessage: "Output is now available for streaming",
    errorMessage: "Unable to enable output"
  },
  disable: {
    title: "Disable Output Confirmation",
    descriptionSingular: "Disabling this output will interrupt any ongoing activity.",
    descriptionPlural: "Disabling these outputs will interrupt any ongoing activity.",
    confirmLabel: "Disable",
    closeOnConfirm: true,
    successTitle: "Output disabled",
    successMessage: "Output has been disabled",
    errorMessage: "Unable to disable output"
  },
  delete: {
    title: "Delete Output Confirmation",
    descriptionSingular: "This output will be permanently deleted and cannot be recovered.",
    descriptionPlural: "These outputs will be permanently deleted and cannot be recovered.",
    confirmLabel: "Delete",
    closeOnConfirm: true,
    successTitle: "Output deleted",
    successMessage: "Output has been deleted",
    errorMessage: "Unable to delete output"
  },
  reset: {
    title: "Reset Output Confirmation",
    descriptionSingular: "Resetting this output will interrupt any ongoing activity.",
    descriptionPlural: "Resetting these outputs will interrupt any ongoing activity.",
    confirmLabel: "Reset",
    closeOnConfirm: true,
    successTitle: "Output reset",
    successMessage: "Output has been reset successfully",
    errorMessage: "Unable to reset output"
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

  get outputName() {
    if(this.modalSlugs.length !== 1) { return ""; }
    return this.outputStore.outputs[this.modalSlugs[0]]?.name ?? "";
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

    if(this.activeModal === "reset") {
      await this.outputStore.ResetOutput({outputId: this.modalSlugs[0]});
    }

    if(this.activeModal === "enable") {
      if(this.modalSlugs.length === 1) {
        await this.outputStore.EnableOutput({outputId: this.modalSlugs[0]});
      } else {
        await this.outputStore.EnableOutputBatch({outputs: [...this.modalSlugs]});
      }
    }

    if(this.activeModal === "disable") {
      if(this.modalSlugs.length === 1) {
        await this.outputStore.DisableOutput({outputId: this.modalSlugs[0]});
      } else {
        await this.outputStore.DisableOutputBatch({outputs: [...this.modalSlugs]});
      }
    }

    if(this.activeModal === "delete") {
      if(this.modalSlugs.length === 1) {
        await this.outputStore.DeleteOutput({outputId: this.modalSlugs[0]});
      } else {
        await this.outputStore.DeleteOutputBatch({outputs: [...this.modalSlugs]});
      }
    }

    this.CloseModal();
  };
}

export default OutputModalStore;
