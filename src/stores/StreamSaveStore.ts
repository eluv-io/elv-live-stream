import {makeAutoObservable} from "mobx";
import type RootStore from "@/stores/RootStore";

// Tracks dirty state and orchestrates batch Save/Discard for the stream details page's panels
export type SavablePanelId = "general" | "recording" | "playout";

const PANEL_ORDER: SavablePanelId[] = ["general", "recording", "playout"];

interface PanelRegistration {
  Save: () => Promise<void>;
  Discard: () => void;
}

class StreamSaveStore {
  rootStore: RootStore;
  panels: Partial<Record<SavablePanelId, PanelRegistration>> = {};
  dirty: Record<SavablePanelId, boolean> = {general: false, recording: false, playout: false};
  saving = false;
  failedPanelId: SavablePanelId | null = null;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {}, {autoBind: true});
  }

  get anyDirty(): boolean {
    return PANEL_ORDER.some(id => this.dirty[id]);
  }

  get dirtyPanelIds(): SavablePanelId[] {
    return PANEL_ORDER.filter(id => this.dirty[id]);
  }

  IsDirty(id: SavablePanelId): boolean {
    return !!this.dirty[id];
  }

  Register({id, Save, Discard}: {id: SavablePanelId} & PanelRegistration): void {
    this.panels[id] = {Save, Discard};
  }

  Unregister(id: SavablePanelId): void {
    delete this.panels[id];
    this.dirty[id] = false;
  }

  SetDirty({id, isDirty}: {id: SavablePanelId, isDirty: boolean}): void {
    this.dirty[id] = isDirty;
  }

  Reset(): void {
    this.panels = {};
    this.dirty = {general: false, recording: false, playout: false};
    this.saving = false;
    this.failedPanelId = null;
  }

  // Saves panels sequentially, stopping at the first failure; unattempted panels stay dirty
  *SaveAll(): Generator<any, void> {
    this.saving = true;
    this.failedPanelId = null;
    const succeededIds: SavablePanelId[] = [];

    try {
      for(const id of this.dirtyPanelIds) {
        const panel = this.panels[id];
        if(!panel) { continue; }

        try {
          yield panel.Save();
          succeededIds.push(id);
        } catch(error) {
          this.failedPanelId = id;
          throw error;
        }
      }
    } finally {
      succeededIds.forEach(id => { this.dirty[id] = false; });
      this.saving = false;
    }
  }

  DiscardAll(): void {
    this.dirtyPanelIds.forEach(id => {
      this.panels[id]?.Discard();
      this.dirty[id] = false;
    });
  }
}

export default StreamSaveStore;
