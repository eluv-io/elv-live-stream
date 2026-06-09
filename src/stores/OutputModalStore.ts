import {makeAutoObservable} from "mobx";
import type RootStore from "@/stores/RootStore";
import type OutputStore from "@/stores/OutputStore";

interface ModalConfig {
  title: string;
  descriptionSingular: string;
  descriptionPlural: string;
  confirmLabel: string;
  closeOnConfirm: boolean;
  successTitle?: string;
  successMessage?: string;
  errorMessage?: string;
}

type ModalAction = "map" | "remap" | "unmap" | "enable" | "disable" | "delete" | "reset" | "tags" | "create";

type ModalConfigProps = Record<Exclude<ModalAction, "map">, ModalConfig>

const MODAL_CONFIG: ModalConfigProps = {
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
  onSuccess = null;
  rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this);
  }

  get outputStore(): OutputStore {
    return this.rootStore.outputStore;
  }

  get isConfirmModalOpen(): boolean {
    return this.activeModal in MODAL_CONFIG;
  }

  get outputName(): string {
    if(this.modalSlugs.length !== 1) { return ""; }
    return this.outputStore.outputs[this.modalSlugs[0]]?.name ?? "";
  }

  get confirmConfig(): (ModalConfig & { description: string } | null) {
    const config = MODAL_CONFIG[this.activeModal];
    if(!config) { return null; }
    return {
      ...config,
      description: this.modalSlugs.length === 1 ? config.descriptionSingular : config.descriptionPlural
    };
  }

  OpenModal = (modal: ModalAction, slugs: string[] = [], onSuccess: () => any) => {
    this.modalSlugs = slugs;
    this.onSuccess = onSuccess ?? null;

    if(modal === "map") {
      const hasExistingMappings = slugs.some(slug => this.outputStore.outputs[slug]?.input?.stream);
      this.activeModal = hasExistingMappings ? "remap" : "map";
    } else {
      this.activeModal = modal;
    }
  };

  CloseModal = (): void => {
    this.activeModal = null;
  };

  *Confirm(): Generator<any, void> {
    switch(this.activeModal) {
      case "remap":
        this.activeModal = "map";
        return;
      case "unmap":
        yield this.outputStore.UnmapStreamBatch({outputs: [...this.modalSlugs]});
        break;
      case "reset":
        yield this.outputStore.ResetOutput({outputId: this.modalSlugs[0]});
        break;
      case "enable":
        if(this.modalSlugs.length === 1) {
          yield this.outputStore.EnableOutput({outputId: this.modalSlugs[0]});
        } else {
          yield this.outputStore.EnableOutputBatch({outputs: [...this.modalSlugs]});
        }
        break;
      case "disable":
        if(this.modalSlugs.length === 1) {
          yield this.outputStore.DisableOutput({outputId: this.modalSlugs[0]});
        } else {
          yield this.outputStore.DisableOutputBatch({outputs: [...this.modalSlugs]});
        }
        break;
      case "delete":
        if(this.modalSlugs.length === 1) {
          yield this.outputStore.DeleteOutput({outputId: this.modalSlugs[0]});
        } else {
          yield this.outputStore.DeleteOutputBatch({outputs: [...this.modalSlugs]});
        }
        break;
    }

    yield this.onSuccess?.();
    this.CloseModal();
  }
}

export default OutputModalStore;
