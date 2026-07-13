import {makeAutoObservable} from "mobx";
import type RootStore from "@/stores/RootStore";

// Coordinates the shared Save/Discard toolbar for the General/Recording/Playout
// config tabs on the stream details page. Each tab's panel registers its own
// Save/Discard implementation on mount; this store just tracks dirty state and
// orchestrates a sequential batch save. It does not own form values - those
// stay in each panel's own @mantine/form instance.
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

  // Sequential by design: each panel does its own independent fabric
  // transaction (own EditContentObject/FinalizeContentObject). Stop at first
  // failure so it's unambiguous which tab failed - tabs already saved in this
  // batch stay clean, unattempted tabs stay dirty for retry.
  //
  // Dirty flags for succeeded panels are cleared together at the very end
  // (not one at a time as each Save resolves) so the whole batch reads as a
  // single atomic action - indicators shouldn't flicker off tab-by-tab while
  // the rest of the save is still in flight.
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
