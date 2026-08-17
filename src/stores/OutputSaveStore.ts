import {makeAutoObservable} from "mobx";
import type RootStore from "@/stores/RootStore";

// Coordinates the output details page's Save/Discard toolbar. Mirrors StreamSaveStore.
export type SavableOutputPanelId = "generalConfig";

const PANEL_ORDER: SavableOutputPanelId[] = ["generalConfig"];

interface PanelRegistration {
  Save: () => Promise<void>;
  Discard: () => void;
}

class OutputSaveStore {
  rootStore: RootStore;
  panels: Partial<Record<SavableOutputPanelId, PanelRegistration>> = {};
  dirty: Record<SavableOutputPanelId, boolean> = {generalConfig: false};
  saving = false;
  failedPanelId: SavableOutputPanelId | null = null;
  // Summary and General Config share one form/save action (see OutputDetails.jsx),
  // but Summary only ever edits "url" - this tracks that field alone so Summary's
  // tab indicator doesn't light up for General-Config-only fields like "name".
  urlDirty = false;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;
    makeAutoObservable(this, {}, {autoBind: true});
  }

  get anyDirty(): boolean {
    return PANEL_ORDER.some(id => this.dirty[id]);
  }

  get dirtyPanelIds(): SavableOutputPanelId[] {
    return PANEL_ORDER.filter(id => this.dirty[id]);
  }

  IsDirty(id: SavableOutputPanelId): boolean {
    return !!this.dirty[id];
  }

  Register({id, Save, Discard}: {id: SavableOutputPanelId} & PanelRegistration): void {
    this.panels[id] = {Save, Discard};
  }

  Unregister(id: SavableOutputPanelId): void {
    delete this.panels[id];
    this.dirty[id] = false;
    this.urlDirty = false;
  }

  SetDirty({id, isDirty}: {id: SavableOutputPanelId, isDirty: boolean}): void {
    this.dirty[id] = isDirty;
  }

  SetUrlDirty(isDirty: boolean): void {
    this.urlDirty = isDirty;
  }

  Reset(): void {
    this.panels = {};
    this.dirty = {generalConfig: false};
    this.urlDirty = false;
    this.saving = false;
    this.failedPanelId = null;
  }

  // Sequential by design, mirroring StreamSaveStore.SaveAll - stop at first
  // failure so it's clear which tab failed. Dirty flags for succeeded
  // panels are cleared together at the end so the whole batch reads as a
  // single atomic action.
  *SaveAll(): Generator<any, void> {
    this.saving = true;
    this.failedPanelId = null;
    const succeededIds: SavableOutputPanelId[] = [];

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

export default OutputSaveStore;
